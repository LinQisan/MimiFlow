import prisma from '@/lib/prisma'
import { MaterialType, QuestionTemplate } from '@prisma/client'
import {
  materialDialogueItems,
  normalizeQuestionContext,
  normalizeQuestionOptions,
} from '../materials'

export type RetryQueueRow = {
  id: string
  questionId: string
  stage: number
  dueAt: Date
  wrongCount: number
  question: {
    sortOrder: number
    questionType: string
    prompt: string | null
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
    quiz: { id: string; title: string | null } | null
    readingSource: { id: string; title: string | null } | null
  }
}

type AttemptLite = {
  id: string
  isCorrect: boolean
  createdAt: Date
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toLegacyQuestionType({
  materialType,
  templateType,
  content,
}: {
  materialType: MaterialType
  templateType: QuestionTemplate
  content: Record<string, unknown>
}): string {
  const explicitType = asString(content.questionType)
  if (explicitType) {
    if (
      materialType === MaterialType.VOCAB_GRAMMAR &&
      (explicitType === 'FILL_BLANK' || explicitType === 'READING_COMPREHENSION')
    ) {
      return 'GRAMMAR'
    }
    return explicitType
  }

  if (materialType === MaterialType.LISTENING) return 'LISTENING'
  if (materialType === MaterialType.READING) {
    if (
      templateType === QuestionTemplate.FILL_BLANK ||
      templateType === QuestionTemplate.CLOZE_TEST
    ) {
      return 'FILL_BLANK'
    }
    return 'READING_COMPREHENSION'
  }

  if (materialType === MaterialType.VOCAB_GRAMMAR) {
    return templateType === QuestionTemplate.CLOZE_TEST ? 'SORTING' : 'GRAMMAR'
  }
  return 'GRAMMAR'
}

function calcRecentStreakDesc(attemptsDesc: AttemptLite[]) {
  let streak = 0
  for (const item of attemptsDesc) {
    if (!item.isCorrect) break
    streak += 1
  }
  return streak
}

function buildRetryStats(attemptsDesc: AttemptLite[]) {
  const attemptTotal = attemptsDesc.length
  const correctTotal = attemptsDesc.filter(item => item.isCorrect).length
  const accuracy = attemptTotal > 0 ? correctTotal / attemptTotal : 0
  const recentWindow = attemptsDesc.slice(0, Math.min(12, attemptTotal))
  const recentCorrect = recentWindow.filter(item => item.isCorrect).length
  const recentAccuracy =
    recentWindow.length > 0 ? recentCorrect / recentWindow.length : accuracy
  const recentStreak = calcRecentStreakDesc(attemptsDesc)

  // “优化后正确率”更重视近期表现，帮助从早期大量错误中恢复。
  const optimizedAccuracy =
    attemptTotal === 0 ? 0 : Math.min(1, recentAccuracy * 0.7 + accuracy * 0.3)
  const resetEligible =
    attemptTotal >= 10 &&
    recentWindow.length >= 6 &&
    recentAccuracy >= 0.75 &&
    recentStreak >= 4 &&
    accuracy < 0.95

  return {
    attemptTotal,
    correctTotal,
    accuracy,
    optimizedAccuracy,
    recentStreak,
    resetEligible,
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
        select: {
          sortOrder: true,
          templateType: true,
          prompt: true,
          context: true,
          options: true,
          answer: true,
          content: true,
          material: {
            select: { id: true, title: true, type: true, contentPayload: true },
          },
          attempts: {
            orderBy: { createdAt: 'desc' },
            take: 60,
            select: {
              id: true,
              isCorrect: true,
              createdAt: true,
            },
          },
        },
      },
    },
  })

  return rows.map(row => {
    const questionContent = asRecord(row.question.content)
    const payload = asRecord(row.question.material.contentPayload)
    return {
    id: row.id,
    questionId: row.questionId,
    stage: row.stage,
    dueAt: row.dueAt,
    wrongCount: row.wrongCount,
    question: {
      sortOrder: row.question.sortOrder,
      questionType: toLegacyQuestionType({
        materialType: row.question.material.type,
        templateType: row.question.templateType,
        content: questionContent,
      }),
      prompt: row.question.prompt,
      contextSentence: normalizeQuestionContext(
        row.question.prompt,
        row.question.context,
      ),
      targetWord: asString(questionContent.targetWord),
      options: normalizeQuestionOptions(row.question.options, row.question.answer),
      passageId:
        row.question.material.type === 'READING' ? row.question.material.id : null,
      passage:
        row.question.material.type === 'READING'
          ? {
              id: row.question.material.id,
              content: asString(payload.text) || asString(payload.transcript) || '',
            }
          : null,
      lessonId:
        row.question.material.type === 'LISTENING' ? row.question.material.id : null,
      lesson:
        row.question.material.type === 'LISTENING'
          ? {
              id: row.question.material.id,
              audioFile: asString(payload.audioFile) || asString(payload.audioUrl),
              dialogues: materialDialogueItems(row.question.material.contentPayload),
            }
          : null,
      stats: buildRetryStats(row.question.attempts),
      quiz:
        row.question.material.type === 'VOCAB_GRAMMAR'
          ? { id: row.question.material.id, title: row.question.material.title }
          : null,
      readingSource:
        row.question.material.type === 'READING'
          ? { id: row.question.material.id, title: row.question.material.title }
          : null,
    },
  }
  })
}

export async function getRetryQuestionRowById(retryId: string) {
  const row = await prisma.questionRetry.findUnique({
    where: { id: retryId },
    include: {
      question: {
        select: {
          sortOrder: true,
          templateType: true,
          prompt: true,
          context: true,
          options: true,
          answer: true,
          content: true,
          material: {
            select: { id: true, title: true, type: true, contentPayload: true },
          },
          attempts: {
            orderBy: { createdAt: 'desc' },
            take: 60,
            select: {
              id: true,
              isCorrect: true,
              createdAt: true,
            },
          },
        },
      },
    },
  })

  if (!row) return null

  const questionContent = asRecord(row.question.content)
  const payload = asRecord(row.question.material.contentPayload)

  return {
    id: row.id,
    questionId: row.questionId,
    stage: row.stage,
    dueAt: row.dueAt,
    wrongCount: row.wrongCount,
    question: {
      sortOrder: row.question.sortOrder,
      questionType: toLegacyQuestionType({
        materialType: row.question.material.type,
        templateType: row.question.templateType,
        content: questionContent,
      }),
      prompt: row.question.prompt,
      contextSentence: normalizeQuestionContext(
        row.question.prompt,
        row.question.context,
      ),
      targetWord: asString(questionContent.targetWord),
      options: normalizeQuestionOptions(row.question.options, row.question.answer),
      passageId:
        row.question.material.type === 'READING' ? row.question.material.id : null,
      passage:
        row.question.material.type === 'READING'
          ? {
              id: row.question.material.id,
              content: asString(payload.text) || asString(payload.transcript) || '',
            }
          : null,
      lessonId:
        row.question.material.type === 'LISTENING' ? row.question.material.id : null,
      lesson:
        row.question.material.type === 'LISTENING'
          ? {
              id: row.question.material.id,
              audioFile: asString(payload.audioFile) || asString(payload.audioUrl),
              dialogues: materialDialogueItems(row.question.material.contentPayload),
            }
          : null,
      stats: buildRetryStats(row.question.attempts),
      quiz:
        row.question.material.type === 'VOCAB_GRAMMAR'
          ? { id: row.question.material.id, title: row.question.material.title }
          : null,
      readingSource:
        row.question.material.type === 'READING'
          ? { id: row.question.material.id, title: row.question.material.title }
          : null,
    },
  }
}

export async function softResetRetryAccuracy(questionId: string) {
  const attemptsAsc = await prisma.questionAttempt.findMany({
    where: { questionId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, isCorrect: true, createdAt: true },
  })
  const attemptsDesc = [...attemptsAsc].reverse()
  const stats = buildRetryStats(attemptsDesc)

  if (!stats.resetEligible) {
    return {
      ok: false as const,
      message: '暂不满足重置条件（需要近期较稳定正确）。',
    }
  }

  const removableWrongIds = attemptsAsc
    // 保留最近 8 次作答历史，避免“清得太狠”
    .slice(0, Math.max(0, attemptsAsc.length - 8))
    .filter(item => !item.isCorrect)
    .map(item => item.id)

  if (removableWrongIds.length === 0) {
    return { ok: false as const, message: '暂无可重置的早期错误记录。' }
  }

  const removeCount = Math.min(
    removableWrongIds.length,
    Math.max(1, Math.floor(attemptsAsc.length * 0.1)),
  )
  const removeIds = removableWrongIds.slice(0, removeCount)

  await prisma.questionAttempt.deleteMany({
    where: {
      id: { in: removeIds },
    },
  })

  const afterAttempts = await prisma.questionAttempt.findMany({
    where: { questionId },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { id: true, isCorrect: true, createdAt: true },
  })
  const afterStats = buildRetryStats(afterAttempts)

  return {
    ok: true as const,
    removed: removeCount,
    stats: afterStats,
  }
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
