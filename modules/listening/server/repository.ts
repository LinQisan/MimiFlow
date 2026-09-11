import { StudyTimeKind, type CollectionType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'

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

export function listListeningLibraryCollections() {
  return prisma.collection.findMany({
    where: { collectionType: { in: ['BOOK', 'CHAPTER'] } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      collectionType: true,
      parentId: true,
      sortOrder: true,
    },
  })
}

export async function getListeningStudySummary() {
  const userId = await getCurrentUserId()
  const [studySummary, studyDays, stats] = await Promise.all([
    prisma.studyTimeDaily.aggregate({
      where: { userId, kind: StudyTimeKind.LESSON_SPEAKING },
      _sum: { seconds: true },
    }),
    prisma.studyTimeDaily.count({
      where: { userId, kind: StudyTimeKind.LESSON_SPEAKING, seconds: { gt: 0 } },
    }),
    prisma.materialPlaytimeStat.findMany({
      where: { profileId: userId },
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
  const userId = await getCurrentUserId()
  const [relatedVocab, playtimeStat] = await Promise.all([
    prisma.vocabulary.findMany({
      where: {
        userId,
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
        senses: {
          orderBy: { order: 'asc' },
          select: {
            definitions: {
              orderBy: { sortOrder: 'asc' },
              select: { definition: true },
            },
          },
        },
      },
    }),
    prisma.materialPlaytimeStat.findUnique({
      where: { profileId_materialId: { profileId: userId, materialId } },
      select: { totalSeconds: true, playedDays: true },
    }),
  ])
  return { relatedVocab, playtimeStat }
}
