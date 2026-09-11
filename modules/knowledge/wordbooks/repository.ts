import { unstable_cache } from 'next/cache'

import prisma from '@/lib/prisma'
import { WORDBOOK_ENTRY_ORDER } from './entry-order'
import { normalizeWordbookQuery, wordbookEntryWhere } from './entry-query'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { VOCABULARY_GROUPS_CACHE_TAG } from '@/modules/knowledge/vocabulary/server/repository'

const getCachedWordbookOptions = unstable_cache(
  async (userId: string) =>
    prisma.wordbook.findMany({
      where: { userId },
      orderBy: [
        { series: { sortOrder: 'asc' } },
        { series: { createdAt: 'asc' } },
        { series: { id: 'asc' } },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        title: true,
        seriesId: true,
        series: { select: { id: true, title: true } },
        _count: { select: { entries: true } },
      },
    }),
  ['wordbook-options-v1'],
  // Same tag as the vocabulary groups: any vocabulary or wordbook write
  // busts both together. The Prisma extension in lib/prisma.ts covers
  // Wordbook/WordbookSeries/WordbookVocabulary writes centrally.
  { tags: [VOCABULARY_GROUPS_CACHE_TAG], revalidate: 300 },
)

export async function listWordbookOptions() {
  const userId = await getCurrentUserId()
  return getCachedWordbookOptions(userId)
}

export async function findWordbookDetail(id: string) {
  const userId = await getCurrentUserId()
  return prisma.wordbook.findFirst({
    where: { id, userId },
    select: {
      id: true,
      title: true,
      seriesId: true,
      series: { select: { id: true, title: true } },
    },
  })
}

export async function listWordbookSeries() {
  const userId = await getCurrentUserId()
  return prisma.wordbookSeries.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      _count: { select: { wordbooks: true } },
    },
  })
}

export async function listWordbookEntries(input: {
  wordbookId: string
  page: number
  pageSize: number
  query?: string
}) {
  const userId = await getCurrentUserId()
  const query = normalizeWordbookQuery(input.query || '')
  const where = wordbookEntryWhere(userId, input.wordbookId, query)
  const countAll = Promise.resolve(prisma.wordbookVocabulary.count({
    where: wordbookEntryWhere(userId, input.wordbookId),
  }))
  const [totalCount, filteredCount] = await Promise.all([
    countAll,
    query ? prisma.wordbookVocabulary.count({ where }) : countAll,
  ])
  const totalPages = Math.max(1, Math.ceil(filteredCount / input.pageSize))
  const page = Math.min(Math.max(1, input.page), totalPages)
  const rows = await prisma.wordbookVocabulary.findMany({
    where,
    orderBy: WORDBOOK_ENTRY_ORDER,
    skip: (page - 1) * input.pageSize,
    take: input.pageSize,
    include: {
      vocabulary: {
        select: {
          id: true,
          word: true,
          wordAudio: true,
          pronunciations: true,
          etymologies: true,
          senses: {
            orderBy: { order: 'asc' },
            select: {
              definitions: {
                orderBy: { sortOrder: 'asc' },
                select: { definition: true },
              },
            },
          },
          partsOfSpeech: true,
          tags: { select: { tag: { select: { name: true } } } },
          createdAt: true,
          sentenceLinks: {
            orderBy: { createdAt: 'asc' },
            take: 6,
            select: { sentence: true },
          },
        },
      },
    },
  })
  return { totalCount, filteredCount, totalPages, page, rows }
}
