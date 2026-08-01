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

export function usePracticeSession<TQuestion extends PracticeQuestionLike>(
  questions: TQuestion[],
  initialIndex = 0,
) {
  const [currentIndex, setCurrentIndexState] = useState(initialIndex)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showSheet, setShowSheet] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submittedQuestionIds, setSubmittedQuestionIds] = useState<string[]>([])
  const [timeSpentByQuestionId, setTimeSpentByQuestionId] = useState<
    Record<string, number>
  >({})
  const questionEnterAtRef = useRef<number>(0)

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

  const submit = () => {
    if (isSubmitted) return
    accumulateCurrentQuestionTime()
    setSubmittedQuestionIds(submissionSummary.submittedQuestionIds)
    setIsSubmitted(true)
    setShowSheet(true)
    // 仅在整卷已作答的情况下自动跳到第一道错题，
    // 避免“只做了少量题就交卷”时被强制切换题目。
    if (answeredCount >= questions.length && wrongIndexes.length > 0) {
      setCurrentIndexState(wrongIndexes[0])
    }
  }

  useEffect(() => {
    questionEnterAtRef.current = Date.now()
  }, [currentIndex, questions.length])

  return {
    currentIndex,
    setCurrentIndex,
    answers,
    answeredCount,
    timeSpentByQuestionId,
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
    submit,
  }
}
