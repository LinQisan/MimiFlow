'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'

const RETRY_HOURS = [24, 72, 168] as const

const addHours = (from: Date, hours: number) =>
  new Date(from.getTime() + hours * 60 * 60 * 1000)

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
      sourceUrl: `/quizzes/${item.question.quiz.id}`,
    }
  }
  if (item.question.passage) {
    return {
      sourceTitle: `阅读 · ${item.question.passage.title || '未命名文章'}`,
      sourceUrl: `/articles/${item.question.passage.id}`,
    }
  }
  return {
    sourceTitle: '题目来源已失效',
    sourceUrl: '/quizzes',
  }
}

export async function getRetryQueueSummary() {
  const now = new Date()
  const [dueCount, totalCount, nextDue] = await Promise.all([
    prisma.questionRetry.count({ where: { dueAt: { lte: now } } }),
    prisma.questionRetry.count(),
    prisma.questionRetry.findFirst({
      orderBy: { dueAt: 'asc' },
      select: { dueAt: true },
    }),
  ])
  return {
    dueCount,
    totalCount,
    nextDueAt: nextDue?.dueAt || null,
  }
}

export async function getDueRetryQuestions(
  limit = 20,
): Promise<RetryQueueItem[]> {
  const now = new Date()
  const rows = await prisma.questionRetry.findMany({
    where: { dueAt: { lte: now } },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    take: limit,
    include: {
      question: {
        include: {
          options: true,
          quiz: { select: { id: true, title: true } },
          passage: { select: { id: true, title: true } },
        },
      },
    },
  })

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
      options: row.question.options.map(option => ({
        id: option.id,
        text: option.text,
        isCorrect: option.isCorrect,
      })),
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
    const now = new Date()
    const row = await prisma.questionRetry.findUnique({
      where: { id: retryId },
      include: {
        question: {
          include: {
            options: { select: { id: true, isCorrect: true } },
          },
        },
      },
    })
    if (!row) {
      return { success: false, message: '回流题目不存在或已完成' }
    }

    const selected = row.question.options.find(
      item => item.id === selectedOptionId,
    )
    if (!selected) {
      return { success: false, message: '未选择有效选项' }
    }
    const isCorrect = selected.isCorrect
    const correctOptionId =
      row.question.options.find(item => item.isCorrect)?.id || null

    await prisma.$transaction(async tx => {
      await tx.questionAttempt.create({
        data: {
          questionId: row.questionId,
          isCorrect,
          timeSpentMs: 0,
        },
      })

      if (!isCorrect) {
        await tx.questionRetry.update({
          where: { id: retryId },
          data: {
            stage: 0,
            dueAt: addHours(now, RETRY_HOURS[0]),
            wrongCount: { increment: 1 },
          },
        })
        return
      }

      const nextStage = row.stage + 1
      if (nextStage >= RETRY_HOURS.length) {
        await tx.questionRetry.delete({ where: { id: retryId } })
        return
      }

      await tx.questionRetry.update({
        where: { id: retryId },
        data: {
          stage: nextStage,
          dueAt: addHours(now, RETRY_HOURS[nextStage]),
        },
      })
    })

    revalidatePath('/retry')
    revalidatePath('/today')
    revalidatePath('/')

    if (!isCorrect) {
      return {
        success: true,
        isCorrect: false,
        correctOptionId,
        nextInHours: RETRY_HOURS[0],
        done: false,
      }
    }

    const nextStage = row.stage + 1
    if (nextStage >= RETRY_HOURS.length) {
      return {
        success: true,
        isCorrect: true,
        correctOptionId,
        nextInHours: null,
        done: true,
      }
    }

    return {
      success: true,
      isCorrect: true,
      correctOptionId,
      nextInHours: RETRY_HOURS[nextStage],
      done: false,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '提交失败'
    return { success: false, message }
  }
}
