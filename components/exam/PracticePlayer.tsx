'use client'

import React from 'react'
import ToggleSwitch from '@/components/ToggleSwitch'
import {
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
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
  paperLanguage?: string | null
  mode?: 'exam' | 'random' | 'single'
  initialIndex?: number
  pronunciationMap: Record<string, string>
  vocabularyMetaMap: Record<string, VocabularyMeta>
}

type AttemptStats = {
  total: number
  correct: number
}

const initAttemptStats = (questions: ExamQuestion[]) =>
  questions.reduce<Record<string, AttemptStats>>((acc, question) => {
    const attempts = question.attempts || []
    acc[question.id] = {
      total: attempts.length,
      correct: attempts.filter(item => item.isCorrect).length,
    }
    return acc
  }, {})

export function PracticePlayer({
  questions,
  paperTitle = '专项练习',
  paperLanguage = null,
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
  const [attemptStatsByQuestion, setAttemptStatsByQuestion] = React.useState<
    Record<string, AttemptStats>
  >(() => initAttemptStats(questions))
  const [persistState, setPersistState] = React.useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [copyState, setCopyState] = React.useState<'idle' | 'copied' | 'error'>(
    'idle',
  )

  const session = usePracticeSession(questions, initialIndex)
  const normalizedPaperLanguage = (paperLanguage || '').trim().toLowerCase()
  const isJapanesePaper =
    normalizedPaperLanguage === 'ja' ||
    normalizedPaperLanguage.startsWith('ja-') ||
    normalizedPaperLanguage.includes('japanese') ||
    /日语|日文|日本语|日本語/.test(paperLanguage || '')

  if (!questions || questions.length === 0) {
    return (
      <div className='flex min-h-screen items-center justify-center text-gray-500'>
        此模块暂无题目数据。
      </div>
    )
  }

  const currentQuestion = questions[session.currentIndex]
  const isSingleMode = questions.length === 1
  const currentWrongPosition = session.wrongIndexes.indexOf(
    session.currentIndex,
  )
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

  const currentStats = attemptStatsByQuestion[currentQuestion.id] || {
    total: 0,
    correct: 0,
  }
  const currentAccuracy =
    currentStats.total > 0
      ? Math.round((currentStats.correct / currentStats.total) * 100)
      : 0

  const handleSubmit = async () => {
    if (session.isSubmitted || persistState === 'saving') return

    session.submit()
    setPersistState('saving')

    const attempts = questions
      .map(question => {
        const selectedId = session.answers[question.id]
        const correctId = session.getCorrectOptionId(question)
        if (!selectedId || !correctId) return null
        return {
          questionId: question.id,
          isCorrect: selectedId === correctId,
          timeSpentMs: Math.max(
            0,
            session.timeSpentByQuestionId[question.id] || 0,
          ),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    if (attempts.length === 0) {
      setPersistState('idle')
      return
    }

    const response = await fetch('/api/quiz-attempts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ attempts }),
    })
    const result = (await response.json()) as { success?: boolean }
    if (!result.success) {
      setPersistState('error')
      return
    }

    setAttemptStatsByQuestion(prev => {
      const next = { ...prev }
      for (const item of attempts) {
        const current = next[item.questionId] || { total: 0, correct: 0 }
        next[item.questionId] = {
          total: current.total + 1,
          correct: current.correct + (item.isCorrect ? 1 : 0),
        }
      }
      return next
    })
    setPersistState('saved')
  }

  const buildCopyPayload = (question: ExamQuestion, questionIndex: number) => {
    const sections: string[] = []
    sections.push(`第 ${questionIndex + 1} 题`)

    const context = (question.contextSentence || '').trim()
    const prompt = (question.prompt || '').trim()
    const shouldIncludePrompt = prompt && prompt !== context
    if (context) sections.push(`题目：${context}`)
    else if (prompt) sections.push(`题目：${prompt}`)
    if (shouldIncludePrompt) sections.push(`补充：${prompt}`)

    if (question.passageId) {
      const passage = (question.passage?.content || '').trim()
      if (passage) sections.push(`阅读正文：\n${passage}`)
    }

    const optionLines = (question.options || [])
      .map((option, index) => {
        const marker = String.fromCharCode(65 + index)
        const text = (option.text || '').trim()
        return text ? `${marker}. ${text}` : ''
      })
      .filter(Boolean)
    if (optionLines.length > 0) {
      sections.push(`选项：\n${optionLines.join('\n')}`)
    }

    return sections.join('\n\n').trim()
  }

  const writeClipboard = async (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    if (typeof document === 'undefined') {
      throw new Error('clipboard api unavailable')
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (!copied) throw new Error('copy fallback failed')
  }

  const handleCopyCurrentQuestion = async () => {
    const payload = buildCopyPayload(currentQuestion, session.currentIndex)
    if (!payload) return
    try {
      await writeClipboard(payload)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
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
    <div
      className={`relative flex min-h-screen flex-col bg-gray-50 pb-24 font-sans ${
        isJapanesePaper ? 'exam-japanese' : ''
      }`}>
      <header className='sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-4 shadow-sm md:px-8'>
        <div className='flex items-center gap-4'>
          <div className='max-w-[60vw] truncate text-sm font-bold text-gray-800 md:max-w-none md:text-lg'>
            {paperTitle}
          </div>
        </div>

        <div className='flex flex-col items-end gap-2'>
          {!isSingleMode && (
            <div className='flex flex-wrap items-center justify-end gap-2 text-sm font-medium tracking-widest text-gray-400'>
              <span>- 第 {session.currentIndex + 1} 题 -</span>
              <span className='rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold tracking-normal text-emerald-700'>
                正确率 {currentStats.total > 0 ? `${currentAccuracy}%` : '--'}
              </span>
              <span className='rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tracking-normal text-slate-700'>
                做题 {currentStats.total} 次
              </span>
            </div>
          )}
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
              进度:{' '}
              <span className='text-blue-600'>{session.answeredCount}</span> /{' '}
              {questions.length}
            </div>
            {mode !== 'single' && (
              <button
                onClick={() => void handleSubmit()}
                disabled={session.isSubmitted || persistState === 'saving'}
                className='rounded-lg bg-blue-600 px-5 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'>
                {session.isSubmitted
                  ? '已交卷'
                  : persistState === 'saving'
                    ? '交卷中...'
                    : '交卷'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main
        onMouseDown={handleQuestionAreaMouseDown}
        className='flex w-full flex-1 flex-col justify-center p-4 md:p-8'>
        {session.isSubmitted && (
          <div className='mb-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800'>
            <div className='flex flex-wrap items-center gap-3'>
              <span className='font-semibold'>
                已交卷：答对 {session.correctCount} / {session.gradableCount}
                ，错题 {session.wrongCount} 题
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

        <QuestionRenderer
          key={currentQuestion.id}
          question={currentQuestion}
          currentAnswer={session.answers[currentQuestion.id]}
          answerMap={session.answers}
          allQuestions={questions}
          onSelect={handleSelectOption}
          isSubmitted={session.isSubmitted}
          isJapanesePaper={isJapanesePaper}
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
            initialNote={(currentQuestion.note || '').trim()}
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
                type='button'
                onClick={() => void handleCopyCurrentQuestion()}
                className={`rounded-xl border px-4 py-2.5 font-medium transition-colors md:px-5 ${
                  copyState === 'copied'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : copyState === 'error'
                      ? 'border-rose-300 bg-rose-50 text-rose-700'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}>
                {copyState === 'copied'
                  ? '已复制'
                  : copyState === 'error'
                    ? '复制失败'
                    : '复制题目'}
              </button>
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
