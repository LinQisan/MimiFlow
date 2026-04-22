import Link from 'next/link'
import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import { parseJsonStringList } from '@/utils/text/jsonList'
import WordbookDetailClient from './WordbookDetailClient'
import { syncAnkiSentenceSourcesForWordbook } from '@/app/actions/content'

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
    <main className='min-h-screen bg-white text-slate-900'>
      <div className='mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8'>
        <header className='mb-5 rounded-[18px] bg-white p-5 shadow-[rgba(19,19,22,0.7)_0px_1px_5px_-4px,rgba(34,42,53,0.08)_0px_0px_0px_1px,rgba(34,42,53,0.05)_0px_4px_8px_0px]'>
          <div className='flex flex-wrap items-center gap-2'>
            <Link
              href='/wordbooks'
              className='inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:text-slate-900'>
              <span>单词书</span>
              <span>←</span>
            </Link>
            <div className='ml-auto'>
              <Link href='/vocabulary' className='ui-btn'>
                打开词汇工作台
              </Link>
            </div>
          </div>
          <h1 className='mt-4 text-4xl font-semibold tracking-tight text-[#242424] md:text-5xl'>
            {wordbook.title}
          </h1>
          <p className='mt-2 text-sm text-[#898989]'>
            线性列表模式，只在当前单词书内分页切换。
          </p>
        </header>

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
