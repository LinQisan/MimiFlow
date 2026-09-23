import {
  JLPT_PRIORITY,
  normalizeVocabularyJlptLevels,
  type VocabularyJlptLevel,
} from '../../../modules/knowledge/vocabulary/domain/jlpt.ts'
import { normalizeVocabularyWord } from '../../../modules/knowledge/vocabulary/domain/normalized-word.ts'
import {
  buildSurfaceAliasMapForText,
  buildSurfaceVariantMapForText,
} from '../../../utils/vocabulary/japaneseInflection.ts'

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
  jlptByWord: Record<string, VocabularyJlptLevel[]>
  wordbookIdsByWord: Record<string, string[]>
}

export const normalizeWordbookHighlightWord = (value: string) =>
  normalizeVocabularyWord(value)

export const resolveJlptHighlightSlot = (
  level: string | null | undefined,
) => {
  const normalized = normalizeVocabularyJlptLevels(level)[0]
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
  const selected = new Set(normalizeVocabularyJlptLevels(selectedLevels))
  if (selected.size === 0) return true
  return normalizeVocabularyJlptLevels(wordLevels).some(level => selected.has(level))
}

// An empty hidden set means “no JLPT restriction”; hiding every level hides
// every word with explicit JLPT metadata.
export const isJlptVisibleWithHiddenLevels = (
  wordLevels: Iterable<string | null | undefined> | string | null | undefined,
  hiddenLevels: Iterable<string | null | undefined>,
) => {
  const hidden = new Set(normalizeVocabularyJlptLevels(hiddenLevels))
  if (hidden.size === 0) return true
  return normalizeVocabularyJlptLevels(wordLevels).some(level => !hidden.has(level))
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
        jlpt: Set<VocabularyJlptLevel>
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
        jlpt: new Set<VocabularyJlptLevel>(),
        wordbookIds: new Set<string>(),
      }
      if (!current.headword) {
        current.headword = wordbook.matchedHeadwords?.[rawWord] || rawWord
      }
      normalizeVocabularyJlptLevels(
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
    ) as Record<string, VocabularyJlptLevel[]>
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

export function buildWordbookHighlightGroups(
  wordbooks: WordbookHighlightDistributionWordbook[],
  text: string,
) {
  const sources = groupWordbookDistributionBySource(wordbooks)
  const jlptByCanonicalWord = new Map<string, Set<VocabularyJlptLevel>>()
  sources.forEach(source => {
    source.matchedWords.forEach(word => {
      const levels = jlptByCanonicalWord.get(word) || new Set<VocabularyJlptLevel>()
      ;(source.jlptByWord[word] || []).forEach(level => levels.add(level))
      jlptByCanonicalWord.set(word, levels)
    })
  })
  return sources
    .map(source => {
      const matchedHeadwords = Array.from(
        new Set(Object.values(source.matchedHeadwords)),
      )
      const aliases = buildSurfaceAliasMapForText(text, matchedHeadwords)
      const variants = buildSurfaceVariantMapForText(text, matchedHeadwords)
      const metadataByHeadword = new Map<
        string,
        { jlpt: Set<VocabularyJlptLevel>; wordbookIds: Set<string> }
      >()
      source.matchedWords.forEach(word => {
        const headword = source.matchedHeadwords[word] || word
        const metadata = metadataByHeadword.get(headword) || {
          jlpt: new Set<VocabularyJlptLevel>(),
          wordbookIds: new Set<string>(),
        }
        ;(source.jlptByWord[word] || []).forEach(level =>
          metadata.jlpt.add(level),
        )
        ;(jlptByCanonicalWord.get(word) || []).forEach(level =>
          metadata.jlpt.add(level),
        )
        ;(source.wordbookIdsByWord[word] || []).forEach(wordbookId =>
          metadata.wordbookIds.add(wordbookId),
        )
        metadataByHeadword.set(headword, metadata)
      })
      const jlptByWord: Record<string, string[]> = {}
      const wordbookIdsByWord: Record<string, string[]> = {}
      source.matchedWords.forEach(word => {
        jlptByWord[word] = [...(jlptByCanonicalWord.get(word) || [])]
        wordbookIdsByWord[word] = source.wordbookIdsByWord[word] || []
      })
      metadataByHeadword.forEach((metadata, headword) => {
        jlptByWord[headword] = [...metadata.jlpt]
        wordbookIdsByWord[headword] = [...metadata.wordbookIds]
      })
      Object.entries(aliases).forEach(([surface, headword]) => {
        const metadata = metadataByHeadword.get(headword)
        jlptByWord[surface] = metadata ? [...metadata.jlpt] : []
        wordbookIdsByWord[surface] = metadata
          ? [...metadata.wordbookIds]
          : source.wordbookIds
      })
      return {
        id: source.id,
        label: source.label,
        words: Object.keys(aliases),
        canonicalWords: Array.from(new Set(Object.values(aliases))),
        jlptByWord,
        wordbookIdsByWord,
        aliases,
        variants,
      }
    })
    .filter(group => group.words.length > 0)
    .sort((left, right) => left.label.localeCompare(right.label, 'ja'))
}
