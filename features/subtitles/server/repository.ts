import { MaterialType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'

export function listMediaSubtitleMaterials() {
  return prisma.material.findMany({
    where: { type: MaterialType.MEDIA_SUBTITLE },
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
    select: {
      id: true,
      title: true,
      type: true,
      createdAt: true,
      contentPayload: true,
      collectionMaterials: {
        take: 1,
        select: { collection: { select: { id: true, title: true } } },
      },
    },
  })
}

export function findMediaSubtitleById(id: string) {
  return prisma.material.findFirst({
    where: { type: MaterialType.MEDIA_SUBTITLE, id },
    select: { id: true, title: true, contentPayload: true },
  })
}

export async function listVocabularyBySentenceSourceIds(sourceIds: string[]) {
  if (sourceIds.length === 0) return Promise.resolve([])
  const userId = await getCurrentUserId()
  return prisma.vocabulary.findMany({
    where: {
      userId,
      sentenceLinks: {
        some: {
          sentence: {
            sourceType: { in: ['MEDIA_SUBTITLE_LINE', 'AUDIO_DIALOGUE'] },
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
  })
}
