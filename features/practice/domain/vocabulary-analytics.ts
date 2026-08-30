import {
  isSudachiContentWord,
  translateSudachiPartOfSpeech,
  type SudachiToken,
} from '../../../modules/language/domain/sudachi.ts'

const PRACTICE_VOCABULARY_CATEGORIES = [
  { key: 'TEXT_VOCAB', label: '文字・語彙' },
  { key: 'GRAMMAR', label: '文法' },
  { key: 'READING', label: '読解' },
  { key: 'LISTENING', label: '聴解' },
] as const

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
  inWordbook: boolean
  wordbookIds: string[]
  wordbookNames: string[]
  isMastered: boolean
  categoryCounts: Record<PracticeVocabularyCategory, number>
  yearCounts: Record<string, number>
}

export type PracticeVocabularyWordbookOption = {
  id: string
  name: string
  pathLabel: string
  depth: number
  totalCount: number
}

export type PracticeVocabularyWordbookEntry = {
  word: string
  reading: string
  partOfSpeech: string
  wordbookIds: string[]
  wordbookNames: string[]
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
        left.row.word.localeCompare(right.row.word, 'ja'),
    )
    .slice(0, limit)
    .map(candidate => candidate.row)
}

type PracticeVocabularyWordbookRow = {
  id: string
  title: string
  parentId: string | null
  count: number
}

export function buildPracticeVocabularyWordbookOptions(
  rows: PracticeVocabularyWordbookRow[],
): PracticeVocabularyWordbookOption[] {
  const byId = new Map(rows.map(row => [row.id, row]))
  const children = new Map<string | null, PracticeVocabularyWordbookRow[]>()
  rows.forEach(row => {
    const parentId = row.parentId && byId.has(row.parentId) ? row.parentId : null
    children.set(parentId, [...(children.get(parentId) || []), row])
  })
  const totals = new Map<string, number>()
  const totalFor = (id: string): number => {
    const cached = totals.get(id)
    if (cached !== undefined) return cached
    const row = byId.get(id)
    if (!row) return 0
    const total = row.count + (children.get(id) || []).reduce(
      (sum, child) => sum + totalFor(child.id),
      0,
    )
    totals.set(id, total)
    return total
  }
  const options: PracticeVocabularyWordbookOption[] = []
  const visit = (
    nodes: PracticeVocabularyWordbookRow[],
    depth: number,
    ancestors: string[],
  ) => {
    nodes.forEach(node => {
      const path = [...ancestors, node.title]
      const totalCount = totalFor(node.id)
      if (totalCount > 0) {
        options.push({
          id: node.id,
          name: node.title,
          pathLabel: path.join(' / '),
          depth,
          totalCount,
        })
      }
      visit(children.get(node.id) || [], depth + 1, path)
    })
  }
  visit(children.get(null) || [], 0, [])
  return options
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

type InternalWord = Omit<
  PracticeVocabularyWordInsight,
  | 'paperCount'
  | 'coverageRate'
  | 'learningValue'
  | 'inWordbook'
  | 'wordbookIds'
  | 'wordbookNames'
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

export const normalizePracticeVocabularyWord = (value: string) =>
  value.normalize('NFKC').trim().toLocaleLowerCase('ja')

export function applyPracticeVocabularyKnowledge(
  analytics: PracticeVocabularyAnalytics,
  wordbookEntries: Array<{
    word: string
    wordbookIds: string[]
    wordbookNames: string[]
  }>,
  masteredWords: Iterable<string>,
  wordbooks: PracticeVocabularyWordbookOption[] = [],
): PracticeVocabularyAnalytics {
  const wordbookIdsByWord = new Map<string, Set<string>>()
  const wordbookNamesByWord = new Map<string, Set<string>>()
  wordbookEntries.forEach(entry => {
    const word = normalizePracticeVocabularyWord(entry.word)
    if (!word) return
    const ids = wordbookIdsByWord.get(word) || new Set<string>()
    entry.wordbookIds.forEach(id => ids.add(id))
    wordbookIdsByWord.set(word, ids)
    const names = wordbookNamesByWord.get(word) || new Set<string>()
    entry.wordbookNames.forEach(name => names.add(name))
    wordbookNamesByWord.set(word, names)
  })
  const mastered = new Set(
    Array.from(masteredWords, normalizePracticeVocabularyWord),
  )

  return {
    ...analytics,
    wordbooks,
    words: analytics.words.map(row => {
      const normalizedWord = normalizePracticeVocabularyWord(row.word)
      const wordbookIds = [...(wordbookIdsByWord.get(normalizedWord) || [])]
      const wordbookNames = [...(wordbookNamesByWord.get(normalizedWord) || [])]
      return {
        ...row,
        inWordbook: wordbookIds.length > 0,
        wordbookIds,
        wordbookNames,
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
  const categoryBreadth = Object.values(row.categoryCounts).filter(Boolean).length
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
  })
  const totalOccurrences = allWords.reduce((sum, row) => sum + row.count, 0)
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
        inWordbook: false,
        wordbookIds: [],
        wordbookNames: [],
        isMastered: false,
      }
      return {
        ...normalized,
        learningValue: getLearningValue(normalized),
      }
    })
    .sort(
      (left, right) =>
        right.learningValue - left.learningValue ||
        right.targetCount - left.targetCount ||
        right.paperCount - left.paperCount ||
        right.count - left.count ||
        left.word.localeCompare(right.word, 'ja'),
    )

  const profiles = PRACTICE_VOCABULARY_CATEGORIES.map(category => {
    const categoryWords = normalizedWords
      .filter(row => row.categoryCounts[category.key] > 0)
      .sort(
        (left, right) =>
          right.learningValue - left.learningValue ||
          right.categoryCounts[category.key] - left.categoryCounts[category.key] ||
          left.word.localeCompare(right.word, 'ja'),
      )
    return {
      key: category.key,
      label: category.label,
      totalOccurrences: categoryWords.reduce(
        (sum, row) => sum + row.categoryCounts[category.key],
        0,
      ),
      uniqueWords: categoryWords.length,
      topWords: categoryWords.slice(0, 20).map(row => ({
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
          left.character.localeCompare(right.character, 'ja'),
      )
      .slice(0, 100),
    years,
    profiles,
  }
}
