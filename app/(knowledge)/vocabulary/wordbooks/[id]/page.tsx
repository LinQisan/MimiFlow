// Vocabulary wordbook detail route.
import Link from 'next/link'
import PageHeader from '@/components/layout/PageHeader'
import { notFound } from 'next/navigation'
import { parseJsonStringList } from '@/utils/text/jsonList'
import WordbookDetailClient from './WordbookDetailClient'
import { syncAnkiSentenceSourcesForWordbook } from '@/modules/knowledge/wordbooks/actions'
import {
  findWordbookWithChildren,
  listWordbookEntries,
  listWordbookOptions,
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
  const PAGE_SIZE = 48

  const [wordbook, allWordbooks] = await Promise.all([
    findWordbookWithChildren(id),
    listWordbookOptions(),
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
      <div className='mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8'>
        <div className='mb-6'>
          <PageHeader
            showTitle
            title={wordbook.title}
            description='浏览目录、词条和记忆卡片。'
            actions={<>
              <Link
                href='/vocabulary?view=wordbooks'
                className='inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50'>
                单词书架
              </Link>
              <Link
                href='/vocabulary'
                className='inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800'>
                复习工作台
              </Link>
            </>}
          />
        </div>

        <WordbookDetailClient
          wordbookId={wordbook.id}
          wordbookTitle={wordbook.title}
          parentWordbook={
            wordbook.parent
              ? { id: wordbook.parent.id, title: wordbook.parent.title }
              : null
          }
          chapterItems={wordbook.children.map(item => ({
            id: item.id,
            title: item.title,
            count: item._count.entries,
          }))}
          wordbooks={allWordbooks.map(item => ({
            id: item.id,
            title: item.title,
            parentId: item.parentId,
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
