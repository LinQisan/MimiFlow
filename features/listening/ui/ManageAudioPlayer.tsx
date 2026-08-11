'use client'

import { useEffect, useRef, useState } from 'react'

import { formatMediaTime } from '@/utils/time/format'

export default function ManageAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const syncTime = () => setCurrentTime(audio.currentTime || 0)
    const syncDuration = () =>
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    audio.addEventListener('loadedmetadata', syncDuration)
    audio.addEventListener('durationchange', syncDuration)
    audio.addEventListener('timeupdate', syncTime)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handlePause)
    syncDuration()
    syncTime()

    return () => {
      audio.removeEventListener('loadedmetadata', syncDuration)
      audio.removeEventListener('durationchange', syncDuration)
      audio.removeEventListener('timeupdate', syncTime)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handlePause)
    }
  }, [src])

  const togglePlayback = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => {})
    else audio.pause()
  }

  const seek = (value: number) => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(value)) return
    audio.currentTime = value
    setCurrentTime(value)
  }

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  return (
    <div className='flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_28px_-24px_rgba(15,23,42,0.45)] md:gap-4 md:p-4'>
      <button
        type='button'
        onClick={togglePlayback}
        aria-label={isPlaying ? '暂停音频' : '播放音频'}
        className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 active:scale-95'>
        <span aria-hidden='true' className={isPlaying ? 'tracking-[-0.18em]' : 'ml-0.5'}>
          {isPlaying ? 'Ⅱ' : '▶'}
        </span>
      </button>

      <div className='min-w-0 flex-1'>
        <div className='mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500'>
          <span>音频</span>
          <span className='shrink-0 font-mono tabular-nums text-slate-600'>
            {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
          </span>
        </div>
        <input
          type='range'
          min={0}
          max={Math.max(duration, 0)}
          step='0.1'
          value={Math.min(currentTime, duration || currentTime)}
          onChange={event => seek(Number(event.currentTarget.value))}
          aria-label='音频播放进度'
          className='h-2 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2'
          style={{
            background: `linear-gradient(to right, #0f172a 0%, #0f172a ${progress}%, #e2e8f0 ${progress}%, #e2e8f0 100%)`,
          }}
        />
      </div>

      <audio ref={audioRef} src={src} preload='metadata' className='hidden'>
        您的浏览器不支持音频播放。
      </audio>
    </div>
  )
}
