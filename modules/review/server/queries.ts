import 'server-only'

import prisma from '@/lib/prisma'
import { parseJsonStringList } from '@/utils/text/jsonList'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { listVocabularyMeanings } from '@/modules/knowledge/vocabulary/domain/meanings'

export type MemoryReviewItem =
  | {
      kind: 'sentence'
      id: string
      text: string
      sourceType: string
      sourceId: string
      due: Date
    }
  | {
      kind: 'vocabulary'
      id: string
      vocabularyId: string
      text: string
      pronunciations: string[]
      meanings: string[]
      due: Date
    }

export async function getReviewOverview(now = new Date()) {
  const userId = await getCurrentUserId()
  const [dueSentences, dueVocabularies, dueMistakes, allMistakes] =
    await Promise.all([
      prisma.sentenceReview.count({ where: { userId, due: { lte: now } } }),
      prisma.vocabularyReview.count({
        where: { userId, due: { lte: now } },
      }),
      prisma.questionRetry.count({ where: { userId, dueAt: { lte: now } } }),
      prisma.questionRetry.count({ where: { userId } }),
    ])

  return {
    dueMemory: dueSentences + dueVocabularies,
    dueSentences,
    dueVocabularies,
    dueMistakes,
    allMistakes,
  }
}

export async function getDueMemoryReviewItems(
  limit = 100,
  now = new Date(),
): Promise<MemoryReviewItem[]> {
  const userId = await getCurrentUserId()
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)))
  const [sentences, vocabularies] = await Promise.all([
    prisma.sentenceReview.findMany({
      where: { userId, due: { lte: now } },
      orderBy: { due: 'asc' },
      take: safeLimit,
      select: {
        id: true,
        text: true,
        sourceType: true,
        sourceId: true,
        due: true,
      },
    }),
    prisma.vocabularyReview.findMany({
      where: { userId, due: { lte: now } },
      orderBy: { due: 'asc' },
      take: safeLimit,
      select: {
        id: true,
        vocabularyId: true,
        due: true,
        vocabulary: {
          select: {
            word: true,
            pronunciations: true,
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
        },
      },
    }),
  ])

  return [
    ...sentences.map(
      (item): MemoryReviewItem => ({
        kind: 'sentence',
        id: item.id,
        text: item.text,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        due: item.due,
      }),
    ),
    ...vocabularies.map(
      (item): MemoryReviewItem => ({
        kind: 'vocabulary',
        id: item.id,
        vocabularyId: item.vocabularyId,
        text: item.vocabulary.word,
        pronunciations: parseJsonStringList(item.vocabulary.pronunciations),
        meanings: listVocabularyMeanings(item.vocabulary.senses),
        due: item.due,
      }),
    ),
  ]
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, safeLimit)
}
