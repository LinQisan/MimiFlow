'use client'

import { annotateExamText } from './annotate'
import { OptionsList } from './OptionsList'
import { SortingQuestion } from './SortingQuestion'
import { WrongQuestionBadge } from './WrongQuestionBadge'
import type {
  ExamAnnotationSettings,
  ExamQuestion,
  OnSelectOption,
} from './types'
import {
  fillQuestionBlank,
  QUESTION_BLANK_PATTERN,
} from '@/modules/practice/domain/question-text'
import {
  hasStructuredText,
  renderSafeStructuredText,
} from './structuredText'

type StandardQuestionProps = {
  question: ExamQuestion
  currentAnswer?: string
  currentSortingOrder?: Array<string | null>
  onSelect: OnSelectOption
  onClear?: () => void
  onSortingOrderChange?: (order: Array<string | null>) => void
  isSubmitted?: boolean
  isInteractionLocked?: boolean
  isWrongReview?: boolean
  isJapanesePaper?: boolean
  annotation: ExamAnnotationSettings
}

export function StandardQuestion({
  question,
  currentAnswer,
  currentSortingOrder,
  onSelect,
  onClear,
  onSortingOrderChange,
  isSubmitted = false,
  isInteractionLocked = isSubmitted,
  isWrongReview = false,
  isJapanesePaper = false,
  annotation,
}: StandardQuestionProps) {
  const questionType = question.questionType || 'UNKNOWN'
  const contextText = (question.contextSentence || '').trim()
  const promptText = (question.prompt || '').trim()
  const isReadingFillBlank =
    (questionType === 'FILL_BLANK' ||
      questionType === 'TOEIC_TEXT_COMPLETION') &&
    Boolean(question.passageId)
  const shouldUseBlankAndFullSentence =
    (questionType === 'FILL_BLANK' ||
      questionType === 'GRAMMAR' ||
      questionType === 'GRAMMAR_SELECTION' ||
      questionType === 'TOEIC_INCOMPLETE_SENTENCES') &&
    !question.passageId
  const hasAnswered = Boolean(currentAnswer)

  if (questionType === 'SORTING') {
    return (
      <div className='mx-auto w-full max-w-3xl py-6 md:py-10'>
        {isWrongReview ? (
          <div className='mb-4'>
            <WrongQuestionBadge />
          </div>
        ) : null}
        <SortingQuestion
          question={question}
          currentAnswer={currentAnswer}
          currentOrder={currentSortingOrder}
          onSelect={onSelect}
          onClear={onClear}
          onOrderChange={onSortingOrderChange}
          isSubmitted={isSubmitted}
          isInteractionLocked={isInteractionLocked}
          isJapanesePaper={isJapanesePaper}
          annotation={annotation}
        />
      </div>
    )
  }

  if (isReadingFillBlank) {
    return (
      <div className='mx-auto w-full max-w-3xl py-6 md:py-10'>
        {isWrongReview ? (
          <div className='mb-4'>
            <WrongQuestionBadge />
          </div>
        ) : null}
        <OptionsList
          options={question.options || []}
          currentAnswer={currentAnswer}
          onSelect={onSelect}
          sourceId={question.id}
          isSubmitted={isSubmitted}
          isInteractionLocked={isInteractionLocked}
          isJapanesePaper={isJapanesePaper}
          optionLabelFormat={question.optionLabelFormat}
          customOptionLabels={question.customOptionLabels}
          annotation={annotation}
        />
      </div>
    )
  }

  const selectedOptionText =
    (question.options || []).find(option => option.id === currentAnswer)
      ?.text || ''
  const pickBlankBaseText = () => {
    const promptHasBlank = QUESTION_BLANK_PATTERN.test(promptText)
    const contextHasBlank = QUESTION_BLANK_PATTERN.test(contextText)
    if (promptHasBlank) return promptText
    if (contextHasBlank) return contextText
    return promptText || contextText || '题干缺失'
  }
  const originalQuestionText = shouldUseBlankAndFullSentence
    ? pickBlankBaseText()
    : contextText || promptText || '题干缺失'

  const promptWithSelectedAnswer = (() => {
    if (!selectedOptionText) return originalQuestionText
    return fillQuestionBlank(originalQuestionText, selectedOptionText)
  })()

  const mainText = shouldUseBlankAndFullSentence
    ? isSubmitted
      ? originalQuestionText
      : hasAnswered
        ? promptWithSelectedAnswer
        : originalQuestionText
    : originalQuestionText
  const mainTextIsStructured = hasStructuredText(mainText)

  return (
    <div className='mx-auto w-full max-w-3xl py-6 md:py-10'>
      {isWrongReview ? (
        <div className='mb-4'>
          <WrongQuestionBadge />
        </div>
      ) : null}
      <div
        data-source-type='QUIZ_QUESTION'
        data-source-id={question.id}
        data-context-block='true'
        data-context-role='question-context'
        className={`text-xl font-medium leading-relaxed text-slate-900 ${
          isJapanesePaper ? 'exam-japanese-text' : ''
        }`}
        dangerouslySetInnerHTML={{
          __html: renderSafeStructuredText(
            questionType === 'FILL_BLANK' ||
              questionType === 'TOEIC_TEXT_COMPLETION' ||
              ((questionType === 'GRAMMAR' ||
                questionType === 'GRAMMAR_SELECTION' ||
                questionType === 'TOEIC_INCOMPLETE_SENTENCES') &&
                shouldUseBlankAndFullSentence)
              ? annotateExamText({
                  text: mainText,
                  fillBlank: true,
                  preserveNewlines: mainTextIsStructured,
                  settings: annotation,
                })
              : annotateExamText({
                  text: mainText,
                  targetWord: question.targetWord,
                  preserveNewlines: mainTextIsStructured,
                  settings: annotation,
                }),
          ),
        }}
      />

      <OptionsList
        options={question.options || []}
        currentAnswer={currentAnswer}
        onSelect={onSelect}
        sourceId={question.id}
        isSubmitted={isSubmitted}
        isInteractionLocked={isInteractionLocked}
        isJapanesePaper={isJapanesePaper}
        optionLabelFormat={question.optionLabelFormat}
        customOptionLabels={question.customOptionLabels}
        optionTargetWord={
          questionType === 'WORD_DISTINCTION'
            ? question.targetWord || promptText
            : undefined
        }
        annotation={annotation}
      />
    </div>
  )
}
