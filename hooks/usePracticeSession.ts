'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { summarizePracticeSubmission } from '@/modules/practice/domain/submission-summary'

type PracticeOptionLike = {
  id: string
  isCorrect?: boolean
}

type PracticeQuestionLike = {
  id: string
  options?: PracticeOptionLike[]
}

type PracticeSessionOptions = {
  draftKey?: string
  restoreDraftIndex?: boolean
}

type StoredPracticeDraft = {
  version: 1 | 2
  answers: Record<string, string>
  sortingDrafts?: Record<string, Array<string | null>>
  currentQuestionId: string | null
  hasProgress: boolean
  updatedAt: string
}

export function usePracticeSession<TQuestion extends PracticeQuestionLike>(
  questions: TQuestion[],
  initialIndex = 0,
  options: PracticeSessionOptions = {},
) {
  const { draftKey, restoreDraftIndex = true } = options
  const [currentIndex, setCurrentIndexState] = useState(initialIndex)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [sortingDrafts, setSortingDrafts] = useState<
    Record<string, Array<string | null>>
  >({})
  const [draftReady, setDraftReady] = useState(!draftKey)
  const [showSheet, setShowSheet] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState<string[]>([])
  const [timeSpentByQuestionId, setTimeSpentByQuestionId] = useState<
    Record<string, number>
  >({})
  const questionEnterAtRef = useRef<number>(0)

  useEffect(() => {
    if (!draftKey || typeof window === 'undefined') {
      setDraftReady(true)
      return
    }

    try {
      const rawDraft = window.localStorage.getItem(draftKey)
      if (!rawDraft) return
      const stored = JSON.parse(rawDraft) as Partial<StoredPracticeDraft>
      if (
        (stored.version !== 1 && stored.version !== 2) ||
        !stored.answers
      )
        return

      const validAnswers: Record<string, string> = {}
      for (const question of questions) {
        const optionId = stored.answers[question.id]
        if (question.options?.some(option => option.id === optionId)) {
          validAnswers[question.id] = optionId
        }
      }
      setAnswers(validAnswers)

      const validSortingDrafts: Record<string, Array<string | null>> = {}
      if (stored.version === 2 && stored.sortingDrafts) {
        for (const question of questions) {
          const draft = stored.sortingDrafts[question.id]
          if (!Array.isArray(draft)) continue
          const validOptionIds = new Set(
            (question.options || []).map(option => option.id),
          )
          const seen = new Set<string>()
          validSortingDrafts[question.id] = draft.map(optionId => {
            if (
              typeof optionId !== 'string' ||
              !validOptionIds.has(optionId) ||
              seen.has(optionId)
            ) {
              return null
            }
            seen.add(optionId)
            return optionId
          })
        }
      }
      setSortingDrafts(validSortingDrafts)

      if (restoreDraftIndex && stored.currentQuestionId) {
        const storedIndex = questions.findIndex(
          question => question.id === stored.currentQuestionId,
        )
        if (storedIndex >= 0) setCurrentIndexState(storedIndex)
      }
    } catch {
      window.localStorage.removeItem(draftKey)
    } finally {
      setDraftReady(true)
    }
  }, [draftKey, questions, restoreDraftIndex])

  const getCorrectOptionId = useCallback(
    (question: TQuestion) =>
      question.options?.find(option => option.isCorrect)?.id,
    [],
  )

  const answeredCount = Object.keys(answers).length
  const submittedQuestionIdSet = useMemo(
    () => new Set(submittedQuestionIds),
    [submittedQuestionIds],
  )

  const submissionSummary = useMemo(
    () => summarizePracticeSubmission(questions, answers),
    [questions, answers],
  )
  const {
    wrongIndexes,
    wrongCount,
    correctCount,
    gradableCount,
  } = submissionSummary
  const submittedCount = submittedQuestionIds.length
  const unansweredCount = Math.max(0, questions.length - submittedCount)
  const isQuestionSubmitted = useCallback(
    (questionId: string) => isSubmitted && submittedQuestionIdSet.has(questionId),
    [isSubmitted, submittedQuestionIdSet],
  )

  const selectOption = (questionId: string, optionId: string) => {
    if (isSubmitted) return
    setAnswers(prev => {
      if (prev[questionId] === optionId) return prev
      return { ...prev, [questionId]: optionId }
    })
  }

  const clearOption = (questionId: string) => {
    if (isSubmitted) return
    setAnswers(prev => {
      if (!prev[questionId]) return prev
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }

  const setSortingDraft = useCallback(
    (questionId: string, order: Array<string | null>) => {
      if (isSubmitted) return
      setSortingDrafts(previous => {
        const current = previous[questionId] || []
        if (
          current.length === order.length &&
          current.every((optionId, index) => optionId === order[index])
        ) {
          return previous
        }
        return { ...previous, [questionId]: order }
      })
    },
    [isSubmitted],
  )

  const accumulateCurrentQuestionTime = () => {
    const currentQuestion = questions[currentIndex]
    if (!currentQuestion) return
    const now = Date.now()
    const enterAt = questionEnterAtRef.current || now
    const delta = Math.max(0, now - enterAt)
    questionEnterAtRef.current = now
    if (delta <= 0) return
    setTimeSpentByQuestionId(prev => ({
      ...prev,
      [currentQuestion.id]: (prev[currentQuestion.id] || 0) + delta,
    }))
  }

  const setCurrentIndex = (nextIndex: number) => {
    if (nextIndex === currentIndex) return
    accumulateCurrentQuestionTime()
    setCurrentIndexState(nextIndex)
  }

  const saveDraft = useCallback(() => {
    if (!draftKey || !draftReady || typeof window === 'undefined') return
    const draft: StoredPracticeDraft = {
      version: 2,
      answers,
      sortingDrafts,
      currentQuestionId: questions[currentIndex]?.id || null,
      hasProgress: Object.keys(answers).length > 0 || currentIndex > 0,
      updatedAt: new Date().toISOString(),
    }
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch {
      // Storage can be unavailable in restricted browser modes; answering still works.
    }
  }, [answers, currentIndex, draftKey, draftReady, questions, sortingDrafts])

  const clearDraft = useCallback(() => {
    if (!draftKey || typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(draftKey)
    } catch {
      // Ignore unavailable storage after a successful submission.
    }
  }, [draftKey])

  const submit = () => {
    if (isSubmitted) return
    accumulateCurrentQuestionTime()
    setSubmittedQuestionIds(submissionSummary.submittedQuestionIds)
    setIsSubmitted(true)
    setShowSheet(false)
    // 仅在整卷已作答的情况下自动跳到第一道错题，
    // 避免“只做了少量题就交卷”时被强制切换题目。
    if (answeredCount >= questions.length && wrongIndexes.length > 0) {
      setCurrentIndexState(wrongIndexes[0])
    }
  }

  useEffect(() => {
    questionEnterAtRef.current = Date.now()
  }, [currentIndex, questions.length])

  useEffect(() => {
    if (isSubmitted) return
    saveDraft()
  }, [isSubmitted, saveDraft])

  return {
    currentIndex,
    setCurrentIndex,
    answers,
    sortingDrafts,
    answeredCount,
    timeSpentByQuestionId,
    draftReady,
    saveDraft,
    clearDraft,
    showSheet,
    setShowSheet,
    isSubmitted,
    submittedQuestionIds,
    submittedCount,
    unansweredCount,
    isQuestionSubmitted,
    wrongIndexes,
    wrongCount,
    correctCount,
    gradableCount,
    getCorrectOptionId,
    selectOption,
    clearOption,
    setSortingDraft,
    submit,
  }
}
