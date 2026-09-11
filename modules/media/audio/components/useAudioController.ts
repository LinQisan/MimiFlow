import { useEffect, useRef, useState } from 'react'

type DialogueItem = {
  id: number
  text: string
  start: number
  end: number
}

export function useAudioController(dialogue: DialogueItem[]) {
  const audioRef = useRef<HTMLAudioElement>(null)

  const [activeId, setActiveId] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isTrackLoop, setIsTrackLoop] = useState(false)
  const [loopId, setLoopId] = useState<number | null>(null)

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
      if (activeId === null && dialogue[0]) audio.currentTime = dialogue[0].start
      void audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }

  // 3. 播放特定句子
  const playSentence = (item: DialogueItem) => {
    const audio = audioRef.current
    if (!audio) return

    if (loopId !== null && loopId !== item.id) setLoopId(null)

    if (isPlaying && activeId === item.id) {
      audio.pause()
    } else {
      audio.currentTime = item.start
      audio.play().catch(() => {})
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
      audio.currentTime = item.start
      audio.play().catch(() => {})
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
        if (audio.paused) audio.play()
        else audio.pause()
      }

      if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
        e.preventDefault()
        const audio = audioRef.current
        if (!audio) return
        if (activeId !== null) {
          const currentItem = dialogue.find(d => d.id === activeId)
          if (currentItem) {
            audio.currentTime = currentItem.start
            audio.play()
          }
        } else if (dialogue.length > 0) {
          audio.currentTime = dialogue[0].start
          audio.play()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeId, dialogue])

  // 重播事件监听
  useEffect(() => {
    const handleReplay = () => {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = 0
      audio.play().catch(() => {})
      setActiveId(null)
      setLoopId(null)
    }
    window.addEventListener('replay-audio', handleReplay)
    return () => window.removeEventListener('replay-audio', handleReplay)
  }, [])

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
