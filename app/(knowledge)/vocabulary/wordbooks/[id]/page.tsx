// Vocabulary wordbook detail route.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { parseJsonStringList } from '@/utils/text/jsonList'
import WordbookDetailClient from './WordbookDetailClient'
import { syncAnkiSentenceSourcesForWordbook } from '@/modules/knowledge/wordbooks/actions'
import {
  findWordbookDetail,
  listWordbookEntries,
  listWordbookSeries,
} from '@/modules/knowledge/wordbooks/repository'

type SearchParams = Record<string, string | string[] | undefined>

export default async function WordbookDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<SearchParams>
}) {
  const { id } = await params
  const resolvedSearchParams = (await Promise.resolve(
    searchParams || {},
  )) as SearchParams
  const pageValue = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page
  const rawPage = Number(pageValue || 1)
  const currentPage = Number.isFinite(rawPage)
    ? Math.max(1, Math.floor(rawPage))
    : 1
  const PAGE_SIZE = 50

  const [wordbook, seriesOptions] = await Promise.all([
    findWordbookDetail(id),
    listWordbookSeries(),
  ])

  if (!wordbook) notFound()

  await syncAnkiSentenceSourcesForWordbook(id)

  const {
    totalCount,
    totalPages,
    page: normalizedPage,
    rows,
  } = await listWordbookEntries({ wordbookId: id, page: currentPage, pageSize: PAGE_SIZE })

  return (
    <main className='min-h-screen bg-slate-50 text-slate-900'>
      <div className='mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8'>
        <header className='mb-5'>
          <Link
            href='/vocabulary?view=wordbooks'
            className='text-sm font-semibold text-slate-500 transition hover:text-slate-900'>
            ← 单词书
          </Link>
          <div className='mt-3 flex items-end justify-between gap-4'>
            <h1 className='min-w-0 truncate text-2xl font-black tracking-tight text-slate-950'>
              {wordbook.title}
            </h1>
            <span className='shrink-0 text-sm text-slate-500'>{totalCount} 词</span>
          </div>
        </header>

        <WordbookDetailClient
          wordbookId={wordbook.id}
          wordbookTitle={wordbook.title}
          series={{ id: wordbook.series.id, title: wordbook.series.title }}
          seriesOptions={seriesOptions.map(item => ({
            id: item.id,
            title: item.title,
          }))}
          currentPage={normalizedPage}
          totalPages={totalPages}
          totalCount={totalCount}
          items={rows.map(row => ({
            id: row.vocabulary.id,
            word: row.vocabulary.word,
            wordAudio: row.vocabulary.wordAudio || null,
            pronunciations: parseJsonStringList(row.vocabulary.pronunciations),
            partsOfSpeech: parseJsonStringList(row.vocabulary.partsOfSpeech),
            sentences: row.vocabulary.sentenceLinks
              .map(link => ({
                text: link.sentence.text,
                translation: link.sentence.translation || null,
                audioFile: link.sentence.audioFile || null,
                source: link.sentence.source || '',
                sourceUrl: link.sentence.sourceUrl || '',
              }))
              .filter(item => item.text.trim().length > 0),
          }))}
        />
      </div>
    </main>
  )
}
