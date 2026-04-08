'use client'

import { useState } from 'react'
import { updateQuestionExplanation } from '@/app/actions/content'

type QuizQuestion = {
  id: string
  explanation?: string | null
  [key: string]: any
}

export function useQuizExplanation(
  onQuestionUpdated?: (question: QuizQuestion) => void,
) {
  const [editingExpId, setEditingExpId] = useState<string | null>(null)
  const [expDraft, setExpDraft] = useState('')
  const [isSavingExp, setIsSavingExp] = useState(false)

  /**
   * 开始编辑笔记
   */
  const startEdit = (question: QuizQuestion) => {
    setEditingExpId(question.id)
    setExpDraft(question.explanation || '')
  }

  /**
   * 取消编辑
   */
  const cancelEdit = () => {
    setEditingExpId(null)
    setExpDraft('')
  }

  /**
   * 保存笔记
   */
  const saveExplanation = async (
    questionId: string,
    questions: QuizQuestion[],
  ) => {
    try {
      setIsSavingExp(true)
      const res = await updateQuestionExplanation(questionId, expDraft)

      if (res?.success) {
        // 更新本地题目
        const updatedQuestion = questions.find(q => q.id === questionId)
        if (updatedQuestion) {
          onQuestionUpdated?.({
            ...updatedQuestion,
            explanation: expDraft,
          })
        }
        setEditingExpId(null)
        setExpDraft('')
      }
    } catch (error) {
      console.error(error)
    } finally {
      setIsSavingExp(false)
    }
  }

  /**
   * 重置
   */
  const reset = () => {
    setEditingExpId(null)
    setExpDraft('')
    setIsSavingExp(false)
  }

  return {
    // 状态
    editingExpId,
    expDraft,
    isSavingExp,

    // 更新方法
    setEditingExpId,
    setExpDraft,
    setIsSavingExp,

    // 业务逻辑
    startEdit,
    cancelEdit,
    saveExplanation,
    reset,
  }
}
