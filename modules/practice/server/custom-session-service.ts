import 'server-only'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import {
  getExamQuestionsByIds,
  getRandomExamQuestionIdsBySelections,
  type RandomPracticeScope,
} from '@/lib/repositories/exam'

import { buildPracticeTitle } from '../domain/custom-session'
export { buildPracticeTitle }

export type CreateCustomPracticeSessionInput = {
  selectionKeys: string[]
  count: number
  language?: string
  level?: string
  scope?: RandomPracticeScope
}

export async function createCustomPracticeSession(
  input: CreateCustomPracticeSessionInput,
) {
  const userId = await getCurrentUserId()
  const questionIds = await getRandomExamQuestionIdsBySelections(
    input.selectionKeys,
    input.count,
    {
      language: input.language,
      level: input.level,
      scope: input.scope,
    },
  )

  if (questionIds.length === 0) {
    return null
  }

  const examData = await getExamQuestionsByIds(questionIds, {
    language: input.language,
  })

  const title = buildPracticeTitle(input.count, examData.sourceCollections, {
    language: input.language,
    level: input.level,
    scope: input.scope,
  })

  const session = await prisma.customPracticeSession.create({
    data: {
      userId,
      title,
      language: input.language || null,
      level: input.level || null,
      scope: input.scope || null,
      selectionKeys: input.selectionKeys,
      requestedCount: input.count,
      questionIds,
    },
  })

  return { session, examData }
}

export async function getCustomPracticeSession(sessionId: string) {
  const userId = await getCurrentUserId()
  const session = await prisma.customPracticeSession.findFirst({
    where: { id: sessionId, userId },
  })

  if (!session || session.questionIds.length === 0) {
    return null
  }

  const examData = await getExamQuestionsByIds(session.questionIds, {
    language: session.language,
    paperTitle: session.title,
  })

  return { session, examData }
}

export async function restartCustomPracticeSession(sessionId: string) {
  const userId = await getCurrentUserId()
  const existing = await prisma.customPracticeSession.findFirst({
    where: { id: sessionId, userId },
  })

  if (!existing) {
    return null
  }

  const scope = (existing.scope as RandomPracticeScope) || 'unattempted'
  const newQuestionIds = await getRandomExamQuestionIdsBySelections(
    existing.selectionKeys,
    existing.requestedCount,
    {
      language: existing.language || undefined,
      level: existing.level || undefined,
      scope,
    },
  )

  if (newQuestionIds.length === 0) {
    return null
  }

  const examData = await getExamQuestionsByIds(newQuestionIds, {
    language: existing.language,
  })

  const title = buildPracticeTitle(existing.requestedCount, examData.sourceCollections, {
    language: existing.language || undefined,
    level: existing.level || undefined,
    scope,
  })

  const newSession = await prisma.customPracticeSession.create({
    data: {
      userId,
      title,
      language: existing.language,
      level: existing.level,
      scope: existing.scope,
      selectionKeys: existing.selectionKeys,
      requestedCount: existing.requestedCount,
      questionIds: newQuestionIds,
    },
  })

  return newSession
}

export async function getLatestActiveCustomPracticeSession() {
  const userId = await getCurrentUserId()
  return prisma.customPracticeSession.findFirst({
    where: { userId, completedAt: null },
    orderBy: { updatedAt: 'desc' },
  })
}
