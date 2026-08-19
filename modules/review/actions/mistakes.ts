'use server'

import { QuestionType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import {
  getDueRetryQuestionRows,
  getDueRetryQuestionTypeRows,
  getRetryQuestionRowById,
  getRetryQueueSummarySnapshot,
  softResetRetryAccuracy,
  submitRetryAnswerWithSchedule,
} from '@/modules/review/server/mistake-repository'

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
  questionId: string
  question: {
    quiz: {
      id: string
      title: string | null
      paperId: string | null
      paperTitle: string | null
    } | null
    readingSource: { id: string; title: string | null } | null
  }
}) => {
  if (item.question.quiz) {
    const paperId = item.question.quiz.paperId
    return {
      sourceTitle: `试卷 · ${item.question.quiz.paperTitle || item.question.quiz.title || '未命名试卷'}`,
      sourceUrl: paperId
        ? `/practice/${encodeURIComponent(paperId)}/do?qid=${encodeURIComponent(item.questionId)}`
        : '/practice',
    }
  }

  if (item.question.readingSource) {
    return {
      sourceTitle: `阅读 · ${item.question.readingSource.title || '未命名文章'}`,
      sourceUrl: `/reading/articles/${item.question.readingSource.id}`,
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
  questionType?: string,
): Promise<RetryQueueItem[]> {
  const normalizedQuestionType = Object.values(QuestionType).includes(
    questionType as QuestionType,
  )
    ? (questionType as QuestionType)
    : undefined
  const rows = await getDueRetryQuestionRows(
    new Date(),
    limit,
    normalizedQuestionType,
  )

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

export async function getDueRetryQuestionTypeSummaries() {
  const rows = await getDueRetryQuestionTypeRows(new Date())
  const summaries = new Map<
    string,
    { questionType: string; count: number; firstRetryId: string }
  >()

  for (const row of rows) {
    const questionType = row.question.questionType
    const current = summaries.get(questionType)
    if (current) {
      current.count += 1
    } else {
      summaries.set(questionType, {
        questionType,
        count: 1,
        firstRetryId: row.id,
      })
    }
  }

  return [...summaries.values()]
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

export async function submitRetryAnswers(
  attempts: Array<{ retryId: string; selectedOptionId: string }>,
) {
  const normalized = attempts
    .map(item => ({
      retryId: item.retryId.trim(),
      selectedOptionId: item.selectedOptionId.trim(),
    }))
    .filter(item => item.retryId && item.selectedOptionId)
  if (normalized.length === 0) {
    return { success: false, message: '请先完成本页题目。' }
  }

  try {
    const results = await Promise.all(
      normalized.map(item =>
        submitRetryAnswerWithSchedule({
          ...item,
          now: new Date(),
          retryHours: RETRY_HOURS,
        }),
      ),
    )
    const failed = results.find(result => !result.ok)
    if (failed && !failed.ok) {
      return { success: false, message: failed.message }
    }

    revalidatePath('/review/mistakes')
    revalidatePath('/')
    return {
      success: true,
      results: results.map((result, index) => ({
        retryId: normalized[index].retryId,
        isCorrect: result.ok ? result.isCorrect : false,
        done: result.ok ? result.done : false,
        nextInHours: result.ok ? result.nextInHours : null,
      })),
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
    revalidatePath('/review/mistakes')
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
