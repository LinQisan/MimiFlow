import { MaterialType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'

export async function getHomeDashboardData(input: {
  weekStartKey: string
  todayKey: string
}) {
  const userId = await getCurrentUserId()
  const [vocabCount, weekStudyAgg, paperCount, questionCount, recentStudyRows, recentPlaytimeRows] =
    await Promise.all([
      prisma.vocabulary.count({ where: { userId } }),
      prisma.studyTimeDaily.aggregate({
        _sum: { seconds: true },
        where: { userId, dateKey: { gte: input.weekStartKey, lte: input.todayKey } },
      }),
      prisma.collection.count({ where: { collectionType: 'PAPER' } }),
      prisma.question.count(),
      prisma.materialStudyProgress.findMany({
        where: { profileId: userId },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        include: {
          material: { select: { id: true, title: true, type: true } },
        },
      }),
      prisma.materialPlaytimeStat.findMany({
        where: {
          profileId: userId,
          material: { type: MaterialType.LISTENING },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        include: {
          material: { select: { id: true, title: true, type: true } },
        },
      }),
    ])

  return {
    vocabCount,
    weekStudySeconds: weekStudyAgg._sum.seconds ?? 0,
    paperCount,
    questionCount,
    recentStudyRows,
    recentPlaytimeRows,
  }
}
