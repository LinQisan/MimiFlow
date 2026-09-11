'use client'

import { useEffect, useRef, useState } from 'react'

let activeAudio: HTMLAudioElement | null = null

export default function WordAudioButton({
  audioFile,
  word,
  start = 0,
  end,
  className = '',
}: {
  audioFile?: string | null
  word: string
  start?: number
  end?: number
  className?: string
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>(
    'idle',
  )

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      if (audio && activeAudio === audio) {
        audio.pause()
        activeAudio = null
      }
    }
  }, [audioFile, start, end])

  if (!audioFile) return null

  const play = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (activeAudio && activeAudio !== audio) activeAudio.pause()
    activeAudio = audio
    setState('loading')

    try {
      audio.currentTime = Math.max(0, start)
      await audio.play()
      setState('playing')
    } catch {
      if (activeAudio === audio) activeAudio = null
      setState('error')
    }
  }

  const label =
    state === 'loading'
      ? `正在加载 ${word} 的发音`
      : state === 'error'
        ? `重新播放 ${word} 的发音`
        : `播放 ${word} 的发音`

  return (
    <>
      <audio
        ref={audioRef}
        src={audioFile}
        preload='none'
        onPlaying={() => setState('playing')}
        onTimeUpdate={event => {
          if (end != null && end > start && event.currentTarget.currentTime >= end) {
            event.currentTarget.pause()
            if (activeAudio === event.currentTarget) activeAudio = null
          }
        }}
        onPause={() => setState('idle')}
        onEnded={() => {
          if (activeAudio === audioRef.current) activeAudio = null
          setState('idle')
        }}
        onError={() => setState('error')}
      />
      <button
        type='button'
        onClick={event => {
          event.stopPropagation()
          void play()
        }}
        aria-label={label}
        title={state === 'error' ? '播放失败，点击重试' : '播放发音'}
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-wait disabled:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white ${className}`}
        disabled={state === 'loading'}>
        <svg
          viewBox='0 0 24 24'
          aria-hidden='true'
          className={`size-[18px] ${state === 'playing' ? 'text-blue-600' : ''}`}
          fill='none'
          stroke='currentColor'
          strokeWidth='1.8'
          strokeLinecap='round'
          strokeLinejoin='round'>
          <path d='M11 5 6.8 8.5H3.5v7h3.3L11 19V5Z' />
          <path d='M14.5 9a4 4 0 0 1 0 6' />
          <path d='M17.2 6.5a7.5 7.5 0 0 1 0 11' />
        </svg>
      </button>
    </>
  )
}
