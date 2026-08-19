'use client'

import type { ReactNode, MouseEvent } from 'react'

import {
  SaveStatusIcon,
  SAVE_BG_COLORS,
  type TooltipSaveState,
} from '@/components/vocabulary/VocabularySaveStatus'

type DialogueItem = {
  id: number
  text: string
  start: number
  end: number
}

export default function ListeningSentenceRow({
  sequence,
  sourceId,
  item,
  isActive,
  isLooping,
  blindState,
  savingDialogueId,
  dialogueSaveState,
  renderedText,
  onClick,
  onToggleLoop,
  onAddToReview,
}: {
  sequence: number
  sourceId: string
  item: DialogueItem
  isActive: boolean
  isLooping: boolean
  blindState: 'normal' | 'clear' | 'blur'
  savingDialogueId: number | null
  dialogueSaveState: TooltipSaveState
  renderedText: ReactNode
  onClick: () => void
  onToggleLoop: (event: MouseEvent) => void
  onAddToReview: (event: MouseEvent) => void
}) {
  const currentState = savingDialogueId === item.id ? dialogueSaveState : 'idle'
  const saveClass =
    currentState !== 'idle'
      ? SAVE_BG_COLORS[currentState]
      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
  const blurClass = blindState === 'blur' ? 'blur-sm opacity-45' : ''

  return (
    <div className='group'>
      <div
        id={`sentence-${item.id}`}
        className='grid scroll-mt-36 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 md:gap-3'>
        <div
          role='button'
          tabIndex={0}
          aria-label={`播放第 ${sequence} 句`}
          data-source-type='AUDIO_DIALOGUE'
          data-source-id={sourceId}
          data-context-block='true'
          onClick={onClick}
          onKeyDown={event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            onClick()
          }}
          className={`min-w-0 cursor-pointer select-text rounded-xl border px-3 py-3 text-base leading-8 wrap-break-word transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 md:px-4 md:py-3.5 md:text-lg ${
            isActive
              ? 'border-slate-500 bg-slate-100 font-semibold text-slate-950 dark:border-slate-400 dark:bg-slate-800 dark:text-slate-50'
              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
          } ${blindState === 'clear' ? 'border-slate-400' : ''}`}>
          <div className='flex min-w-0 gap-3'>
            <span
              data-context-ignore='true'
              className='pointer-events-none mt-0.5 w-5 shrink-0 select-none text-right text-[11px] font-semibold tabular-nums text-slate-400'
              aria-hidden='true'>
              {sequence}
            </span>
            <div
              data-context-sentence='true'
              className={`min-w-0 transition-[filter,opacity] duration-300 ${blurClass}`}>
              {renderedText}
            </div>
          </div>
        </div>

        <div className='flex shrink-0 flex-col gap-1.5 sm:flex-row'>
          <button
            type='button'
            onClick={onAddToReview}
            aria-label={`收藏第 ${sequence} 句`}
            title='加入跟读训练库'
            disabled={savingDialogueId === item.id}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${saveClass}`}>
            <SaveStatusIcon state={currentState} className='h-4 w-4' />
          </button>
          <button
            type='button'
            onClick={onToggleLoop}
            aria-label={`复读第 ${sequence} 句`}
            aria-pressed={isLooping}
            title='单句复读'
            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-xs transition-colors ${
              isLooping
                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
            }`}>
            <svg
              className='h-4 w-4'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              aria-hidden='true'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
          </button>
        </div>
      </div>

    </div>
  )
}
