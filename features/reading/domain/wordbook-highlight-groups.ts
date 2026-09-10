import {
  JLPT_PRIORITY as CANONICAL_JLPT_PRIORITY,
  mergeVocabularyJlptLevels,
  normalizeVocabularyJlptLevels,
  resolvePrimaryVocabularyJlpt,
  type VocabularyJlptLevel,
} from '../../../modules/knowledge/vocabulary/domain/jlpt.ts'

export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const

export type JlptLevel = VocabularyJlptLevel

// Single source of truth lives in
// modules/knowledge/vocabulary/domain/jlpt.ts. This module keeps its export
// names so existing reading/practice callers do not churn.
export const JLPT_PRIORITY = CANONICAL_JLPT_PRIORITY

export type WordbookHighlightChoice = {
  id: string
  label: string
  wordCount: number
  priority?: number
  slot?: number
}
export type WordbookHighlightDistributionWordbook = {
  id: string
  pathLabel: string
  matchedWords: string[]
  matchedHeadwords?: Record<string, string>
  matchedJlpt?: Record<string, string[]>
  sourceId?: string
  sourceLabel?: string
}

export type WordbookHighlightSource = {
  id: string
  label: string
  wordbookIds: string[]
  matchedWords: string[]
  matchedHeadwords: Record<string, string>
  jlptByWord: Record<string, JlptLevel[]>
  wordbookIdsByWord: Record<string, string[]>
}

const normalizeValue = (value: string) =>
  value.normalize('NFKC').trim().toLocaleLowerCase('ja')

export const normalizeWordbookHighlightWord = (value: string) =>
  normalizeValue(value)

export const normalizeJlptLevels = (
  values: Iterable<string | null | undefined> | string | null | undefined,
): JlptLevel[] => normalizeVocabularyJlptLevels(values)

export const mergeJlptLevels = (
  ...values: Array<Iterable<string | null | undefined> | string | null | undefined>
) => mergeVocabularyJlptLevels(...values)

export const resolvePrimaryJlpt = (
  values: Iterable<string | null | undefined> | string | null | undefined,
): JlptLevel | null => resolvePrimaryVocabularyJlpt(values)

export const resolveJlptHighlightSlot = (
  level: string | null | undefined,
) => {
  const normalized = normalizeJlptLevels(level)[0]
  if (normalized === 'N5') return 0
  if (normalized === 'N4') return 1
  if (normalized === 'N3') return 2
  if (normalized === 'N2') return 3
  if (normalized === 'N1') return 4
  return 5
}

export const jlptLevelsIntersect = (
  wordLevels: Iterable<string | null | undefined> | string | null | undefined,
  selectedLevels: Iterable<string | null | undefined> | string | null | undefined,
) => {
  const selected = new Set(normalizeJlptLevels(selectedLevels))
  if (selected.size === 0) return true
  return normalizeJlptLevels(wordLevels).some(level => selected.has(level))
}

// The selector uses hidden levels for backwards-compatible toggle behavior:
// an empty hidden set means “no JLPT restriction”, while hiding every level
// hides every word with explicit JLPT metadata.
export const isJlptVisibleWithHiddenLevels = (
  wordLevels: Iterable<string | null | undefined> | string | null | undefined,
  hiddenLevels: Iterable<string | null | undefined>,
) => {
  const hidden = new Set(normalizeJlptLevels(hiddenLevels))
  if (hidden.size === 0) return true
  return normalizeJlptLevels(wordLevels).some(level => !hidden.has(level))
}

export const groupWordbookHighlightChoices = (
  choices: WordbookHighlightChoice[],
) => {
  // The reading selector is intentionally flat. This helper only removes
  // duplicate source rows; it never parses a label and never derives JLPT
  // metadata from a wordbook name.
  const sources = new Map<string, WordbookHighlightChoice>()
  choices.forEach(choice => {
    const current = sources.get(choice.id)
    if (!current) {
      sources.set(choice.id, { ...choice })
      return
    }
    current.wordCount = Math.max(current.wordCount, choice.wordCount)
    current.priority = Math.min(
      current.priority ?? Number.MAX_SAFE_INTEGER,
      choice.priority ?? Number.MAX_SAFE_INTEGER,
    )
    if (current.slot == null) current.slot = choice.slot
  })
  return [...sources.values()]
}

export const groupWordbookDistributionBySource = (
  wordbooks: WordbookHighlightDistributionWordbook[],
): WordbookHighlightSource[] => {
  type SourceAccumulator = {
    id: string
    label: string
    wordbookIds: Set<string>
    words: Map<
      string,
      {
        headword: string
        jlpt: Set<JlptLevel>
        wordbookIds: Set<string>
      }
    >
  }

  const sources = new Map<string, SourceAccumulator>()
  wordbooks.forEach(wordbook => {
    const sourceId = wordbook.sourceId || wordbook.id
    const source = sources.get(sourceId) || {
      id: sourceId,
      label: wordbook.sourceLabel || wordbook.pathLabel,
      wordbookIds: new Set<string>(),
      words: new Map(),
    }
    source.wordbookIds.add(wordbook.id)

    const matchedWords = Array.from(
      new Set([
        ...wordbook.matchedWords,
        ...Object.keys(wordbook.matchedHeadwords || {}),
      ]),
    )
    matchedWords.forEach(rawWord => {
      const word = normalizeWordbookHighlightWord(rawWord)
      if (!word) return
      const current = source.words.get(word) || {
        headword: wordbook.matchedHeadwords?.[rawWord] || rawWord,
        jlpt: new Set<JlptLevel>(),
        wordbookIds: new Set<string>(),
      }
      if (!current.headword) {
        current.headword = wordbook.matchedHeadwords?.[rawWord] || rawWord
      }
      normalizeJlptLevels(
        wordbook.matchedJlpt?.[rawWord] || wordbook.matchedJlpt?.[word],
      ).forEach(level => current.jlpt.add(level))
      current.wordbookIds.add(wordbook.id)
      source.words.set(word, current)
    })
    sources.set(sourceId, source)
  })

  return [...sources.values()].map(source => {
    const matchedWords = [...source.words.keys()].sort((left, right) =>
      left.localeCompare(right, 'ja'),
    )
    const matchedHeadwords = Object.fromEntries(
      matchedWords.map(word => [word, source.words.get(word)?.headword || word]),
    )
    const jlptByWord = Object.fromEntries(
      matchedWords.map(word => [
        word,
        JLPT_PRIORITY.filter(level => source.words.get(word)?.jlpt.has(level)),
      ]),
    ) as Record<string, JlptLevel[]>
    const wordbookIdsByWord = Object.fromEntries(
      matchedWords.map(word => [
        word,
        [...(source.words.get(word)?.wordbookIds || [])],
      ]),
    )
    return {
      id: source.id,
      label: source.label,
      wordbookIds: [...source.wordbookIds],
      matchedWords,
      matchedHeadwords,
      jlptByWord,
      wordbookIdsByWord,
    }
  })
}
