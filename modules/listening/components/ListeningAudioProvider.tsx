'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type RefObject,
} from 'react'

import { DecodedRangePlayer } from '@/modules/media/audio/browser/decoded-range-player'

type PlaybackRange = {
  rowId: string
  start: number
  end: number
  requestId: number
}

export type ListeningAudioController = {
  audioRef: RefObject<HTMLAudioElement | null>
  src: string
  currentTime: number
  duration: number
  isPlaying: boolean
  activeRowId: string | null
  toggleFullPlayback: () => void
  toggleRange: (rowId: string, start: number, end: number) => void
  playRange: (rowId: string, start: number, end: number) => void
  pause: () => void
  seek: (time: number) => void
}

const ListeningAudioContext = createContext<ListeningAudioController | null>(
  null,
)

const SEEK_FALLBACK_MS = 1500
const RANGE_TIMER_PADDING_MS = 50

function isRangePlaybackDebugEnabled() {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debugAudio') === '1'
  )
}

function debugRangePlayback(
  event: string,
  details: Record<string, unknown> = {},
) {
  if (!isRangePlaybackDebugEnabled()) return
  console.debug(
    '[ListeningAudioRange]',
    event,
    JSON.stringify({
      at: typeof performance !== 'undefined' ? performance.now() : undefined,
      ...details,
    }),
  )
}

function finiteDuration(audio: HTMLAudioElement) {
  return Number.isFinite(audio.duration) && audio.duration >= 0
    ? audio.duration
    : 0
}

export default function ListeningAudioProvider({
  src,
  children,
}: PropsWithChildren<{ src: string }>) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const decodedPlayerRef = useRef<DecodedRangePlayer | null>(null)
  const decodedRequestRef = useRef<number | null>(null)
  const rangeRef = useRef<PlaybackRange | null>(null)
  const playbackRequestIdRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const rangeTimeoutRef = useRef<number | null>(null)
  const pendingSeekCleanupRef = useRef<(() => void) | null>(null)
  const suppressedPauseEventsRef = useRef(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)

  const syncCurrentTime = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return 0
    const nextTime = decodedRequestRef.current !== null
      ? decodedPlayerRef.current?.currentTime ?? rangeRef.current?.start ?? 0
      : Number.isFinite(audio.currentTime) ? audio.currentTime : 0
    setCurrentTime(previous =>
      Math.abs(previous - nextTime) > 0.001 ? nextTime : previous,
    )
    return nextTime
  }, [])

  const clearRangeWatch = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (rangeTimeoutRef.current !== null) {
      window.clearTimeout(rangeTimeoutRef.current)
      rangeTimeoutRef.current = null
    }
  }, [])

  /**
   * Invalidate every pending range operation before changing playback mode.
   * The generation check is important because HTMLMediaElement.play() and
   * seek events settle asynchronously and an old request must never clear a
   * newer range.
   */
  const invalidatePlayback = useCallback(
    (audio: HTMLAudioElement | null, pauseAudio = true) => {
      const decodedTime = decodedPlayerRef.current?.currentTime
      decodedRequestRef.current = null
      decodedPlayerRef.current?.stop()
      if (audio && decodedTime != null) {
        audio.currentTime = decodedTime
        setCurrentTime(decodedTime)
      }
      const previousRange = rangeRef.current
      const previousRequestId = playbackRequestIdRef.current
      playbackRequestIdRef.current += 1
      clearRangeWatch()
      pendingSeekCleanupRef.current?.()
      pendingSeekCleanupRef.current = null
      rangeRef.current = null
      setActiveRowId(null)
      if (pauseAudio) setIsPlaying(false)
      debugRangePlayback('invalidate', {
        previousRequestId,
        nextRequestId: playbackRequestIdRef.current,
        previousRange,
        pauseAudio,
        audioCurrentTime: audio?.currentTime,
        readyState: audio?.readyState,
        seeking: audio?.seeking,
        paused: audio?.paused,
      })
      if (pauseAudio && audio && !audio.paused) {
        // `pause` is dispatched asynchronously by media elements. When a
        // newer range starts before that event arrives, the old event must not
        // invalidate the newer range.
        suppressedPauseEventsRef.current += 1
        audio.pause()
      }
      return playbackRequestIdRef.current
    },
    [clearRangeWatch],
  )

  const waitForSeek = useCallback(
    (audio: HTMLAudioElement, target: number, requestId: number) => {
      return new Promise<boolean>(resolve => {
        let settled = false
        let seekRequested = false
        let timeoutId: number | null = null

        const cleanup = () => {
          audio.removeEventListener('loadedmetadata', attemptSeek)
          audio.removeEventListener('durationchange', attemptSeek)
          audio.removeEventListener('canplay', attemptSeek)
          audio.removeEventListener('seeked', handleSeeked)
          if (timeoutId !== null) window.clearTimeout(timeoutId)
          if (pendingSeekCleanupRef.current === cancel) {
            pendingSeekCleanupRef.current = null
          }
        }

        const finish = (success: boolean) => {
          if (settled) return
          settled = true
          cleanup()
          resolve(success)
        }

        const cancel = () => finish(false)

        const handleSeeked = () => {
          debugRangePlayback('seeked', {
            requestId,
            target,
            audioCurrentTime: audio.currentTime,
            readyState: audio.readyState,
            seeking: audio.seeking,
            paused: audio.paused,
          })
          if (playbackRequestIdRef.current !== requestId) {
            finish(false)
            return
          }
          if (!audio.seeking) finish(true)
        }

        const attemptSeek = () => {
          if (settled || seekRequested) return
          if (playbackRequestIdRef.current !== requestId) {
            finish(false)
            return
          }
          // Setting currentTime while the element is still HAVE_NOTHING can
          // throw in some browsers. Wait for metadata instead of racing it.
          if (audio.readyState === HTMLMediaElement.HAVE_NOTHING) return

          debugRangePlayback('seek-before-set', {
            requestId,
            target,
            audioCurrentTime: audio.currentTime,
            readyState: audio.readyState,
            seeking: audio.seeking,
            paused: audio.paused,
          })
          try {
            audio.currentTime = target
            seekRequested = true
          } catch {
            finish(false)
            return
          }

          debugRangePlayback('seek-after-set', {
            requestId,
            target,
            audioCurrentTime: audio.currentTime,
            readyState: audio.readyState,
            seeking: audio.seeking,
            paused: audio.paused,
          })

          if (!audio.seeking) queueMicrotask(handleSeeked)
        }

        pendingSeekCleanupRef.current = cancel
        audio.addEventListener('loadedmetadata', attemptSeek)
        audio.addEventListener('durationchange', attemptSeek)
        audio.addEventListener('canplay', attemptSeek)
        audio.addEventListener('seeked', handleSeeked)
        attemptSeek()

        timeoutId = window.setTimeout(() => {
          if (playbackRequestIdRef.current !== requestId) {
            finish(false)
            return
          }
          // `seeked` is the preferred signal. The timeout is only a browser
          // fallback for media implementations that do not emit it reliably.
          debugRangePlayback('seek-timeout-fallback', {
            requestId,
            target,
            seekRequested,
            audioCurrentTime: audio.currentTime,
            readyState: audio.readyState,
            seeking: audio.seeking,
            paused: audio.paused,
          })
          finish(
            seekRequested && audio.readyState !== HTMLMediaElement.HAVE_NOTHING,
          )
        }, SEEK_FALLBACK_MS)
      })
    },
    [],
  )

  const finishRangePlayback = useCallback(
    (requestId: number, reason: 'raf' | 'timer' | 'ended' | 'unknown' = 'unknown') => {
      const audio = audioRef.current
      const range = rangeRef.current
      if (
        !audio ||
        !range ||
        range.requestId !== requestId ||
        playbackRequestIdRef.current !== requestId
      ) {
        return
      }

      debugRangePlayback('range-stop', {
        requestId,
        reason,
        requestedStart: range.start,
        requestedEnd: range.end,
        audioCurrentTime: audio.currentTime,
        readyState: audio.readyState,
        seeking: audio.seeking,
        paused: audio.paused,
        ended: audio.ended,
      })
      playbackRequestIdRef.current += 1
      decodedRequestRef.current = null
      decodedPlayerRef.current?.stop()
      clearRangeWatch()
      rangeRef.current = null
      setActiveRowId(null)
      setIsPlaying(false)
      if (!audio.paused) {
        suppressedPauseEventsRef.current += 1
        audio.pause()
      }
      try {
        audio.currentTime = range.end
      } catch {
        // The media element may be unloading; the React playhead still uses
        // the exact requested end for this completed range.
      }
      setCurrentTime(range.end)
    },
    [clearRangeWatch],
  )

  const scheduleRangeMonitor = useCallback(
    (requestId: number) => {
      const audio = audioRef.current
      const range = rangeRef.current
      if (
        !audio ||
        !range ||
        range.requestId !== requestId ||
        playbackRequestIdRef.current !== requestId
      ) {
        return
      }

      clearRangeWatch()

      const tick = () => {
        const currentRange = rangeRef.current
        if (
          !currentRange ||
          currentRange.requestId !== requestId ||
          playbackRequestIdRef.current !== requestId
        ) {
          return
        }

        const time = syncCurrentTime()
        if (time >= currentRange.end || audio.ended) {
          debugRangePlayback('monitor-stop-condition', {
            source: 'raf',
            requestId,
            requestedStart: currentRange.start,
            requestedEnd: currentRange.end,
            monitorTime: time,
            audioCurrentTime: audio.currentTime,
            ended: audio.ended,
            readyState: audio.readyState,
            seeking: audio.seeking,
            paused: audio.paused,
          })
          finishRangePlayback(requestId, audio.ended ? 'ended' : 'raf')
          return
        }
        if (audio.paused) {
          debugRangePlayback('monitor-unexpected-pause', {
            source: 'raf',
            requestId,
            requestedStart: currentRange.start,
            requestedEnd: currentRange.end,
            monitorTime: time,
            audioCurrentTime: audio.currentTime,
            readyState: audio.readyState,
            seeking: audio.seeking,
            paused: audio.paused,
          })
          invalidatePlayback(audio, false)
          return
        }
        animationFrameRef.current = window.requestAnimationFrame(tick)
      }

      const timerTick = () => {
        const currentRange = rangeRef.current
        if (
          !currentRange ||
          currentRange.requestId !== requestId ||
          playbackRequestIdRef.current !== requestId
        ) {
          return
        }

        const time = syncCurrentTime()
        if (time >= currentRange.end || audio.ended) {
          debugRangePlayback('monitor-stop-condition', {
            source: 'timer',
            requestId,
            requestedStart: currentRange.start,
            requestedEnd: currentRange.end,
            monitorTime: time,
            audioCurrentTime: audio.currentTime,
            ended: audio.ended,
            readyState: audio.readyState,
            seeking: audio.seeking,
            paused: audio.paused,
          })
          finishRangePlayback(requestId, audio.ended ? 'ended' : 'timer')
          return
        }
        if (audio.paused) {
          debugRangePlayback('monitor-unexpected-pause', {
            source: 'timer',
            requestId,
            requestedStart: currentRange.start,
            requestedEnd: currentRange.end,
            monitorTime: time,
            audioCurrentTime: audio.currentTime,
            readyState: audio.readyState,
            seeking: audio.seeking,
            paused: audio.paused,
          })
          invalidatePlayback(audio, false)
          return
        }

        const remainingMs = Math.max(
          10,
          (currentRange.end - time) * 1000 + RANGE_TIMER_PADDING_MS,
        )
        rangeTimeoutRef.current = window.setTimeout(
          timerTick,
          Math.min(remainingMs, 1000),
        )
      }

      animationFrameRef.current = window.requestAnimationFrame(tick)
      const remainingMs = Math.max(
        10,
        (range.end - audio.currentTime) * 1000 + RANGE_TIMER_PADDING_MS,
      )
      rangeTimeoutRef.current = window.setTimeout(
        timerTick,
        Math.min(remainingMs, 1000),
      )
    },
    [
      clearRangeWatch,
      finishRangePlayback,
      invalidatePlayback,
      syncCurrentTime,
    ],
  )

  const playRange = useCallback(
    (rowId: string, start: number, end: number) => {
      const audio = audioRef.current
      if (
        !audio ||
        !src ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start
      ) {
        return
      }

      const durationValue = finiteDuration(audio)
      const safeStart = Math.max(
        0,
        durationValue > 0 ? Math.min(start, durationValue) : start,
      )
      const safeEnd = Math.max(
        safeStart,
        durationValue > 0 ? Math.min(end, durationValue) : end,
      )
      if (safeEnd <= safeStart) return

      const currentTimeBeforeRequest = audio.currentTime
      debugRangePlayback('range-request', {
        rowId,
        requestedStart: start,
        requestedEnd: end,
        safeStart,
        safeEnd,
        audioCurrentTime: currentTimeBeforeRequest,
        readyState: audio.readyState,
        seeking: audio.seeking,
        paused: audio.paused,
      })
      const requestId = invalidatePlayback(audio)
      rangeRef.current = {
        rowId,
        start: safeStart,
        end: safeEnd,
        requestId,
      }
      setActiveRowId(rowId)
      setCurrentTime(safeStart)

      const startPlayback = async () => {
        try {
          if (!decodedPlayerRef.current) {
            const contextWindow = window as Window & {
              webkitAudioContext?: typeof AudioContext
            }
            const Context = window.AudioContext || contextWindow.webkitAudioContext
            if (!Context) throw new Error('AudioContext unavailable')
            decodedPlayerRef.current = new DecodedRangePlayer(new Context(), src)
          }
          decodedRequestRef.current = requestId
          const started = await decodedPlayerRef.current.play(safeStart, safeEnd, () => {
            finishRangePlayback(requestId, 'ended')
          })
          if (!started || playbackRequestIdRef.current !== requestId) return
          setIsPlaying(true)
          debugRangePlayback('decoded-range-start', {
            requestId, requestedStart: safeStart, requestedEnd: safeEnd,
          })
          const tick = () => {
            if (playbackRequestIdRef.current !== requestId) return
            syncCurrentTime()
            animationFrameRef.current = window.requestAnimationFrame(tick)
          }
          animationFrameRef.current = window.requestAnimationFrame(tick)
          return
        } catch {
          if (playbackRequestIdRef.current !== requestId) return
          decodedRequestRef.current = null
          decodedPlayerRef.current?.stop()
          debugRangePlayback('decoded-range-fallback', { requestId })
        }
        const didSeek = await waitForSeek(audio, safeStart, requestId)
        const currentRange = rangeRef.current
        if (
          !didSeek ||
          playbackRequestIdRef.current !== requestId ||
          !currentRange ||
          currentRange.requestId !== requestId
        ) {
          if (didSeek === false && playbackRequestIdRef.current === requestId) {
            invalidatePlayback(audio)
          }
          return
        }

        try {
          await audio.play()
          debugRangePlayback('play-resolved', {
            rowId,
            requestId,
            requestedStart: safeStart,
            requestedEnd: safeEnd,
            audioCurrentTime: audio.currentTime,
            readyState: audio.readyState,
            seeking: audio.seeking,
            paused: audio.paused,
          })
        } catch {
          debugRangePlayback('play-rejected', {
            rowId,
            requestId,
            requestedStart: safeStart,
            requestedEnd: safeEnd,
            audioCurrentTime: audio.currentTime,
            readyState: audio.readyState,
            seeking: audio.seeking,
            paused: audio.paused,
          })
          if (playbackRequestIdRef.current === requestId) {
            invalidatePlayback(audio)
          }
          return
        }

        if (
          playbackRequestIdRef.current === requestId &&
          rangeRef.current?.requestId === requestId
        ) {
          scheduleRangeMonitor(requestId)
        }
      }

      void startPlayback()
    },
    [finishRangePlayback, invalidatePlayback, scheduleRangeMonitor, src, syncCurrentTime, waitForSeek],
  )

  const pause = useCallback(() => {
    const audio = audioRef.current
    invalidatePlayback(audio)
    if (audio) audio.pause()
    syncCurrentTime()
  }, [invalidatePlayback, syncCurrentTime])

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current
      if (!audio || !Number.isFinite(time)) return
      if (rangeRef.current) invalidatePlayback(audio)
      const max = finiteDuration(audio)
      const nextTime = Math.max(0, max > 0 ? Math.min(time, max) : time)
      try {
        audio.currentTime = nextTime
      } catch {
        return
      }
      setCurrentTime(nextTime)
    },
    [invalidatePlayback],
  )

  const toggleRange = useCallback(
    (rowId: string, start: number, end: number) => {
      const range = rangeRef.current
      debugRangePlayback('toggle-range', {
        rowId,
        requestedStart: start,
        requestedEnd: end,
        currentRange: range,
        currentRequestId: playbackRequestIdRef.current,
      })
      if (
        range &&
        range.rowId === rowId &&
        range.requestId === playbackRequestIdRef.current
      ) {
        pause()
        return
      }
      playRange(rowId, start, end)
    },
    [pause, playRange],
  )

  const toggleFullPlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !src) return
    if (rangeRef.current || !audio.paused) {
      pause()
      return
    }

    const requestId = invalidatePlayback(audio)
    if (finiteDuration(audio) > 0 && audio.currentTime >= audio.duration) {
      audio.currentTime = 0
      setCurrentTime(0)
    }
    void audio.play().catch(() => {
      if (playbackRequestIdRef.current === requestId) {
        invalidatePlayback(audio)
      }
    })
  }, [invalidatePlayback, pause, src])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const syncDuration = () => setDuration(finiteDuration(audio))
    const syncTime = () => syncCurrentTime()
    const onPlay = () => setIsPlaying(true)
    const onPause = () => {
      debugRangePlayback('pause-event', {
        range: rangeRef.current,
        requestId: playbackRequestIdRef.current,
        suppressedPauseEvents: suppressedPauseEventsRef.current,
        audioCurrentTime: audio.currentTime,
        readyState: audio.readyState,
        seeking: audio.seeking,
        paused: audio.paused,
      })
      if (suppressedPauseEventsRef.current > 0) {
        suppressedPauseEventsRef.current -= 1
        // A new play may already have won the race by the time the old pause
        // event is delivered, so derive the visible state from the element.
        setIsPlaying(decodedPlayerRef.current?.currentTime != null || !audio.paused)
        syncCurrentTime()
        return
      }
      clearRangeWatch()
      setIsPlaying(false)
      if (rangeRef.current) invalidatePlayback(audio, false)
      syncCurrentTime()
    }
    const onEnded = () => {
      invalidatePlayback(audio, false)
      setIsPlaying(false)
      setCurrentTime(finiteDuration(audio))
    }

    audio.addEventListener('loadedmetadata', syncDuration)
    audio.addEventListener('durationchange', syncDuration)
    // This event only updates the visible playhead. Range stopping is handled
    // by requestAnimationFrame plus the duration-based fallback timer above.
    audio.addEventListener('timeupdate', syncTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.load()
    syncDuration()
    syncTime()

    return () => {
      invalidatePlayback(audio)
      decodedPlayerRef.current?.dispose()
      decodedPlayerRef.current = null
      audio.removeEventListener('loadedmetadata', syncDuration)
      audio.removeEventListener('durationchange', syncDuration)
      audio.removeEventListener('timeupdate', syncTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [clearRangeWatch, invalidatePlayback, src, syncCurrentTime])

  const controller = useMemo<ListeningAudioController>(
    () => ({
      audioRef,
      src,
      currentTime,
      duration,
      isPlaying,
      activeRowId,
      toggleFullPlayback,
      toggleRange,
      playRange,
      pause,
      seek,
    }),
    [
      activeRowId,
      currentTime,
      duration,
      isPlaying,
      pause,
      playRange,
      seek,
      src,
      toggleFullPlayback,
      toggleRange,
    ],
  )

  return (
    <ListeningAudioContext.Provider value={controller}>
      {children}
      <audio
        ref={audioRef}
        src={src || undefined}
        preload='metadata'
        className='hidden'
        playsInline>
        您的浏览器不支持音频播放。
      </audio>
    </ListeningAudioContext.Provider>
  )
}

export function useListeningAudio() {
  const context = useContext(ListeningAudioContext)
  if (!context) {
    throw new Error('useListeningAudio 必须在 ListeningAudioProvider 内使用。')
  }
  return context
}

export function useOptionalListeningAudio() {
  return useContext(ListeningAudioContext)
}
