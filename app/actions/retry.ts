'use server'

import { revalidatePath } from 'next/cache'
import {
  getDueRetryQuestionRows,
  getRetryQuestionRowById,
  getRetryQueueSummarySnapshot,
  softResetRetryAccuracy,
  submitRetryAnswerWithSchedule,
} from '@/lib/repositories/review/retry'
import { toLegacyMaterialId } from '@/lib/repositories/materials'

const RETRY_HOURS = [24, 72, 168] as const

export type RetryQueueItem = {
  retryId: string
  questionId: string
  questionOrder: number
  stage: number
  dueAt: Date
  wrongCount: number
  questionType: string
  prompt: string
  contextSentence: string
  targetWord: string | null
  options: { id: string; text: string; isCorrect: boolean }[]
  passageId: string | null
  passage: { id: string; content: string } | null
  lessonId: string | null
  lesson: {
    id: string
    audioFile: string | null
    dialogues: {
      id: number
      text: string
      start: number
      end: number
      sequenceId?: number
    }[]
  } | null
  stats: {
    attemptTotal: number
    correctTotal: number
    accuracy: number
    optimizedAccuracy: number
    recentStreak: number
    resetEligible: boolean
  }
  sourceTitle: string
  sourceUrl: string
}

const mapRetrySource = (item: {
  question: {
    quiz: { id: string; title: string | null } | null
    readingSource: { id: string; title: string | null } | null
  }
}) => {
  if (item.question.quiz) {
    return {
      sourceTitle: `题库 · ${item.question.quiz.title || '未命名题库'}`,
      sourceUrl: '/practice',
    }
  }

  if (item.question.readingSource) {
    return {
      sourceTitle: `阅读 · ${item.question.readingSource.title || '未命名文章'}`,
      sourceUrl: `/articles/${toLegacyMaterialId(item.question.readingSource.id)}`,
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
      questionOrder: row.question.sortOrder,
      stage: row.stage,
      dueAt: row.dueAt,
      wrongCount: row.wrongCount,
      questionType: row.question.questionType,
      prompt: row.question.prompt || '',
      contextSentence: row.question.contextSentence,
      targetWord: row.question.targetWord,
      options: row.question.options,
      passageId: row.question.passageId,
      passage: row.question.passage,
      lessonId: row.question.lessonId,
      lesson: row.question.lesson,
      stats: row.question.stats,
      sourceTitle: source.sourceTitle,
      sourceUrl: source.sourceUrl,
    }
  })
}

export async function getRetryQuestionById(
  retryId: string,
): Promise<RetryQueueItem | null> {
  const row = await getRetryQuestionRowById(retryId)
  if (!row) return null

  const source = mapRetrySource(row)
  return {
    retryId: row.id,
    questionId: row.questionId,
    questionOrder: row.question.sortOrder,
    stage: row.stage,
    dueAt: row.dueAt,
    wrongCount: row.wrongCount,
    questionType: row.question.questionType,
    prompt: row.question.prompt || '',
    contextSentence: row.question.contextSentence,
    targetWord: row.question.targetWord,
    options: row.question.options,
    passageId: row.question.passageId,
    passage: row.question.passage,
    lessonId: row.question.lessonId,
    lesson: row.question.lesson,
    stats: row.question.stats,
    sourceTitle: source.sourceTitle,
    sourceUrl: source.sourceUrl,
  }
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

export async function resetRetryQuestionAccuracy(questionId: string) {
  try {
    const result = await softResetRetryAccuracy(questionId)
    if (!result.ok) {
      return { success: false, message: result.message }
    }

    revalidatePath('/review')
    revalidatePath('/practice')
    revalidatePath('/today')
    revalidatePath('/')

    return {
      success: true,
      message: `已轻度重置错误历史（移除 ${result.removed} 条旧错误记录）。`,
      stats: result.stats,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '重置失败'
    return { success: false, message }
  }
}
