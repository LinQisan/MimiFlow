// Vocabulary wordbook detail route.
import Link from 'next/link'
import PageHeader from '@/components/layout/PageHeader'
import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import { parseJsonStringList } from '@/utils/text/jsonList'
import WordbookDetailClient from './WordbookDetailClient'
import { syncAnkiSentenceSourcesForWordbook } from '@/modules/knowledge/wordbooks/actions'

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
    prisma.wordbook.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        parentId: true,
        parent: {
          select: { id: true, title: true },
        },
        children: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            title: true,
            _count: {
              select: { entries: true },
            },
          },
        },
      },
    }),
    prisma.wordbook.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, parentId: true },
    }),
  ])

  if (!wordbook) notFound()

  await syncAnkiSentenceSourcesForWordbook(id)

  const totalCount = await prisma.wordbookVocabulary.count({
    where: { wordbookId: id },
  })
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const normalizedPage = Math.min(currentPage, totalPages)
  const rows = await prisma.wordbookVocabulary.findMany({
    where: { wordbookId: id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    skip: (normalizedPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
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
            select: {
              sentence: {
                select: {
                  text: true,
                  translation: true,
                  audioFile: true,
                  source: true,
                  sourceUrl: true,
                  sourceId: true,
                },
              },
            },
          },
        },
      },
    },
  })

  return (
    <main className='min-h-screen bg-slate-50 text-slate-900'>
      <div className='mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8'>
        <div className='mb-6'>
          <PageHeader
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
