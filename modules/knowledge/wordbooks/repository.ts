import prisma from '@/lib/prisma'

export function listWordbookShelf() {
  return prisma.wordbook.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      parentId: true,
      _count: { select: { entries: true } },
    },
  })
}

export function listWordbookOptions() {
  return prisma.wordbook.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, parentId: true },
  })
}

export function findWordbookWithChildren(id: string) {
  return prisma.wordbook.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      parentId: true,
      parent: { select: { id: true, title: true } },
      children: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, title: true, _count: { select: { entries: true } } },
      },
    },
  })
}

export async function listWordbookEntries(input: {
  wordbookId: string
  page: number
  pageSize: number
}) {
  const totalCount = await prisma.wordbookVocabulary.count({
    where: { wordbookId: input.wordbookId },
  })
  const totalPages = Math.max(1, Math.ceil(totalCount / input.pageSize))
  const page = Math.min(Math.max(1, input.page), totalPages)
  const rows = await prisma.wordbookVocabulary.findMany({
    where: { wordbookId: input.wordbookId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    skip: (page - 1) * input.pageSize,
    take: input.pageSize,
    include: {
      vocabulary: {
        select: {
          id: true,
          word: true,
          wordAudio: true,
          pronunciations: true,
          partsOfSpeech: true,
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
  return { totalCount, totalPages, page, rows }
}
