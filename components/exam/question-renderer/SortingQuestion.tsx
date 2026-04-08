'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { annotateExamText } from './annotate'
import type {
  ExamAnnotationSettings,
  ExamQuestion,
  ExamQuestionOption,
  OnSelectOption,
} from './types'

const SORT_SLOT_TOKEN =
  /([＿_]{2,}|[★＊]|[（(][\s　]*[）)]|[（(]\s*\d+\s*[）)]|\[\s*\d+\s*\]|［\s*\d+\s*］)/
const SLOT_TOKEN_CHECK = new RegExp(`^${SORT_SLOT_TOKEN.source}$`)
const STAR_TOKEN_CHECK = /[★＊]/

type SortingQuestionProps = {
  question: ExamQuestion
  currentAnswer?: string
  onSelect: OnSelectOption
  isSubmitted?: boolean
  annotation: ExamAnnotationSettings
}

const isSlotToken = (segment: string) => SLOT_TOKEN_CHECK.test(segment)

const extractSegments = (question: ExamQuestion) => {
  const sourceText = (question.prompt || question.contextSentence || '').trim()
  if (!sourceText) return []

  const segments = sourceText.split(SORT_SLOT_TOKEN).filter(Boolean)
  return segments
}

const createSlotDraft = (
  slotCount: number,
  options: ExamQuestionOption[],
  currentAnswer?: string,
  starIndex?: number,
) => {
  const nextSlots = Array(slotCount).fill(null) as (ExamQuestionOption | null)[]
  const chosen = options.find(option => option.id === currentAnswer)

  if (
    chosen &&
    typeof starIndex === 'number' &&
    starIndex >= 0 &&
    starIndex < nextSlots.length
  ) {
    nextSlots[starIndex] = chosen
  }

  return {
    slots: nextSlots,
    pool: options.filter(option => option.id !== chosen?.id),
  }
}

export function SortingQuestion({
  question,
  currentAnswer,
  onSelect,
  isSubmitted = false,
  annotation,
}: SortingQuestionProps) {
  const options = question.options || []

  const segments = useMemo(() => extractSegments(question), [question])

  const slotCount = useMemo(() => {
    const detectedSlots = segments.filter(isSlotToken).length
    return Math.max(detectedSlots, options.length)
  }, [options.length, segments])

  const starIndex = useMemo(() => {
    let count = 0
    let index = -1

    segments.forEach(segment => {
      if (!isSlotToken(segment)) return
      if (STAR_TOKEN_CHECK.test(segment)) index = count
      count += 1
    })

    return index
  }, [segments])

  const renderedSegments = useMemo(() => {
    const detectedSlots = segments.filter(isSlotToken).length
    if (detectedSlots >= slotCount) return segments

    const extra = Array.from(
      { length: slotCount - detectedSlots },
      (_, idx) => `__AUTO_SLOT_${idx}__`,
    )
    return [...segments, ' ', ...extra]
  }, [segments, slotCount])

  const [slots, setSlots] = useState<(ExamQuestionOption | null)[]>([])
  const [pool, setPool] = useState<ExamQuestionOption[]>([])

  useEffect(() => {
    const draft = createSlotDraft(slotCount, options, currentAnswer, starIndex)
    setSlots(draft.slots)
    setPool(draft.pool)
  }, [currentAnswer, options, slotCount, starIndex])

  useEffect(() => {
    if (slots.length === 0) return

    if (starIndex >= 0 && slots[starIndex]) {
      onSelect(slots[starIndex]!.id)
      return
    }

    if (starIndex === -1 && slots.every(Boolean) && slots[0]) {
      onSelect(slots[0].id)
    }
  }, [onSelect, slots, starIndex])

  const moveToSlot = (option: ExamQuestionOption, slotIndex?: number) => {
    if (isSubmitted) return
    const targetIndex =
      typeof slotIndex === 'number'
        ? slotIndex
        : slots.findIndex(item => item === null)

    if (targetIndex < 0 || targetIndex >= slots.length) return
    if (slots[targetIndex] !== null) return

    setSlots(prev => {
      const next = [...prev]
      next[targetIndex] = option
      return next
    })
    setPool(prev => prev.filter(item => item.id !== option.id))
  }

  const moveBackToPool = (option: ExamQuestionOption, slotIndex: number) => {
    if (isSubmitted) return
    setSlots(prev => {
      const next = [...prev]
      next[slotIndex] = null
      return next
    })
    setPool(prev =>
      prev.some(item => item.id === option.id) ? prev : [...prev, option],
    )
  }

  return (
    <div className='mt-4'>
      <div
        data-source-type='QUIZ_QUESTION'
        data-source-id={question.id}
        data-context-block='true'
        data-context-role='sorting-sentence'
        className='mb-6 border-b border-orange-200 pb-4 text-base font-medium leading-10 text-gray-800 md:text-lg'>
        {renderedSegments.map((segment, index) => {
          const isAutoSlot = segment.startsWith('__AUTO_SLOT_')
          const shouldRenderSlot = isAutoSlot || isSlotToken(segment)

          if (!shouldRenderSlot) {
            return (
              <span
                key={`sorting-text-${index}`}
                className='align-middle'
                dangerouslySetInnerHTML={{
                  __html: annotateExamText({ text: segment, settings: annotation }),
                }}
              />
            )
          }

          const slotIndex =
            renderedSegments
              .slice(0, index + 1)
              .filter(item => item.startsWith('__AUTO_SLOT_') || isSlotToken(item))
              .length - 1
          const filled = slots[slotIndex]
          const isStar = slotIndex === starIndex

          return (
            <button
              key={`sorting-slot-${slotIndex}-${index}`}
              type='button'
              onClick={() => filled && moveBackToPool(filled, slotIndex)}
              disabled={isSubmitted}
              data-source-type='QUIZ_QUESTION'
              data-source-id={question.id}
              data-context-block='true'
              data-context-role='sorting-slot'
              className={`relative mx-1 inline-flex h-12 min-w-20 items-center justify-center border-b-2 px-3 align-middle transition-colors duration-200 ${
                filled
                  ? 'border-orange-400 bg-white text-gray-800'
                  : 'border-dashed border-gray-300 bg-gray-100/50 text-transparent'
              }`}>
              {isStar && !filled && (
                <span className='absolute -top-5 text-sm text-orange-400'>★</span>
              )}
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
                '占位'
              )}
            </button>
          )
        })}
      </div>

      <div className='min-h-24 border-b border-gray-200 bg-gray-50 p-6'>
        {!isSubmitted && (
          <div className='mb-5 text-center text-xs font-semibold tracking-wide text-gray-500'>
            点击选项填入上方空缺处
          </div>
        )}
        {isSubmitted && (
          <div className='mb-5 text-center text-xs font-semibold tracking-wide text-gray-600'>
            <span>正确答案：</span>
            <span
              dangerouslySetInnerHTML={{
                __html: annotateExamText({
                  text: options.find(option => option.isCorrect)?.text || '未配置',
                  settings: annotation,
                }),
              }}
            />
          </div>
        )}

        <div className='flex flex-wrap justify-center gap-3'>
          {pool.map(option => (
            <button
              key={option.id}
              type='button'
              onClick={() => moveToSlot(option)}
              disabled={isSubmitted}
              data-source-type='QUIZ_QUESTION'
              data-source-id={question.id}
              data-context-block='true'
              data-context-role='sorting-option'
              className='select-none border border-orange-200 bg-white px-6 py-3 font-semibold text-orange-700 transition-colors hover:border-orange-400 active:scale-95'>
              <span
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
            <p className='text-sm text-gray-400'>全部已填入，点击上方词块可撤回。</p>
          )}
        </div>
      </div>
    </div>
  )
}
