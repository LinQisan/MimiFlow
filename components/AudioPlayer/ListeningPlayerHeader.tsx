'use client'

import Link from 'next/link'

import { Play, Pause, Repeat2, Copy, Check } from 'lucide-react'
import { formatDurationCompact, formatMediaTime } from '@/utils/time/format'
import PronunciationSourceSelector, {
  type PronunciationSource,
} from '@/components/ui/PronunciationSourceSelector'

type CopyStatus = 'idle' | 'success' | 'error'

function DisplayToggle({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <button type='button' aria-pressed={checked} onClick={() => onChange(!checked)}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors hover:bg-[var(--editorial-paper-muted)] ${checked ? 'text-[var(--editorial-ink)]' : 'text-slate-500'}`}>
      <span className={`h-1 w-1 rounded-full ${checked ? 'bg-current' : 'bg-transparent'}`} aria-hidden='true' />
      {label}
    </button>
  )
}

export default function ListeningPlayerHeader({
  title,
  groupName,
  dialogueCount,
  prevId,
  nextId,
  isPlaying,
  isTrackLoop,
  playbackRate,
  showPronunciation,
  showAnnotations,
  showLearningPoints,
  pronunciationSource,
  sudachiAvailable,
  isBlindMode,
  sessionPlaySeconds,
  totalPlaySeconds,
  playedDays,
  copyStatus,
  onBack,
  onCopy,
  onTogglePlayback,
  onToggleTrackLoop,
  onTogglePlaybackRate,
  onShowPronunciationChange,
  onAnnotationsChange,
  onLearningPointsChange,
  onPronunciationSourceChange,
  onBlindModeChange,
}: {
  title: string
  groupName: string
  dialogueCount: number
  prevId: string | null
  nextId: string | null
  isPlaying: boolean
  isTrackLoop: boolean
  playbackRate: number
  showPronunciation: boolean
  showAnnotations: boolean
  showLearningPoints: boolean
  pronunciationSource: PronunciationSource
  sudachiAvailable: boolean
  isBlindMode: boolean
  sessionPlaySeconds: number
  totalPlaySeconds: number
  playedDays: number
  copyStatus: CopyStatus
  onBack: () => void
  onCopy: () => void
  onTogglePlayback: () => void
  onToggleTrackLoop: () => void
  onTogglePlaybackRate: () => void
  onShowPronunciationChange: (value: boolean) => void
  onAnnotationsChange: (value: boolean) => void
  onLearningPointsChange: (value: boolean) => void
  onPronunciationSourceChange: (value: PronunciationSource) => void
  onBlindModeChange: (value: boolean) => void
}) {
  const displayedDays = Math.max(playedDays, totalPlaySeconds > 0 ? 1 : 0)

  return (
    <header className='z-30 border-b border-slate-200 bg-[var(--editorial-paper)] md:sticky md:top-0 dark:border-slate-800'>
      <div className='mx-auto w-full max-w-5xl px-3 py-2.5 md:px-5'>
        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={onBack}
            aria-label='返回听力列表'
            title='返回听力列表'
            className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'>
            <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' aria-hidden='true'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' />
            </svg>
          </button>

          <div className='min-w-0 flex-1'>
            <h1 className='truncate text-sm font-bold text-slate-900 dark:text-slate-100 md:text-base'>
              {title}
            </h1>
            <p className='truncate text-[11px] text-slate-500'>
              {groupName} · {dialogueCount} 句
            </p>
          </div>

          <p className='hidden shrink-0 text-[11px] tabular-nums text-slate-500 lg:block'>
            本次 {formatMediaTime(sessionPlaySeconds)} · 累计 {formatDurationCompact(totalPlaySeconds)} · {displayedDays} 天
          </p>

          <nav className='flex shrink-0 items-center gap-1' aria-label='切换听力材料'>
            {prevId ? (
              <Link
                href={`/listening/${prevId}`}
                aria-label='上一篇'
                className='inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'>
                <span aria-hidden='true'>←</span>
              </Link>
            ) : null}
            {nextId ? (
              <Link
                href={`/listening/${nextId}`}
                aria-label='下一篇'
                className='inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'>
                <span aria-hidden='true'>→</span>
              </Link>
            ) : null}
          </nav>
        </div>

        <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200/70 pt-2 dark:border-slate-800'>
          <div role='group' aria-label='播放控制' className='flex items-center gap-1'>
            <button type='button' onClick={onTogglePlayback} aria-label={isPlaying ? '暂停' : '播放'} aria-pressed={isPlaying}
              className='inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--editorial-ink)] text-[var(--editorial-paper)] transition-opacity hover:opacity-80'>
              {isPlaying ? <Pause size={16} fill='currentColor' /> : <Play size={16} fill='currentColor' />}
            </button>
            <button type='button' onClick={onToggleTrackLoop} aria-label='循环' aria-pressed={isTrackLoop}
              className={`inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-xs ${isTrackLoop ? 'bg-[var(--editorial-paper-muted)] text-[var(--editorial-ink)]' : 'text-slate-500 hover:bg-[var(--editorial-paper-muted)]'}`}>
              <Repeat2 size={15} />循环
            </button>
            <button type='button' onClick={onTogglePlaybackRate} aria-label='切换播放速度' className='h-10 min-w-12 rounded-md px-2 text-xs font-medium tabular-nums hover:bg-[var(--editorial-paper-muted)]'>
              {playbackRate}x
            </button>
            <DisplayToggle label='盲听' checked={isBlindMode} onChange={onBlindModeChange} />
          </div>
          <div role='group' aria-label='原文工具' className='flex flex-wrap items-center gap-0.5 sm:border-l sm:border-slate-300 sm:pl-3 dark:sm:border-slate-700'>
            <div className='flex items-center'>
              <DisplayToggle label='注音' checked={showPronunciation} onChange={onShowPronunciationChange} />
              {showPronunciation ? (
                <PronunciationSourceSelector value={pronunciationSource} onChange={onPronunciationSourceChange} sudachiAvailable={sudachiAvailable} />
              ) : null}
            </div>
            <DisplayToggle label='注释' checked={showAnnotations} onChange={onAnnotationsChange} />
            <DisplayToggle label='学习点' checked={showLearningPoints} onChange={onLearningPointsChange} />
          </div>
          <button type='button' onClick={onCopy} aria-label='复制原文' className={`ml-auto inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-[var(--editorial-paper-muted)] ${copyStatus === 'error' ? 'text-rose-700' : 'text-slate-500'}`}>
            {copyStatus === 'success' ? <Check size={14} /> : <Copy size={14} />}
            <span aria-live='polite'>{copyStatus === 'success' ? '已复制' : copyStatus === 'error' ? '复制失败' : '复制原文'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
