'use client'

import Link from 'next/link'

import ToggleSwitch from '@/components/ToggleSwitch'
import { formatDurationCompact, formatMediaTime } from '@/utils/time/format'

type CopyStatus = 'idle' | 'success' | 'error'

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
  showMeaning,
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
  onShowMeaningChange,
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
  showMeaning: boolean
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
  onShowMeaningChange: (value: boolean) => void
  onBlindModeChange: (value: boolean) => void
}) {
  const displayedDays = Math.max(playedDays, totalPlaySeconds > 0 ? 1 : 0)

  return (
    <header className='sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95'>
      <div className='mx-auto w-full max-w-6xl px-3 py-2.5 md:px-5'>
        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={onBack}
            aria-label='返回听力列表'
            className='inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'>
            <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24' aria-hidden='true'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' />
            </svg>
            <span className='hidden sm:inline'>返回</span>
          </button>

          <div className='min-w-0 flex-1'>
            <h1 className='truncate text-sm font-bold text-slate-900 dark:text-slate-100 md:text-base'>
              {title}
            </h1>
            <p className='truncate text-[11px] text-slate-500'>
              {groupName} · {dialogueCount} 句
            </p>
          </div>

          <button
            type='button'
            onClick={onCopy}
            aria-label='复制原文'
            className={`inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${
              copyStatus === 'success'
                ? 'border-slate-900 bg-slate-900 text-white'
                : copyStatus === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
            }`}>
            {copyStatus === 'success' ? '已复制' : copyStatus === 'error' ? '失败' : '复制'}
          </button>

          <nav className='flex shrink-0 gap-1' aria-label='切换听力材料'>
            {prevId ? (
              <Link
                href={`/listening/${prevId}`}
                aria-label='上一篇'
                className='inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'>
                <span aria-hidden='true'>←</span>
              </Link>
            ) : null}
            {nextId ? (
              <Link
                href={`/listening/${nextId}`}
                aria-label='下一篇'
                className='inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'>
                <span aria-hidden='true'>→</span>
              </Link>
            ) : null}
          </nav>
        </div>

        <div className='mt-2 flex flex-wrap items-center gap-2'>
          <button
            type='button'
            onClick={onTogglePlayback}
            aria-pressed={isPlaying}
            className='h-8 min-w-[4.5rem] rounded-lg bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900'>
            {isPlaying ? '暂停' : '播放'}
          </button>
          <button
            type='button'
            onClick={onToggleTrackLoop}
            aria-pressed={isTrackLoop}
            className={`h-8 rounded-lg border px-2.5 text-xs font-semibold ${
              isTrackLoop
                ? 'border-slate-900 bg-slate-100 text-slate-900 dark:border-slate-100 dark:bg-slate-800 dark:text-slate-100'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}>
            循环
          </button>
          <button
            type='button'
            onClick={onTogglePlaybackRate}
            aria-label='切换播放速度'
            className='h-8 min-w-[3.4rem] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'>
            {playbackRate}x
          </button>

          <div className='flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900'>
            <ToggleSwitch label='注音' checked={showPronunciation} onChange={onShowPronunciationChange} />
            <ToggleSwitch label='释义' checked={showMeaning} onChange={onShowMeaningChange} />
            <ToggleSwitch label='盲听' checked={isBlindMode} onChange={onBlindModeChange} />
          </div>

          <p className='ml-auto hidden text-[11px] tabular-nums text-slate-500 sm:block'>
            本次 {formatMediaTime(sessionPlaySeconds)} · 累计 {formatDurationCompact(totalPlaySeconds)} · {displayedDays} 天
          </p>
        </div>
      </div>
    </header>
  )
}
