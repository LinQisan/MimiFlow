// Grammar management route.
import Link from 'next/link'
import GrammarCreatePanel from './GrammarCreatePanel'
import GrammarEditTable from './GrammarEditTable'
import type { ConstructionDraft } from './GrammarConstructionsEditor'
import { getGrammarManagementData } from '@/features/grammar/server/repository'

export const revalidate = 0

export default async function GrammarEditPage() {
  const { grammars, tagRows, clusterRows } = await getGrammarManagementData()

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
    <main className='min-h-full px-3 py-4 md:px-6 md:py-6'>
      <div className='mx-auto max-w-6xl space-y-4'>
        <header className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-baseline gap-3'>
            <h1 className='text-xl font-bold text-slate-950 md:text-2xl'>语法</h1>
            <span className='text-sm text-slate-400'>{grammars.length} 条</span>
          </div>
          <Link href='/grammar' className='ui-btn ui-btn-sm'>
            查看语法
          </Link>
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
