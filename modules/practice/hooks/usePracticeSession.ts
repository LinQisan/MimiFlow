'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { summarizePracticeSubmission } from '@/modules/practice/domain/submission-summary'
import {
  readUserStorageValue,
  useCurrentUser,
  userStorageKey,
} from '@/context/UserContext'

type PracticeOptionLike = {
  id: string
  isCorrect?: boolean
}

type PracticeQuestionLike = {
  id: string
  questionType?: string | null
  prompt?: string | null
  correctOrder?: string[]
  options?: PracticeOptionLike[]
}

type PracticeSessionOptions = {
  draftKey?: string
  restoreDraftIndex?: boolean
  initialAnswers?: Record<string, string>
  initialSortingOrders?: Record<string, Array<string | null>>
  initialSubmitted?: boolean
}

type StoredPracticeDraft = {
  version: 2
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
  const currentUser = useCurrentUser()
  const {
    draftKey,
    restoreDraftIndex = true,
    initialAnswers = {},
    initialSortingOrders = {},
    initialSubmitted = false,
  } = options
  const scopedDraftKey = draftKey
    ? userStorageKey(currentUser.id, draftKey)
    : undefined
  const [currentIndex, setCurrentIndexState] = useState(initialIndex)
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers)
  const [sortingDrafts, setSortingDrafts] = useState<
    Record<string, Array<string | null>>
  >(initialSortingOrders)
  const [draftReady, setDraftReady] = useState(!draftKey)
  const [showSheet, setShowSheet] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(initialSubmitted)
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState<string[]>(
    initialSubmitted
      ? summarizePracticeSubmission(
          questions,
          initialAnswers,
          initialSortingOrders,
        ).submittedQuestionIds
      : [],
  )
  const [timeSpentByQuestionId, setTimeSpentByQuestionId] = useState<
    Record<string, number>
  >({})
  const questionEnterAtRef = useRef<number>(0)

  useEffect(() => {
    if (initialSubmitted || !scopedDraftKey || typeof window === 'undefined') {
      setDraftReady(true)
      return
    }

    try {
      const rawDraft = readUserStorageValue(currentUser.id, draftKey!)
      if (!rawDraft) return
      const stored = JSON.parse(rawDraft) as Partial<StoredPracticeDraft>
      if (stored.version !== 2 || !stored.answers) return

      const validAnswers: Record<string, string> = {}
      for (const question of questions) {
        const optionId = stored.answers[question.id]
        if (question.options?.some(option => option.id === optionId)) {
          validAnswers[question.id] = optionId
        }
      }
      setAnswers(validAnswers)

      const validSortingDrafts: Record<string, Array<string | null>> = {}
      if (stored.sortingDrafts) {
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
      window.localStorage.removeItem(scopedDraftKey)
    } finally {
      setDraftReady(true)
    }
  }, [currentUser.id, draftKey, initialSubmitted, questions, restoreDraftIndex, scopedDraftKey])

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
    () => summarizePracticeSubmission(questions, answers, sortingDrafts),
    [questions, answers, sortingDrafts],
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
    if (!scopedDraftKey || !draftReady || typeof window === 'undefined') return
    const draft: StoredPracticeDraft = {
      version: 2,
      answers,
      sortingDrafts,
      currentQuestionId: questions[currentIndex]?.id || null,
      hasProgress: Object.keys(answers).length > 0 || currentIndex > 0,
      updatedAt: new Date().toISOString(),
    }
    try {
      window.localStorage.setItem(scopedDraftKey, JSON.stringify(draft))
    } catch {
      // Storage can be unavailable in restricted browser modes; answering still works.
    }
  }, [answers, currentIndex, draftReady, questions, scopedDraftKey, sortingDrafts])

  const clearDraft = useCallback(() => {
    if (!scopedDraftKey || typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(scopedDraftKey)
    } catch {
      // Ignore unavailable storage after a successful submission.
    }
  }, [scopedDraftKey])

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
