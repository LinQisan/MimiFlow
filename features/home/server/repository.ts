import { MaterialType } from '#prisma-client'

import prisma from '@/lib/prisma'

export async function getHomeDashboardData(input: {
  weekStartKey: string
  todayKey: string
}) {
  const [vocabCount, weekStudyAgg, paperCount, questionCount, recentStudyRows, recentPlaytimeRows] =
    await Promise.all([
      prisma.vocabulary.count(),
      prisma.studyTimeDaily.aggregate({
        _sum: { seconds: true },
        where: { dateKey: { gte: input.weekStartKey, lte: input.todayKey } },
      }),
      prisma.collection.count({ where: { collectionType: 'PAPER' } }),
      prisma.question.count(),
      prisma.materialStudyProgress.findMany({
        where: { profileId: 'default' },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        include: {
          material: { select: { id: true, title: true, type: true } },
        },
      }),
      prisma.materialPlaytimeStat.findMany({
        where: {
          profileId: 'default',
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
