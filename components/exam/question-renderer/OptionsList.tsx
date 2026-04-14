'use client'

import React from 'react'
import { annotateExamText } from './annotate'
import type {
  ExamAnnotationSettings,
  ExamQuestionOption,
  OnSelectOption,
} from './types'

type OptionsListProps = {
  options?: ExamQuestionOption[]
  currentAnswer?: string
  onSelect: OnSelectOption
  sourceId: string
  isSubmitted?: boolean
  isJapanesePaper?: boolean
  annotation: ExamAnnotationSettings
}

const optionLabel = (index: number) => String.fromCharCode(65 + index)

const isAudioOnlyOptions = (options: ExamQuestionOption[]) =>
  options.length > 0 && options.every(option => !(option.text || '').trim())

export function OptionsList({
  options = [],
  currentAnswer,
  onSelect,
  sourceId,
  isSubmitted = false,
  isJapanesePaper = false,
  annotation,
}: OptionsListProps) {
  if (options.length === 0) {
    return <div className='mt-4 text-sm text-slate-400'>暂无选项</div>
  }

  const audioOnly = isAudioOnlyOptions(options)
  const correctOptionId = options.find(option => option.isCorrect)?.id

  return (
    <div className='mt-6 grid gap-3'>
      {options.map((option, index) => {
        const isSelected = currentAnswer === option.id
        const isCorrect = correctOptionId === option.id
        const isWrongSelected = isSubmitted && isSelected && !isCorrect
        const optionClassName = `group flex items-start rounded-xl border px-5 py-4 text-left transition-all duration-200 ${
          isSubmitted
            ? isCorrect
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : isWrongSelected
                ? 'border-rose-300 bg-rose-50 text-rose-900'
                : 'border-slate-200 bg-white text-slate-500'
            : isSelected
              ? 'border-slate-900 bg-slate-100 text-slate-900 shadow-sm ring-1 ring-slate-400'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
        }`
        const content = (
          <>
            <span
              className={`mr-3 mt-0.5 font-semibold ${
                isSubmitted
                  ? isCorrect
                    ? 'text-emerald-600'
                    : isWrongSelected
                      ? 'text-rose-600'
                      : 'text-slate-400'
                  : isSelected
                    ? 'text-slate-900'
                    : 'text-slate-400 group-hover:text-slate-600'
              }`}>
              {optionLabel(index)}.
            </span>
            {audioOnly ? (
              <span
                className={`cursor-text select-text leading-relaxed ${
                  isJapanesePaper ? 'exam-japanese-text' : ''
                }`}>{`选项 ${optionLabel(index)}`}</span>
            ) : (
              <span
                className={`cursor-text select-text leading-relaxed ${
                  isJapanesePaper ? 'exam-japanese-text' : ''
                }`}
                dangerouslySetInnerHTML={{
                  __html: annotateExamText({
                    text: option.text || '',
                    settings: annotation,
                  }),
                }}
              />
            )}
            {isSubmitted && isCorrect && (
              <span className='ml-2 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700'>
                正确答案
              </span>
            )}
            {isSubmitted && isWrongSelected && (
              <span className='ml-2 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700'>
                你的选择
              </span>
            )}
          </>
        )

        if (isSubmitted) {
          return (
            <div
              key={option.id}
              data-source-type='QUIZ_QUESTION'
              data-source-id={sourceId}
              data-context-block='true'
              data-context-role='question-option'
              className={optionClassName}>
              {content}
            </div>
          )
        }

        return (
          <button
            key={option.id}
            type='button'
            onClick={() => {
              if (isSubmitted) return
              const selectedText = window.getSelection()?.toString().trim() || ''
              // 当用户在选项文本上划词时，不触发选项选择，优先弹出 WordTooltip。
              if (selectedText.length > 0) return
              onSelect(option.id)
            }}
            aria-disabled={isSubmitted}
            data-source-type='QUIZ_QUESTION'
            data-source-id={sourceId}
            data-context-block='true'
            data-context-role='question-option'
            className={optionClassName}>
            {content}
          </button>
        )
      })}
    </div>
  )
}
