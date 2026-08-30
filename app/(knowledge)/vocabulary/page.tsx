// app/vocabulary/page.tsx
import VocabularyTabs from './VocabularyTabs'
import { parseJsonStringList } from '@/utils/text/jsonList'
import { toVocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'
import {
  resolveVocabularyGroupName,
  resolveVocabularyLanguageCode,
} from '@/modules/knowledge/vocabulary/domain/language'
import {
  findVocabularyDetail,
  listVocabularyDetailsByWords,
  listVocabularyGroups,
  listVocabularySentenceLinks,
  resolveAudioDialogueClips,
  resolveVocabularySentenceSources,
  type VocabularyDetailRow,
} from '@/modules/knowledge/vocabulary/server/repository'
import {
  listWordbookOptions,
} from '@/modules/knowledge/wordbooks/repository'

type SentenceSource = {
  text: string
  source: string
  sourceUrl: string
  translation?: string | null
  audioFile?: string | null
  audioData?: AudioData | null
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
  recordIds: string[]
  wordbooks: Array<{ id: string; name: string; pathLabel: string }>
  wordbookSources: Array<{
    id: string
    name: string
    pathLabel: string
    recordIds: string[]
    pronunciations: string[]
    partsOfSpeech: string[]
    meanings: string[]
    sentences: SentenceSource[]
  }>
  createdAt: Date
  sourceType: string
  sentences: SentenceSource[]
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
  count?: number
}

const normalizeSentencePosTags = (list?: string[] | null) =>
  Array.from(
    new Set((list || []).map(item => item.trim()).filter(Boolean)),
  ).slice(0, 1)

const vocabularyWordKey = (word: string) =>
  word.normalize('NFKC').trim().toLocaleLowerCase('ja')

const uniqueStrings = (values: string[]) =>
  Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))

export default async function VocabularyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const PAGE_SIZE = 50
  const resolvedSearchParams = await searchParams
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
  const focusId = (focusValue || '').trim()
  const initialFocusGroup = (groupValue || '').trim()
  const wordbookFilter = (wordbookValue || 'all').trim()

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
        ? {
            wordbooks: {
              none: { wordbook: { NOT: { id: { startsWith: 'legacy-' } } } },
            },
          }
        : { wordbooks: { some: { wordbookId: { in: wordbookFilterIds } } } }

  const vocabularyGroupRows = await listVocabularyGroups(whereClause)

  const groupedTotals: Record<string, number> = {}
  const vocabularyGroups = new Map<
    string,
    { word: string; groupName: string; ids: string[] }
  >()
  vocabularyGroupRows.forEach(vocab => {
    const finalGroupName = resolveVocabularyGroupName({
      word: vocab.word,
      pronunciations: parseJsonStringList(vocab.pronunciations),
      sourceType: vocab.sourceType,
    })
    const key = vocabularyWordKey(vocab.word)
    const current = vocabularyGroups.get(key)
    if (current) current.ids.push(vocab.id)
    else vocabularyGroups.set(key, {
      word: vocab.word,
      groupName: finalGroupName,
      ids: [vocab.id],
    })
  })
  vocabularyGroups.forEach(group => {
    groupedTotals[group.groupName] = (groupedTotals[group.groupName] || 0) + 1
  })
  const filteredVocabularyGroups = [...vocabularyGroups.values()].filter(
    group => !groupValue || group.groupName === groupValue,
  )

  const totalCount = filteredVocabularyGroups.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const normalizedPage = Math.min(currentPage, totalPages)
  const skip = (normalizedPage - 1) * PAGE_SIZE

  const pageVocabularyGroups = filteredVocabularyGroups.slice(skip, skip + PAGE_SIZE)
  const pageWords = pageVocabularyGroups.map(group => group.word)
  let pageVocabularies: VocabularyDetailRow[] =
    pageWords.length === 0
      ? []
      : await listVocabularyDetailsByWords(pageWords)

  const pageVocabularyOrder = new Map(
    pageVocabularyGroups.map((group, index) => [
      vocabularyWordKey(group.word),
      index,
    ] as const),
  )
  pageVocabularies.sort(
    (left, right) =>
      (pageVocabularyOrder.get(vocabularyWordKey(left.word)) ?? Number.MAX_SAFE_INTEGER) -
      (pageVocabularyOrder.get(vocabularyWordKey(right.word)) ?? Number.MAX_SAFE_INTEGER),
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
      const focusedGroup = await listVocabularyDetailsByWords([
        focusedVocabulary.word,
      ])
      const existingIds = new Set(pageVocabularies.map(item => item.id))
      pageVocabularies = [
        ...focusedGroup.filter(item => !existingIds.has(item.id)),
        ...pageVocabularies,
      ]
    }
  }
  const folders = allWordbooks.map(item => ({
    id: item.id,
    name: item.title,
    parentId: item.parentId,
    count: item._count.entries,
  }))
  const wordbookById = new Map(allWordbooks.map(item => [item.id, item]))
  const getWordbookPath = (wordbookId: string) => {
    const path: Array<{ id: string; title: string }> = []
    const visited = new Set<string>()
    let cursor: string | null = wordbookId
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor)
      const wordbook = wordbookById.get(cursor)
      if (!wordbook) break
      path.unshift({ id: wordbook.id, title: wordbook.title })
      cursor = wordbook.parentId
    }
    return path
  }
  const getWordbookPriority = (wordbookId: string) => {
    const rootTitle = getWordbookPath(wordbookId)[0]?.title || ''
    if (rootTitle.includes('N2語彙トレーニング')) return 0
    if (rootTitle === '红宝书') return 1
    return 2
  }
  const vocabularyIds = pageVocabularies.map(item => item.id)
  const sentenceLinks = await listVocabularySentenceLinks(vocabularyIds)
  const [audioDialogueClips, resolvedSentenceSources] = await Promise.all([
    resolveAudioDialogueClips(
      sentenceLinks
        .filter(link => link.sentence.sourceType === 'AUDIO_DIALOGUE')
        .map(link => link.sentence.sourceId || '')
        .filter(Boolean),
    ),
    resolveVocabularySentenceSources(
      sentenceLinks.map(link => ({
        sourceType: link.sentence.sourceType,
        sourceId: link.sentence.sourceId,
      })),
    ),
  ])
  const sentenceLinksByVocabularyId = sentenceLinks.reduce<
    Record<string, SentenceSource[]>
  >((acc, link) => {
    const posTags = normalizeSentencePosTags(parseJsonStringList(link.posTags))
    const resolvedSource =
      resolvedSentenceSources[
        `${link.sentence.sourceType || ''}:${link.sentence.sourceId || ''}`
      ]
    if (!acc[link.vocabularyId]) acc[link.vocabularyId] = []
    acc[link.vocabularyId].push({
      text: link.sentence.text,
      source: resolvedSource?.source || link.sentence.source,
      sourceUrl: resolvedSource?.sourceUrl || link.sentence.sourceUrl,
      translation: link.sentence.translation || null,
      audioFile: link.sentence.audioFile || null,
      audioData:
        (link.sentence.sourceId &&
          audioDialogueClips[link.sentence.sourceId]) ||
        null,
      sourceType: link.sentence.sourceType,
      meaningIndex: link.meaningIndex ?? null,
      posTags,
    })
    return acc
  }, {})

  const groupedData: Record<string, GroupedVocabItem[]> = {}
  const recordsByWord = new Map<string, VocabularyDetailRow[]>()
  pageVocabularies.forEach(vocab => {
    const key = vocabularyWordKey(vocab.word)
    recordsByWord.set(key, [...(recordsByWord.get(key) || []), vocab])
  })
  let resolvedFocusId = focusId

  recordsByWord.forEach(records => {
    const recordPriority = (vocab: VocabularyDetailRow) =>
      Math.min(
        3,
        ...vocab.wordbooks.map(link => getWordbookPriority(link.wordbook.id)),
      )
    const orderedRecords = [...records].sort(
      (left, right) =>
        recordPriority(left) - recordPriority(right) ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    )
    const primary = orderedRecords[0]
    if (focusId && orderedRecords.some(record => record.id === focusId)) {
      resolvedFocusId = primary.id
    }
    const sourceMap = new Map<
      string,
      {
        id: string
        name: string
        pathLabel: string
        priority: number
        recordIds: Set<string>
        pronunciations: Set<string>
        partsOfSpeech: Set<string>
        meanings: Set<string>
        sentences: SentenceSource[]
      }
    >()
    const allPronunciations: string[] = []
    const allPartsOfSpeech: string[] = []
    const allMeanings: string[] = []
    const allSentences: SentenceSource[] = []
    const allTags: string[] = []

    orderedRecords.forEach(vocab => {
      const meta = toVocabularyMeta(vocab)
      const parsedSentences = dedupeAndRankSentences(
        sentenceLinksByVocabularyId[vocab.id] || [],
        16,
      )
      allPronunciations.push(...meta.pronunciations)
      allPartsOfSpeech.push(...meta.partsOfSpeech)
      allMeanings.push(...meta.meanings)
      allSentences.push(...parsedSentences)
      allTags.push(
        ...(vocab.tags || [])
          .map(item => (item.tag?.name || '').trim())
          .filter(Boolean),
      )
      const memberships = vocab.wordbooks
        .map(link => {
          const path = getWordbookPath(link.wordbook.id)
          return {
            id: link.wordbook.id,
            name: link.wordbook.title,
            pathLabel: path.map(item => item.title).join(' / '),
            priority: getWordbookPriority(link.wordbook.id),
          }
        })
        .sort(
          (left, right) =>
            left.priority - right.priority ||
            left.pathLabel.localeCompare(right.pathLabel, 'ja'),
        )
      memberships.forEach((membership, membershipIndex) => {
        const source = sourceMap.get(membership.id) || {
          ...membership,
          recordIds: new Set<string>(),
          pronunciations: new Set<string>(),
          partsOfSpeech: new Set<string>(),
          meanings: new Set<string>(),
          sentences: [],
        }
        source.recordIds.add(vocab.id)
        meta.pronunciations.forEach(value => source.pronunciations.add(value))
        meta.partsOfSpeech.forEach(value => source.partsOfSpeech.add(value))
        // A shared database row keeps its rich content with the highest-priority
        // wordbook, so it is not repeated under every membership.
        if (membershipIndex === 0) {
          meta.meanings.forEach(value => source.meanings.add(value))
          source.sentences.push(...parsedSentences)
        }
        sourceMap.set(membership.id, source)
      })
    })

    const wordbookSources = [...sourceMap.values()]
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          left.pathLabel.localeCompare(right.pathLabel, 'ja'),
      )
      .map(source => ({
        id: source.id,
        name: source.name,
        pathLabel: source.pathLabel,
        recordIds: [...source.recordIds],
        pronunciations: [...source.pronunciations],
        partsOfSpeech: [...source.partsOfSpeech],
        meanings: [...source.meanings],
        sentences: dedupeAndRankSentences(source.sentences, 16),
      }))
    const pronunciations = uniqueStrings(allPronunciations)
    const partsOfSpeech = uniqueStrings(allPartsOfSpeech)
    const meanings = uniqueStrings(allMeanings)
    const parsedSentences = dedupeAndRankSentences(allSentences, 16)
    const primaryWordbook = wordbookSources[0]
    const defaultLang = resolveVocabularyLanguageCode({
      word: primary.word,
      pronunciations,
      sourceType: primary.sourceType,
    })
    const finalGroupName = resolveVocabularyGroupName({
      word: primary.word,
      pronunciations,
      sourceType: primary.sourceType,
    })
    if (!groupedData[finalGroupName]) groupedData[finalGroupName] = []
    groupedData[finalGroupName].push({
      id: primary.id,
      word: primary.word,
      languageCode: defaultLang,
      wordAudio: orderedRecords.find(record => record.wordAudio)?.wordAudio || null,
      pronunciation: pronunciations[0] || null,
      pronunciations,
      partOfSpeech: partsOfSpeech[0] || null,
      partsOfSpeech,
      meanings,
      tags: uniqueStrings(allTags),
      folderId: primaryWordbook?.id || null,
      folderName: primaryWordbook?.name || null,
      recordIds: orderedRecords.map(record => record.id),
      wordbooks: wordbookSources.map(source => ({
        id: source.id,
        name: source.name,
        pathLabel: source.pathLabel,
      })),
      wordbookSources,
      createdAt: primary.createdAt,
      sourceType: primary.sourceType,
      sentences: parsedSentences,
      review: orderedRecords.find(record => record.review)?.review || null,
    })
  })

  return (
    <main className='min-h-screen bg-stone-50 pb-12'>
      <div className='mx-auto max-w-6xl px-4 py-4 md:px-8 md:py-6'>
        <VocabularyTabs
          groupedData={groupedData}
          groupedTotals={groupedTotals}
          folders={folders as FolderItem[]}
          initialFolderFilter={wordbookFilter}
          initialGroupFilter={groupValue || undefined}
          initialFocusId={resolvedFocusId || undefined}
          initialFocusGroup={initialFocusGroup || undefined}
          totalCount={totalCount}
          currentPage={normalizedPage}
          pageSize={PAGE_SIZE}
        />
      </div>
    </main>
  )
}
