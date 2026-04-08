'use client'

import { useMemo, useState } from 'react'

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
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showSheet, setShowSheet] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

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

  const submit = () => {
    if (isSubmitted) return
    setIsSubmitted(true)
    setShowSheet(true)
    if (wrongIndexes.length > 0) {
      setCurrentIndex(wrongIndexes[0])
    }
  }

  return {
    currentIndex,
    setCurrentIndex,
    answers,
    answeredCount,
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
