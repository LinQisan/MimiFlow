// app/vocabulary/page.tsx
import Link from 'next/link'
import VocabularyTabs from './VocabularyTabs'
import { parseJsonStringList } from '@/utils/text/jsonList'
import { toVocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'
import WordbooksBrowser from '@/features/vocabulary/ui/WordbooksBrowser'
import {
  resolveVocabularyGroupName,
  resolveVocabularyLanguageCode,
} from '@/modules/knowledge/vocabulary/domain/language'
import {
  findVocabularyDetail,
  listVocabularyDetails,
  listVocabularyGroups,
  listVocabularySentenceLinks,
  type VocabularyDetailRow,
} from '@/modules/knowledge/vocabulary/server/repository'
import {
  listWordbookOptions,
  listWordbookShelf,
} from '@/modules/knowledge/wordbooks/repository'

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

function VocabularyHeader({ activeView }: { activeView: 'workbench' | 'wordbooks' }) {
  return (
    <header className='mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
      <h1 className='text-2xl font-black tracking-tight text-slate-950'>词汇</h1>
      <nav
        aria-label='词汇页面'
        className='inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1'>
        <Link
          href='/vocabulary'
          aria-current={activeView === 'workbench' ? 'page' : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
            activeView === 'workbench'
              ? 'bg-slate-900 text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`}>
          词汇
        </Link>
        <Link
          href='/vocabulary?view=wordbooks'
          aria-current={activeView === 'wordbooks' ? 'page' : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
            activeView === 'wordbooks'
              ? 'bg-slate-900 text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`}>
          单词书
        </Link>
      </nav>
    </header>
  )
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
    const wordbooks = await listWordbookShelf()

    return (
      <main className='min-h-screen bg-slate-50 pb-16'>
        <div className='mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8'>
          <VocabularyHeader activeView='wordbooks' />

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

  const allWordbooks = await listWordbookOptions()
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

  const vocabularyGroupRows = await listVocabularyGroups(whereClause)

  const groupedTotals: Record<string, number> = {}
  const filteredVocabularyIds: string[] = []

  vocabularyGroupRows.forEach(vocab => {
    const finalGroupName = resolveVocabularyGroupName({
      word: vocab.word,
      pronunciations: parseJsonStringList(vocab.pronunciations),
      sourceType: vocab.sourceType,
    })
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
      : await listVocabularyDetails(pageVocabularyIds)

  const pageVocabularyOrder = new Map(
    pageVocabularyIds.map((id, index) => [id, index] as const),
  )
  pageVocabularies.sort(
    (left, right) =>
      (pageVocabularyOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (pageVocabularyOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  )

  if (focusId && !pageVocabularies.some(item => item.id === focusId)) {
    const focusedVocabulary = await findVocabularyDetail(focusId)
    if (
      focusedVocabulary &&
      (!groupValue ||
        resolveVocabularyGroupName({
          word: focusedVocabulary.word,
          pronunciations: parseJsonStringList(focusedVocabulary.pronunciations),
          sourceType: focusedVocabulary.sourceType,
        }) === groupValue)
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
  const sentenceLinks = await listVocabularySentenceLinks(vocabularyIds)
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
    const meta = toVocabularyMeta(vocab)
    const defaultLang = resolveVocabularyLanguageCode({
      word: vocab.word,
      pronunciations: meta.pronunciations,
      sourceType: vocab.sourceType,
    })
    const finalGroupName = resolveVocabularyGroupName({
      word: vocab.word,
      pronunciations: meta.pronunciations,
      sourceType: vocab.sourceType,
    })
    if (!groupedData[finalGroupName]) groupedData[finalGroupName] = []
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
      <div className='mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8'>
        <VocabularyHeader activeView='workbench' />

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
