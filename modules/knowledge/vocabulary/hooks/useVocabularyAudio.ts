'use client'

import { useCallback, useRef } from 'react'
import { useDialog } from '@/context/DialogContext'

export function useVocabularyAudio() {
  const dialog = useDialog()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioRequestIdRef = useRef(0)

  const reportAudioPlaybackError = useCallback(
    (error: unknown, userInitiated: boolean) => {
      const errorName =
        error && typeof error === 'object' && 'name' in error
          ? String(error.name)
          : ''

      if (errorName === 'AbortError') return

      if (errorName === 'NotAllowedError') {
        if (userInitiated) {
          dialog.toast('浏览器阻止了播放，请再次点击发音按钮', { tone: 'info' })
        }
        return
      }

      if (errorName === 'NotSupportedError') {
        console.error('当前音频格式或来源不受支持:', error)
        if (userInitiated) {
          dialog.toast('当前音频无法播放，请检查音频文件', { tone: 'error' })
        }
        return
      }

      console.error('音频播放失败，请检查文件路径或浏览器权限:', error)
      if (userInitiated) {
        dialog.toast('音频播放失败，请稍后重试', { tone: 'error' })
      }
    },
    [dialog],
  )

  const startAudioPlayback = useCallback(
    (
      audio: HTMLAudioElement,
      requestId: number,
      start = 0,
      end = 0,
      userInitiated = true,
    ) => {
      if (requestId !== audioRequestIdRef.current) return

      const current = audioRef.current
      if (current && current !== audio) {
        current.ontimeupdate = null
        current.pause()
      }
      if (requestId !== audioRequestIdRef.current) return

      audioRef.current = audio
      audio.preload = 'auto'
      audio.setAttribute('playsinline', '')

      if (start > 0) {
        const setStartTime = () => {
          try {
            audio.currentTime = start
          } catch (error) {
            const errorName =
              error && typeof error === 'object' && 'name' in error
                ? String(error.name)
                : ''
            if (errorName !== 'InvalidStateError') {
              reportAudioPlaybackError(error, false)
            }
          }
        }
        if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
          audio.addEventListener(
            'loadedmetadata',
            () => {
              if (requestId !== audioRequestIdRef.current) return
              setStartTime()
            },
            { once: true },
          )
        } else {
          setStartTime()
        }
      }

      if (end > start) {
        audio.ontimeupdate = () => {
          if (audio.currentTime < end) return
          audio.ontimeupdate = null
          audio.pause()
        }
      } else {
        audio.ontimeupdate = null
      }

      try {
        // Keep play() in the original click call stack. Deferring it through a
        // promise queue or loadedmetadata loses iOS Safari's user activation.
        const playback = audio.play()
        void playback.catch(error =>
          reportAudioPlaybackError(error, userInitiated),
        )
      } catch (error) {
        reportAudioPlaybackError(error, userInitiated)
      }
    },
    [reportAudioPlaybackError],
  )

  const playAudio = (
    audioData: {
      audioFile: string
      start: number
      end: number
    },
    userInitiated = true,
  ) => {
    if (!audioData?.audioFile) return

    try {
      const requestId = ++audioRequestIdRef.current
      const audio = new Audio(audioData.audioFile)
      audio.preload = 'auto'
      audio.setAttribute('playsinline', '')
      const start = Math.max(0, audioData.start || 0)
      const end = Math.max(start, audioData.end || 0)
      startAudioPlayback(audio, requestId, start, end, userInitiated)
    } catch (e) {
      reportAudioPlaybackError(e, userInitiated)
    }
  }

  const playAudioFile = useCallback(
    (audioFile?: string | null, userInitiated = true) => {
      if (!audioFile) return

      try {
        const requestId = ++audioRequestIdRef.current
        const audio = new Audio(audioFile)
        audio.preload = 'auto'
        audio.setAttribute('playsinline', '')
        startAudioPlayback(audio, requestId, 0, 0, userInitiated)
      } catch (error) {
        reportAudioPlaybackError(error, userInitiated)
      }
    },
    [reportAudioPlaybackError, startAudioPlayback],
  )

  const pauseAudio = useCallback(() => {
    if (audioRef.current) audioRef.current.pause()
  }, [])

  return { playAudio, playAudioFile, pauseAudio }
}
