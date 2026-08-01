import prisma from '@/lib/prisma'
import { parseJsonStringList } from '@/utils/text/jsonList'

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
  const [dueSentences, dueVocabularies, dueMistakes, allMistakes] =
    await Promise.all([
      prisma.sentenceReview.count({ where: { due: { lte: now } } }),
      prisma.vocabularyReview.count({ where: { due: { lte: now } } }),
      prisma.questionRetry.count({ where: { dueAt: { lte: now } } }),
      prisma.questionRetry.count(),
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
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)))
  const [sentences, vocabularies] = await Promise.all([
    prisma.sentenceReview.findMany({
      where: { due: { lte: now } },
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
      where: { due: { lte: now } },
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
            meanings: true,
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
        meanings: parseJsonStringList(item.vocabulary.meanings),
        due: item.due,
      }),
    ),
  ]
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .slice(0, safeLimit)
}
