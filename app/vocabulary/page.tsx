// app/vocabulary/page.tsx
import Link from 'next/link'
import prisma from '@/lib/prisma'
import VocabularyTabs from './VocabularyTabs'
import { guessLanguageCode } from '@/utils/language/langDetector'
import { parseJsonStringList } from '@/utils/text/jsonList'
import { toVocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'

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
  const folderValue = Array.isArray(resolvedSearchParams.folder)
    ? resolvedSearchParams.folder[0]
    : resolvedSearchParams.folder
  const focusId = (focusValue || '').trim()
  const initialFocusGroup = (groupValue || '').trim()
  const folderFilter = (folderValue || 'all').trim()
  const allFolders = await prisma.vocabularyFolder.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, parentId: true },
  })
  const getFolderDescendantIds = (folderId: string) => {
    const childrenByParent = allFolders.reduce<Record<string, string[]>>(
      (acc, folder) => {
        const parentKey = folder.parentId || '__root__'
        if (!acc[parentKey]) acc[parentKey] = []
        acc[parentKey].push(folder.id)
        return acc
      },
      {},
    )
    const queue = [folderId]
    const result: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      result.push(current)
      const children = childrenByParent[current] || []
      children.forEach(childId => queue.push(childId))
    }
    return result
  }

  const folderFilterIds =
    folderFilter !== 'all' && folderFilter !== 'none'
      ? getFolderDescendantIds(folderFilter)
      : []
  const rawPage = Number(pageValue || 1)
  const currentPage = Number.isFinite(rawPage)
    ? Math.max(1, Math.floor(rawPage))
    : 1
  const whereClause =
    folderFilter === 'all'
      ? {}
      : folderFilter === 'none'
        ? { folderId: null as null }
        : { folderId: { in: folderFilterIds } }

  const rawVocabularies = await prisma.vocabulary.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      folder: {
        select: { id: true, name: true },
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
    },
  })

  const groupedCountRows: Record<string, number> = {}
  rawVocabularies.forEach(vocab => {
    const finalGroupName = resolveVocabularyGroupName(
      vocab.word,
      vocab.groupName,
    )
    groupedCountRows[finalGroupName] =
      (groupedCountRows[finalGroupName] || 0) + 1
  })

  const filteredVocabularies = groupValue
    ? rawVocabularies.filter(
        vocab =>
          resolveVocabularyGroupName(vocab.word, vocab.groupName) ===
          groupValue,
      )
    : rawVocabularies

  const totalCount = filteredVocabularies.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const normalizedPage = Math.min(currentPage, totalPages)
  const skip = (normalizedPage - 1) * PAGE_SIZE

  let pageVocabularies = filteredVocabularies.slice(skip, skip + PAGE_SIZE)

  if (focusId && !pageVocabularies.some(item => item.id === focusId)) {
    const focusedVocabulary = await prisma.vocabulary.findUnique({
      where: { id: focusId },
      include: {
        folder: {
          select: { id: true, name: true },
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
      },
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
  const folders = allFolders
  const groupedTotals: Record<string, number> = {}
  rawVocabularies.forEach(vocab => {
    const groupName = resolveVocabularyGroupName(vocab.word, vocab.groupName)
    groupedTotals[groupName] = (groupedTotals[groupName] || 0) + 1
  })
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
    let sourceName = '未知来源'
    let sourceUrl = '#'
    let audioData: AudioData | null = null

    let parsedSentences: SentenceSource[] = []
    const linkedSentences = sentenceLinksByVocabularyId[vocab.id] || []
    if (linkedSentences.length > 0) {
      parsedSentences = dedupeAndRankSentences(linkedSentences, 16)
      const firstSentence = parsedSentences[0]
      sourceName = firstSentence?.source || sourceName
      sourceUrl = firstSentence?.sourceUrl || sourceUrl
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
      folderId: vocab.folder?.id || null,
      folderName: vocab.folder?.name || null,
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
                词汇复习
              </h1>
            </div>
            <div className='grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4 sm:items-stretch'>
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
                  收藏夹
                </p>
                <p className='mt-1 max-w-[14rem] truncate text-base font-bold'>
                  {folderFilter === 'all'
                    ? '全部收藏夹'
                    : folderFilter === 'none'
                      ? '未收藏'
                      : '已筛选收藏夹'}
                </p>
              </div>
            </div>
          </div>
        </section>

        <VocabularyTabs
          groupedData={groupedData}
          groupedTotals={groupedTotals}
          folders={folders as FolderItem[]}
          initialFolderFilter={folderFilter}
          initialGroupFilter={groupValue || undefined}
          initialFocusId={focusId || undefined}
          initialFocusGroup={initialFocusGroup || undefined}
          totalCount={totalCount}
          currentPage={normalizedPage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
        />
      </div>
    </main>
  )
}
