'use client'

import React from 'react'
import ToggleSwitch from '@/components/ToggleSwitch'
import { useShowMeaning, useShowPronunciation } from '@/hooks/usePronunciationPrefs'
import { usePracticeSession } from '@/hooks/usePracticeSession'
import { useTextSelection } from '@/hooks/useTextSelection'
import { QuestionRenderer } from './QuestionRenderer'
import WordTooltip from './WordTooltip'
import QuestionNoteEditor from './QuestionNoteEditor'
import type { ExamQuestion } from './question-renderer/types'
import type { VocabularyMeta } from '@/utils/vocabularyMeta'

interface PracticePlayerProps {
  questions: ExamQuestion[]
  paperTitle?: string
  mode?: 'exam' | 'random' | 'single'
  initialIndex?: number
  pronunciationMap: Record<string, string>
  vocabularyMetaMap: Record<string, VocabularyMeta>
}

export function PracticePlayer({
  questions,
  paperTitle = '专项练习',
  mode = 'exam',
  initialIndex = 0,
  pronunciationMap,
  vocabularyMetaMap,
}: PracticePlayerProps) {
  const { selection, closeSelection } = useTextSelection()
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()
  const [localPronunciationMap, setLocalPronunciationMap] =
    React.useState(pronunciationMap)
  const [localVocabularyMetaMap, setLocalVocabularyMetaMap] =
    React.useState(vocabularyMetaMap)
  const [questionNotes, setQuestionNotes] = React.useState<
    Record<string, string>
  >(() =>
    questions.reduce<Record<string, string>>((acc, question) => {
      acc[question.id] = (question.note || '').trim()
      return acc
    }, {}),
  )

  const session = usePracticeSession(questions, initialIndex)

  if (!questions || questions.length === 0) {
    return (
      <div className='flex min-h-screen items-center justify-center text-gray-500'>
        此模块暂无题目数据。
      </div>
    )
  }

  const currentQuestion = questions[session.currentIndex]
  const isSingleMode = questions.length === 1
  const currentWrongPosition = session.wrongIndexes.indexOf(session.currentIndex)
  const prevWrongIndex =
    currentWrongPosition > 0
      ? session.wrongIndexes[currentWrongPosition - 1]
      : null
  const nextWrongIndex =
    currentWrongPosition >= 0 &&
    currentWrongPosition < session.wrongIndexes.length - 1
      ? session.wrongIndexes[currentWrongPosition + 1]
      : null

  const handleSelectOption = (optionId: string) => {
    session.selectOption(currentQuestion.id, optionId)
  }

  const handleQuestionAreaMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (session.isSubmitted) return
    const target = event.target as HTMLElement
    const clickedInsideOption = Boolean(
      target.closest('[data-context-role="question-option"]') ||
        target.closest('[data-context-role="sorting-option"]') ||
        target.closest('[data-context-role="sorting-slot"]'),
    )
    if (clickedInsideOption) return
    session.clearOption(currentQuestion.id)
  }

  return (
    <div className='relative flex min-h-screen flex-col bg-gray-50 pb-24 font-sans'>
      <header className='sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-4 shadow-sm md:px-8'>
        <div className='flex items-center gap-4'>
          <div className='max-w-[60vw] truncate text-sm font-bold text-gray-800 md:max-w-none md:text-lg'>
            {paperTitle}
          </div>
        </div>

        <div className='flex flex-wrap items-center justify-end gap-3'>
          <ToggleSwitch
            checked={showPronunciation}
            onChange={setShowPronunciation}
            label='注音'
          />
          <ToggleSwitch
            checked={showMeaning}
            onChange={setShowMeaning}
            label='注释'
          />
          <div className='rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-500'>
            进度: <span className='text-blue-600'>{session.answeredCount}</span> /{' '}
            {questions.length}
          </div>
          {mode !== 'single' && (
            <button
              onClick={session.submit}
              disabled={session.isSubmitted}
              className='rounded-lg bg-blue-600 px-5 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'>
              {session.isSubmitted ? '已交卷' : '交卷'}
            </button>
          )}
        </div>
      </header>

      <main
        onMouseDown={handleQuestionAreaMouseDown}
        className='mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center p-4 md:p-8'>
        {session.isSubmitted && (
          <div className='mb-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
            <div className='flex flex-wrap items-center gap-3'>
              <span className='font-semibold'>
                已交卷：答对 {session.correctCount} / {session.gradableCount}，错题{' '}
                {session.wrongCount} 题
              </span>
              {session.wrongCount > 0 && (
                <>
                  <button
                    type='button'
                    disabled={prevWrongIndex === null}
                    onClick={() => {
                      if (prevWrongIndex !== null) {
                        session.setCurrentIndex(prevWrongIndex)
                      }
                    }}
                    className='rounded-md border border-amber-200 px-2.5 py-1 text-xs hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40'>
                    上一道错题
                  </button>
                  <button
                    type='button'
                    disabled={nextWrongIndex === null}
                    onClick={() => {
                      if (nextWrongIndex !== null) {
                        session.setCurrentIndex(nextWrongIndex)
                      }
                    }}
                    className='rounded-md border border-amber-200 px-2.5 py-1 text-xs hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40'>
                    下一道错题
                  </button>
                </>
              )}
            </div>
            {session.wrongCount > 0 && (
              <div className='mt-3 flex flex-wrap gap-2'>
                {session.wrongIndexes.map(index => (
                  <button
                    key={`wrong-q-${questions[index].id}`}
                    type='button'
                    onClick={() => session.setCurrentIndex(index)}
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      index === session.currentIndex
                        ? 'border-red-500 bg-red-100 text-red-700'
                        : 'border-red-200 bg-white text-red-600 hover:bg-red-50'
                    }`}>
                    错题 #{index + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!isSingleMode && (
          <div className='mb-6 text-center text-sm font-medium tracking-widest text-gray-400'>
            - 第 {session.currentIndex + 1} 题 -
          </div>
        )}

        <QuestionRenderer
          key={currentQuestion.id}
          question={currentQuestion}
          currentAnswer={session.answers[currentQuestion.id]}
          answerMap={session.answers}
          allQuestions={questions}
          onSelect={handleSelectOption}
          isSubmitted={session.isSubmitted}
          annotation={{
            showPronunciation,
            showMeaning,
            pronunciationMap: localPronunciationMap,
            vocabularyMetaMap: localVocabularyMetaMap,
          }}
        />

        {session.isSubmitted && (
          <QuestionNoteEditor
            questionId={currentQuestion.id}
            initialNote={questionNotes[currentQuestion.id] || ''}
            onSaved={nextNote =>
              setQuestionNotes(prev => ({ ...prev, [currentQuestion.id]: nextNote }))
            }
          />
        )}

        {selection.isVisible && selection.sourceType !== '' && (
          <WordTooltip
            word={selection.text}
            x={selection.x}
            y={selection.y}
            isTop={selection.isTop}
            contextSentence={selection.contextSentence}
            sourceType={selection.sourceType}
            sourceId={selection.sourceId}
            initialMeta={localVocabularyMetaMap[selection.text]}
            onSaved={({ word, meta }) => {
              setLocalVocabularyMetaMap(prev => ({ ...prev, [word]: meta }))
              if (meta.pronunciations[0]) {
                setLocalPronunciationMap(prev => ({
                  ...prev,
                  [word]: meta.pronunciations[0],
                }))
              }
            }}
            onClose={closeSelection}
          />
        )}
      </main>

      {!isSingleMode && (
        <footer className='fixed bottom-0 z-40 w-full border-t border-slate-200/90 bg-white/95 p-4 shadow-[0_-10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur'>
          <div className='mx-auto flex max-w-5xl items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 md:px-4'>
            <div className='flex items-center gap-2'>
              <button
                onClick={() => session.setShowSheet(!session.showSheet)}
                className='flex items-center gap-2 rounded-lg px-2.5 py-2 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-blue-600'>
                <svg
                  className='h-5 w-5'
                  fill='none'
                  viewBox='0 0 24 24'
                  stroke='currentColor'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z'
                  />
                </svg>
                答题卡
              </button>
              <span className='text-xs font-medium text-slate-400'>
                第 {session.currentIndex + 1} / {questions.length} 题
              </span>
            </div>

            <div className='flex gap-2 md:gap-3'>
              <button
                disabled={session.currentIndex === 0}
                onClick={() => {
                  session.setCurrentIndex(session.currentIndex - 1)
                  session.setShowSheet(false)
                }}
                className='rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 md:px-6'>
                上一题
              </button>
              <button
                disabled={session.currentIndex === questions.length - 1}
                onClick={() => {
                  session.setCurrentIndex(session.currentIndex + 1)
                  session.setShowSheet(false)
                }}
                className='rounded-xl bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 md:px-6'>
                下一题
              </button>
            </div>
          </div>
        </footer>
      )}

      {session.showSheet && !isSingleMode && (
        <div className='animate-fade-in-up fixed bottom-19 left-0 z-30 w-full transform border-t border-gray-100 bg-white p-6 shadow-2xl transition-transform'>
          <div className='mx-auto max-w-4xl'>
            <div className='mb-4 flex items-center justify-between'>
              <h4 className='font-bold text-gray-800'>答题进度</h4>
              <button
                onClick={() => session.setShowSheet(false)}
                className='text-gray-400 hover:text-gray-600'>
                关闭
              </button>
            </div>

            <div className='custom-scrollbar grid max-h-[40vh] grid-cols-5 gap-3 overflow-y-auto py-2 sm:grid-cols-8 md:grid-cols-10'>
              {questions.map((question, index) => {
                const isCurrent = session.currentIndex === index
                const isAnswered = !!session.answers[question.id]
                const isWrong =
                  session.isSubmitted &&
                  !!session.getCorrectOptionId(question) &&
                  session.answers[question.id] !==
                    session.getCorrectOptionId(question)

                return (
                  <button
                    key={question.id}
                    onClick={() => {
                      session.setCurrentIndex(index)
                      session.setShowSheet(false)
                    }}
                    className={`h-12 rounded-lg border-2 font-medium transition-all duration-200 ${
                      isCurrent
                        ? 'border-blue-500 text-blue-600 ring-2 ring-blue-100 ring-offset-1'
                        : isWrong
                          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                          : isAnswered
                            ? 'border-transparent bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-blue-300'
                    }`}>
                    {index + 1}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
