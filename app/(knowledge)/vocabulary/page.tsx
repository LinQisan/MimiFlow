// app/vocabulary/page.tsx
import Link from 'next/link'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import VocabularyTabs from './VocabularyTabs'
import { guessLanguageCode } from '@/utils/language/langDetector'
import { parseJsonStringList } from '@/utils/text/jsonList'
import { toVocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'
import WordbooksBrowser from '@/app/(knowledge)/wordbooks/WordbooksBrowser'

type SentenceSource = {
  text: string
  source: string
  sourceUrl: string
  translation?: string | null
  audioFile?: string | null
  sourceType?: string | null
  meaningIndex?: number | null
  posTags?: string[]
}

type AudioData = {
  audioFile: string
  start: number
  end: number
}

type GroupedVocabItem = {
  id: string
  word: string
  languageCode: string
  wordAudio?: string | null
  pronunciation?: string | null
  pronunciations?: string[]
  partOfSpeech?: string | null
  partsOfSpeech?: string[]
  meanings?: string[]
  tags?: string[]
  folderId?: string | null
  folderName?: string | null
  createdAt: Date
  sourceType: string
  sentences: SentenceSource[]
  audioData: AudioData | null
  review?: {
    id: string
    due: Date
    state: number
    stability: number
    difficulty: number
    elapsed_days: number
    scheduled_days: number
    reps: number
    lapses: number
    learning_steps: number
    last_review: Date | null
  } | null
}

type FolderItem = {
  id: string
  name: string
  parentId: string | null
}

const normalizeSentencePosTags = (list?: string[] | null) =>
  Array.from(
    new Set((list || []).map(item => item.trim()).filter(Boolean)),
  ).slice(0, 1)

const DEFAULT_GROUP_NAMES: Record<string, string> = {
  ja: '日语',
  en: '英语',
  ko: '韩语',
  zh: '中文',
  other: '未分类',
}

const resolveVocabularyGroupName = (
  word: string,
  groupName?: string | null,
) => {
  const explicitGroup = (groupName || '').trim()
  if (explicitGroup) return explicitGroup
  const languageCode = guessLanguageCode(word) || 'other'
  return DEFAULT_GROUP_NAMES[languageCode] || '未分类'
}

const VOCABULARY_DETAIL_INCLUDE = {
  wordbooks: {
    orderBy: { createdAt: 'asc' },
    include: {
      wordbook: {
        select: { id: true, title: true },
      },
    },
  },
  tags: {
    include: {
      tag: {
        select: { name: true },
      },
    },
  },
  review: {
    select: {
      id: true,
      due: true,
      state: true,
      stability: true,
      difficulty: true,
      elapsed_days: true,
      scheduled_days: true,
      reps: true,
      lapses: true,
      learning_steps: true,
      last_review: true,
    },
  },
} satisfies Prisma.VocabularyInclude

type VocabularyDetailRow = Prisma.VocabularyGetPayload<{
  include: typeof VOCABULARY_DETAIL_INCLUDE
}>

export default async function VocabularyPage({
  searchParams,
}: {
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>
}) {
  const PAGE_SIZE = 48
  const resolvedSearchParams = await Promise.resolve(searchParams || {})
  const pageValue = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page
  const focusValue = Array.isArray(resolvedSearchParams.focus)
    ? resolvedSearchParams.focus[0]
    : resolvedSearchParams.focus
  const groupValue = Array.isArray(resolvedSearchParams.group)
    ? resolvedSearchParams.group[0]
    : resolvedSearchParams.group
  const wordbookValue = Array.isArray(resolvedSearchParams.wordbook)
    ? resolvedSearchParams.wordbook[0]
    : resolvedSearchParams.wordbook
  const viewValue = Array.isArray(resolvedSearchParams.view)
    ? resolvedSearchParams.view[0]
    : resolvedSearchParams.view
  const activeView = viewValue === 'wordbooks' ? 'wordbooks' : 'workbench'
  const focusId = (focusValue || '').trim()
  const initialFocusGroup = (groupValue || '').trim()
  const wordbookFilter = (wordbookValue || 'all').trim()

  if (activeView === 'wordbooks') {
    const wordbooks = await prisma.wordbook.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        parentId: true,
        _count: {
          select: { entries: true },
        },
      },
    })
    const totalWordbooks = wordbooks.length
    const rootCount = wordbooks.filter(item => !item.parentId).length
    const totalEntries = wordbooks.reduce(
      (sum, item) => sum + item._count.entries,
      0,
    )

    return (
      <main className='min-h-screen bg-slate-50 pb-16'>
        <div className='mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8'>
          <section className='mb-6 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-5'>
            <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
              <div>
                <p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>
                  Vocabulary
                </p>
                <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl'>
                  词汇中心
                </h1>
                <p className='mt-2 text-sm text-slate-500'>
                  在同一个入口管理生词、单词书与复习工作流。
                </p>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Link
                  href='/vocabulary'
                  className='inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50'>
                  复习工作台
                </Link>
                <Link
                  href='/vocabulary?view=wordbooks'
                  className='inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white'>
                  单词书架
                </Link>
                <Link
                  href='/'
                  className='inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50'>
                  返回首页
                </Link>
              </div>
            </div>
            <div className='mt-5 grid grid-cols-3 gap-2 md:max-w-xl'>
              <div className='rounded-xl bg-slate-50 px-3 py-2'>
                <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500'>
                  总书数
                </p>
                <p className='mt-1 text-2xl font-black text-slate-900'>
                  {totalWordbooks}
                </p>
              </div>
              <div className='rounded-xl bg-slate-50 px-3 py-2'>
                <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500'>
                  根分组
                </p>
                <p className='mt-1 text-2xl font-black text-slate-900'>
                  {rootCount}
                </p>
              </div>
              <div className='rounded-xl bg-slate-50 px-3 py-2'>
                <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500'>
                  收录词条
                </p>
                <p className='mt-1 text-2xl font-black text-slate-900'>
                  {totalEntries}
                </p>
              </div>
            </div>
          </section>

          <WordbooksBrowser
            items={wordbooks.map(item => ({
              id: item.id,
              title: item.title,
              parentId: item.parentId,
              count: item._count.entries,
            }))}
          />
        </div>
      </main>
    )
  }

  const allWordbooks = await prisma.wordbook.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, parentId: true },
  })
  const getWordbookDescendantIds = (wordbookId: string) => {
    const childrenByParent = allWordbooks.reduce<Record<string, string[]>>(
      (acc, folder) => {
        const parentKey = folder.parentId || '__root__'
        if (!acc[parentKey]) acc[parentKey] = []
        acc[parentKey].push(folder.id)
        return acc
      },
      {},
    )
    const queue = [wordbookId]
    const result: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      result.push(current)
      const children = childrenByParent[current] || []
      children.forEach(childId => queue.push(childId))
    }
    return result
  }

  const wordbookFilterIds =
    wordbookFilter !== 'all' && wordbookFilter !== 'none'
      ? getWordbookDescendantIds(wordbookFilter)
      : []
  const rawPage = Number(pageValue || 1)
  const currentPage = Number.isFinite(rawPage)
    ? Math.max(1, Math.floor(rawPage))
    : 1
  const whereClause =
    wordbookFilter === 'all'
      ? {}
      : wordbookFilter === 'none'
        ? { wordbooks: { none: {} } }
        : { wordbooks: { some: { wordbookId: { in: wordbookFilterIds } } } }

  const vocabularyGroupRows = await prisma.vocabulary.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      word: true,
      groupName: true,
    },
  })

  const groupedTotals: Record<string, number> = {}
  const filteredVocabularyIds: string[] = []

  vocabularyGroupRows.forEach(vocab => {
    const finalGroupName = resolveVocabularyGroupName(vocab.word, vocab.groupName)
    groupedTotals[finalGroupName] = (groupedTotals[finalGroupName] || 0) + 1
    if (!groupValue || finalGroupName === groupValue) {
      filteredVocabularyIds.push(vocab.id)
    }
  })

  const totalCount = filteredVocabularyIds.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const normalizedPage = Math.min(currentPage, totalPages)
  const skip = (normalizedPage - 1) * PAGE_SIZE

  const pageVocabularyIds = filteredVocabularyIds.slice(skip, skip + PAGE_SIZE)
  let pageVocabularies: VocabularyDetailRow[] =
    pageVocabularyIds.length === 0
      ? []
      : await prisma.vocabulary.findMany({
          where: { id: { in: pageVocabularyIds } },
          include: VOCABULARY_DETAIL_INCLUDE,
        })

  const pageVocabularyOrder = new Map(
    pageVocabularyIds.map((id, index) => [id, index] as const),
  )
  pageVocabularies.sort(
    (left, right) =>
      (pageVocabularyOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (pageVocabularyOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  )

  if (focusId && !pageVocabularies.some(item => item.id === focusId)) {
    const focusedVocabulary = await prisma.vocabulary.findUnique({
      where: { id: focusId },
      include: VOCABULARY_DETAIL_INCLUDE,
    })
    if (
      focusedVocabulary &&
      (!groupValue ||
        resolveVocabularyGroupName(
          focusedVocabulary.word,
          focusedVocabulary.groupName,
        ) === groupValue)
    ) {
      pageVocabularies = [focusedVocabulary, ...pageVocabularies]
    }
  }
  const folders = allWordbooks.map(item => ({
    id: item.id,
    name: item.title,
    parentId: item.parentId,
  }))
  const vocabularyIds = pageVocabularies.map(item => item.id)
  const sentenceLinks = await prisma.vocabularySentenceLink.findMany({
    where: { vocabularyId: { in: vocabularyIds } },
    include: { sentence: true },
    orderBy: { createdAt: 'asc' },
  })
  const sentenceLinksByVocabularyId = sentenceLinks.reduce<
    Record<string, SentenceSource[]>
  >((acc, link) => {
    const posTags = normalizeSentencePosTags(parseJsonStringList(link.posTags))
    if (!acc[link.vocabularyId]) acc[link.vocabularyId] = []
    acc[link.vocabularyId].push({
      text: link.sentence.text,
      source: link.sentence.source,
      sourceUrl: link.sentence.sourceUrl,
      translation: link.sentence.translation || null,
      audioFile: link.sentence.audioFile || null,
      sourceType: link.sentence.sourceType,
      meaningIndex: link.meaningIndex ?? null,
      posTags,
    })
    return acc
  }, {})

  const groupedData: Record<string, GroupedVocabItem[]> = {}

  // 组装页面数据
  pageVocabularies.forEach(vocab => {
    let audioData: AudioData | null = null

    let parsedSentences: SentenceSource[] = []
    const linkedSentences = sentenceLinksByVocabularyId[vocab.id] || []
    if (linkedSentences.length > 0) {
      parsedSentences = dedupeAndRankSentences(linkedSentences, 16)
      const firstSentence = parsedSentences[0]
      if (firstSentence?.audioFile) {
        audioData = {
          audioFile: firstSentence.audioFile,
          start: 0,
          end: 0,
        }
      }
    }

    // 分组
    const defaultLang = guessLanguageCode(vocab.word) || 'other'
    const finalGroupName = resolveVocabularyGroupName(
      vocab.word,
      vocab.groupName,
    )
    if (!groupedData[finalGroupName]) groupedData[finalGroupName] = []
    const meta = toVocabularyMeta(vocab)
    groupedData[finalGroupName].push({
      id: vocab.id,
      word: vocab.word,
      languageCode: defaultLang,
      wordAudio: vocab.wordAudio || null,
      pronunciation: meta.pronunciations[0] || null,
      pronunciations: meta.pronunciations,
      partOfSpeech: meta.partsOfSpeech[0] || null,
      partsOfSpeech: meta.partsOfSpeech,
      meanings: meta.meanings,
      tags: Array.from(
        new Set(
          (vocab.tags || [])
            .map(item => (item.tag?.name || '').trim())
            .filter(Boolean),
        ),
      ),
      folderId: vocab.wordbooks[0]?.wordbook?.id || null,
      folderName: vocab.wordbooks[0]?.wordbook?.title || null,
      createdAt: vocab.createdAt,
      sourceType: vocab.sourceType,
      sentences: parsedSentences,
      audioData,
      review: vocab.review || null,
    })
  })

  return (
    <main className='min-h-screen bg-slate-50 pb-16'>
      <div className='mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8'>
        <section className='mb-6 rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-5'>
          <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>
                Vocabulary
              </p>
              <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl'>
                词汇中心
              </h1>
              <p className='mt-2 text-sm text-slate-500'>
                复习工作台与单词书架统一入口。
              </p>
            </div>
            <div className='grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-3 lg:grid-cols-6 lg:items-stretch'>
              <Link
                href='/vocabulary'
                className='inline-flex h-[5.5rem] items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800'>
                复习工作台
              </Link>
              <Link
                href='/vocabulary?view=wordbooks'
                className='inline-flex h-[5.5rem] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50'>
                单词书架
              </Link>
              <Link
                href='/'
                className='inline-flex h-[5.5rem] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50'>
                返回首页
              </Link>
              <div className='flex h-[5.5rem] flex-col justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 shadow-sm'>
                <p className='text-[11px] font-semibold uppercase tracking-wider'>
                  词条总数
                </p>
                <p className='mt-1 text-2xl font-black'>{totalCount}</p>
              </div>
              <div className='flex h-[5.5rem] flex-col justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm'>
                <p className='text-[11px] font-semibold uppercase tracking-wider'>
                  当前页
                </p>
                <p className='mt-1 text-2xl font-black'>
                  {normalizedPage}/{totalPages}
                </p>
              </div>
              <div className='flex h-[5.5rem] flex-col justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm'>
                <p className='text-[11px] font-semibold uppercase tracking-wider'>
                  单词书
                </p>
                <p className='mt-1 max-w-[14rem] truncate text-base font-bold'>
                  {wordbookFilter === 'all'
                    ? '全部单词书'
                    : wordbookFilter === 'none'
                      ? '未加入单词书'
                      : '已筛选单词书'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <VocabularyTabs
          groupedData={groupedData}
          groupedTotals={groupedTotals}
          folders={folders as FolderItem[]}
          initialFolderFilter={wordbookFilter}
          initialGroupFilter={groupValue || undefined}
          initialFocusId={focusId || undefined}
          initialFocusGroup={initialFocusGroup || undefined}
          totalCount={totalCount}
          currentPage={normalizedPage}
          pageSize={PAGE_SIZE}
        />
      </div>
    </main>
  )
}
