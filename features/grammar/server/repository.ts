import prisma from '@/lib/prisma'

const grammarRelations = {
  tags: { include: { tag: true } },
  clusters: { include: { cluster: true } },
  constructions: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      examples: {
        orderBy: { createdAt: 'asc' as const },
        select: { id: true, source: true, sentenceText: true },
      },
    },
  },
}

export function listGrammarLibrary() {
  return prisma.grammar.findMany({
    orderBy: { createdAt: 'desc' },
    take: 120,
    include: grammarRelations,
  })
}

export async function getGrammarManagementData() {
  const [grammars, tagRows, clusterRows] = await Promise.all([
    prisma.grammar.findMany({
      orderBy: { updatedAt: 'desc' },
      include: grammarRelations,
    }),
    prisma.grammarTag.findMany({
      orderBy: { createdAt: 'desc' },
      take: 120,
      select: { name: true },
    }),
    prisma.grammarCluster.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 120,
      select: { title: true },
    }),
  ])
  return { grammars, tagRows, clusterRows }
}
