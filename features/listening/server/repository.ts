import { StudyTimeKind, type CollectionType } from '#prisma-client'

import prisma from '@/lib/prisma'

export function listCollectionsByTypes(types: CollectionType[]) {
  return prisma.collection.findMany({
    where: { collectionType: { in: types } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      collectionType: true,
      parentId: true,
      sortOrder: true,
      description: true,
      language: true,
      level: true,
      _count: { select: { materials: true, children: true } },
    },
  })
}

export async function getListeningStudySummary(materialIds: string[]) {
  const [studySummary, studyDays, stats] = await Promise.all([
    prisma.studyTimeDaily.aggregate({
      where: { kind: StudyTimeKind.LESSON_SPEAKING },
      _sum: { seconds: true },
    }),
    prisma.studyTimeDaily.count({
      where: { kind: StudyTimeKind.LESSON_SPEAKING, seconds: { gt: 0 } },
    }),
    materialIds.length === 0
      ? Promise.resolve([])
      : prisma.materialPlaytimeStat.findMany({
          where: { profileId: 'default', materialId: { in: materialIds } },
          select: {
            materialId: true,
            totalSeconds: true,
            playedDays: true,
            lastPlayedAt: true,
          },
        }),
  ])
  return {
    totalSeconds: studySummary._sum.seconds ?? 0,
    studyDays,
    stats,
  }
}

export async function getListeningDetailSupport(
  materialId: string,
  sourceIds: string[],
) {
  const [relatedVocab, playtimeStat] = await Promise.all([
    prisma.vocabulary.findMany({
      where: {
        sentenceLinks: {
          some: {
            sentence: {
              sourceType: 'AUDIO_DIALOGUE',
              sourceId: { in: sourceIds },
            },
          },
        },
      },
      select: {
        word: true,
        pronunciations: true,
        partsOfSpeech: true,
        meanings: true,
      },
    }),
    prisma.materialPlaytimeStat.findUnique({
      where: { profileId_materialId: { profileId: 'default', materialId } },
      select: { totalSeconds: true, playedDays: true },
    }),
  ])
  return { relatedVocab, playtimeStat }
}
