// Grammar management route.
import Link from 'next/link'
import prisma from '@/lib/prisma'
import GrammarCreatePanel from './GrammarCreatePanel'
import GrammarEditTable from './GrammarEditTable'
import type { ConstructionDraft } from './GrammarConstructionsEditor'

export const revalidate = 0

export default async function GrammarEditPage() {
  const [grammars, tagRows, clusterRows] = await Promise.all([
    prisma.grammar.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        tags: { include: { tag: true } },
        clusters: { include: { cluster: true } },
        constructions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            examples: {
              orderBy: { createdAt: 'asc' },
              select: {
                source: true,
                sentenceText: true,
              },
            },
          },
        },
      },
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

  const grammarOptions = grammars.map(item => ({ id: item.id, name: item.name }))
  const tagSuggestions = Array.from(new Set(tagRows.map(item => item.name)))
  const clusterSuggestions = Array.from(new Set(clusterRows.map(item => item.title)))

  const editRows = grammars.map(item => {
    const dbExampleCount = item.constructions.reduce(
      (sum, c) =>
        sum + c.examples.filter(example => example.source === 'SENTENCE_DB').length,
      0,
    )
    return {
      id: item.id,
      name: item.name,
      constructions: (
        item.constructions.map(construction => ({
          id: construction.id,
          connection: construction.connection,
          meaning: construction.meaning,
          note: construction.note || '',
          examplesInput: construction.examples
            .filter(example => example.source === 'MANUAL')
            .map(example => example.sentenceText)
            .join('\n'),
          sentenceExampleIds: [],
        })) as ConstructionDraft[]
      ),
      tagsInput: item.tags.map(tag => tag.tag.name).join(', '),
      clusterTitle: item.clusters[0]?.cluster.title || '',
      dbExampleCount,
    }
  })

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4'>
        <header className='border-b border-slate-200 pb-5'>
          <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
            <div>
              <div className='flex items-center gap-2'>
                <Link
                  href='/grammar'
                  className='inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50'
                  aria-label='返回语法页'>
                  返回语法页
                </Link>
              </div>
              <h1 className='mt-3 text-3xl font-black tracking-tight text-slate-900'>
                语法编辑
              </h1>
              <p className='mt-2 max-w-2xl text-sm text-slate-600'>
                创建语法并维护接续、标签和例句。
              </p>
            </div>
            <p className='text-sm text-slate-500'>
              {grammars.length} 条语法 · {tagSuggestions.length} 个标签 · {clusterSuggestions.length} 个相似组
            </p>
          </div>
        </header>

        <GrammarCreatePanel
          grammarOptions={grammarOptions}
          tagSuggestions={tagSuggestions}
          clusterSuggestions={clusterSuggestions}
        />

        <GrammarEditTable initialRows={editRows} />
      </div>
    </main>
  )
}
