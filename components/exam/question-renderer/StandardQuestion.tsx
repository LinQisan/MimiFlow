'use client'

import React from 'react'
import { annotateExamText } from './annotate'
import { OptionsList } from './OptionsList'
import { SortingQuestion } from './SortingQuestion'
import type {
  ExamAnnotationSettings,
  ExamQuestion,
  OnSelectOption,
} from './types'

type StandardQuestionProps = {
  question: ExamQuestion
  currentAnswer?: string
  onSelect: OnSelectOption
  isSubmitted?: boolean
  isJapanesePaper?: boolean
  annotation: ExamAnnotationSettings
}

const TYPE_LABEL_MAP: Record<string, string> = {
  PRONUNCIATION: '读音题',
  SYNONYM_REPLACEMENT: '同义词替换',
  WORD_DISTINCTION: '单词辨析',
  GRAMMAR: '语法题',
  FILL_BLANK: '完形填空',
  SORTING: '排序题',
  LISTENING: '听力题',
  READING_COMPREHENSION: '阅读题',
}

export function StandardQuestion({
  question,
  currentAnswer,
  onSelect,
  isSubmitted = false,
  isJapanesePaper = false,
  annotation,
}: StandardQuestionProps) {
  const questionType = question.questionType || 'UNKNOWN'
  const contextText = (question.contextSentence || '').trim()
  const promptText = (question.prompt || '').trim()
  const typeLabel = TYPE_LABEL_MAP[questionType] || '题目'
  const isReadingFillBlank =
    questionType === 'FILL_BLANK' && Boolean(question.passageId)
  const shouldUseBlankAndFullSentence =
    (questionType === 'FILL_BLANK' || questionType === 'GRAMMAR') &&
    !question.passageId
  const hasAnswered = Boolean(currentAnswer)
  const fillBlankTokenRegex = /\[\s*\d+\s*\]|［\s*\d+\s*］|\(\s*\d+\s*\)|（\s*\d+\s*）|【\s*\d+\s*】|「\s*\d+\s*」|『\s*\d+\s*』|[（(]\s*[）)]|[＿_]{2,}|[★＊]|～/

  if (questionType === 'SORTING') {
    return (
      <div className='mx-auto w-full max-w-3xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-8'>
        <div className='mb-4 inline-block rounded-md border border-orange-100 bg-orange-50 px-3 py-1 text-sm font-medium text-orange-600'>
          {typeLabel}
        </div>
        <SortingQuestion
          question={question}
          currentAnswer={currentAnswer}
          onSelect={onSelect}
          isSubmitted={isSubmitted}
          isJapanesePaper={isJapanesePaper}
          annotation={annotation}
        />
      </div>
    )
  }

  if (isReadingFillBlank) {
    return (
      <div className='mx-auto w-full max-w-3xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-8'>
        <div className='mb-4 inline-block rounded-md border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600'>
          {typeLabel}
        </div>
        <OptionsList
          options={question.options || []}
          currentAnswer={currentAnswer}
          onSelect={onSelect}
          sourceId={question.id}
          isSubmitted={isSubmitted}
          isJapanesePaper={isJapanesePaper}
          annotation={annotation}
        />
      </div>
    )
  }

  const selectedOptionText =
    (question.options || []).find(option => option.id === currentAnswer)?.text ||
    ''
  const pickBlankBaseText = () => {
    const promptHasBlank = fillBlankTokenRegex.test(promptText)
    const contextHasBlank = fillBlankTokenRegex.test(contextText)
    if (promptHasBlank) return promptText
    if (contextHasBlank) return contextText
    return promptText || contextText || '题干缺失'
  }
  const originalQuestionText = shouldUseBlankAndFullSentence
    ? pickBlankBaseText()
    : contextText || promptText || '题干缺失'

  const promptWithSelectedAnswer = (() => {
    if (!selectedOptionText) return originalQuestionText
    if (!fillBlankTokenRegex.test(originalQuestionText)) return originalQuestionText
    return originalQuestionText.replace(fillBlankTokenRegex, selectedOptionText)
  })()

  const mainText = shouldUseBlankAndFullSentence
    ? isSubmitted
      ? originalQuestionText
      : hasAnswered
        ? promptWithSelectedAnswer
        : originalQuestionText
    : originalQuestionText

  const synonymRenderedText = (() => {
    if (questionType !== 'SYNONYM_REPLACEMENT') return mainText
    if (isSubmitted) return originalQuestionText
    if (!question.targetWord || !selectedOptionText) return mainText

    const replacement = selectedOptionText
    if (!replacement) return mainText

    return mainText.replace(question.targetWord, replacement)
  })()

  return (
    <div className='mx-auto w-full max-w-3xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-8'>
      <div className='mb-4 inline-block rounded-md border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600'>
        {typeLabel}
      </div>

      <div
        data-source-type='QUIZ_QUESTION'
        data-source-id={question.id}
        data-context-block='true'
        data-context-role='question-context'
        className={`text-xl font-medium leading-relaxed text-gray-900 ${
          isJapanesePaper ? 'exam-japanese-text' : ''
        }`}
        dangerouslySetInnerHTML={{
          __html:
            (questionType === 'FILL_BLANK' ||
              (questionType === 'GRAMMAR' && shouldUseBlankAndFullSentence))
              ? annotateExamText({
                  text: mainText,
                  fillBlank: true,
                  settings: annotation,
                })
                : questionType === 'SYNONYM_REPLACEMENT'
                ? annotateExamText({
                    text: synonymRenderedText,
                    targetWord:
                      isSubmitted || !selectedOptionText
                        ? question.targetWord
                        : undefined,
                    settings: annotation,
                  })
                : annotateExamText({
                    text: mainText,
                    targetWord: question.targetWord,
                    settings: annotation,
                  }),
        }}
      />

      <OptionsList
        options={question.options || []}
        currentAnswer={currentAnswer}
        onSelect={onSelect}
        sourceId={question.id}
        isSubmitted={isSubmitted}
        isJapanesePaper={isJapanesePaper}
        annotation={annotation}
      />
    </div>
  )
}
