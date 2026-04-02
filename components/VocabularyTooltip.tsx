// components/VocabularyTooltip.tsx
'use client'

import React, { useMemo } from 'react'
import { useI18n } from '@/context/I18nContext'

export type TooltipSaveState =
  | 'idle'
  | 'saving'
  | 'success'
  | 'already_exists'
  | 'error'

export const SAVE_BG_COLORS: Record<TooltipSaveState, string> = {
  idle: 'bg-indigo-600 text-white hover:bg-indigo-700',
  saving: 'bg-indigo-100 text-indigo-500 cursor-not-allowed',
  success: 'bg-emerald-100 text-emerald-700',
  already_exists: 'bg-amber-100 text-amber-700',
  error: 'bg-rose-100 text-rose-700',
}
// ============================================================================
// 🌟 按照你的思路：直接在这里暴露一个纯图标组件，供 SentenceRow 等其他地方复用！
// ============================================================================
export function SaveStatusIcon({
  state,
  className = 'w-4 h-4',
}: {
  state: TooltipSaveState
  className?: string
}) {
  switch (state) {
    case 'saving':
      return (
        <svg
          className={`animate-spin text-current ${className}`}
          fill='none'
          viewBox='0 0 24 24'>
          <circle
            className='opacity-25'
            cx='12'
            cy='12'
            r='10'
            stroke='currentColor'
            strokeWidth='3'></circle>
          <path
            className='opacity-75'
            fill='currentColor'
            d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
        </svg>
      )
    case 'success':
      return (
        <svg
          className={className}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M5 13l4 4L19 7'
          />
        </svg>
      )
    case 'already_exists':
      return (
        <svg
          className={className}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
          />
        </svg>
      )
    case 'error':
      return (
        <svg
          className={className}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M6 18L18 6M6 6l12 12'
          />
        </svg>
      )
    case 'idle':
    default:
      return (
        <svg
          className={className}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z'
          />
        </svg>
      )
  }
}
// ============================================================================

interface VocabularyTooltipProps {
  word: string
  x: number
  y: number
  isTop?: boolean
  saveState: TooltipSaveState
  onSaveWord: (word: string) => void
  enablePronunciation?: boolean
  pronunciationValue?: string
  saveWithPronunciation?: boolean
  onPronunciationChange?: (value: string) => void
  onSaveWithPronunciationChange?: (value: boolean) => void
  meaningValue?: string
  saveWithMeaning?: boolean
  onMeaningChange?: (value: string) => void
  onSaveWithMeaningChange?: (value: boolean) => void
  partOfSpeechValue?: string
  onPartOfSpeechChange?: (value: string) => void
  partOfSpeechOptions?: string[]
}

export default function VocabularyTooltip({
  word,
  x,
  y,
  isTop = true,
  saveState,
  onSaveWord,
  enablePronunciation = false,
  pronunciationValue = '',
  saveWithPronunciation = false,
  onPronunciationChange,
  onSaveWithPronunciationChange,
  meaningValue = '',
  saveWithMeaning = false,
  onMeaningChange,
  onSaveWithMeaningChange,
  partOfSpeechValue = '',
  onPartOfSpeechChange,
  partOfSpeechOptions = [],
}: VocabularyTooltipProps) {
  const { t } = useI18n()
  const selectedPos = (
    partOfSpeechValue
      .split(/[\n,，；;]+/)
      .map(item => item.trim())
      .find(Boolean) || ''
  ).trim()

  const togglePosOption = (pos: string) => {
    onPartOfSpeechChange?.(selectedPos === pos ? '' : pos)
  }

  const saveBtnConfig = useMemo(() => {
    switch (saveState) {
      case 'saving':
        return {
          text: t('player.saving'),
          bg: 'bg-indigo-100 text-indigo-500 cursor-not-allowed',
          disabled: true,
        }
      case 'success':
        return {
          text: t('player.saved'),
          bg: 'bg-emerald-100 text-emerald-700',
          disabled: true,
        }
      case 'already_exists':
        return {
          text: t('player.already_exists'),
          bg: 'bg-amber-100 text-amber-700',
          disabled: true,
        }
      case 'error':
        return { text: 'Error', bg: 'bg-rose-100 text-rose-700', disabled: false }
      default:
        return {
          text: t('player.saveWord'),
          bg: 'bg-indigo-600 text-white hover:bg-indigo-700',
          disabled: false,
        }
    }
  }, [saveState, t])

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        top: y,
        left: x,
        transform: isTop ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      }}
      className={`fixed z-100 w-[min(82vw,22rem)] border border-gray-200 bg-white animate-in fade-in zoom-in-95 duration-300`}>
      <div className='border-b border-gray-100 px-3 py-2.5'>
        <div className='flex items-center justify-between gap-2'>
          <span className='max-w-[60%] truncate text-sm font-bold text-gray-900'>
            {word}
          </span>
          <span className='rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600'>
            收藏
          </span>
        </div>
      </div>

      <div className='space-y-2.5 px-3 py-2.5'>
        <button
          onClick={() => !saveBtnConfig.disabled && onSaveWord(word)}
          disabled={saveBtnConfig.disabled}
          className={`flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors duration-200 ${saveBtnConfig.bg}`}>
          <SaveStatusIcon state={saveState} className='w-4 h-4' />
          {saveBtnConfig.text}
        </button>

        <div className='grid grid-cols-2 gap-2 text-xs'>
          <label className='flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600'>
            <input
              type='checkbox'
              checked={saveWithPronunciation}
              onChange={e =>
                onSaveWithPronunciationChange?.(e.currentTarget.checked)
              }
            />
            保存注音
          </label>
          <label className='flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600'>
            <input
              type='checkbox'
              checked={saveWithMeaning}
              onChange={e => onSaveWithMeaningChange?.(e.currentTarget.checked)}
            />
            保存释义
          </label>
        </div>

        {enablePronunciation && (
          <div className='space-y-1'>
            <div className='flex items-center justify-between'>
              <p className='text-[11px] font-semibold text-gray-600'>注音 / 音标</p>
              <p className='text-[10px] text-gray-400'>多值</p>
            </div>
            <textarea
              value={pronunciationValue}
              onChange={e => onPronunciationChange?.(e.currentTarget.value)}
              placeholder='例如: にん げん（或 にん|げん）\nˈlæŋɡwɪdʒ'
              rows={1}
              className='w-full resize-none rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
            />
            <p className='text-[10px] text-gray-400'>
              日语可用空格或 | 拆分读音（人間: にん げん），外来语一般整词填写
            </p>
          </div>
        )}

        <div className='space-y-1'>
          <div className='flex items-center justify-between'>
            <p className='text-[11px] font-semibold text-gray-600'>词性</p>
            <p className='text-[10px] text-gray-400'>单个</p>
          </div>
          {partOfSpeechOptions.length > 0 && (
            <div className='flex flex-wrap gap-1.5'>
              {partOfSpeechOptions.map(option => {
                const active = selectedPos === option
                return (
                  <button
                    key={`pos-option-${option}`}
                    type='button'
                    onClick={() => togglePosOption(option)}
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                      active
                        ? 'border-amber-300 bg-amber-100 text-amber-800'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}>
                    {option}
                  </button>
                )
              })}
            </div>
          )}
          <textarea
            value={partOfSpeechValue}
            onChange={e => onPartOfSpeechChange?.(e.currentTarget.value)}
            placeholder='例如: n.\nvt.'
            rows={1}
            className='w-full resize-none rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
          />
        </div>

        <div className='space-y-1'>
          <div className='flex items-center justify-between'>
            <p className='text-[11px] font-semibold text-gray-600'>释义</p>
            <p className='text-[10px] text-gray-400'>多个</p>
          </div>
          <textarea
            value={meaningValue}
            onChange={e => onMeaningChange?.(e.currentTarget.value)}
            placeholder='例如: 沟通; 交流'
            rows={1}
            className='w-full resize-none rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] text-gray-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
          />
        </div>
      </div>
      <div
        className={`absolute left-1/2 h-2.5 w-2.5 rotate-45 -translate-x-1/2 border border-gray-200 bg-white ${isTop ? '-bottom-1' : '-top-1'}`}
        style={{
          borderTop: isTop ? 'none' : '',
          borderLeft: isTop ? 'none' : '',
        }}></div>
    </div>
  )
}
