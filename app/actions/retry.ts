'use server'

import { revalidatePath } from 'next/cache'
import {
  getDueRetryQuestionRows,
  getRetryQueueSummarySnapshot,
  submitRetryAnswerWithSchedule,
} from '@/lib/repositories/retry.repo'
import { toLegacyMaterialId } from '@/lib/repositories/materials.repo'

const RETRY_HOURS = [24, 72, 168] as const

export type RetryQueueItem = {
  retryId: string
  questionId: string
  stage: number
  dueAt: Date
  wrongCount: number
  questionType: string
  prompt: string
  contextSentence: string
  options: { id: string; text: string; isCorrect: boolean }[]
  sourceTitle: string
  sourceUrl: string
}

const mapRetrySource = (item: {
  question: {
    quiz: { id: string; title: string | null } | null
    passage: { id: string; title: string | null } | null
  }
}) => {
  if (item.question.quiz) {
    return {
      sourceTitle: `题库 · ${item.question.quiz.title || '未命名题库'}`,
      sourceUrl: '/practice',
    }
  }

  if (item.question.passage) {
    return {
      sourceTitle: `阅读 · ${item.question.passage.title || '未命名文章'}`,
      sourceUrl: `/articles/${toLegacyMaterialId(item.question.passage.id)}`,
    }
  }

  return {
    sourceTitle: '题目来源已失效',
    sourceUrl: '/practice',
  }
}

export async function getRetryQueueSummary() {
  return getRetryQueueSummarySnapshot(new Date())
}

export async function getDueRetryQuestions(
  limit = 20,
): Promise<RetryQueueItem[]> {
  const rows = await getDueRetryQuestionRows(new Date(), limit)

  return rows.map(row => {
    const source = mapRetrySource(row)
    return {
      retryId: row.id,
      questionId: row.questionId,
      stage: row.stage,
      dueAt: row.dueAt,
      wrongCount: row.wrongCount,
      questionType: row.question.questionType,
      prompt: row.question.prompt || '',
      contextSentence: row.question.contextSentence,
      options: row.question.options,
      sourceTitle: source.sourceTitle,
      sourceUrl: source.sourceUrl,
    }
  })
}

export async function submitRetryAnswer(
  retryId: string,
  selectedOptionId: string,
) {
  try {
    const result = await submitRetryAnswerWithSchedule({
      retryId,
      selectedOptionId,
      now: new Date(),
      retryHours: RETRY_HOURS,
    })

    if (!result.ok) {
      return { success: false, message: result.message }
    }

    revalidatePath('/review')
    revalidatePath('/practice')
    revalidatePath('/today')
    revalidatePath('/')

    return {
      success: true,
      isCorrect: result.isCorrect,
      correctOptionId: result.correctOptionId,
      nextInHours: result.nextInHours,
      done: result.done,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '提交失败'
    return { success: false, message }
  }
}
