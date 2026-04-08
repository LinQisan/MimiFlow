// app/vocabulary/page.tsx
import prisma from '@/lib/prisma'
import VocabularyTabs from './VocabularyTabs'
import { guessLanguageCode } from '@/utils/langDetector'
import { parseJsonStringList } from '@/utils/jsonList'
import { toVocabularyMeta } from '@/utils/vocabularyMeta'
import { dedupeAndRankSentences } from '@/utils/sentenceQuality'

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

  const totalCount = await prisma.vocabulary.count({
    where: whereClause,
  })
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const normalizedPage = Math.min(currentPage, totalPages)
  const skip = (normalizedPage - 1) * PAGE_SIZE

  // 获取生词及关联句子
  let rawVocabularies = await prisma.vocabulary.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    skip,
    take: PAGE_SIZE,
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
  if (focusId && !rawVocabularies.some(item => item.id === focusId)) {
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
    if (focusedVocabulary) {
      rawVocabularies = [focusedVocabulary, ...rawVocabularies]
    }
  }
  const folders = allFolders
  const groupedCountRows = await prisma.vocabulary.groupBy({
    by: ['groupName'],
    where: whereClause,
    _count: { _all: true },
  })
  const nullGroupWords = await prisma.vocabulary.findMany({
    where: { ...whereClause, groupName: null },
    select: { word: true },
  })

  const defaultNames: Record<string, string> = {
    ja: '日语',
    en: '英语',
    ko: '韩语',
    zh: '中文',
    other: '未分类',
  }
  const groupedTotals: Record<string, number> = {}
  groupedCountRows.forEach(row => {
    if (!row.groupName) return
    groupedTotals[row.groupName] =
      (groupedTotals[row.groupName] || 0) + row._count._all
  })
  nullGroupWords.forEach(item => {
    const code = guessLanguageCode(item.word) || 'other'
    const groupName = defaultNames[code] || '未分类'
    groupedTotals[groupName] = (groupedTotals[groupName] || 0) + 1
  })
  const vocabularyIds = rawVocabularies.map(item => item.id)
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
  rawVocabularies.forEach(vocab => {
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
    const finalGroupName =
      vocab.groupName || defaultNames[defaultLang] || '未分类'
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
    <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
      <div className='max-w-7xl mx-auto'>
        <VocabularyTabs
          groupedData={groupedData}
          groupedTotals={groupedTotals}
          folders={folders as FolderItem[]}
          initialFolderFilter={folderFilter}
          initialFocusId={focusId || undefined}
          initialFocusGroup={initialFocusGroup || undefined}
          totalCount={totalCount}
          currentPage={normalizedPage}
          totalPages={totalPages}
        />
      </div>
    </main>
  )
}
