import {
  isSudachiContentWord,
  translateSudachiPartOfSpeech,
  type SudachiToken,
} from '../../../modules/language/domain/sudachi.ts'
import { normalizeVocabularyWord } from '../../../modules/knowledge/vocabulary/domain/normalized-word.ts'

const PRACTICE_VOCABULARY_CATEGORIES = [
  { key: 'TEXT_VOCAB', label: '文字・語彙' },
  { key: 'GRAMMAR', label: '文法' },
  { key: 'READING', label: '読解' },
  { key: 'LISTENING', label: '聴解' },
] as const

const JAPANESE_COLLATOR = new Intl.Collator('ja')

export type PracticeVocabularyCategory =
  (typeof PRACTICE_VOCABULARY_CATEGORIES)[number]['key']

export type PracticeVocabularyDocument = {
  paperId: string
  year: string
  category: PracticeVocabularyCategory
  kind: 'body' | 'question' | 'option' | 'target'
  text: string
}

export type PracticeVocabularyWordInsight = {
  word: string
  reading: string
  partOfSpeech: string
  count: number
  paperCount: number
  coverageRate: number
  optionCount: number
  targetCount: number
  learningValue: number
  wordbookIds: string[]
  isMastered: boolean
  categoryCounts: Record<PracticeVocabularyCategory, number>
  yearCounts: Record<string, number>
}

export type PracticeVocabularyWordbookOption = {
  id: string
  name: string
  pathLabel: string
  seriesId: string
  seriesTitle: string
  depth: number
  totalCount: number
}

export type PracticeVocabularyWordbookEntry = {
  word: string
  reading: string
  partOfSpeech: string
  wordbookIds: string[]
  wordbookNames: string[]
  isMastered?: boolean
}

export function rankPracticeVocabularyTrendWords(
  words: PracticeVocabularyWordInsight[],
  years: string[],
  limit = 20,
) {
  const yearTotals = new Map(
    years.map(year => [
      year,
      words.reduce((sum, row) => sum + (row.yearCounts[year] || 0), 0),
    ]),
  )
  return words
    .map(row => {
      const counts = years.map(year => row.yearCounts[year] || 0)
      const total = counts.reduce((sum, count) => sum + count, 0)
      const rates = years.map((year, index) => {
        const yearTotal = yearTotals.get(year) || 0
        return yearTotal > 0 ? (counts[index] / yearTotal) * 1_000 : 0
      })
      const spread = rates.length > 0
        ? Math.max(...rates) - Math.min(...rates)
        : 0
      const endpointChange = rates.length > 1
        ? Math.abs(rates.at(-1)! - rates[0])
        : spread
      const evidenceWeight = Math.min(1, total / 4)
      const trendScore =
        (spread * 0.7 + endpointChange * 0.3) * evidenceWeight +
        Math.log2(total + 1) * 0.15
      return { row, total, trendScore }
    })
    .filter(candidate => candidate.total >= 2 && candidate.trendScore > 0)
    .sort(
      (left, right) =>
        right.trendScore - left.trendScore ||
        right.total - left.total ||
        right.row.learningValue - left.row.learningValue ||
        JAPANESE_COLLATOR.compare(left.row.word, right.row.word),
    )
    .slice(0, limit)
    .map(candidate => candidate.row)
}

type PracticeVocabularyWordbookRow = {
  id: string
  title: string
  seriesTitle: string
  seriesId: string
  count: number
}

export function buildPracticeVocabularyWordbookOptions(
  rows: PracticeVocabularyWordbookRow[],
): PracticeVocabularyWordbookOption[] {
  return rows
    .map(row => ({
      id: row.id,
      name: row.title,
      seriesId: row.seriesId,
      seriesTitle: row.seriesTitle,
      pathLabel: `${row.seriesTitle} / ${row.title}`,
      depth: 0,
      totalCount: row.count,
    }))
}

export type PracticeVocabularyAnalytics = {
  totalPapers: number
  totalOccurrences: number
  words: PracticeVocabularyWordInsight[]
  wordbooks: PracticeVocabularyWordbookOption[]
  kanji: Array<{
    character: string
    count: number
    paperCount: number
    coverageRate: number
  }>
  years: string[]
  profiles: Array<{
    key: PracticeVocabularyCategory
    label: string
    totalOccurrences: number
    uniqueWords: number
    topWords: Array<{ word: string; count: number }>
  }>
}

export type PracticeVocabularySummaryWord = Pick<
  PracticeVocabularyWordInsight,
  'word' | 'count' | 'optionCount' | 'targetCount' | 'yearCounts' | 'isMastered'
>

export type PracticeVocabularyAnalyticsSummary = Omit<
  PracticeVocabularyAnalytics,
  'words' | 'wordbooks'
> & {
  wordCount: number
  topItems: {
    words: PracticeVocabularySummaryWord[]
    rankings: {
      learning: string[]
      option: string[]
      katakana: string[]
      compounds: string[]
      tested: string[]
      trends: string[]
    }
  }
}

export type PracticeVocabularyAnalyticsWordsResponse = {
  words: PracticeVocabularyWordInsight[]
  wordbooks: PracticeVocabularyWordbookOption[]
  total: number
  page: number
  limit: number | null
  hasNextPage: boolean
}

export const isPracticeVocabularyCategory = (
  value: string,
): value is PracticeVocabularyCategory =>
  PRACTICE_VOCABULARY_CATEGORIES.some(category => category.key === value)

export const PRACTICE_VOCABULARY_CATEGORY_OPTIONS: ReadonlyArray<{
  key: PracticeVocabularyCategory
  label: string
}> = PRACTICE_VOCABULARY_CATEGORIES.map(({ key, label }) => ({ key, label }))

export type PracticeWordRecommendReason =
  | 'full-coverage'
  | 'top-tested'
  | 'top-distractor'
  | 'frequent'
  | 'multi-category'
  | 'complex-form'

export const PRACTICE_WORD_RECOMMEND_REASON_LABELS: Record<
  PracticeWordRecommendReason,
  string
> = {
  'full-coverage': '全卷覆盖',
  'top-tested': '高频考点',
  'top-distractor': '高频干扰词',
  frequent: '高频',
  'multi-category': '多题型出现',
  'complex-form': '词形复杂',
}

// Presentation-level cutoffs for reason chips. They only decide which
// explanation chips render next to a word — sorting always uses
// learningValue, so tuning these never reorders anything.
const RECOMMEND_CUTOFFS = {
  testedCount: 3,
  distractorCount: 8,
  frequentCount: 10,
  multiCategoryBreadth: 3,
  complexKanjiCount: 3,
} as const

const countKanji = (word: string) => word.match(HAN_PATTERN)?.length || 0

const countActiveCategories = (
  categoryCounts?: Partial<Record<PracticeVocabularyCategory, number>>,
) =>
  PRACTICE_VOCABULARY_CATEGORIES.reduce(
    (sum, category) => sum + Number((categoryCounts?.[category.key] || 0) > 0),
    0,
  )

/**
 * Explains, from already-computed insight fields, why a word is worth
 * learning first. Every field is optional so summary-level rows (which lack
 * paper coverage and category breakdowns) degrade gracefully instead of
 * inventing reasons.
 */
export function getPracticeWordRecommendReasons(
  row: {
    word: string
    count: number
    paperCount?: number | null
    optionCount: number
    targetCount: number
    categoryCounts?: Partial<Record<PracticeVocabularyCategory, number>> | null
  },
  totalPapers: number,
): PracticeWordRecommendReason[] {
  const reasons: PracticeWordRecommendReason[] = []
  if (
    totalPapers > 0 &&
    (row.paperCount || 0) >= totalPapers &&
    row.count > 0
  ) {
    reasons.push('full-coverage')
  }
  if (row.targetCount >= RECOMMEND_CUTOFFS.testedCount) {
    reasons.push('top-tested')
  }
  if (row.optionCount >= RECOMMEND_CUTOFFS.distractorCount) {
    reasons.push('top-distractor')
  }
  if (row.count >= RECOMMEND_CUTOFFS.frequentCount) {
    reasons.push('frequent')
  }
  if (
    countActiveCategories(row.categoryCounts || undefined) >=
    RECOMMEND_CUTOFFS.multiCategoryBreadth
  ) {
    reasons.push('multi-category')
  }
  if (countKanji(row.word) >= RECOMMEND_CUTOFFS.complexKanjiCount) {
    reasons.push('complex-form')
  }
  return reasons.slice(0, 3)
}

export type PriorityReviewPlan = {
  /** Minimum paper coverage ("N 套试卷") behind the headline number. */
  threshold: number
  totalPapers: number
  words: Array<{
    word: string
    count: number
    paperCount: number
    targetCount: number
    optionCount: number
    learningValue: number
  }>
}

/**
 * The "优先复习" headline: unmastered words covering at least `threshold`
 * papers, ordered by the existing learningValue score. For small corpora the
 * threshold stays at full coverage so the promise never overstates.
 */
export function buildPriorityReviewPlan(
  words: Array<{
    word: string
    count: number
    paperCount: number
    targetCount: number
    optionCount: number
    learningValue: number
    isMastered: boolean
  }>,
  totalPapers: number,
): PriorityReviewPlan {
  const threshold = totalPapers >= 4 ? totalPapers - 1 : Math.max(totalPapers, 1)
  const qualified = words
    .filter(row => !row.isMastered && row.paperCount >= threshold)
    .sort(
      (left, right) =>
        right.learningValue - left.learningValue ||
        right.count - left.count ||
        JAPANESE_COLLATOR.compare(left.word, right.word),
    )
  return {
    threshold,
    totalPapers,
    words: qualified.map(
      ({ word, count, paperCount, targetCount, optionCount, learningValue }) => ({
        word,
        count,
        paperCount,
        targetCount,
        optionCount,
        learningValue,
      }),
    ),
  }
}

export function filterPracticeVocabularyWords(
  words: PracticeVocabularyWordInsight[],
  {
    profile,
    query,
  }: {
    profile?: PracticeVocabularyCategory
    query?: string
  } = {},
) {
  const normalizedQuery = query
    ? normalizeVocabularyWord(query)
    : ''
  return words.filter(row => {
    if (profile && row.categoryCounts[profile] <= 0) return false
    if (!normalizedQuery) return true
    return normalizeVocabularyWord(
      `${row.word} ${row.reading} ${row.partOfSpeech}`,
    ).includes(normalizedQuery)
  })
}

type InternalWord = Omit<
  PracticeVocabularyWordInsight,
  | 'paperCount'
  | 'coverageRate'
  | 'learningValue'
  | 'wordbookIds'
  | 'isMastered'
> & {
  paperIds: Set<string>
  countUnitIds: Set<string>
  optionUnitIds: Set<string>
  targetUnitIds: Set<string>
  categoryUnitIds: Record<PracticeVocabularyCategory, Set<string>>
  yearUnitIds: Map<string, Set<string>>
}

const emptyCategoryCounts = (): Record<PracticeVocabularyCategory, number> => ({
  TEXT_VOCAB: 0,
  GRAMMAR: 0,
  READING: 0,
  LISTENING: 0,
})

const emptyCategoryUnitIds = (): Record<
  PracticeVocabularyCategory,
  Set<string>
> => ({
  TEXT_VOCAB: new Set(),
  GRAMMAR: new Set(),
  READING: new Set(),
  LISTENING: new Set(),
})

const KANJI_PATTERN = /^\p{Script=Han}$/u
const HAN_PATTERN = /\p{Script=Han}/gu
const HIRAGANA_WORD_PATTERN = /^[\p{Script=Hiragana}ー]+$/u

export function applyPracticeVocabularyKnowledge(
  analytics: PracticeVocabularyAnalytics,
  wordbookEntries: Array<{
    word: string
    wordbookIds: string[]
  }>,
  masteredWords: Iterable<string>,
  wordbooks: PracticeVocabularyWordbookOption[] = [],
): PracticeVocabularyAnalytics {
  const wordbookIdsByWord = new Map<string, Set<string>>()
  wordbookEntries.forEach(entry => {
    const word = normalizeVocabularyWord(entry.word)
    if (!word) return
    const ids = wordbookIdsByWord.get(word) || new Set<string>()
    entry.wordbookIds.forEach(id => ids.add(id))
    wordbookIdsByWord.set(word, ids)
  })
  const mastered = new Set(
    Array.from(masteredWords, normalizeVocabularyWord),
  )

  return {
    ...analytics,
    wordbooks,
    words: analytics.words.map(row => {
      const normalizedWord = normalizeVocabularyWord(row.word)
      const wordbookIds = [...(wordbookIdsByWord.get(normalizedWord) || [])]
      return {
        ...row,
        wordbookIds,
        isMastered: mastered.has(normalizedWord),
      }
    }),
  }
}

const getLearningValue = (
  row: Omit<PracticeVocabularyWordInsight, 'learningValue'>,
) => {
  const characterCount = Array.from(row.word).length
  const kanjiCount = row.word.match(HAN_PATTERN)?.length || 0
  const categoryBreadth =
    Number(row.categoryCounts.TEXT_VOCAB > 0) +
    Number(row.categoryCounts.GRAMMAR > 0) +
    Number(row.categoryCounts.READING > 0) +
    Number(row.categoryCounts.LISTENING > 0)
  const lexicalComplexity =
    Math.min(kanjiCount, 4) * 1.6 +
    Math.min(characterCount, 8) * 0.35 -
    (HIRAGANA_WORD_PATTERN.test(row.word) ? 1.5 : 0)
  const evidence =
    Math.log2(row.count + 1) * 2.5 +
    Math.log2(row.paperCount + 1) * 4 +
    Math.log2(row.optionCount + 1) * 2 +
    row.targetCount * 8 +
    categoryBreadth * 1.5
  return Math.round((evidence + lexicalComplexity) * 10) / 10
}

const compareProfileRows = (
  category: PracticeVocabularyCategory,
  left: PracticeVocabularyWordInsight,
  right: PracticeVocabularyWordInsight,
) =>
  right.learningValue - left.learningValue ||
  right.categoryCounts[category] - left.categoryCounts[category] ||
  JAPANESE_COLLATOR.compare(left.word, right.word)

const KATAKANA_WORD_PATTERN = /^[\p{Script=Katakana}ー]+$/u
const TWO_KANJI_WORD_PATTERN = /^\p{Script=Han}{2}$/u
const KANJI_WORD_PATTERN = /\p{Script=Han}/u

const toSummaryWord = (
  row: PracticeVocabularyWordInsight,
  masteredWords: ReadonlySet<string>,
): PracticeVocabularySummaryWord => ({
  word: row.word,
  count: row.count,
  optionCount: row.optionCount,
  targetCount: row.targetCount,
  yearCounts: row.yearCounts,
  isMastered: masteredWords.has(normalizeVocabularyWord(row.word)),
})

export function buildPracticeVocabularyAnalyticsSummary(
  analytics: PracticeVocabularyAnalytics,
  masteredWords: Iterable<string> = [],
): PracticeVocabularyAnalyticsSummary {
  const mastered = new Set(
    Array.from(masteredWords, normalizeVocabularyWord),
  )
  const rankedWords = analytics.words.map(row => ({
    ...row,
    isMastered: mastered.has(normalizeVocabularyWord(row.word)),
  }))
  const learningRows = rankedWords.filter(row => !row.isMastered)
  const optionRows = rankedWords
    .filter(row => row.optionCount > 0 && !row.isMastered)
    .sort((left, right) => right.optionCount - left.optionCount)
  const katakanaRows = rankedWords.filter(row =>
    KATAKANA_WORD_PATTERN.test(row.word),
  )
  const compoundRows = rankedWords.filter(row =>
    TWO_KANJI_WORD_PATTERN.test(row.word) && !row.isMastered,
  )
  const testedRows = rankedWords
    .filter(row => row.targetCount > 0 && KANJI_WORD_PATTERN.test(row.word))
    .sort(
      (left, right) =>
        right.targetCount - left.targetCount || right.count - left.count,
    )
  const trendRows = rankPracticeVocabularyTrendWords(
    rankedWords.filter(row => !row.isMastered),
    analytics.years,
  ).map(row => toSummaryWord(row, mastered))
  const profiles = analytics.profiles.map(profile => ({
    ...profile,
    topWords: rankedWords
      .filter(row =>
        !row.isMastered && row.categoryCounts[profile.key] > 0,
      )
      .slice(0, 16)
      .map(row => ({
        word: row.word,
        count: row.categoryCounts[profile.key],
      })),
  }))
  const rankingRows = {
    learning: learningRows.slice(0, 10).map(row => toSummaryWord(row, mastered)),
    option: optionRows.slice(0, 10).map(row => toSummaryWord(row, mastered)),
    katakana: katakanaRows.slice(0, 10).map(row => toSummaryWord(row, mastered)),
    compounds: compoundRows.slice(0, 10).map(row => toSummaryWord(row, mastered)),
    tested: testedRows.slice(0, 10).map(row => toSummaryWord(row, mastered)),
    trends: trendRows,
  }
  const topItems = new Map<string, PracticeVocabularySummaryWord>()
  Object.values(rankingRows).forEach(rows => {
    rows.forEach(row => topItems.set(row.word, row))
  })

  return {
    totalPapers: analytics.totalPapers,
    totalOccurrences: analytics.totalOccurrences,
    wordCount: analytics.words.length,
    kanji: analytics.kanji.slice(0, 20),
    years: analytics.years,
    profiles,
    topItems: {
      words: [...topItems.values()],
      rankings: Object.fromEntries(
        Object.entries(rankingRows).map(([key, rows]) => [
          key,
          rows.map(row => row.word),
        ]),
      ) as PracticeVocabularyAnalyticsSummary['topItems']['rankings'],
    },
  }
}

export function buildPracticeVocabularyAnalytics({
  documents,
  tokens,
  totalPapers,
  years = Array.from(
    new Set(documents.map(document => document.year).filter(Boolean)),
  ).sort((left, right) => Number(left) - Number(right) || left.localeCompare(right)),
}: {
  documents: PracticeVocabularyDocument[]
  tokens: SudachiToken[]
  totalPapers: number
  years?: string[]
}): PracticeVocabularyAnalytics {
  const words = new Map<string, InternalWord>()
  const kanji = new Map<
    string,
    { count: number; paperIds: Set<string> }
  >()

  const getWord = (token: SudachiToken) => {
    const word = token.dictionaryForm.normalize('NFKC').trim()
    const current = words.get(word)
    if (current) return current
    const created: InternalWord = {
      word,
      reading: token.dictionaryReading || token.reading,
      partOfSpeech: translateSudachiPartOfSpeech(token.partsOfSpeech),
      count: 0,
      optionCount: 0,
      targetCount: 0,
      categoryCounts: emptyCategoryCounts(),
      yearCounts: {},
      paperIds: new Set(),
      countUnitIds: new Set(),
      optionUnitIds: new Set(),
      targetUnitIds: new Set(),
      categoryUnitIds: emptyCategoryUnitIds(),
      yearUnitIds: new Map(),
    }
    words.set(word, created)
    return created
  }

  tokens.forEach(token => {
    const document = documents[token.textIndex]
    if (!document || !isSudachiContentWord(token)) return
    const row = getWord(token)
    const unitId = `${document.paperId}:${document.category}`
    if (document.kind === 'target') {
      row.targetUnitIds.add(unitId)
      return
    }
    row.countUnitIds.add(unitId)
    row.paperIds.add(document.paperId)
    row.categoryUnitIds[document.category].add(unitId)
    if (document.kind === 'option') row.optionUnitIds.add(unitId)
    if (document.year) {
      const yearUnits = row.yearUnitIds.get(document.year) || new Set<string>()
      yearUnits.add(unitId)
      row.yearUnitIds.set(document.year, yearUnits)
    }
  })

  documents.forEach(document => {
    if (document.kind === 'target') return
    const seenCharacters = new Set<string>()
    Array.from(document.text.normalize('NFKC')).forEach(character => {
      if (!KANJI_PATTERN.test(character)) return
      const current = kanji.get(character) || {
        count: 0,
        paperIds: new Set<string>(),
      }
      current.count += 1
      if (!seenCharacters.has(character)) {
        current.paperIds.add(document.paperId)
        seenCharacters.add(character)
      }
      kanji.set(character, current)
    })
  })

  const denominator = Math.max(0, totalPapers)
  const allWords = [...words.values()]
  let totalOccurrences = 0
  const profileStats: Record<
    PracticeVocabularyCategory,
    {
      totalOccurrences: number
      uniqueWords: number
      topRows: PracticeVocabularyWordInsight[]
    }
  > = {
    TEXT_VOCAB: { totalOccurrences: 0, uniqueWords: 0, topRows: [] },
    GRAMMAR: { totalOccurrences: 0, uniqueWords: 0, topRows: [] },
    READING: { totalOccurrences: 0, uniqueWords: 0, topRows: [] },
    LISTENING: { totalOccurrences: 0, uniqueWords: 0, topRows: [] },
  }
  allWords.forEach(row => {
    row.count = row.countUnitIds.size
    row.optionCount = row.optionUnitIds.size
    row.targetCount = row.targetUnitIds.size
    PRACTICE_VOCABULARY_CATEGORIES.forEach(category => {
      row.categoryCounts[category.key] = row.categoryUnitIds[category.key].size
    })
    row.yearCounts = Object.fromEntries(
      [...row.yearUnitIds].map(([year, units]) => [year, units.size]),
    )
    totalOccurrences += row.count
  })
  const normalizedWords = allWords
    .filter(row => row.count > 0 || row.targetCount > 0)
    .map(row => {
      const normalized = {
        word: row.word,
        reading: row.reading,
        partOfSpeech: row.partOfSpeech,
        count: row.count,
        optionCount: row.optionCount,
        targetCount: row.targetCount,
        categoryCounts: row.categoryCounts,
        yearCounts: row.yearCounts,
        paperCount: row.paperIds.size,
        coverageRate:
          denominator > 0
            ? Math.round((row.paperIds.size / denominator) * 1000) / 10
            : 0,
        wordbookIds: [],
        isMastered: false,
      }
      const withLearningValue = {
        ...normalized,
        learningValue: getLearningValue(normalized),
      }
      PRACTICE_VOCABULARY_CATEGORIES.forEach(category => {
        const categoryCount = normalized.categoryCounts[category.key]
        if (categoryCount <= 0) return
        const stats = profileStats[category.key]
        stats.totalOccurrences += categoryCount
        stats.uniqueWords += 1
        if (
          stats.topRows.length < 20 ||
          compareProfileRows(category.key, withLearningValue, stats.topRows.at(-1)!) < 0
        ) {
          stats.topRows.push(withLearningValue)
          stats.topRows.sort((left, right) =>
            compareProfileRows(category.key, left, right),
          )
          if (stats.topRows.length > 20) stats.topRows.pop()
        }
      })
      return withLearningValue
    })
    .sort(
      (left, right) =>
        right.learningValue - left.learningValue ||
        right.targetCount - left.targetCount ||
        right.paperCount - left.paperCount ||
        right.count - left.count ||
        JAPANESE_COLLATOR.compare(left.word, right.word),
    )

  const profiles = PRACTICE_VOCABULARY_CATEGORIES.map(category => {
    const stats = profileStats[category.key]
    return {
      key: category.key,
      label: category.label,
      totalOccurrences: stats.totalOccurrences,
      uniqueWords: stats.uniqueWords,
      topWords: stats.topRows.map(row => ({
        word: row.word,
        count: row.categoryCounts[category.key],
      })),
    }
  })

  return {
    totalPapers,
    totalOccurrences,
    words: normalizedWords,
    wordbooks: [],
    kanji: [...kanji.entries()]
      .map(([character, value]) => ({
        character,
        count: value.count,
        paperCount: value.paperIds.size,
        coverageRate:
          denominator > 0
            ? Math.round((value.paperIds.size / denominator) * 1000) / 10
            : 0,
      }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          right.paperCount - left.paperCount ||
          JAPANESE_COLLATOR.compare(left.character, right.character),
      )
      .slice(0, 100),
    years,
    profiles,
  }
}
