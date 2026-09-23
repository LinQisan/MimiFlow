// Vocabulary wordbook detail route.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { parseJsonStringList } from '@/utils/text/jsonList'
import { listVocabularyMeanings } from '@/modules/knowledge/vocabulary/domain/meanings'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'
import WordbookDetailClient from '@/modules/knowledge/vocabulary/components/WordbookDetailClient'
import { listVocabularyPartOfSpeechHierarchyAdmin } from '@/modules/knowledge/vocabulary/admin-actions'
import { normalizeWordbookQuery } from '@/modules/knowledge/wordbooks/entry-query'
import { filterVocabularyTags } from '@/modules/knowledge/vocabulary/domain/jlpt'
import { getCurrentUser } from '@/modules/users/server/current-user'
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
  const currentUser = await getCurrentUser()
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
  const queryValue = resolvedSearchParams.q
  const query = normalizeWordbookQuery(Array.isArray(queryValue) ? queryValue[0] || '' : queryValue || '')
  const viewMode = resolvedSearchParams.view === 'card' ? 'flashcard' : 'list'

  const [wordbook, seriesOptions, partOfSpeechHierarchy] = await Promise.all([
    findWordbookDetail(id),
    listWordbookSeries(),
    currentUser.isAdmin ? listVocabularyPartOfSpeechHierarchyAdmin() : Promise.resolve([]),
  ])

  if (!wordbook) notFound()

  const {
    totalCount,
    filteredCount,
    totalPages,
    page: normalizedPage,
    rows,
  } = await listWordbookEntries({ wordbookId: id, page: currentPage, pageSize: PAGE_SIZE, query })

  return (
    <main className='min-h-screen bg-[var(--editorial-paper)] text-slate-900 dark:text-slate-100'>
      <div className='mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-9'>
        <header className='mb-4 border-b border-slate-200 dark:border-slate-800 pb-4'>
          <Link
            href={`/vocabulary?wordbook=${encodeURIComponent(wordbook.id)}`}
            className='text-xs font-semibold text-slate-500 dark:text-slate-400 transition hover:text-slate-950'>
            ← 返回词汇
          </Link>
          <div className='mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
            <div className='min-w-0'>
              <p className='font-word-ja text-xs font-medium text-slate-500 dark:text-slate-400'>{wordbook.series.title}</p>
              <h1 className='font-word-ja mt-1 break-words text-2xl font-semibold text-slate-950 dark:text-slate-100 md:text-3xl'>{wordbook.title}</h1>
            </div>
            <span className='shrink-0 text-sm font-medium tabular-nums text-slate-500 dark:text-slate-400'>{totalCount} 个词</span>
          </div>
        </header>

        <WordbookDetailClient
          canManage={currentUser.isAdmin}
          key={`${id}:${query}:${normalizedPage}`}
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
          filteredCount={filteredCount}
          initialQuery={query}
          initialViewMode={viewMode}
          pageSize={PAGE_SIZE}
          partOfSpeechHierarchy={partOfSpeechHierarchy.map(item => ({
            id: item.id,
            name: item.name,
            parentName: item.parent?.name || null,
          }))}
          items={rows.map(row => ({
            id: row.vocabulary.id,
            jlpt: row.jlpt,
            word: row.vocabulary.word,
            wordAudio: row.vocabulary.wordAudio || null,
            pronunciations: parseJsonStringList(row.vocabulary.pronunciations),
            etymologies: parseJsonStringList(row.vocabulary.etymologies),
            meanings: listVocabularyMeanings(row.vocabulary.senses),
            entryNumber: row.entryNumber,
            section: row.section,
            page: row.page,
            partsOfSpeech: parseJsonStringList(row.vocabulary.partsOfSpeech),
            tags: filterVocabularyTags(row.vocabulary.tags.map(link => link.tag.name)),
            sentences: dedupeAndRankSentences(row.vocabulary.sentenceLinks
              .map(link => ({
                text: link.sentence.text,
                translation: link.sentence.translation || null,
                audioFile: link.sentence.audioFile || null,
                source: link.sentence.source || '',
                sourceUrl: link.sentence.sourceUrl || '',
              }))
              .filter(item => item.text.trim().length > 0)),
          }))}
        />
      </div>
    </main>
  )
}
