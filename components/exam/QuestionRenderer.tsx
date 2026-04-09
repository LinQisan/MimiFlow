'use client'

import React, { useRef } from 'react'
import { StandardQuestion } from './question-renderer/StandardQuestion'
import { OptionsList } from './question-renderer/OptionsList'
import { annotateExamText } from './question-renderer/annotate'
import { buildReadingPassageHtml } from './question-renderer/readingPassage'
import { ListeningTranscript } from './question-renderer/ListeningTranscript'
import type {
  ExamAnnotationSettings,
  ExamQuestion,
  OnSelectOption,
} from './question-renderer/types'

type QuestionRendererProps = {
  question: ExamQuestion
  allQuestions?: ExamQuestion[]
  currentAnswer?: string
  answerMap?: Record<string, string>
  onSelect: OnSelectOption
  isSubmitted?: boolean
  isJapanesePaper?: boolean
  annotation: ExamAnnotationSettings
}

function ReadingQuestion({
  question,
  allQuestions = [],
  currentAnswer,
  answerMap = {},
  onSelect,
  isSubmitted = false,
  isJapanesePaper = false,
  annotation,
}: QuestionRendererProps) {
  const relatedFillBlankQuestions = allQuestions
    .filter(
      item =>
        item.passageId === question.passageId &&
        item.questionType === 'FILL_BLANK',
    )
    .sort((a, b) => (a.order || 0) - (b.order || 0))

  return (
    <div className='mx-auto w-full flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)] lg:items-start '>
      <section className='custom-scrollbar relative w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8 lg:max-h-[78vh]'>
        <article
          data-source-type='ARTICLE_TEXT'
          data-source-id={question.passage?.id || ''}
          data-context-block='true'
          data-context-role='reading-passage'
          className={`reading-passage-body mx-auto max-w-[76ch] whitespace-pre-wrap text-[1.12rem] leading-[2.08] text-gray-700 md:text-[1.2rem] md:leading-[2.15] ${
            isJapanesePaper ? 'exam-japanese-text' : ''
          }`}
          dangerouslySetInnerHTML={{
            __html: buildReadingPassageHtml({
              question,
              fillBlankQuestions: relatedFillBlankQuestions,
              answerMap,
              isSubmitted,
              annotation,
            }),
          }}
        />
      </section>

      <aside className='custom-scrollbar w-full overflow-y-auto rounded-2xl border border-gray-200 bg-slate-50/60 p-4 shadow-sm md:p-5 lg:sticky lg:top-24 lg:max-h-[78vh]'>
        <div className='mx-auto w-full max-w-xl'>
          <div className='mb-3 border-b border-slate-200 pb-2'>
            <p className='text-xs font-bold tracking-wide text-slate-500'>
              作答面板
            </p>
          </div>
          <StandardQuestion
            question={question}
            currentAnswer={currentAnswer}
            onSelect={onSelect}
            isSubmitted={isSubmitted}
            isJapanesePaper={isJapanesePaper}
            annotation={annotation}
          />
        </div>
      </aside>
    </div>
  )
}

function ListeningQuestion({
  question,
  currentAnswer,
  onSelect,
  isSubmitted = false,
  isJapanesePaper = false,
  annotation,
}: QuestionRendererProps) {
  const dialogueSourceId = question.lessonId || question.id
  const audioRef = useRef<HTMLAudioElement>(null)
  const dialogues = question.lesson?.dialogues || []
  const lessonId = question.lesson?.id || question.lessonId || question.id

  return (
    <div className='mx-auto w-full max-w-3xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-8'>
      {question.lesson?.audioFile && (
        <div className='mb-8 flex items-center gap-4 rounded-2xl border border-blue-100 bg-blue-50/80 p-4 shadow-inner md:p-5'>
          <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-2xl text-blue-500 shadow-sm'>
            🎧
          </div>
          <audio
            ref={audioRef}
            controls
            className='h-10 w-full outline-none'
            src={question.lesson.audioFile}
            controlsList='nodownload'>
            您的浏览器不支持音频播放。
          </audio>
        </div>
      )}

      {question.prompt && (
        <p
          data-source-type='QUIZ_QUESTION'
          data-source-id={question.id}
          data-context-block='true'
          data-context-role='question-prompt'
          className={`mb-3 font-medium text-gray-500 ${
            isJapanesePaper ? 'exam-japanese-text' : ''
          }`}
          dangerouslySetInnerHTML={{
            __html: annotateExamText({
              text: question.prompt,
              settings: annotation,
            }),
          }}
        />
      )}

      {question.contextSentence && (
        <div
          data-source-type='AUDIO_DIALOGUE'
          data-source-id={dialogueSourceId}
          data-context-block='true'
          data-context-role='listening-dialogue'
          className={`mb-6 text-xl font-medium leading-relaxed text-gray-900 ${
            isJapanesePaper ? 'exam-japanese-text' : ''
          }`}
          dangerouslySetInnerHTML={{
            __html: annotateExamText({
              text: question.contextSentence,
              settings: annotation,
            }),
          }}
        />
      )}

      <OptionsList
        options={question.options || []}
        currentAnswer={currentAnswer}
        onSelect={onSelect}
        sourceId={question.id}
        isSubmitted={isSubmitted}
        isJapanesePaper={isJapanesePaper}
        annotation={annotation}
      />

      {isSubmitted && dialogues.length > 0 && (
        <ListeningTranscript
          lessonId={lessonId}
          dialogues={dialogues}
          audioRef={audioRef}
          annotation={annotation}
        />
      )}
    </div>
  )
}

export function QuestionRenderer({
  question,
  allQuestions,
  currentAnswer,
  answerMap,
  onSelect,
  isSubmitted = false,
  isJapanesePaper = false,
  annotation,
}: QuestionRendererProps) {
  if (!question) {
    return <div className='p-10 text-center text-gray-500'>加载题目失败...</div>
  }

  if (question.passageId) {
    return (
      <ReadingQuestion
        question={question}
        allQuestions={allQuestions}
        currentAnswer={currentAnswer}
        answerMap={answerMap}
        onSelect={onSelect}
        isSubmitted={isSubmitted}
        isJapanesePaper={isJapanesePaper}
        annotation={annotation}
      />
    )
  }

  if (question.lessonId) {
    return (
      <ListeningQuestion
        question={question}
        allQuestions={allQuestions}
        currentAnswer={currentAnswer}
        answerMap={answerMap}
        onSelect={onSelect}
        isSubmitted={isSubmitted}
        isJapanesePaper={isJapanesePaper}
        annotation={annotation}
      />
    )
  }

  return (
    <StandardQuestion
      question={question}
      currentAnswer={currentAnswer}
      onSelect={onSelect}
      isSubmitted={isSubmitted}
      isJapanesePaper={isJapanesePaper}
      annotation={annotation}
    />
  )
}
