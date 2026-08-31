import prisma from '@/lib/prisma'
import {
  buildPaperWordbookDistribution,
  type PaperWordbookDistribution,
} from '@/features/practice/domain/paper-word-frequency'
import { buildPracticeVocabularyWordbookOptions } from '@/features/practice/domain/vocabulary-analytics'
import { getCurrentUserId } from '@/modules/users/server/current-user'

const MATCH_BATCH_SIZE = 1_500

export async function getPaperWordbookDistribution(
  words: string[],
): Promise<PaperWordbookDistribution> {
  const userId = await getCurrentUserId()
  const uniqueWords = Array.from(new Set(words.map(word => word.trim()).filter(Boolean)))
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
  const [wordbookRows, vocabularyBatches] = await Promise.all([
    prisma.wordbook.findMany({
      where: activeWordbookWhere,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        series: { select: { title: true } },
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
          select: { wordbookId: true },
        },
      },
    }))),
  ])
  const options = buildPracticeVocabularyWordbookOptions(
    wordbookRows.map(row => ({
      id: row.id,
      title: row.title,
      seriesTitle: row.series.title,
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
    })),
    memberships: vocabularyBatches.flat().map(vocabulary => ({
      word: vocabulary.word,
      wordbookIds: Array.from(new Set(
        vocabulary.wordbooks.map(link => link.wordbookId),
      )),
    })),
  })
}
