'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { annotateExamText } from './annotate'
import type {
  ExamAnnotationSettings,
  ExamQuestion,
  ExamQuestionOption,
  OnSelectOption,
} from './types'
import { parseSortingPrompt } from '@/modules/practice/domain/question-text'

type SortingQuestionProps = {
  question: ExamQuestion
  currentAnswer?: string
  currentOrder?: Array<string | null>
  onSelect: OnSelectOption
  onClear?: () => void
  onOrderChange?: (order: Array<string | null>) => void
  isSubmitted?: boolean
  isInteractionLocked?: boolean
  isJapanesePaper?: boolean
  annotation: ExamAnnotationSettings
}

const resolveOptionOrder = (
  order: Array<string | null> | undefined,
  options: ExamQuestionOption[],
) => {
  if (!order) return []
  return order.map(id => options.find(option => option.id === id) || null)
}

const createSlotDraft = (
  slotCount: number,
  options: ExamQuestionOption[],
  currentOrder?: Array<string | null>,
  currentAnswer?: string,
  starIndex?: number,
) => {
  const nextSlots = Array(slotCount).fill(null) as (ExamQuestionOption | null)[]
  const seen = new Set<string>()
  currentOrder?.slice(0, slotCount).forEach((optionId, index) => {
    if (!optionId || seen.has(optionId)) return
    const option = options.find(item => item.id === optionId)
    if (!option) return
    nextSlots[index] = option
    seen.add(optionId)
  })
  const chosen = options.find(option => option.id === currentAnswer)

  if (
    chosen &&
    !seen.has(chosen.id) &&
    typeof starIndex === 'number' &&
    starIndex >= 0 &&
    starIndex < nextSlots.length
  ) {
    nextSlots[starIndex] = chosen
  }

  return {
    slots: nextSlots,
    pool: options.filter(
      option => !seen.has(option.id) && option.id !== chosen?.id,
    ),
  }
}

export function SortingQuestion({
  question,
  currentAnswer,
  currentOrder,
  onSelect,
  onClear,
  onOrderChange,
  isSubmitted = false,
  isInteractionLocked = isSubmitted,
  isJapanesePaper = false,
  annotation,
}: SortingQuestionProps) {
  const options = useMemo(() => question.options || [], [question.options])
  const promptText = (question.prompt || '').trim()
  const parsedPrompt = useMemo(
    () => parseSortingPrompt(promptText),
    [promptText],
  )
  const segments = parsedPrompt.segments

  const slotCount = useMemo(() => {
    return Math.max(parsedPrompt.slotCount, options.length)
  }, [options.length, parsedPrompt.slotCount])

  const starIndex = parsedPrompt.starIndex

  const renderedSegments = useMemo(() => {
    const detectedSlots = parsedPrompt.slotCount
    if (detectedSlots >= slotCount) return segments

    const extra = Array.from(
      { length: slotCount - detectedSlots },
      (_, idx) => ({
        text: `__AUTO_SLOT_${idx}__`,
        slotIndex: detectedSlots + idx,
        isStar: false,
      }),
    )
    return [
      ...segments,
      { text: ' ', slotIndex: null, isStar: false },
      ...extra,
    ]
  }, [parsedPrompt.slotCount, segments, slotCount])

  const [slots, setSlots] = useState<(ExamQuestionOption | null)[]>([])
  const [pool, setPool] = useState<ExamQuestionOption[]>([])
  const correctSlots = useMemo(
    () => resolveOptionOrder(question.correctOrder, options),
    [options, question.correctOrder],
  )
  const correctOption = starIndex >= 0 ? correctSlots[starIndex] : null

  useEffect(() => {
    const initialAnswerId = currentOrder?.some(Boolean) ? undefined : currentAnswer
    const draft = createSlotDraft(
      slotCount,
      options,
      currentOrder,
      initialAnswerId,
      starIndex,
    )
    setSlots(draft.slots)
    setPool(draft.pool)
  }, [
    currentAnswer,
    currentOrder,
    isSubmitted,
    question.id,
    options,
    slotCount,
    starIndex,
  ])

  const syncAnswer = useCallback(
    (nextSlots: Array<ExamQuestionOption | null>) => {
      if (starIndex >= 0 && nextSlots.every(Boolean)) {
        const starOption = nextSlots[starIndex]
        if (starOption) onSelect(starOption.id)
        else onClear?.()
        return
      }

      if (starIndex >= 0) {
        onClear?.()
        return
      }

      if (nextSlots.every(Boolean) && nextSlots[0]) {
        onSelect(nextSlots[0].id)
      } else {
        onClear?.()
      }
    },
    [onClear, onSelect, starIndex],
  )

  const moveToSlot = (option: ExamQuestionOption, slotIndex?: number) => {
    if (isInteractionLocked) return
    const targetIndex =
      typeof slotIndex === 'number'
        ? slotIndex
        : slots.findIndex(item => item === null)

    if (targetIndex < 0 || targetIndex >= slots.length) return
    if (slots[targetIndex] !== null) return

    const next = [...slots]
    next[targetIndex] = option
    setSlots(next)
    onOrderChange?.(next.map(item => item?.id || null))
    syncAnswer(next)
    setPool(prev => prev.filter(item => item.id !== option.id))
  }

  const moveBackToPool = (option: ExamQuestionOption, slotIndex: number) => {
    if (isInteractionLocked) return
    const next = [...slots]
    next[slotIndex] = null
    setSlots(next)
    onOrderChange?.(next.map(item => item?.id || null))
    syncAnswer(next)
    setPool(prev =>
      prev.some(item => item.id === option.id) ? prev : [...prev, option],
    )
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        isInteractionLocked ||
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (target instanceof HTMLElement &&
          target.closest(
            'input, textarea, select, [contenteditable="true"], [role="dialog"]',
          ))
      ) {
        return
      }

      const optionNumber =
        /^Digit[1-4]$/.test(event.code) || /^Numpad[1-4]$/.test(event.code)
          ? Number(event.code.at(-1))
          : /^[1-4]$/.test(event.key)
            ? Number(event.key)
            : 0
      if (!optionNumber) return

      const option = options[optionNumber - 1]
      const targetIndex = slots.findIndex(item => item === null)
      if (
        !option ||
        targetIndex < 0 ||
        !pool.some(item => item.id === option.id)
      ) {
        return
      }

      event.preventDefault()
      const next = [...slots]
      next[targetIndex] = option
      setSlots(next)
      onOrderChange?.(next.map(item => item?.id || null))
      syncAnswer(next)
      setPool(previous => previous.filter(item => item.id !== option.id))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isInteractionLocked, onOrderChange, options, pool, slots, syncAnswer])

  return (
    <div className='mt-4'>
      <div
        data-source-type='QUIZ_QUESTION'
        data-source-id={question.id}
        data-context-block='true'
        data-context-role='sorting-sentence'
        data-context-sentence='true'
        className={`mb-6 border-b border-orange-200 pb-4 text-base font-medium leading-10 text-gray-800 md:text-lg ${
          isJapanesePaper ? 'exam-japanese-text' : ''
        }`}>
        {renderedSegments.map((segment, index) => {
          const shouldRenderSlot = segment.slotIndex !== null

          if (!shouldRenderSlot) {
            return (
              <span
                key={`sorting-text-${index}`}
                className='align-middle'
                dangerouslySetInnerHTML={{
                  __html: annotateExamText({
                    text: segment.text,
                    settings: annotation,
                  }),
                }}
              />
            )
          }

          const slotIndex = segment.slotIndex!
          const filled = slots[slotIndex]
          const isStar = segment.isStar || slotIndex === starIndex
          const positionIsCorrect =
            isSubmitted &&
            Boolean(filled) &&
            filled?.id === correctSlots[slotIndex]?.id

          return (
            <button
              key={`sorting-slot-${slotIndex}-${index}`}
              type='button'
              onClick={event => {
                const selection = window.getSelection()
                if (event.detail !== 0 && selection?.toString().trim() && selection.containsNode(event.currentTarget, true)) return
                if (filled) moveBackToPool(filled, slotIndex)
              }}
              data-selection-text='true'
              disabled={isInteractionLocked}
              data-source-type='QUIZ_QUESTION'
              data-source-id={question.id}
              data-context-block='true'
              data-context-role='sorting-slot'
              aria-label={`${isStar ? '星号' : `第 ${slotIndex + 1}`}排序位${filled ? `：${filled.text}` : ''}`}
              className={`relative mx-1 inline-flex min-h-12 min-w-24 items-center justify-center rounded-lg border px-3 align-middle shadow-sm transition-colors duration-200 ${
                isSubmitted && filled
                  ? positionIsCorrect
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                    : 'border-rose-400 bg-rose-50 text-rose-900'
                  : filled
                    ? 'border-orange-300 bg-orange-50 text-gray-800'
                  : 'border-dashed border-slate-300 bg-slate-50 text-slate-400'
              }`}>
              <span data-context-ignore='true' aria-hidden='true' className='select-none absolute -top-2.5 left-2 rounded-full bg-white px-1.5 text-[10px] font-bold leading-5 text-orange-500 shadow-sm'>
                {isStar ? '★' : slotIndex + 1}
              </span>
              {filled ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: annotateExamText({
                      text: filled.text || '',
                      settings: annotation,
                    }),
                  }}
                />
              ) : (
                ' '
              )}
            </button>
          )
        })}
      </div>

      <div className='min-h-24 border-b border-gray-200 bg-gray-50 p-6'>
        {!isSubmitted && (
          <div className='mb-5 text-center text-xs font-semibold tracking-wide text-gray-500'>
            {isInteractionLocked
              ? '本题未作答，本次不显示答案'
              : '点击选项填入上方空缺处'}
          </div>
        )}
        {!isSubmitted && (
          <div className='flex flex-wrap justify-center gap-3'>
            {pool.map(option => (
              <button
                key={option.id}
                type='button'
                onClick={() => moveToSlot(option)}
                disabled={isInteractionLocked}
                data-source-type='QUIZ_QUESTION'
                data-source-id={question.id}
                data-context-block='true'
                data-context-role='sorting-option'
                className='select-none border border-orange-200 bg-white px-6 py-3 font-semibold text-orange-700 transition-colors hover:border-orange-400 active:scale-95 disabled:cursor-default disabled:border-slate-200 disabled:text-slate-500 disabled:hover:border-slate-200'>
                <span
                  className={isJapanesePaper ? 'exam-japanese-text' : ''}
                  dangerouslySetInnerHTML={{
                    __html: annotateExamText({
                      text: option.text || '',
                      settings: annotation,
                    }),
                  }}
                />
              </button>
            ))}

            {pool.length === 0 && (
              <p className='text-sm text-gray-400'>
                全部已填入，点击上方词块可撤回。
              </p>
            )}
          </div>
        )}

        {isSubmitted && (
          <div
            data-source-type='QUIZ_QUESTION'
            data-source-id={question.id}
            data-context-block='true'
            data-context-role='sorting-result'
            className='mx-auto max-w-4xl space-y-5'>
            {[
              { label: '你的排列', values: slots, compare: true },
              { label: '正确排列', values: correctSlots, compare: false },
            ].map(row => (
              <div key={row.label}>
                <div className='mb-2 text-xs font-bold tracking-wide text-slate-600'>
                  {row.label}：
                </div>
                <div className='flex flex-wrap items-center gap-2' aria-label={row.label}>
                  {row.values.map((option, index) => {
                    const positionIsCorrect = option?.id === correctSlots[index]?.id
                    const tone = row.compare
                      ? positionIsCorrect
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'border-rose-300 bg-rose-50 text-rose-900'
                      : 'border-slate-300 bg-white text-slate-800'
                    return (
                      <span key={`${row.label}-${index}`} className='contents'>
                        {index > 0 && <span aria-hidden='true' className='text-slate-400'>→</span>}
                        <span className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tone}`}>
                          {index === starIndex && <span className='mr-1 text-orange-600'>★</span>}
                          <span
                            className={isJapanesePaper ? 'exam-japanese-text' : ''}
                            dangerouslySetInnerHTML={{
                              __html: annotateExamText({
                                text: option?.text || '未作答',
                                settings: annotation,
                              }),
                            }}
                          />
                        </span>
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
            <div
              data-source-type='QUIZ_QUESTION'
              data-source-id={question.id}
              data-context-block='true'
              data-context-role='sorting-correct-answer'
              className='border-t border-slate-200 pt-4 text-sm font-bold text-slate-700'>
              <span>★ 正确答案：</span>
              <span
                className='text-emerald-700'
                dangerouslySetInnerHTML={{
                  __html: annotateExamText({
                    text: correctOption?.text || '未配置',
                    settings: annotation,
                  }),
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
