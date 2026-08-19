import {
  isSudachiContentWord,
  type SudachiToken,
} from '../../reading/domain/sudachi.ts'

export const PRACTICE_VOCABULARY_CATEGORIES = [
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
  categoryCounts: Record<PracticeVocabularyCategory, number>
  yearCounts: Record<string, number>
}

export type PracticeVocabularyAnalytics = {
  totalPapers: number
  totalOccurrences: number
  words: PracticeVocabularyWordInsight[]
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
  'paperCount' | 'coverageRate'
> & { paperIds: Set<string> }

const emptyCategoryCounts = (): Record<PracticeVocabularyCategory, number> => ({
  TEXT_VOCAB: 0,
  GRAMMAR: 0,
  READING: 0,
  LISTENING: 0,
})

const KANJI_PATTERN = /^\p{Script=Han}$/u

export function buildPracticeVocabularyAnalytics({
  documents,
  tokens,
  totalPapers,
  years = ['2022', '2023', '2024', '2025', '2026'],
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
      partOfSpeech: token.partsOfSpeech[0] || '',
      count: 0,
      optionCount: 0,
      targetCount: 0,
      categoryCounts: emptyCategoryCounts(),
      yearCounts: {},
      paperIds: new Set(),
    }
    words.set(word, created)
    return created
  }

  tokens.forEach(token => {
    const document = documents[token.textIndex]
    if (!document || !isSudachiContentWord(token)) return
    const row = getWord(token)
    if (document.kind === 'target') {
      row.targetCount += 1
      return
    }
    row.count += 1
    row.paperIds.add(document.paperId)
    row.categoryCounts[document.category] += 1
    if (document.kind === 'option') row.optionCount += 1
    if (document.year) {
      row.yearCounts[document.year] = (row.yearCounts[document.year] || 0) + 1
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
  const totalOccurrences = allWords.reduce((sum, row) => sum + row.count, 0)
  const normalizedWords = allWords
    .filter(row => row.count > 0 || row.targetCount > 0)
    .map(({ paperIds, ...row }) => ({
      ...row,
      paperCount: paperIds.size,
      coverageRate:
        denominator > 0
          ? Math.round((paperIds.size / denominator) * 1000) / 10
          : 0,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.paperCount - left.paperCount ||
        left.word.localeCompare(right.word, 'ja'),
    )

  const profiles = PRACTICE_VOCABULARY_CATEGORIES.map(category => {
    const categoryWords = normalizedWords
      .filter(row => row.categoryCounts[category.key] > 0)
      .sort(
        (left, right) =>
          right.categoryCounts[category.key] -
            left.categoryCounts[category.key] ||
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
