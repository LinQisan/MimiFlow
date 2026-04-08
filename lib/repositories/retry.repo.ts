import prisma from '@/lib/prisma'
import {
  normalizeQuestionContext,
  normalizeQuestionOptions,
} from './materials.repo'

export type RetryQueueRow = {
  id: string
  questionId: string
  stage: number
  dueAt: Date
  wrongCount: number
  question: {
    questionType: string
    prompt: string | null
    contextSentence: string
    options: { id: string; text: string; isCorrect: boolean }[]
    quiz: { id: string; title: string | null } | null
    passage: { id: string; title: string | null } | null
  }
}

export async function getRetryQueueSummarySnapshot(now: Date) {
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

export async function getDueRetryQuestionRows(now: Date, limit: number) {
  const rows = await prisma.questionRetry.findMany({
    where: { dueAt: { lte: now } },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    take: limit,
    include: {
      question: {
        include: {
          material: {
            select: { id: true, title: true, type: true },
          },
        },
      },
    },
  })

  return rows.map(row => ({
    id: row.id,
    questionId: row.questionId,
    stage: row.stage,
    dueAt: row.dueAt,
    wrongCount: row.wrongCount,
    question: {
      questionType: row.question.templateType,
      prompt: row.question.prompt,
      contextSentence: normalizeQuestionContext(
        row.question.prompt,
        row.question.context,
      ),
      options: normalizeQuestionOptions(row.question.options, row.question.answer),
      quiz:
        row.question.material.type === 'VOCAB_GRAMMAR'
          ? { id: row.question.material.id, title: row.question.material.title }
          : null,
      passage:
        row.question.material.type === 'READING'
          ? { id: row.question.material.id, title: row.question.material.title }
          : null,
    },
  }))
}

const addHours = (from: Date, hours: number) =>
  new Date(from.getTime() + hours * 60 * 60 * 1000)

type SubmitRetryAnswerInput = {
  retryId: string
  selectedOptionId: string
  now: Date
  retryHours: readonly number[]
}

export async function submitRetryAnswerWithSchedule({
  retryId,
  selectedOptionId,
  now,
  retryHours,
}: SubmitRetryAnswerInput) {
  const row = await prisma.questionRetry.findUnique({
    where: { id: retryId },
    include: {
      question: {
        select: {
          id: true,
          prompt: true,
          context: true,
          options: true,
          answer: true,
        },
      },
    },
  })

  if (!row) {
    return { ok: false as const, message: '回流题目不存在或已完成' }
  }

  const options = normalizeQuestionOptions(row.question.options, row.question.answer)
  const selected = options.find(item => item.id === selectedOptionId)
  if (!selected) {
    return { ok: false as const, message: '未选择有效选项' }
  }

  const isCorrect = selected.isCorrect
  const correctOptionId = options.find(item => item.isCorrect)?.id || null

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
          dueAt: addHours(now, retryHours[0]),
          wrongCount: { increment: 1 },
        },
      })
      return
    }

    const nextStage = row.stage + 1
    if (nextStage >= retryHours.length) {
      await tx.questionRetry.delete({ where: { id: retryId } })
      return
    }

    await tx.questionRetry.update({
      where: { id: retryId },
      data: {
        stage: nextStage,
        dueAt: addHours(now, retryHours[nextStage]),
      },
    })
  })

  if (!isCorrect) {
    return {
      ok: true as const,
      isCorrect,
      correctOptionId,
      nextInHours: retryHours[0],
      done: false,
    }
  }

  const nextStage = row.stage + 1
  if (nextStage >= retryHours.length) {
    return {
      ok: true as const,
      isCorrect,
      correctOptionId,
      nextInHours: null,
      done: true,
    }
  }

  return {
    ok: true as const,
    isCorrect,
    correctOptionId,
    nextInHours: retryHours[nextStage],
    done: false,
  }
}
