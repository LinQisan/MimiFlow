'use client'

import { useRef } from 'react'
import Image from 'next/image'
import { annotateExamText } from './annotate'
import type {
  ExamAnnotationSettings,
  ExamQuestionOption,
  OnSelectOption,
} from './types'
import {
  formatOptionLabel,
  normalizeOptionLabelFormat,
  type OptionLabelFormat,
} from '@/utils/questions/optionLabels'

type OptionsListProps = {
  options?: ExamQuestionOption[]
  currentAnswer?: string
  onSelect: OnSelectOption
  sourceId: string
  isSubmitted?: boolean
  isInteractionLocked?: boolean
  isJapanesePaper?: boolean
  optionLabelFormat?: OptionLabelFormat | null
  customOptionLabels?: string[]
  optionTargetWord?: string | null
  compact?: boolean
  annotation: ExamAnnotationSettings
}

const isAudioOnlyOptions = (options: ExamQuestionOption[]) =>
  options.length > 0 &&
  options.every(option => !(option.text || '').trim() && !option.imageUrl)

type SelectionSnapshot = {
  text: string
  anchorNode: Node | null
  anchorOffset: number
  focusNode: Node | null
  focusOffset: number
}

const readSelectionSnapshot = (): SelectionSnapshot => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return {
      text: '',
      anchorNode: null,
      anchorOffset: 0,
      focusNode: null,
      focusOffset: 0,
    }
  }

  return {
    text: selection.toString().trim(),
    anchorNode: selection.anchorNode,
    anchorOffset: selection.anchorOffset,
    focusNode: selection.focusNode,
    focusOffset: selection.focusOffset,
  }
}

const selectionChanged = (
  before: SelectionSnapshot,
  after: SelectionSnapshot,
) =>
  before.text !== after.text ||
  before.anchorNode !== after.anchorNode ||
  before.anchorOffset !== after.anchorOffset ||
  before.focusNode !== after.focusNode ||
  before.focusOffset !== after.focusOffset

const selectionTouchesElement = (
  selection: SelectionSnapshot,
  element: HTMLElement,
) =>
  Boolean(
    (selection.anchorNode && element.contains(selection.anchorNode)) ||
    (selection.focusNode && element.contains(selection.focusNode)),
  )

export function OptionsList({
  options = [],
  currentAnswer,
  onSelect,
  sourceId,
  isSubmitted = false,
  isInteractionLocked = isSubmitted,
  isJapanesePaper = false,
  optionLabelFormat,
  customOptionLabels = [],
  optionTargetWord,
  compact = false,
  annotation,
}: OptionsListProps) {
  const pointerStartSelectionRef = useRef<SelectionSnapshot | null>(null)
  const suppressNextClickRef = useRef(false)

  if (options.length === 0) {
    return <div className='mt-4 text-sm text-slate-400'>暂无选项</div>
  }

  const audioOnly = isAudioOnlyOptions(options)
  const correctOptionId = options.find(option => option.isCorrect)?.id
  const resolvedLabelFormat = normalizeOptionLabelFormat(
    optionLabelFormat,
    'numeric',
  )
  const hasImageOptions = options.some(option => Boolean(option.imageUrl))

  if (audioOnly) {
    return (
      <div
        className={`${compact ? 'mt-3' : 'mt-7'} flex flex-wrap items-center gap-3 py-2`}>
        {options.map((option, index) => {
          const label = formatOptionLabel(
            index,
            resolvedLabelFormat,
            customOptionLabels,
          )
          const isSelected = currentAnswer === option.id
          const isCorrect = correctOptionId === option.id
          const isWrongSelected = isSubmitted && isSelected && !isCorrect
          const stateClass = isSubmitted
            ? isCorrect
              ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
              : isWrongSelected
                ? 'border-rose-500 bg-rose-50 text-rose-800'
                : 'border-slate-200 bg-white text-slate-400'
            : isSelected
              ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-600 hover:bg-slate-50'
          const content = (
            <>
              <span className='text-base font-bold'>{label}</span>
              {isSubmitted && isCorrect ? (
                <span className='sr-only'>正确答案</span>
              ) : null}
              {isSubmitted && isWrongSelected ? (
                <span className='sr-only'>你的选择</span>
              ) : null}
            </>
          )
          const className = `inline-flex h-12 min-w-14 items-center justify-center rounded-lg border px-4 transition-colors ${stateClass}`

          if (isInteractionLocked) {
            return (
              <div
                key={option.id}
                data-source-type='QUIZ_QUESTION'
                data-source-id={sourceId}
                data-context-block='true'
                data-context-role='question-option'
                aria-label={`选项 ${label}`}
                className={className}>
                {content}
              </div>
            )
          }

          return (
            <button
              key={option.id}
              type='button'
              onClick={() => onSelect(option.id)}
              data-source-type='QUIZ_QUESTION'
              data-source-id={sourceId}
              data-context-block='true'
              data-context-role='question-option'
              aria-label={`选择选项 ${label}`}
              aria-pressed={isSelected}
              aria-keyshortcuts={`${index + 1}`}
              className={className}>
              {content}
            </button>
          )
        })}
      </div>
    )
  }

  if (hasImageOptions) {
    return (
      <div className={`${compact ? 'mt-3' : 'mt-7'} grid grid-cols-2 gap-3 md:grid-cols-4`}>
        {options.map((option, index) => {
          const label = formatOptionLabel(
            index,
            resolvedLabelFormat,
            customOptionLabels,
          )
          const isSelected = currentAnswer === option.id
          const isCorrect = correctOptionId === option.id
          const isWrongSelected = isSubmitted && isSelected && !isCorrect
          const stateClass = isSubmitted
            ? isCorrect
              ? 'border-emerald-500 bg-emerald-50'
              : isWrongSelected
                ? 'border-rose-500 bg-rose-50'
                : 'border-slate-200 bg-white opacity-60'
            : isSelected
              ? 'border-slate-950 bg-slate-50 ring-1 ring-slate-950'
              : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'
          const content = (
            <>
              <span className={`absolute left-2 top-2 z-10 flex h-7 min-w-7 items-center justify-center bg-white px-1.5 text-xs font-bold shadow-sm ${
                isSelected ? 'text-slate-950' : 'text-slate-500'
              }`}>
                {label}
              </span>
              {option.imageUrl ? (
                <Image
                  src={option.imageUrl}
                  alt={`选项 ${label}`}
                  width={480}
                  height={320}
                  unoptimized
                  className='max-h-52 w-full object-contain'
                />
              ) : (
                <span className='text-xs font-medium text-slate-400'>未上传图片</span>
              )}
              {isSubmitted && (isCorrect || isWrongSelected) ? (
                <span className={`absolute bottom-2 right-2 px-2 py-1 text-[11px] font-bold ${
                  isCorrect
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}>
                  {isCorrect ? '正确答案' : '你的选择'}
                </span>
              ) : null}
            </>
          )

          const className = `relative flex min-h-32 w-full items-center justify-center overflow-hidden border p-2 text-left transition-colors ${stateClass}`
          if (isInteractionLocked) {
            return (
              <div
                key={option.id}
                data-source-type='QUIZ_QUESTION'
                data-source-id={sourceId}
                data-context-block='true'
                data-context-role='question-option'
                className={className}>
                {content}
              </div>
            )
          }
          return (
            <button
              key={option.id}
              type='button'
              onClick={() => onSelect(option.id)}
              data-source-type='QUIZ_QUESTION'
              data-source-id={sourceId}
              data-context-block='true'
              data-context-role='question-option'
              aria-label={`选择选项 ${label}`}
              className={className}>
              {content}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className={`${compact ? 'mt-2' : 'mt-7'} divide-y divide-slate-200 border-y border-slate-200`}>
      {options.map((option, index) => {
        const label = formatOptionLabel(
          index,
          resolvedLabelFormat,
          customOptionLabels,
        )
        const isSelected = currentAnswer === option.id
        const isCorrect = correctOptionId === option.id
        const isWrongSelected = isSubmitted && isSelected && !isCorrect
        const optionClassName = `group flex w-full items-start px-2 ${compact ? 'py-3' : 'py-4'} text-left transition-colors duration-150 md:px-3 ${
          isSubmitted
            ? isCorrect
              ? 'bg-emerald-50 text-emerald-900'
              : isWrongSelected
                ? 'bg-rose-50 text-rose-900'
                : 'text-slate-500'
            : isSelected
              ? 'bg-slate-200/70 text-slate-950'
              : 'text-slate-700 hover:bg-slate-100/70'
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
              {label}.
            </span>
            <span
              className={`cursor-text select-text leading-relaxed ${
                isJapanesePaper ? 'exam-japanese-text' : ''
              }`}
              dangerouslySetInnerHTML={{
                __html: annotateExamText({
                  text: option.text || '',
                  targetWord: optionTargetWord,
                  fuzzyTarget: Boolean(optionTargetWord),
                  settings: annotation,
                }),
              }}
            />
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

        if (isInteractionLocked) {
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
            onPointerDown={() => {
              pointerStartSelectionRef.current = readSelectionSnapshot()
              suppressNextClickRef.current = false
            }}
            onPointerUp={event => {
              const before = pointerStartSelectionRef.current
              pointerStartSelectionRef.current = null
              if (!before) return

              const after = readSelectionSnapshot()
              // 只有本次手势新产生了选项文本选区时，才拦截 click。
              // 页面其他位置残留的选区不应阻止选择答案。
              suppressNextClickRef.current =
                Boolean(after.text) &&
                selectionChanged(before, after) &&
                selectionTouchesElement(after, event.currentTarget)
            }}
            onClick={() => {
              if (isInteractionLocked) return
              if (suppressNextClickRef.current) {
                suppressNextClickRef.current = false
                return
              }
              onSelect(option.id)
            }}
            aria-disabled={isInteractionLocked}
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
