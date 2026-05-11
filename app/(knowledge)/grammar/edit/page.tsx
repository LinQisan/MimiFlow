import Link from 'next/link'
import prisma from '@/lib/prisma'
import GrammarCreatePanel from '../GrammarCreatePanel'
import GrammarEditTable from './GrammarEditTable'
import type { ConstructionDraft } from '../GrammarConstructionsEditor'

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
        <header className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
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
              <p className='mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>
                Grammar Edit
              </p>
              <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl'>
                语法编辑
              </h1>
              <p className='mt-2 max-w-2xl text-sm text-slate-600 md:text-base'>
                在此创建和编辑语法数据，支持标签、相似组与例句维护。
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <div className='rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 shadow-sm'>
                <p className='text-[11px] font-semibold uppercase tracking-wider'>
                  语法条目
                </p>
                <p className='mt-1 text-2xl font-black'>{grammars.length}</p>
              </div>
              <div className='rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm'>
                <p className='text-[11px] font-semibold uppercase tracking-wider'>
                  标签
                </p>
                <p className='mt-1 text-2xl font-black'>{tagSuggestions.length}</p>
              </div>
              <div className='rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm'>
                <p className='text-[11px] font-semibold uppercase tracking-wider'>
                  相似组
                </p>
                <p className='mt-1 text-2xl font-black'>
                  {clusterSuggestions.length}
                </p>
              </div>
            </div>
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
