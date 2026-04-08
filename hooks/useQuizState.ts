'use client'

import { useEffect, useState } from 'react'

type QuestionAttempt = {
  isCorrect: boolean
}

type QuestionOption = {
  id: string
  text: string
  isCorrect: boolean
}

type QuizQuestion = {
  id: string
  questionType: string
  prompt?: string | null
  contextSentence: string
  targetWord?: string | null
  options: QuestionOption[]
  attempts?: QuestionAttempt[]
  explanation?: string | null
  order?: number | null
  sourcePaper?: string | null
  lessonId?: string | null
  passageId?: string | null
}

type QuizMode = 'scroll' | 'random' | 'sequential'

type QuizAnswerMap = Record<string, string | null>

const shuffleArray = <T>(array: T[]) => {
  const next = [...array]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

const initializeQuestions = (questions: QuizQuestion[], mode: QuizMode) => {
  const sorted = [...questions].sort((a, b) => (a.order || 0) - (b.order || 0))
  const withShuffledOptions = sorted.map(question => ({
    ...question,
    options: shuffleArray(question.options),
  }))

  return mode === 'random'
    ? shuffleArray(withShuffledOptions)
    : withShuffledOptions
}

export function useQuizState(quizQuestions: QuizQuestion[], mode: QuizMode) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<QuizAnswerMap>({})
  const [isGraded, setIsGraded] = useState<Record<string, boolean>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFinished, setIsFinished] = useState(false)
  const [score, setScore] = useState(0)

  // 初始化题目
  useEffect(() => {
    const initializedQuestions = initializeQuestions(quizQuestions, mode)
    setQuestions(initializedQuestions)
    setAnswers({})
    setIsGraded({})
    setCurrentIndex(0)
    setIsFinished(false)
    setScore(0)
  }, [quizQuestions, mode])

  const questionCount = questions.length
  const answeredCount = Object.values(answers).filter(Boolean).length
  const gradedCount = Object.values(isGraded).filter(Boolean).length

  /**
   * 选择一个选项作为答案
   */
  const handleSelectOption = (questionId: string, optionId: string | null) => {
    if (isFinished) return

    setAnswers(prev => ({
      ...prev,
      [questionId]: optionId,
    }))
  }

  /**
   * 批改单个题目
   * @returns 是否正确
   */
  const gradeQuestionById = (questionId: string): boolean => {
    const question = questions.find(item => item.id === questionId)
    if (!question) return false

    const selectedId = answers[questionId] || null
    const correctOption = question.options.find(option => option.isCorrect)
    const isCorrect = Boolean(
      selectedId && correctOption && selectedId === correctOption.id,
    )

    setIsGraded(prev => ({
      ...prev,
      [questionId]: true,
    }))

    return isCorrect
  }

  /**
   * 批改所有未批改的题目
   */
  const gradeRemaining = () => {
    const nextIsGraded = { ...isGraded }
    questions.forEach(question => {
      if (!nextIsGraded[question.id]) {
        nextIsGraded[question.id] = true
      }
    })
    setIsGraded(nextIsGraded)
  }

  /**
   * 提交全卷，标记所有题目为已批改
   */
  const submitAll = () => {
    const nextGraded = { ...isGraded }
    questions.forEach(question => {
      nextGraded[question.id] = true
    })
    setIsGraded(nextGraded)

    const nextScore = questions.reduce((acc, question) => {
      const selectedId = answers[question.id]
      const correctOption = question.options.find(option => option.isCorrect)
      return selectedId && correctOption && selectedId === correctOption.id
        ? acc + 1
        : acc
    }, 0)

    setScore(nextScore)
    setIsFinished(true)
  }

  /**
   * 重置状态
   */
  const reset = () => {
    setAnswers({})
    setIsGraded({})
    setCurrentIndex(0)
    setIsFinished(false)
    setScore(0)
  }

  return {
    // 状态
    questions,
    answers,
    isGraded,
    currentIndex,
    isFinished,
    score,
    questionCount,
    answeredCount,
    gradedCount,

    // 更新方法
    setCurrentIndex,
    setAnswers,
    setIsGraded,
    setQuestions,
    setScore,
    setIsFinished,

    // 业务逻辑
    handleSelectOption,
    gradeQuestionById,
    gradeRemaining,
    submitAll,
    reset,
  }
}
