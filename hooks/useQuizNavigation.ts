'use client'

import { useCallback } from 'react'

export function useQuizNavigation(
  currentIndex: number,
  questionCount: number,
  isArticleMode: boolean,
  isAllBrowse: boolean,
) {
  /**
   * 跳转到指定题目
   */
  const jumpToQuestion = useCallback(
    (index: number, onIndexChange?: (index: number) => void) => {
      if (index < 0 || index >= questionCount) return
      onIndexChange?.(index)

      if (isAllBrowse) {
        document
          .getElementById(`question-${index}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    [questionCount, isAllBrowse],
  )

  /**
   * 上一题
   */
  const goToPrevious = useCallback(
    (onIndexChange?: (index: number) => void) => {
      if (currentIndex === 0) return
      const nextIndex = currentIndex - 1
      onIndexChange?.(nextIndex)
    },
    [currentIndex],
  )

  /**
   * 下一题
   */
  const goToNext = useCallback(
    (onIndexChange?: (index: number) => void) => {
      if (currentIndex >= questionCount - 1) return
      const nextIndex = currentIndex + 1
      onIndexChange?.(nextIndex)
    },
    [currentIndex, questionCount],
  )

  /**
   * 判断是否在第一题
   */
  const isFirstQuestion = currentIndex === 0

  /**
   * 判断是否在最后一题
   */
  const isLastQuestion = currentIndex === questionCount - 1

  /**
   * 是否可以跳转
   */
  const canNavigate = questionCount > 1

  return {
    // 状态
    isFirstQuestion,
    isLastQuestion,
    canNavigate,

    // 业务逻辑
    jumpToQuestion,
    goToPrevious,
    goToNext,
  }
}
