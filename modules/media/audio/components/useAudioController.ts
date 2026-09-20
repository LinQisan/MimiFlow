import { useCallback, useEffect, useRef, useState } from 'react'
import { PcmAudioSource, waitForAudioMetadata } from '../browser/pcm-source'

type DialogueItem = {
  id: number
  text: string
  start: number
  end: number
}

export function useAudioController(dialogue: DialogueItem[], src: string) {
  const audioRef = useRef<HTMLAudioElement>(null)

  const [activeId, setActiveId] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isTrackLoop, setIsTrackLoop] = useState(false)
  const [loopId, setLoopId] = useState<number | null>(null)

  const pcmRef = useRef<PcmAudioSource | null>(null)
  const requestRef = useRef(0)
  const pendingRef = useRef(false)
  const metadataAbortRef = useRef<AbortController | null>(null)

  const pause = useCallback(() => {
    requestRef.current += 1
    pendingRef.current = false
    metadataAbortRef.current?.abort()
    audioRef.current?.pause()
  }, [])

  const startAt = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) return
    pause()
    const request = requestRef.current
    pendingRef.current = true
    pcmRef.current ??= new PcmAudioSource()
    void (async () => {
      try {
        const url = await pcmRef.current!.prepare(src)
        if (request !== requestRef.current) return
        if (audio.src !== url) {
          audio.src = url
          audio.load()
        }
        const abort = new AbortController()
        metadataAbortRef.current = abort
        await waitForAudioMetadata(audio, abort.signal)
        if (request !== requestRef.current) return
        audio.currentTime = Math.max(0, Math.min(time, audio.duration))
        await audio.play()
      } catch (error) {
        if (request === requestRef.current) {
          console.error('Unable to prepare precise listening audio', error)
          setIsPlaying(false)
        }
      } finally {
        if (request === requestRef.current) pendingRef.current = false
      }
    })()
  }, [pause, src])

  useEffect(() => {
    return () => {
      pause()
      pcmRef.current?.dispose()
      pcmRef.current = null
    }
  }, [pause, src])

  // 1. 切换播放速度
  const togglePlaybackRate = () => {
    const audio = audioRef.current
    if (!audio) return
    const nextRate =
      playbackRate === 1
        ? 1.25
        : playbackRate === 1.25
          ? 1.5
          : playbackRate === 1.5
            ? 0.75
            : 1
    audio.defaultPlaybackRate = nextRate
    audio.playbackRate = nextRate
    setPlaybackRate(nextRate)
  }

  // 2. 切换全曲循环
  const toggleTrackLoop = () => {
    const audio = audioRef.current
    if (!audio) return
    const nextLoop = !isTrackLoop
    audio.loop = nextLoop
    setIsTrackLoop(nextLoop)
  }

  const togglePlayback = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      if (pendingRef.current) {
        pause()
        return
      }
      startAt(activeId === null && dialogue[0] ? dialogue[0].start : audio.currentTime)
    } else {
      pause()
    }
  }

  // 3. 播放特定句子
  const playSentence = (item: DialogueItem) => {
    const audio = audioRef.current
    if (!audio) return

    if (loopId !== null && loopId !== item.id) setLoopId(null)

    if (isPlaying && activeId === item.id) {
      pause()
    } else {
      setActiveId(item.id)
      startAt(item.start)
    }
  }

  // 4. 切换单句循环
  const toggleLoop = (item: DialogueItem) => {
    const audio = audioRef.current
    if (!audio) return
    if (loopId === item.id) {
      setLoopId(null)
    } else {
      setLoopId(item.id)
      setActiveId(item.id)
      startAt(item.start)
    }
  }

  // 同步全曲循环属性
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.loop = isTrackLoop
  }, [isTrackLoop])

  // 卸载时确保停止播放，防止 SPA 软导航切走后音频泄漏
  useEffect(() => {
    const audio = audioRef.current
    return () => {
      if (audio && !audio.paused) {
        audio.pause()
      }
    }
  }, [])

  // 仅在播放时逐帧同步高亮与单句循环，暂停时不持续占用主线程。
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    let animationFrameId: number | null = null

    const syncHighlight = () => {
      if (audio.paused) {
        animationFrameId = null
        return
      }
      const currentTime = audio.currentTime
      if (loopId !== null) {
        const loopItem = dialogue.find(d => d.id === loopId)
        if (loopItem && currentTime >= loopItem.end) {
          audio.currentTime = loopItem.start
        }
      }
      const currentItem = dialogue.find(
        d => currentTime >= d.start && currentTime <= d.end,
      )
      setActiveId(prev => (currentItem ? currentItem.id : prev))
      animationFrameId = requestAnimationFrame(syncHighlight)
    }

    const onPlay = () => {
      setIsPlaying(true)
      if (animationFrameId === null) syncHighlight()
    }
    const onPause = () => {
      setIsPlaying(false)
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    const onEnded = () => {
      setIsPlaying(false)
      setActiveId(null)
      setLoopId(null)
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    if (!audio.paused) onPlay()

    return () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [dialogue, loopId])

  // 快捷键监听 (Space / R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()
        const audio = audioRef.current
        if (!audio) return
        if (audio.paused && !pendingRef.current) startAt(audio.currentTime)
        else pause()
      }

      if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
        e.preventDefault()
        const audio = audioRef.current
        if (!audio) return
        if (activeId !== null) {
          const currentItem = dialogue.find(d => d.id === activeId)
          if (currentItem) {
            startAt(currentItem.start)
          }
        } else if (dialogue.length > 0) {
          startAt(dialogue[0].start)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeId, dialogue, pause, startAt])

  // 重播事件监听
  useEffect(() => {
    const handleReplay = () => {
      const audio = audioRef.current
      if (!audio) return
      startAt(0)
      setActiveId(null)
      setLoopId(null)
    }
    window.addEventListener('replay-audio', handleReplay)
    return () => window.removeEventListener('replay-audio', handleReplay)
  }, [startAt])

  return {
    audioRef,
    activeId,
    isPlaying,
    playbackRate,
    isTrackLoop,
    loopId,
    togglePlayback,
    togglePlaybackRate,
    toggleTrackLoop,
    playSentence,
    toggleLoop,
  }
}
