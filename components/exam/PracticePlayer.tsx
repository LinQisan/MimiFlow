'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
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
import {
  buildPracticeQuestionGroups,
  findPracticeQuestionGroupIndex,
} from '@/modules/practice/domain/question-groups'
import { buildAnswerCardSections } from '@/modules/practice/domain/answer-card-sections'

interface PracticePlayerProps {
  questions: ExamQuestion[]
  paperTitle?: string
  paperLanguage?: string | null
  mode?: 'exam' | 'random' | 'single'
  initialIndex?: number
  exitHref?: string
  exitLabel?: string
  paperId?: string
  draftKey?: string
  restoreDraftIndex?: boolean
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

const isEditableKeyboardTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"]',
    ),
  )
}

const isInteractiveSpaceTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[data-context-role="question-option"]')) return false
  return Boolean(
    target.closest(
      'button, a[href], input, textarea, select, [contenteditable="true"], [role="button"], [role="slider"], [role="dialog"]',
    ),
  )
}

export function PracticePlayer({
  questions,
  paperTitle = '专项练习',
  paperLanguage = null,
  mode = 'exam',
  initialIndex = 0,
  exitHref = '/practice',
  exitLabel = '返回试卷库',
  paperId,
  draftKey,
  restoreDraftIndex = true,
  pronunciationMap,
  vocabularyMetaMap,
}: PracticePlayerProps) {
  const router = useRouter()
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

  const session = usePracticeSession(questions, initialIndex, {
    draftKey,
    restoreDraftIndex,
  })
  const questionGroups = React.useMemo(
    () => buildPracticeQuestionGroups(questions),
    [questions],
  )
  const answerCardSections = React.useMemo(
    () => buildAnswerCardSections(questions, paperLanguage),
    [paperLanguage, questions],
  )
  const currentGroupIndex = findPracticeQuestionGroupIndex(
    questionGroups,
    session.currentIndex,
  )
  const currentGroup = questionGroups[currentGroupIndex]
  const normalizedPaperLanguage = (paperLanguage || '').trim().toLowerCase()
  const isJapanesePaper =
    normalizedPaperLanguage === 'ja' ||
    normalizedPaperLanguage.startsWith('ja-') ||
    normalizedPaperLanguage.includes('japanese') ||
    /日语|日文|日本语|日本語/.test(paperLanguage || '')

  const handleSelectOption = React.useCallback(
    (questionId: string, optionId: string) => {
      session.selectOption(questionId, optionId)
    },
    [session],
  )

  const goToPreviousGroup = React.useCallback(() => {
    const previousGroup = questionGroups[currentGroupIndex - 1]
    if (previousGroup) session.setCurrentIndex(previousGroup.startIndex)
    session.setShowSheet(false)
  }, [currentGroupIndex, questionGroups, session])

  const goToNextGroup = React.useCallback(() => {
    const nextGroup = questionGroups[currentGroupIndex + 1]
    if (nextGroup) session.setCurrentIndex(nextGroup.startIndex)
    session.setShowSheet(false)
  }, [currentGroupIndex, questionGroups, session])

  const handleExit = React.useCallback(() => {
    session.saveDraft()
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push(exitHref)
  }, [exitHref, router, session])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        session.showSheet ||
        selection.isVisible ||
        isEditableKeyboardTarget(event.target)
      ) {
        return
      }

      if (event.key === 'ArrowLeft') {
        if (currentGroupIndex <= 0) return
        event.preventDefault()
        goToPreviousGroup()
        return
      }

      if (event.key === 'ArrowRight') {
        if (currentGroupIndex >= questionGroups.length - 1) return
        event.preventDefault()
        goToNextGroup()
        return
      }

      if (event.code === 'Space' || event.key === ' ') {
        if (isInteractiveSpaceTarget(event.target)) return
        const audio = document.querySelector<HTMLAudioElement>(
          'audio[data-practice-audio="current"]',
        )
        if (!audio) return

        event.preventDefault()
        if (audio.paused) audio.play().catch(() => {})
        else audio.pause()
        return
      }

      if (session.isSubmitted || !currentGroup) return
      const numericOptionNumber =
        /^Digit[1-9]$/.test(event.code) || /^Numpad[1-9]$/.test(event.code)
          ? Number(event.code.at(-1))
          : /^[1-9]$/.test(event.key)
            ? Number(event.key)
            : 0
      const optionNumber = numericOptionNumber
      if (!optionNumber) return

      const targetQuestion =
        currentGroup.questions.find(question => !session.answers[question.id]) ||
        currentGroup.questions[0]
      if (!targetQuestion || targetQuestion.questionType === 'SORTING') return
      const option = targetQuestion.options?.[optionNumber - 1]
      if (!option) return

      event.preventDefault()
      handleSelectOption(targetQuestion.id, option.id)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    currentGroup,
    currentGroupIndex,
    goToNextGroup,
    goToPreviousGroup,
    handleSelectOption,
    questionGroups.length,
    selection.isVisible,
    session,
  ])

  if (!questions || questions.length === 0) {
    return (
      <div className='flex min-h-screen items-center justify-center text-gray-500'>
        此模块暂无题目数据。
      </div>
    )
  }

  const currentQuestion = currentGroup.questions[0]
  const currentCardSection = answerCardSections.find(section =>
    section.items.some(item => item.question.id === currentQuestion.id),
  )
  const currentSectionItems = currentCardSection?.items.filter(item =>
    currentGroup.questions.some(question => question.id === item.question.id),
  )
  const currentLocalRange = currentSectionItems?.length
    ? currentSectionItems.length === 1
      ? `${currentSectionItems[0].localNumber}`
      : `${currentSectionItems[0].localNumber}–${currentSectionItems[currentSectionItems.length - 1].localNumber}`
    : `${currentGroup.startIndex + 1}`
  const currentQuestionRange = currentCardSection
    ? isJapanesePaper
      ? `問題${currentCardSection.sectionNumber}｜${currentCardSection.sectionTitle} · ${currentLocalRange}/${currentCardSection.items.length}`
      : `${currentCardSection.sectionTitle} · ${currentLocalRange}/${currentCardSection.items.length}`
    : `第 ${currentGroup.startIndex + 1} 题`
  const isSingleMode = questionGroups.length === 1
  const currentWrongPosition = session.wrongIndexes.indexOf(
    session.currentIndex,
  )
  const prevWrongIndex =
    currentWrongPosition > 0
      ? session.wrongIndexes[currentWrongPosition - 1]
      : currentWrongPosition === -1
        ? [...session.wrongIndexes]
            .reverse()
            .find(index => index < session.currentIndex) ?? null
        : null
  const nextWrongIndex =
    currentWrongPosition >= 0 &&
    currentWrongPosition < session.wrongIndexes.length - 1
      ? session.wrongIndexes[currentWrongPosition + 1]
      : currentWrongPosition === -1
        ? session.wrongIndexes.find(index => index > session.currentIndex) ??
          session.wrongIndexes[0] ??
          null
        : null

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
      body: JSON.stringify({
        attempts,
        completedPaperId:
          paperId && attempts.length === questions.length ? paperId : undefined,
      }),
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
    session.clearDraft()
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
    if (prompt) sections.push(`题目：${prompt}`)
    else if (context) sections.push(`题目：${context}`)

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
    const payload = currentGroup.questions
      .map((question, index) =>
        buildCopyPayload(question, currentGroup.startIndex + index),
      )
      .join('\n\n---\n\n')
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
    const questionNode = target.closest<HTMLElement>('[data-question-id]')
    session.clearOption(questionNode?.dataset.questionId || currentQuestion.id)
  }

  return (
    <div
      className={`relative flex min-h-screen flex-col bg-[#f7f7f5] font-sans ${
        isJapanesePaper ? 'exam-japanese' : ''
      }`}>
      <header className='sticky top-0 z-40 border-b border-slate-200 bg-[#f7f7f5]/95 backdrop-blur'>
        <div className='mx-auto flex h-14 max-w-7xl items-center gap-2 px-2 sm:px-3 md:px-6'>
          <div className='flex min-w-0 flex-1 items-center gap-2'>
            {mode !== 'single' && (
              <>
                <button
                  type='button'
                  onClick={handleExit}
                  title={`${exitLabel}，当前进度会自动保存`}
                  className='inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-950'>
                  <span aria-hidden='true'>←</span>
                  <span className='hidden sm:inline'>返回</span>
                </button>
                <span className='h-4 w-px shrink-0 bg-slate-300' />
              </>
            )}
            <h1 className='hidden shrink-0 text-sm font-bold tracking-tight text-slate-900 lg:block'>
              {paperTitle}
            </h1>
            <span className='hidden h-4 w-px bg-slate-300 lg:block' />
            <div className='min-w-0'>
              <p className='truncate text-xs font-semibold text-slate-900 sm:text-sm'>
                {currentQuestionRange}
              </p>
              {!isSingleMode && (
                <p className='mt-0.5 hidden truncate text-[10px] text-slate-500 md:block'>
                  {session.isSubmitted ? (
                    <>
                      本次答对 {session.correctCount}/{session.submittedCount}
                      {session.unansweredCount > 0 && (
                        <>
                          <span className='mx-1 text-slate-300'>·</span>
                          未答 {session.unansweredCount}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      已答 {session.answeredCount}/{questions.length}
                      <span className='mx-1 text-slate-300'>·</span>
                      正确率{' '}
                      {currentStats.total > 0 ? `${currentAccuracy}%` : '--'}
                    </>
                  )}
                  <span className='mx-1 text-slate-300'>·</span>
                  第 {currentGroupIndex + 1}/{questionGroups.length} 页
                </p>
              )}
            </div>
          </div>

          <div className='flex shrink-0 items-center gap-0.5 sm:gap-1'>
            {isJapanesePaper ? (
              <>
                <button
                  type='button'
                  aria-pressed={showPronunciation}
                  aria-label='切换注音'
                  onClick={() => setShowPronunciation(!showPronunciation)}
                  className={`inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
                    showPronunciation
                      ? 'bg-slate-200 text-slate-900'
                      : 'text-slate-500 hover:bg-slate-200/70'
                  }`}>
                  <span className='sm:hidden'>注</span>
                  <span className='hidden sm:inline'>注音</span>
                </button>
                <button
                  type='button'
                  aria-pressed={showMeaning}
                  aria-label='切换注释'
                  onClick={() => setShowMeaning(!showMeaning)}
                  className={`inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
                    showMeaning
                      ? 'bg-slate-200 text-slate-900'
                      : 'text-slate-500 hover:bg-slate-200/70'
                  }`}>
                  <span className='sm:hidden'>释</span>
                  <span className='hidden sm:inline'>注释</span>
                </button>
              </>
            ) : null}

            {!isSingleMode && (
              <>
                <span className='mx-0.5 h-5 w-px bg-slate-300' />
                <button
                  type='button'
                  onClick={() => session.setShowSheet(!session.showSheet)}
                  aria-expanded={session.showSheet}
                  aria-label='答题卡'
                  className={`inline-flex h-9 min-w-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors ${
                    session.showSheet
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}>
                  <svg
                    className='h-4 w-4'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M4 6h4v4H4V6zm6 0h4v4h-4V6zm6 0h4v4h-4V6zM4 14h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z'
                    />
                  </svg>
                  <span className='hidden xl:inline'>答题卡</span>
                </button>
                <button
                  type='button'
                  onClick={() => void handleCopyCurrentQuestion()}
                  aria-label='复制题目和选项'
                  className={`inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
                    copyState === 'copied'
                      ? 'bg-slate-200 text-slate-900'
                      : copyState === 'error'
                        ? 'bg-rose-50 text-rose-700'
                        : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}>
                  <svg
                    className='h-4 w-4'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M8 7V5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2h-2M6 7h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2z'
                    />
                  </svg>
                  <span className='sr-only' aria-live='polite'>
                    {copyState === 'copied'
                      ? '已复制'
                      : copyState === 'error'
                        ? '复制失败'
                        : '复制'}
                  </span>
                </button>
                <button
                  type='button'
                  aria-label='上一题'
                  title='上一题（←）'
                  disabled={currentGroupIndex === 0}
                  onClick={goToPreviousGroup}
                  className='inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30'>
                  ←
                </button>
                <button
                  type='button'
                  aria-label='下一题'
                  title='下一题（→）'
                  disabled={currentGroupIndex === questionGroups.length - 1}
                  onClick={goToNextGroup}
                  className='inline-flex h-9 min-w-8 items-center justify-center rounded-md bg-slate-900 px-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30'>
                  →
                </button>
              </>
            )}

            {mode !== 'single' && !session.isSubmitted ? (
              <button
                type='button'
                onClick={() => void handleSubmit()}
                disabled={session.isSubmitted || persistState === 'saving'}
                className='ml-0.5 h-9 rounded-md bg-slate-900 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 md:px-3'>
                {persistState === 'saving' ? '保存中' : '交卷'}
              </button>
            ) : null}
          </div>
        </div>

        {!isSingleMode && (
          <div
            className='h-0.5 bg-slate-100'
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

      {session.showSheet && !isSingleMode && (
        <>
          <button
            type='button'
            aria-label='关闭答题卡'
            onClick={() => session.setShowSheet(false)}
            className='fixed inset-0 z-30 cursor-default bg-slate-900/10 backdrop-blur-[1px]'
          />
          <section
            role='dialog'
            aria-modal='true'
            aria-label='答题卡'
            className='fixed inset-x-3 top-[4.25rem] z-50 mx-auto max-h-[calc(100vh-5.25rem)] max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-[#f7f7f5] shadow-[0_24px_70px_-28px_rgba(15,23,42,0.55)]'>
            <div className='flex items-center justify-between border-b border-slate-200 px-4 py-3 md:px-5'>
              <div>
                <h4 className='text-sm font-bold tracking-tight text-slate-900 md:text-base'>
                  答题卡
                </h4>
                <p className='mt-0.5 text-[11px] text-slate-500'>
                  已答 {session.answeredCount}/{questions.length}
                </p>
              </div>
              <button
                type='button'
                onClick={() => session.setShowSheet(false)}
                className='inline-flex h-8 items-center rounded-md px-2 text-sm text-slate-500 hover:bg-slate-200 hover:text-slate-900'>
                关闭
              </button>
            </div>

            <div className='custom-scrollbar grid max-h-[calc(100vh-9.5rem)] gap-x-8 gap-y-5 overflow-y-auto p-4 md:grid-cols-2 md:p-5'>
              {answerCardSections.map((section, sectionIndex) => (
                <React.Fragment key={section.key}>
                  {(sectionIndex === 0 ||
                    answerCardSections[sectionIndex - 1].materialKey !==
                      section.materialKey) && (
                    <h5 className='border-b border-slate-300 pb-2 text-xs font-bold tracking-[0.16em] text-slate-500 md:col-span-2'>
                      {section.materialTitle}
                    </h5>
                  )}
                  <section className='grid grid-cols-[minmax(7.5rem,auto)_1fr] items-start gap-3'>
                    <div className='pt-1'>
                      <p className='text-sm font-bold text-slate-800'>
                        {isJapanesePaper
                          ? `問題${section.sectionNumber}`
                          : section.sectionTitle}
                      </p>
                      {isJapanesePaper ? (
                        <p className='mt-0.5 text-xs text-slate-500'>
                          {section.sectionTitle}
                        </p>
                      ) : null}
                    </div>
                    <div className='grid grid-cols-6 gap-1.5 sm:grid-cols-8'>
                      {section.items.map(item => {
                        const question = questions[item.questionIndex]
                        const isCurrent =
                          session.currentIndex === item.questionIndex
                        const isAnswered = !!session.answers[question.id]
                        const isWrong =
                          session.isQuestionSubmitted(question.id) &&
                          !!session.getCorrectOptionId(question) &&
                          session.answers[question.id] !==
                            session.getCorrectOptionId(question)

                        return (
                          <button
                            key={question.id}
                            type='button'
                            aria-label={
                              isJapanesePaper
                                ? `問題${section.sectionNumber} ${section.sectionTitle} 第${item.localNumber}题`
                                : `${section.sectionTitle} 第${item.localNumber}题`
                            }
                            onClick={() => {
                              session.setCurrentIndex(item.questionIndex)
                              session.setShowSheet(false)
                            }}
                            className={`h-8 rounded-md border text-xs font-semibold transition-colors md:h-9 ${
                              isCurrent
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : isWrong
                                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                                  : isAnswered
                                    ? 'border-slate-400 bg-slate-200/70 text-slate-900'
                                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-600 hover:text-slate-900'
                            }`}>
                            {item.localNumber}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                </React.Fragment>
              ))}
            </div>
          </section>
        </>
      )}

      <main
        onMouseDown={handleQuestionAreaMouseDown}
        className='flex w-full flex-1 flex-col px-5 py-4 md:px-10 md:py-6'>
        {session.isSubmitted && (
          <div className='mx-auto mb-3 flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 text-xs text-slate-500'>
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
              <span className='font-semibold text-slate-900'>答题结果</span>
              <span>答对 {session.correctCount}</span>
              <span className={session.wrongCount > 0 ? 'text-rose-600' : ''}>
                答错 {session.wrongCount}
              </span>
              {session.unansweredCount > 0 ? (
                <span>未答 {session.unansweredCount}</span>
              ) : null}
            </div>
            {session.wrongCount > 0 && (
              <div className='flex items-center gap-1'>
                <span className='mr-1 tabular-nums'>
                  错题 {currentWrongPosition >= 0 ? currentWrongPosition + 1 : '—'}/
                  {session.wrongCount}
                </span>
                <button
                  type='button'
                  aria-label='上一道错题'
                  title='上一道错题'
                  disabled={prevWrongIndex === null}
                  onClick={() => {
                    if (prevWrongIndex !== null) {
                      session.setCurrentIndex(prevWrongIndex)
                    }
                  }}
                  className='inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30'>
                  ←
                </button>
                <button
                  type='button'
                  aria-label='下一道错题'
                  title='下一道错题'
                  disabled={nextWrongIndex === null}
                  onClick={() => {
                    if (nextWrongIndex !== null) {
                      session.setCurrentIndex(nextWrongIndex)
                    }
                  }}
                  className='inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30'>
                  →
                </button>
              </div>
            )}
          </div>
        )}

        <QuestionRenderer
          key={currentGroup.key}
          question={currentQuestion}
          currentAnswer={session.answers[currentQuestion.id]}
          currentSortingOrder={session.sortingDrafts[currentQuestion.id]}
          answerMap={session.answers}
          allQuestions={
            currentQuestion.lessonId ? currentGroup.questions : questions
          }
          onSelect={optionId =>
            handleSelectOption(currentQuestion.id, optionId)
          }
          onClear={() => session.clearOption(currentQuestion.id)}
          onSortingOrderChange={order =>
            session.setSortingDraft(currentQuestion.id, order)
          }
          onSelectQuestion={handleSelectOption}
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

        {currentGroup.questions.map(question =>
          session.isQuestionSubmitted(question.id) ? (
            <QuestionNoteEditor
              key={question.id}
              questionId={question.id}
              initialNote={(question.note || '').trim()}
            />
          ) : null,
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

    </div>
  )
}
