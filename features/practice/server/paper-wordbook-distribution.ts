import 'server-only'

import prisma from '@/lib/prisma'
import {
  buildPaperWordbookDistribution,
  type PaperWordbookDistribution,
} from '@/features/practice/domain/paper-word-frequency'
import { buildPracticeVocabularyWordbookOptions } from '@/features/practice/domain/vocabulary-analytics'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { expandVocabularyHeadwordMatchVariants } from '@/utils/vocabulary/vocabularyCanonical'

const MATCH_BATCH_SIZE = 1_500

export async function getPaperWordbookDistribution(
  words: string[],
): Promise<PaperWordbookDistribution> {
  const userId = await getCurrentUserId()
  const uniqueWords = Array.from(new Set(words.map(word => word.trim()).filter(Boolean)))
  const uniqueWordSet = new Set(uniqueWords)
  const activeWordbookWhere = {
    userId,
    NOT: { id: { startsWith: 'legacy-' } },
  } as const
  const batches = Array.from(
    { length: Math.ceil(uniqueWords.length / MATCH_BATCH_SIZE) },
    (_, index) => uniqueWords.slice(
      index * MATCH_BATCH_SIZE,
      (index + 1) * MATCH_BATCH_SIZE,
    ),
  )
  const [wordbookRows, vocabularyBatches, compoundVocabularyRows] = await Promise.all([
    prisma.wordbook.findMany({
      where: activeWordbookWhere,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        series: { select: { id: true, title: true } },
        _count: { select: { entries: true } },
      },
    }),
    Promise.all(batches.map(batch => prisma.vocabulary.findMany({
      where: {
        userId,
        word: { in: batch },
        wordbooks: { some: { wordbook: activeWordbookWhere } },
      },
      select: {
        word: true,
        wordbooks: {
          where: { wordbook: activeWordbookWhere },
          select: { wordbookId: true, jlpt: true },
        },
      },
    }))),
    prisma.vocabulary.findMany({
      where: {
        userId,
        OR: [
          { word: { contains: '/' } },
          { word: { contains: '／' } },
          { word: { contains: '(' } },
          { word: { contains: '（' } },
        ],
        wordbooks: { some: { wordbook: activeWordbookWhere } },
      },
      select: {
        word: true,
        wordbooks: {
          where: { wordbook: activeWordbookWhere },
          select: { wordbookId: true, jlpt: true },
        },
      },
    }),
  ])
  const sourceByWordbookId = new Map(
    wordbookRows.map(row => [
      row.id,
      { id: row.series.id, label: row.series.title },
    ]),
  )
  const options = buildPracticeVocabularyWordbookOptions(
    wordbookRows.map(row => ({
      id: row.id,
      title: row.title,
      seriesTitle: row.series.title,
      seriesId: row.series.id,
      count: row._count.entries,
    })),
  )

  return buildPaperWordbookDistribution({
    words: uniqueWords,
    wordbooks: options.map(option => ({
      id: option.id,
      name: option.name,
      pathLabel: option.pathLabel,
      depth: option.depth,
      sourceId: sourceByWordbookId.get(option.id)?.id,
      sourceLabel: sourceByWordbookId.get(option.id)?.label,
    })),
    memberships: [
      ...vocabularyBatches.flat().map(vocabulary => ({
        word: vocabulary.word,
        headword: vocabulary.word,
        wordbookIds: Array.from(new Set(vocabulary.wordbooks.map(link => link.wordbookId))),
        jlpt: Array.from(
          new Set(
            vocabulary.wordbooks
              .map(link => link.jlpt)
              .filter((value): value is string => Boolean(value)),
          ),
        ),
      })),
      ...compoundVocabularyRows.flatMap(vocabulary =>
        expandVocabularyHeadwordMatchVariants(vocabulary.word)
          .filter(variant => uniqueWordSet.has(variant))
          .map(variant => ({
            word: variant,
            headword: vocabulary.word,
            wordbookIds: Array.from(new Set(vocabulary.wordbooks.map(link => link.wordbookId))),
            jlpt: Array.from(
              new Set(
                vocabulary.wordbooks
                  .map(link => link.jlpt)
                  .filter((value): value is string => Boolean(value)),
              ),
            ),
          })),
      ),
    ],
  })
}
