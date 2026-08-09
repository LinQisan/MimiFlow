'use client'

import React from 'react'
import Link from 'next/link'
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
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

interface PracticePlayerProps {
  questions: ExamQuestion[]
  paperTitle?: string
  paperLanguage?: string | null
  mode?: 'exam' | 'random' | 'single'
  initialIndex?: number
  exitHref?: string
  exitLabel?: string
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
  exitHref = '/practice',
  exitLabel = '返回试卷库',
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
  const answeredProgress = Math.round(
    (session.answeredCount / questions.length) * 100,
  )

  const handleSubmit = async () => {
    if (session.isSubmitted || persistState === 'saving') return

    session.submit()
    setPersistState('saving')

    const attempts = questions
      .map(question => {
        const selectedId = session.answers[question.id]
        if (!selectedId) return null
        return {
          questionId: question.id,
          selectedOptionId: selectedId,
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
    const result = (await response.json()) as {
      success?: boolean
      results?: Array<{ questionId: string; isCorrect: boolean }>
    }
    if (!result.success) {
      setPersistState('error')
      return
    }

    setAttemptStatsByQuestion(prev => {
      const next = { ...prev }
      for (const item of result.results || []) {
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
    if (question.lesson?.sectionTitle) {
      sections.push(`听力部分：${question.lesson.sectionTitle}`)
    }
    if (question.lesson?.audioFile) {
      sections.push(`音频：${question.lesson.audioFile}`)
    }

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
      className={`relative flex min-h-screen flex-col bg-slate-50 pb-20 font-sans md:pb-24 ${
        isJapanesePaper ? 'exam-japanese' : ''
      }`}>
      <header className='sticky top-0 z-40 border-b border-slate-200/80 bg-white shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
        <div className='mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 md:px-8 md:py-3'>
          <div className='min-w-0 flex-1'>
            <div className='flex min-w-0 items-center gap-2'>
              <h1 className='truncate text-sm font-bold tracking-tight text-slate-900 md:text-base'>
                {paperTitle}
              </h1>
              {currentQuestion.lesson?.sectionTitle && (
                <span className='hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 sm:inline-flex'>
                  {currentQuestion.lesson.sectionTitle}
                </span>
              )}
            </div>
            {!isSingleMode && (
              <p className='mt-0.5 truncate text-[11px] font-medium text-slate-500 md:text-xs'>
                第 {session.currentIndex + 1} 题
                <span className='hidden sm:inline'>
                  <span className='mx-1.5 text-slate-300'>·</span>
                  正确率 {currentStats.total > 0 ? `${currentAccuracy}%` : '--'}
                  <span className='mx-1.5 text-slate-300'>·</span>
                  {currentStats.total} 次作答
                </span>
              </p>
            )}
          </div>

          <div className='flex shrink-0 items-center gap-1.5 md:gap-2'>
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
            {!isSingleMode && (
              <span className='hidden whitespace-nowrap text-xs font-medium text-slate-500 lg:inline'>
                已答 {session.answeredCount}/{questions.length}
              </span>
            )}
            {mode !== 'single' && session.isSubmitted && persistState !== 'saving' ? (
              <Link
                href={exitHref}
                className='ui-btn ui-btn-primary h-9 px-3 text-xs md:h-10 md:px-5 md:text-sm'>
                {exitLabel}
              </Link>
            ) : mode !== 'single' ? (
              <button
                onClick={() => void handleSubmit()}
                disabled={session.isSubmitted || persistState === 'saving'}
                className='ui-btn ui-btn-primary h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50 md:h-10 md:px-5 md:text-sm'>
                {persistState === 'saving' ? '保存中...' : '交卷'}
              </button>
            ) : null}
          </div>
        </div>
        {!isSingleMode && (
          <div
            className='h-1 bg-slate-100'
            role='progressbar'
            aria-label={`已完成 ${session.answeredCount} / ${questions.length} 题`}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-valuenow={session.answeredCount}>
            <div
              className='h-full bg-slate-900 transition-[width] duration-200'
              style={{ width: `${answeredProgress}%` }}
            />
          </div>
        )}
      </header>

      <main
        onMouseDown={handleQuestionAreaMouseDown}
        className='flex w-full flex-1 flex-col justify-center px-4 py-5 md:p-8'>
        {session.isSubmitted && (
          <div className='mb-6 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.3),0_0_0_1px_rgba(15,23,42,0.06),0_4px_10px_rgba(15,23,42,0.03)]'>
            <div className='flex flex-wrap items-center gap-3'>
              <span className='font-semibold'>
                已提交 {session.submittedCount} 题：答对 {session.correctCount}
                ，答错 {session.wrongCount}
              </span>
              {session.unansweredCount > 0 && (
                <span className='text-slate-500'>
                  未答 {session.unansweredCount} 题，不计入本次正确率且不显示答案
                </span>
              )}
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
                    className='ui-btn ui-btn-sm disabled:cursor-not-allowed disabled:opacity-40'>
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
                    className='ui-btn ui-btn-sm disabled:cursor-not-allowed disabled:opacity-40'>
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
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
          isSubmitted={session.isQuestionSubmitted(currentQuestion.id)}
          isInteractionLocked={session.isSubmitted}
          submittedQuestionIds={session.submittedQuestionIds}
          isJapanesePaper={isJapanesePaper}
          annotation={{
            showPronunciation,
            showMeaning,
            pronunciationMap: localPronunciationMap,
            vocabularyMetaMap: localVocabularyMetaMap,
          }}
        />

        {session.isQuestionSubmitted(currentQuestion.id) && (
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
              setLocalVocabularyMetaMap(prev => {
                const next = { ...prev, [word]: meta }
                if (selection.text && selection.text !== word) {
                  next[selection.text] = meta
                }
                return next
              })
              if (meta.pronunciations[0]) {
                setLocalPronunciationMap(prev => {
                  const next = { ...prev, [word]: meta.pronunciations[0] }
                  if (selection.text && selection.text !== word) {
                    next[selection.text] = meta.pronunciations[0]
                  }
                  return next
                })
              }
            }}
            onClose={closeSelection}
          />
        )}
      </main>

      {!isSingleMode && (
        <footer className='fixed bottom-0 z-40 w-full border-t border-slate-200/90 bg-white/95 px-2 py-2 shadow-[0_-10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur md:px-4 md:py-3'>
          <div className='mx-auto flex max-w-5xl items-center gap-1.5 md:justify-between md:gap-4'>
            <div className='flex shrink-0 items-center gap-2'>
              <button
                onClick={() => session.setShowSheet(!session.showSheet)}
                aria-expanded={session.showSheet}
                className='flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:gap-2 md:px-2.5 md:text-sm'>
                <svg
                  className='h-4 w-4 md:h-5 md:w-5'
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
              <span className='hidden text-xs font-medium text-slate-400 md:inline'>
                第 {session.currentIndex + 1} / {questions.length} 题
              </span>
            </div>

            <div className='grid min-w-0 flex-1 grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1.5 md:flex md:flex-none md:gap-2'>
              <button
                type='button'
                onClick={() => void handleCopyCurrentQuestion()}
                aria-label='复制题目和选项'
                className={`h-10 truncate rounded-lg border px-2 text-xs font-medium transition-colors md:px-4 md:text-sm ${
                  copyState === 'copied'
                    ? 'border-slate-300 bg-slate-100 text-slate-900'
                    : copyState === 'error'
                      ? 'border-rose-300 bg-rose-50 text-rose-700'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}>
                {copyState === 'copied'
                  ? '已复制'
                  : copyState === 'error'
                    ? '复制失败'
                    : '复制'}
              </button>
              <button
                disabled={session.currentIndex === 0}
                onClick={() => {
                  session.setCurrentIndex(session.currentIndex - 1)
                  session.setShowSheet(false)
                }}
                className='h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 md:px-6 md:text-sm'>
                上一题
              </button>
              <button
                disabled={session.currentIndex === questions.length - 1}
                onClick={() => {
                  session.setCurrentIndex(session.currentIndex + 1)
                  session.setShowSheet(false)
                }}
                className='ui-btn ui-btn-primary h-10 rounded-lg px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 md:px-6 md:text-sm'>
                下一题
              </button>
            </div>
          </div>
        </footer>
      )}

      {session.showSheet && !isSingleMode && (
        <div className='animate-fade-in-up fixed bottom-[57px] left-0 z-30 w-full transform border-t border-slate-100 bg-white p-3 shadow-[0_-10px_30px_-18px_rgba(15,23,42,0.35)] transition-transform md:bottom-16 md:p-6'>
          <div className='mx-auto max-w-4xl'>
            <div className='mb-3 flex items-center justify-between md:mb-4'>
              <h4 className='text-sm font-bold tracking-tight text-slate-900 md:text-base'>
                答题进度
              </h4>
              <button
                onClick={() => session.setShowSheet(false)}
                className='text-sm text-slate-400 hover:text-slate-600'>
                关闭
              </button>
            </div>

            <div className='custom-scrollbar grid max-h-[46vh] grid-cols-6 gap-2 overflow-y-auto py-1 sm:grid-cols-8 md:max-h-[40vh] md:grid-cols-10 md:gap-3 md:py-2'>
              {questions.map((question, index) => {
                const isCurrent = session.currentIndex === index
                const isAnswered = !!session.answers[question.id]
                const isWrong =
                  session.isQuestionSubmitted(question.id) &&
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
                    className={`h-10 rounded-lg border-2 text-sm font-medium transition-all duration-200 md:h-12 ${
                      isCurrent
                        ? 'border-slate-900 text-slate-900 ring-2 ring-slate-200 ring-offset-1'
                        : isWrong
                          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                          : isAnswered
                            ? 'border-transparent bg-slate-200 text-slate-900 hover:bg-slate-300'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
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
