'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

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
  const [timeSpentByQuestionId, setTimeSpentByQuestionId] = useState<
    Record<string, number>
  >({})
  const questionEnterAtRef = useRef<number>(Date.now())

  const getCorrectOptionId = (question: TQuestion) =>
    question.options?.find(option => option.isCorrect)?.id

  const answeredCount = Object.keys(answers).length

  const wrongIndexes = useMemo(
    () =>
      questions.reduce<number[]>((acc, question, index) => {
        const correctId = getCorrectOptionId(question)
        if (!correctId) return acc
        if (answers[question.id] !== correctId) acc.push(index)
        return acc
      }, []),
    [questions, answers],
  )

  const gradableCount = useMemo(
    () => questions.filter(question => !!getCorrectOptionId(question)).length,
    [questions],
  )

  const wrongCount = wrongIndexes.length
  const correctCount = gradableCount - wrongCount

  const selectOption = (questionId: string, optionId: string) => {
    if (isSubmitted) return
    setAnswers(prev => ({ ...prev, [questionId]: optionId }))
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
    const delta = Math.max(0, now - questionEnterAtRef.current)
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
