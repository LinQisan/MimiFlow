'use client'

import { useRef, useState } from 'react'
import { Star, Volume2 } from 'lucide-react'
import { FOCUS_RING, cn } from '@/lib/cn'

let currentAudio: HTMLAudioElement | null = null

/** 收藏后端落定前的总开关（见 FavoriteButton 注释） */
const VOCABULARY_FAVORITE_ENABLED = false

function Base({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
}) {
  return (
    <button
      type='button'
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-150',
        active ? 'text-primary' : 'text-fg-3 hover:bg-surface-hover hover:text-primary',
        FOCUS_RING,
      )}>
      {children}
    </button>
  )
}

export function AudioButton({ word, audioUrl }: { word: string; audioUrl?: string | null }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  if (!audioUrl) return <span aria-hidden className='size-8 shrink-0' />
  const play = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (currentAudio) currentAudio.pause()
    const audio = audioRef.current ?? new Audio(audioUrl)
    audioRef.current = audio
    currentAudio = audio
    audio.onended = () => setPlaying(false)
    audio.onpause = () => setPlaying(false)
    try {
      await audio.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }
  return (
    <Base label={`播放 ${word} 的发音`} active={playing} onClick={play}>
      <Volume2 size={18} className={playing ? 'animate-pulse' : undefined} />
    </Base>
  )
}

export function FavoriteButton({ word, initialActive = false }: { word: string; initialActive?: boolean }) {
  // 后端尚无收藏表：默认不渲染真按钮，只留列位，避免“刷新即失忆”伤害信任；
  // 建表后把 VOCABULARY_FAVORITE_ENABLED 置 true 并接 toggleFavorite Action。
  if (!VOCABULARY_FAVORITE_ENABLED) return <span aria-hidden className='size-8 shrink-0' />
  return <FavoriteButtonEnabled word={word} initialActive={initialActive} />
}

function FavoriteButtonEnabled({ word, initialActive = false }: { word: string; initialActive?: boolean }) {
  const [active, setActive] = useState(initialActive)
  return (
    <Base
      label={active ? `取消收藏 ${word}` : `收藏 ${word}`}
      active={active}
      onClick={e => {
        e.stopPropagation()
        setActive(v => !v)
      }}>
      <Star size={18} className={active ? 'fill-accent text-accent' : undefined} />
    </Base>
  )
}
