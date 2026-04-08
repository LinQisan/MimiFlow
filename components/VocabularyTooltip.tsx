'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/context/I18nContext'

export type TooltipSaveState =
  | 'idle'
  | 'saving'
  | 'success'
  | 'already_exists'
  | 'error'

type SaveButtonConfig = {
  text: string
  bg: string
  disabled: boolean
}

const TOOLTIP_WIDTH_CLASS = 'w-[min(82vw,20rem)]'
const BASE_INPUT_CLASS = 'ui-input'
const SECTION_TITLE_CLASS = 'text-[11px] font-semibold text-gray-600'
const SECTION_HINT_CLASS = 'text-[10px] text-gray-400'

export const SAVE_BG_COLORS: Record<TooltipSaveState, string> = {
  idle: 'bg-indigo-600 text-white hover:bg-indigo-700',
  saving: 'bg-indigo-100 text-indigo-500 cursor-not-allowed',
  success: 'bg-emerald-100 text-emerald-700',
  already_exists: 'bg-amber-100 text-amber-700',
  error: 'bg-rose-100 text-rose-700',
}

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
            strokeWidth='3'
          />
          <path
            className='opacity-75'
            fill='currentColor'
            d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
          />
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

function getSaveButtonConfig(
  saveState: TooltipSaveState,
  t: (key: string) => string,
): SaveButtonConfig {
  switch (saveState) {
    case 'saving':
      return {
        text: t('player.saving'),
        bg: SAVE_BG_COLORS.saving,
        disabled: true,
      }
    case 'success':
      return {
        text: t('player.saved'),
        bg: SAVE_BG_COLORS.success,
        disabled: true,
      }
    case 'already_exists':
      return {
        text: t('player.already_exists'),
        bg: SAVE_BG_COLORS.already_exists,
        disabled: true,
      }
    case 'error':
      return {
        text: 'Error',
        bg: SAVE_BG_COLORS.error,
        disabled: false,
      }
    case 'idle':
    default:
      return {
        text: t('player.saveWord'),
        bg: SAVE_BG_COLORS.idle,
        disabled: false,
      }
  }
}

function getSelectedPartOfSpeech(value: string) {
  return (
    value
      .split(/[\n,，；;]+/)
      .map(item => item.trim())
      .find(Boolean) || ''
  ).trim()
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
  saveWithPronunciation = true,
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
  const [showAdvanced, setShowAdvanced] = useState(false)

  const estimatedHeight = showAdvanced ? 460 : 240
  const shouldOpenDown = isTop && y < estimatedHeight + 16
  const topOffset = shouldOpenDown ? y + 12 : y

  const saveBtnConfig = useMemo(
    () => getSaveButtonConfig(saveState, t),
    [saveState, t],
  )

  const selectedPos = useMemo(
    () => getSelectedPartOfSpeech(partOfSpeechValue),
    [partOfSpeechValue],
  )

  const handleSave = () => {
    if (!saveBtnConfig.disabled) {
      onSaveWord(word)
    }
  }

  const handleTogglePosOption = (pos: string) => {
    onPartOfSpeechChange?.(selectedPos === pos ? '' : pos)
  }

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        top: topOffset,
        left: x,
        transform:
          shouldOpenDown || !isTop
            ? 'translate(-50%, 0)'
            : 'translate(-50%, -100%)',
      }}
      className={`ui-pop ui-pop-surface fixed z-100 ${TOOLTIP_WIDTH_CLASS} overflow-hidden rounded-xl shadow-xl animate-in fade-in zoom-in-95 duration-200`}>
      <div className='flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2'>
        <span className='max-w-[62%] truncate text-sm font-bold text-gray-900'>
          {word}
        </span>

        <button
          type='button'
          onClick={handleSave}
          disabled={saveBtnConfig.disabled}
          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors duration-200 ${saveBtnConfig.bg}`}>
          <SaveStatusIcon state={saveState} className='h-3.5 w-3.5' />
          {saveBtnConfig.text}
        </button>
      </div>

      <div className='max-h-[min(68vh,26rem)] space-y-3 overflow-y-auto px-3 py-2.5'>
        {enablePronunciation && (
          <section className='space-y-1.5'>
            <div className='flex items-center justify-between'>
              <p className={SECTION_TITLE_CLASS}>读音 / 注音</p>
              <label className='flex items-center gap-1.5 text-[10px] text-gray-500'>
                <input
                  type='checkbox'
                  checked={saveWithPronunciation}
                  onChange={e =>
                    onSaveWithPronunciationChange?.(e.currentTarget.checked)
                  }
                />
                保存
              </label>
            </div>

            <input
              value={pronunciationValue}
              onChange={e => onPronunciationChange?.(e.currentTarget.value)}
              placeholder='言:い い 訳:わけ / にん げん / にん|げん / ˈlæŋɡwɪdʒ'
              className={BASE_INPUT_CLASS}
            />

            <p className={SECTION_HINT_CLASS}>
              先输入读音。支持日语汉字:读音、空格分隔、或 | 分隔。
            </p>
          </section>
        )}

        <div className='border-t border-gray-100 pt-2'>
          <button
            type='button'
            onClick={() => setShowAdvanced(v => !v)}
            className='inline-flex h-8 items-center rounded-lg border border-gray-200 px-2.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50'>
            {showAdvanced ? '收起其他信息' : '展开其他信息'}
          </button>
        </div>

        {showAdvanced && (
          <div className='space-y-3 rounded-lg border border-gray-100 bg-gray-50/40 p-2.5'>
            <section className='space-y-1.5'>
              <div className='flex items-center justify-between'>
                <p className={SECTION_TITLE_CLASS}>词性</p>
                <p className={SECTION_HINT_CLASS}>单个</p>
              </div>

              {partOfSpeechOptions.length > 0 && (
                <div className='flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1'>
                  {partOfSpeechOptions.map(option => {
                    const active = selectedPos === option
                    return (
                      <button
                        key={`pos-option-${option}`}
                        type='button'
                        onClick={() => handleTogglePosOption(option)}
                        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
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

              <input
                value={partOfSpeechValue}
                onChange={e => onPartOfSpeechChange?.(e.currentTarget.value)}
                placeholder='名词'
                className={BASE_INPUT_CLASS}
              />
            </section>

            <section className='space-y-1.5'>
              <div className='flex items-center justify-between'>
                <p className={SECTION_TITLE_CLASS}>释义</p>
                <label className='flex items-center gap-1.5 text-[10px] text-gray-500'>
                  <input
                    type='checkbox'
                    checked={saveWithMeaning}
                    onChange={e =>
                      onSaveWithMeaningChange?.(e.currentTarget.checked)
                    }
                  />
                  保存
                </label>
              </div>

              <input
                value={meaningValue}
                onChange={e => onMeaningChange?.(e.currentTarget.value)}
                placeholder='沟通; 交流'
                className={BASE_INPUT_CLASS}
              />
            </section>
          </div>
        )}
      </div>

      <div
        className={`absolute left-1/2 h-2.5 w-2.5 rotate-45 -translate-x-1/2 border border-gray-200 bg-white ${
          isTop ? '-bottom-1' : '-top-1'
        }`}
        style={{
          borderTop: isTop ? 'none' : '',
          borderLeft: isTop ? 'none' : '',
        }}
      />
    </div>
  )
}
