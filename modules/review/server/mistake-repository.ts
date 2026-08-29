import type { QuestionType } from '@prisma/client'

import prisma from '@/lib/prisma'
import {
  materialDialogueItems,
  normalizeQuestionContext,
  normalizeQuestionOptions,
} from '@/lib/repositories/materials'
import { readString } from '@/lib/validation/schema'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { getCurrentUserId } from '@/modules/users/server/current-user'

type AttemptLite = {
  id: string
  isCorrect: boolean
  createdAt: Date
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
  const userId = await getCurrentUserId()
  const [dueCount, totalCount, nextDue] = await Promise.all([
    prisma.questionRetry.count({ where: { userId, dueAt: { lte: now } } }),
    prisma.questionRetry.count({ where: { userId } }),
    prisma.questionRetry.findFirst({
      where: { userId },
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

export async function getDueRetryQuestionRows(
  now: Date,
  limit: number,
  questionType?: QuestionType,
) {
  const userId = await getCurrentUserId()
  const rows = await prisma.questionRetry.findMany({
    where: {
      userId,
      dueAt: { lte: now },
      ...(questionType ? { question: { questionType } } : {}),
    },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    take: limit,
    include: {
      question: {
        select: {
          sortOrder: true,
          questionType: true,
          prompt: true,
          context: true,
          options: true,
          answer: true,
          content: true,
          material: {
            select: {
              id: true,
              title: true,
              type: true,
              contentPayload: true,
              collectionMaterials: {
                where: { collection: { collectionType: 'PAPER' } },
                orderBy: { sortOrder: 'asc' },
                take: 1,
                select: {
                  collection: { select: { id: true, title: true } },
                },
              },
            },
          },
          attempts: {
            where: { userId },
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
    const questionContent = decodeQuestionContent(row.question.content)
    const payload = decodeMaterialPayloadRecord(
      row.question.material.type,
      row.question.material.contentPayload,
    )
    return {
    id: row.id,
    questionId: row.questionId,
    stage: row.stage,
    dueAt: row.dueAt,
    wrongCount: row.wrongCount,
    question: {
      sortOrder: row.question.sortOrder,
      questionType: row.question.questionType,
      prompt: row.question.prompt,
      contextSentence: normalizeQuestionContext(
        row.question.prompt,
        row.question.context,
      ),
      targetWord: readString(questionContent.targetWord),
      options: normalizeQuestionOptions(row.question.options, row.question.answer),
      passageId:
        row.question.material.type === 'READING' ? row.question.material.id : null,
      passage:
        row.question.material.type === 'READING'
          ? {
              id: row.question.material.id,
              content: readString(payload.text) || readString(payload.transcript) || '',
            }
          : null,
      lessonId:
        row.question.material.type === 'LISTENING' ? row.question.material.id : null,
      lesson:
        row.question.material.type === 'LISTENING'
          ? {
              id: row.question.material.id,
              audioFile: readString(payload.audioFile) || readString(payload.audioUrl),
              dialogues: materialDialogueItems(
                row.question.material.type,
                row.question.material.contentPayload,
              ),
            }
          : null,
      stats: buildRetryStats(row.question.attempts),
      quiz:
        row.question.material.type === 'VOCAB_GRAMMAR'
          ? {
              id: row.question.material.id,
              title: row.question.material.title,
              paperId:
                row.question.material.collectionMaterials[0]?.collection.id || null,
              paperTitle:
                row.question.material.collectionMaterials[0]?.collection.title ||
                null,
            }
          : null,
      readingSource:
        row.question.material.type === 'READING'
          ? { id: row.question.material.id, title: row.question.material.title }
          : null,
    },
  }
  })
}

export async function getDueRetryQuestionTypeRows(now: Date) {
  const userId = await getCurrentUserId()
  return prisma.questionRetry.findMany({
    where: { userId, dueAt: { lte: now } },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      question: { select: { questionType: true } },
    },
  })
}

export async function getRetryQuestionRowById(retryId: string) {
  const userId = await getCurrentUserId()
  const row = await prisma.questionRetry.findFirst({
    where: { id: retryId, userId },
    include: {
      question: {
        select: {
          sortOrder: true,
          questionType: true,
          prompt: true,
          context: true,
          options: true,
          answer: true,
          content: true,
          material: {
            select: {
              id: true,
              title: true,
              type: true,
              contentPayload: true,
              collectionMaterials: {
                where: { collection: { collectionType: 'PAPER' } },
                orderBy: { sortOrder: 'asc' },
                take: 1,
                select: {
                  collection: { select: { id: true, title: true } },
                },
              },
            },
          },
          attempts: {
            where: { userId },
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

  const questionContent = decodeQuestionContent(row.question.content)
  const payload = decodeMaterialPayloadRecord(
    row.question.material.type,
    row.question.material.contentPayload,
  )

  return {
    id: row.id,
    questionId: row.questionId,
    stage: row.stage,
    dueAt: row.dueAt,
    wrongCount: row.wrongCount,
    question: {
      sortOrder: row.question.sortOrder,
      questionType: row.question.questionType,
      prompt: row.question.prompt,
      contextSentence: normalizeQuestionContext(
        row.question.prompt,
        row.question.context,
      ),
      targetWord: readString(questionContent.targetWord),
      options: normalizeQuestionOptions(row.question.options, row.question.answer),
      passageId:
        row.question.material.type === 'READING' ? row.question.material.id : null,
      passage:
        row.question.material.type === 'READING'
          ? {
              id: row.question.material.id,
              content: readString(payload.text) || readString(payload.transcript) || '',
            }
          : null,
      lessonId:
        row.question.material.type === 'LISTENING' ? row.question.material.id : null,
      lesson:
        row.question.material.type === 'LISTENING'
          ? {
              id: row.question.material.id,
              audioFile: readString(payload.audioFile) || readString(payload.audioUrl),
              dialogues: materialDialogueItems(
                row.question.material.type,
                row.question.material.contentPayload,
              ),
            }
          : null,
      stats: buildRetryStats(row.question.attempts),
      quiz:
        row.question.material.type === 'VOCAB_GRAMMAR'
          ? {
              id: row.question.material.id,
              title: row.question.material.title,
              paperId:
                row.question.material.collectionMaterials[0]?.collection.id || null,
              paperTitle:
                row.question.material.collectionMaterials[0]?.collection.title ||
                null,
            }
          : null,
      readingSource:
        row.question.material.type === 'READING'
          ? { id: row.question.material.id, title: row.question.material.title }
          : null,
    },
  }
}

export async function softResetRetryAccuracy(questionId: string) {
  const userId = await getCurrentUserId()
  const attemptsAsc = await prisma.questionAttempt.findMany({
    where: { userId, questionId },
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
      userId,
      id: { in: removeIds },
    },
  })

  const afterAttempts = await prisma.questionAttempt.findMany({
    where: { userId, questionId },
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
  const userId = await getCurrentUserId()
  const row = await prisma.questionRetry.findFirst({
    where: { id: retryId, userId },
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
        userId,
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
