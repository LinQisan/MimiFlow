import VocabularyTabs from '@/modules/knowledge/vocabulary/components/VocabularyTabs'
import { parseJsonStringList } from '@/utils/text/jsonList'
import { toVocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'
import {
  resolveVocabularyGroupName,
  resolveVocabularyLanguageCode,
} from '@/modules/knowledge/vocabulary/domain/language'
import {
  normalizeVocabularyPartOfSpeechFilter,
} from '@/utils/vocabulary/partOfSpeech'
import { selectLatestVocabularyWordAudio } from '@/utils/vocabulary/audioPriority'
import { getVocabularySeriesPriority } from '@/utils/vocabulary/sourcePriority'
import { filterVocabularyTags } from '@/modules/knowledge/vocabulary/domain/jlpt'
import {
  listVocabularyDetailsByWords,
  listVocabularyListDetailsByWords,
  listVocabularyTagOptions,
  listVocabularySentenceLinks,
  resolveAudioDialogueClips,
  resolveVocabularySentenceSources,
  type VocabularyDetailRow,
  type VocabularyListDetailRow,
} from '@/modules/knowledge/vocabulary/server/repository'
import {
  listWordbookOptions,
} from '@/modules/knowledge/wordbooks/repository'
import {
  normalizePronunciationData,
  type VocabularyPronunciationData,
} from '@/modules/knowledge/vocabulary/domain/pronunciation'
import { getCurrentUser } from '@/modules/users/server/current-user'
import { listVocabularyPageGroups } from '@/modules/knowledge/vocabulary/server/page-repository'
import { normalizeVocabularyWord } from '@/modules/knowledge/vocabulary/domain/normalized-word'
import { dedupeVocabularyReadingAudios } from '@/modules/knowledge/vocabulary/domain/reading-audio'
import { normalizeVocabularySentencePosTags } from '@/modules/knowledge/vocabulary/domain/sentence-pos-tags'

type SentenceSource = {
  id: string
  text: string
  source: string
  sourceUrl: string
  translation?: string | null
  audioFile?: string | null
  audioData?: AudioData | null
  sourceType?: string | null
  senseId: string
  posTags?: string[]
  pronunciationData?: VocabularyPronunciationData | null
  pronunciationVersion?: number | null
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
  readingAudios?: Array<{ reading: string; audioFile: string }>
  wordAudio?: string | null
  etymologies?: string[]
  pronunciations?: string[]
  pronunciationData?: VocabularyPronunciationData | null
  pronunciationVersion?: number | null
  partsOfSpeech?: string[]
  grammarPartOfSpeech?: 'noun' | 'verb' | 'i_adjective' | 'na_adjective' | 'adverb' | 'adnominal' | 'other' | null
  transitivity?: 'intransitive' | 'transitive' | 'both' | null
  conjugationType?: string | null
  meanings?: string[]
  tags?: string[]
  wordbooks: Array<{ id: string; jlpt?: string | null }>
  wordbookSources: Array<{
    id: string
    jlpt?: string | null
    recordIds: string[]
    meanings: string[]
    sentenceIds: string[]
  }>
  createdAt: Date
  sentencePool: SentenceSource[]
  sentenceIds: string[]
  senses: Array<{
    id: string
    order: number
    definitions: Array<{ id: string; language: string; text: string }>
    exampleIds: string[]
    patterns: Array<{ id: string; text: string; meaning?: string | null }>
    expressions: Array<{ id: string; type: 'collocation' | 'compound' | 'idiom'; text: string; reading?: string | null; meaning?: string | null }>
    relations: Array<{ id: string; type: 'compound' | 'synonym' | 'antonym' | 'related' | 'collocation' | 'transitivity_pair' | 'derived'; targetVocabularyId?: string | null; targetText: string; targetReading?: string | null; targetPartOfSpeech?: string | null; marker?: string | null; pattern?: string | null }>
    notes: Array<{ id: string; type: 'usage' | 'register' | 'restriction' | 'grammar' | 'nuance' | 'warning'; text: string }>
  }>
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
  }
}

type FolderItem = {
  id: string
  name: string
  seriesId: string
  seriesName: string
  count?: number
}

const vocabularyWordKey = normalizeVocabularyWord

type VocabularyPageDetailRow = VocabularyDetailRow | VocabularyListDetailRow

const hasVocabularyCardDetails = (
  vocabulary: VocabularyPageDetailRow,
): vocabulary is VocabularyDetailRow =>
  vocabulary.senses.some(sense => 'relations' in sense)

const uniqueStrings = (values: string[]) =>
  Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))

const mapRelation = (
  relation: VocabularyDetailRow['senses'][number]['relations'][number],
) => ({
  id: relation.id,
  type: relation.type,
  targetVocabularyId: relation.targetVocabularyId,
  targetText: relation.targetVocabulary?.word || relation.targetText || '',
  targetReading:
    relation.targetReading ||
    parseJsonStringList(relation.targetVocabulary?.pronunciations)[0] ||
    null,
  targetPartOfSpeech: parseJsonStringList(relation.targetVocabulary?.partsOfSpeech)[0] || null,
  marker: relation.marker,
  pattern: relation.pattern,
})

const buildSenseItems = (
  vocabulary: VocabularyDetailRow,
  sentences: SentenceSource[],
) => {
  const uniqueSenseExamples = (items: SentenceSource[]) => {
    const seen = new Set<string>()
    return items.filter(item => {
      const key = item.sourceUrl?.startsWith('https://nadeshiko.co/sentence/')
        ? item.sourceUrl
        : item.text.normalize('NFKC').trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  return vocabulary.senses.map(sense => ({
      id: sense.id,
      order: sense.order,
      definitions: sense.definitions.map(definition => ({
        id: definition.id,
        language: definition.language,
        text: definition.definition,
      })),
      examples: uniqueSenseExamples(sentences.filter(sentence => sentence.senseId === sense.id)),
      patterns: sense.patterns.map(pattern => ({ id: pattern.id, text: pattern.text, meaning: pattern.meaning })),
      expressions: sense.expressions.map(expression => ({ id: expression.id, type: expression.type, text: expression.text, reading: expression.reading, meaning: expression.meaning })),
      relations: sense.relations.map(mapRelation),
      notes: sense.notes.map(note => ({ id: note.id, type: note.type, text: note.text })),
  }))
}

export default async function VocabularyRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const PAGE_SIZE = 30
  const resolvedSearchParams = await searchParams
  const pageValue = Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page
  const focusValue = Array.isArray(resolvedSearchParams.focus)
    ? resolvedSearchParams.focus[0]
    : resolvedSearchParams.focus
  const viewValue = Array.isArray(resolvedSearchParams.view)
    ? resolvedSearchParams.view[0]
    : resolvedSearchParams.view
  const groupValue = Array.isArray(resolvedSearchParams.group)
    ? resolvedSearchParams.group[0]
    : resolvedSearchParams.group
  const wordbookValue = Array.isArray(resolvedSearchParams.wordbook)
    ? resolvedSearchParams.wordbook[0]
    : resolvedSearchParams.wordbook
  const posValue = Array.isArray(resolvedSearchParams.pos)
    ? resolvedSearchParams.pos[0]
    : resolvedSearchParams.pos
  const tagValue = Array.isArray(resolvedSearchParams.tag)
    ? resolvedSearchParams.tag[0]
    : resolvedSearchParams.tag
  const queryValue = Array.isArray(resolvedSearchParams.q)
    ? resolvedSearchParams.q[0]
    : resolvedSearchParams.q
  const focusId = (focusValue || '').trim()
  const requestedViewMode = viewValue === 'card' ? 'card' : 'list'
  const includeCardDetails = requestedViewMode === 'card'
  const initialFocusGroup = (groupValue || '').trim()
  const keyword = (queryValue || '').trim().slice(0, 50)
  const wordbookFilter = (wordbookValue || 'all').trim()
  const requestedPosFilter =
    normalizeVocabularyPartOfSpeechFilter(posValue || 'all') || 'all'
  const tagFilter = (tagValue || 'all').trim() || 'all'
  const seriesFilter = wordbookFilter.startsWith('series:')
    ? wordbookFilter.slice('series:'.length).trim()
    : ''

  const rawPage = Number(pageValue || 1)
  const currentPage = Number.isFinite(rawPage)
    ? Math.max(1, Math.floor(rawPage))
    : 1

  const currentUser = await getCurrentUser()
  const userId = currentUser.id

  // Start page details as soon as the page words are known, independently of
  // wordbook and tag options. Only the current page's words are hydrated.
  const groupPagePromise = listVocabularyPageGroups({
    wordbookFilter, seriesFilter, tagFilter, keyword,
    groupFilter: groupValue || '', posFilter: requestedPosFilter,
    page: currentPage, pageSize: PAGE_SIZE,
    focusId,
  })
  const [allWordbooks, availableTags, groupPage, pageVocabularies] = await Promise.all([
    listWordbookOptions(),
    listVocabularyTagOptions(),
    groupPagePromise,
    groupPagePromise.then(result =>
      includeCardDetails
        ? listVocabularyDetailsByWords(result.pageGroups.map(group => group.word))
        : listVocabularyListDetailsByWords(
            result.pageGroups.map(group => group.word),
          ),
    ),
  ])

  const {
    groupedTotals, availablePosFilters, posFilter, totalCount, normalizedPage,
    pageGroups: pageVocabularyGroups,
  } = groupPage

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

  const folders = allWordbooks.map(item => ({
    id: item.id,
    name: item.title,
    seriesId: item.seriesId,
    seriesName: item.series.title,
    count: item._count.entries,
  }))
  const wordbookById = new Map(allWordbooks.map(item => [item.id, item]))
  const getWordbookPath = (wordbookId: string) => {
    const wordbook = wordbookById.get(wordbookId)
    if (!wordbook) return []
    return [
      { id: wordbook.series.id, title: wordbook.series.title },
      { id: wordbook.id, title: wordbook.title },
    ]
  }
  const getWordbookPriority = (wordbookId: string) => {
    if (wordbookFilter === wordbookId) return -1
    if (seriesFilter && wordbookById.get(wordbookId)?.seriesId === seriesFilter) {
      return -1
    }
    const rootTitle = getWordbookPath(wordbookId)[0]?.title || ''
    return getVocabularySeriesPriority(rootTitle)
  }
  const primaryWordbookIdByVocabularyId = new Map(
    pageVocabularies.map(vocabulary => [
      vocabulary.id,
      [...vocabulary.wordbooks]
        .sort(
          (left, right) =>
            getWordbookPriority(left.wordbook.id) -
            getWordbookPriority(right.wordbook.id),
        )[0]?.wordbook.id || '',
    ]),
  )
  const vocabularyIds = pageVocabularies.map(item => item.id)

  const sentenceLinks = includeCardDetails
    ? await listVocabularySentenceLinks(vocabularyIds)
    : []

  const [audioDialogueClips, resolvedSentenceSources] = includeCardDetails
    ? await Promise.all([
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
    : [{}, {}]

  const sentenceLinksByVocabularyId = sentenceLinks.reduce<
    Record<string, SentenceSource[]>
  >((acc, link) => {
    const posTags = normalizeVocabularySentencePosTags(parseJsonStringList(link.posTags))
    const resolvedSource =
      resolvedSentenceSources[
        `${link.sentence.sourceType || ''}:${link.sentence.sourceId || ''}`
      ]
    const isAnkiImport = link.sentence.sourceId === 'anki-import'
    const primaryWordbookId = primaryWordbookIdByVocabularyId.get(
      link.vocabularyId,
    )
    if (!acc[link.vocabularyId]) acc[link.vocabularyId] = []
    acc[link.vocabularyId].push({
      id: link.id,
      text: link.sentence.text,
      source: isAnkiImport
        ? link.sentence.source
        : resolvedSource?.source || link.sentence.source,
      sourceUrl:
        isAnkiImport && primaryWordbookId
          ? `/vocabulary/wordbooks/${primaryWordbookId}`
          : resolvedSource?.sourceUrl || link.sentence.sourceUrl,
      translation: link.sentence.translation || null,
      audioFile: link.sentence.audioFile || null,
      audioData:
        (link.sentence.sourceId &&
          audioDialogueClips[link.sentence.sourceId]) ||
        null,
      sourceType: link.sentence.sourceType,
      senseId: link.senseId,
      posTags,
      pronunciationData: normalizePronunciationData(link.sentence.pronunciationData),
      pronunciationVersion: link.sentence.pronunciationVersion ?? null,
    })
    return acc
  }, {})

  const groupedData: Record<string, GroupedVocabItem[]> = {}
  const recordsByWord = new Map<string, VocabularyPageDetailRow[]>()
  pageVocabularies.forEach(vocab => {
    const key = vocabularyWordKey(vocab.word)
    recordsByWord.set(key, [...(recordsByWord.get(key) || []), vocab])
  })
  let resolvedFocusId = focusId

  recordsByWord.forEach(records => {
    const recordPriority = (vocab: VocabularyPageDetailRow) =>
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
        jlpt: string | null
        priority: number
        recordIds: Set<string>
        pronunciations: Set<string>
        partsOfSpeech: Set<string>
        meanings: Set<string>
        sentences: SentenceSource[]
      }
    >()
    const allEtymologies: string[] = []
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
      allEtymologies.push(...(meta.etymologies || []))
      allPronunciations.push(...meta.pronunciations)
      allPartsOfSpeech.push(...meta.partsOfSpeech)
      allMeanings.push(...meta.meanings)
      allSentences.push(...parsedSentences)
      allTags.push(...filterVocabularyTags(
        (vocab.tags || []).map(item => item.tag?.name || ''),
      ))
      const memberships = vocab.wordbooks
        .map(link => {
          const path = getWordbookPath(link.wordbook.id)
          return {
            id: link.wordbook.id,
            name: link.wordbook.title,
            pathLabel: path.map(item => item.title).join(' / '),
            jlpt: link.jlpt,
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

    const wordbookSources = includeCardDetails
      ? [...sourceMap.values()]
          .sort(
            (left, right) =>
              left.priority - right.priority ||
              left.pathLabel.localeCompare(right.pathLabel, 'ja'),
          )
          .map(source => ({
            id: source.id,
            name: source.name,
            pathLabel: source.pathLabel,
            jlpt: source.jlpt,
            recordIds: [...source.recordIds],
            pronunciations: [...source.pronunciations],
            partsOfSpeech: [...source.partsOfSpeech],
            meanings: [...source.meanings],
            sentences: dedupeAndRankSentences(source.sentences, 16),
          }))
      : []
    const pronunciations = uniqueStrings(allPronunciations)
    const partsOfSpeech = uniqueStrings(allPartsOfSpeech)
    const meanings = uniqueStrings(allMeanings)
    const tags = uniqueStrings(allTags)
    const parsedSentences = dedupeAndRankSentences(allSentences, 16)
    const senses = hasVocabularyCardDetails(primary)
      ? buildSenseItems(
          primary,
          sentenceLinksByVocabularyId[primary.id] || [],
        )
      : []
    const sentencePoolById = new Map<string, SentenceSource>()
    const addToSentencePool = (sentences: SentenceSource[]) => {
      sentences.forEach(sentence => sentencePoolById.set(sentence.id, sentence))
    }
    addToSentencePool(parsedSentences)
    wordbookSources.forEach(source => addToSentencePool(source.sentences))
    senses.forEach(sense => addToSentencePool(sense.examples))
    const compactSentence = (sentence: SentenceSource) => ({
      id: sentence.id,
      text: sentence.text,
      source: sentence.source,
      sourceUrl: sentence.sourceUrl,
      ...(sentence.translation ? { translation: sentence.translation } : {}),
      ...(sentence.audioFile ? { audioFile: sentence.audioFile } : {}),
      ...(sentence.audioData ? { audioData: sentence.audioData } : {}),
      ...(sentence.sourceType ? { sourceType: sentence.sourceType } : {}),
      senseId: sentence.senseId,
      ...(sentence.posTags?.length ? { posTags: sentence.posTags } : {}),
      ...(sentence.pronunciationData
        ? { pronunciationData: sentence.pronunciationData }
        : {}),
      ...(typeof sentence.pronunciationVersion === 'number'
        ? { pronunciationVersion: sentence.pronunciationVersion }
        : {}),
    })
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
    const review = orderedRecords.flatMap(record => record.reviews).find(item => item.userId === userId)
    if (!groupedData[finalGroupName]) groupedData[finalGroupName] = []
    groupedData[finalGroupName].push({
      id: primary.id,
      word: primary.word,
      languageCode: defaultLang,
      readingAudios: dedupeVocabularyReadingAudios(
        orderedRecords.flatMap(record => record.readingAudios || []),
        primary.word,
      ),
      wordAudio: selectLatestVocabularyWordAudio(orderedRecords),
      etymologies: uniqueStrings(allEtymologies),
      pronunciations,
      pronunciationData: normalizePronunciationData(primary.pronunciationData),
      pronunciationVersion: primary.pronunciationVersion ?? null,
      partsOfSpeech,
      grammarPartOfSpeech: primary.grammarPartOfSpeech,
      transitivity: primary.transitivity,
      conjugationType: primary.conjugationType,
      meanings,
      ...(tags.length > 0
        ? { tags }
        : {}),
      wordbooks: wordbookSources.map(source => ({
        id: source.id,
        jlpt: source.jlpt,
      })),
      wordbookSources: wordbookSources.map(source => ({
        id: source.id,
        jlpt: source.jlpt,
        recordIds: source.recordIds,
        meanings: source.meanings,
        sentenceIds: source.sentences.map(sentence => sentence.id),
      })),
      createdAt: primary.createdAt,
      sentencePool: [...sentencePoolById.values()].map(compactSentence),
      sentenceIds: parsedSentences.map(sentence => sentence.id),
      senses: senses.map(({ examples, ...sense }) => ({
        ...sense,
        exampleIds: examples.map(sentence => sentence.id),
      })),
      ...(review ? { review } : {}),
    })
  })

  const tabsProps = {
      canEdit: currentUser.isAdmin || wordbookFilter === 'none',
      groupedData,
      groupedTotals,
      folders: folders as FolderItem[],
      initialFolderFilter: wordbookFilter,
      initialGroupFilter: groupValue || undefined,
      initialPosFilter: posFilter,
      initialTagFilter: tagFilter,
      initialQuery: keyword || undefined,
      availablePosFilters,
      availableTagFilters: availableTags.map(tag => ({
        name: tag.name,
        count: tag._count.vocabularies,
      })),
      initialFocusId: resolvedFocusId || undefined,
      initialFocusGroup: initialFocusGroup || undefined,
      initialViewMode: requestedViewMode as 'list' | 'card',
      totalCount,
      currentPage: normalizedPage,
      pageSize: PAGE_SIZE,
    }

  return (
    <main className='min-h-screen bg-[#f6f5f1] pb-12'>
      <div className='mx-auto max-w-7xl px-5 py-3 md:px-8 md:py-5'>
        <VocabularyTabs {...tabsProps} />
      </div>
    </main>
  )
}
