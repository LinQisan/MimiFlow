'use client'

import { useEffect, useState } from 'react'

export function useQuizTimer(
  currentIndex: number,
  isAllBrowse: boolean,
  questionCount: number,
) {
  const [timeLogs, setTimeLogs] = useState<Record<string, number>>({})
  const [globalStartTime, setGlobalStartTime] = useState(0)
  const [currentQuestionStartTime, setCurrentQuestionStartTime] = useState(0)
  const [totalTimeSpent, setTotalTimeSpent] = useState(0)

  // 初始化全局开始时间
  useEffect(() => {
    const now = Date.now()
    setGlobalStartTime(now)
    setCurrentQuestionStartTime(now)
  }, [])

  // 监听题目变化
  useEffect(() => {
    if (isAllBrowse || questionCount === 0) return
    setCurrentQuestionStartTime(Date.now())
  }, [currentIndex, isAllBrowse, questionCount])

  /**
   * 更新某个题目的耗时
   */
  const updateElapsedForQuestion = (questionId: string) => {
    if (!questionId) return

    const now = Date.now()
    const base =
      isAllBrowse && globalStartTime > 0
        ? globalStartTime
        : currentQuestionStartTime > 0
          ? currentQuestionStartTime
          : now

    const elapsed = Math.max(0, now - base)

    setTimeLogs(prev => ({
      ...prev,
      [questionId]: (prev[questionId] || 0) + elapsed,
    }))

    if (!isAllBrowse) {
      setCurrentQuestionStartTime(now)
    }
  }

  /**
   * 获取最终的耗时统计（调用此方法前应先更新当前题目的耗时）
   */
  const getFinalTimeLogs = (
    currentQuestionId: string | null = null,
  ): Record<string, number> => {
    if (!isAllBrowse || globalStartTime === 0) {
      return timeLogs
    }

    const finalLogs = { ...timeLogs }
    if (currentQuestionId) {
      finalLogs[currentQuestionId] =
        (finalLogs[currentQuestionId] || 0) +
        Math.max(0, Date.now() - globalStartTime)
    }
    return finalLogs
  }

  /**
   * 计算总耗时
   */
  const calculateTotalTimeSpent = (logs: Record<string, number>): number => {
    return Object.values(logs).reduce((sum, value) => sum + value, 0)
  }

  /**
   * 重置计时
   */
  const resetTimer = () => {
    const now = Date.now()
    setTimeLogs({})
    setGlobalStartTime(now)
    setCurrentQuestionStartTime(now)
    setTotalTimeSpent(0)
  }

  return {
    // 状态
    timeLogs,
    globalStartTime,
    currentQuestionStartTime,
    totalTimeSpent,

    // 更新方法
    setTimeLogs,
    setGlobalStartTime,
    setCurrentQuestionStartTime,
    setTotalTimeSpent,

    // 业务逻辑
    updateElapsedForQuestion,
    getFinalTimeLogs,
    calculateTotalTimeSpent,
    resetTimer,
  }
}
