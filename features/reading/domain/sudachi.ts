export type SudachiLexeme = {
  surface: string
  dictionaryForm: string
  normalizedForm: string
  reading: string
  dictionaryReading: string
  partsOfSpeech: string[]
}

export type SudachiToken = SudachiLexeme & {
  textIndex: number
  begin: number
  end: number
}

export type VocabularyCandidate = {
  word: string
  surface: string
  reading: string
  partOfSpeech: string
  count: number
}

export type WordFrequencyRow = VocabularyCandidate & {
  documentCount: number
}

const CONTENT_PARTS_OF_SPEECH = new Set([
  '名詞',
  '動詞',
  '形容詞',
  '形状詞',
  '副詞',
])
const JAPANESE_WORD_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u
const LATIN_WORD_PATTERN = /^[A-Za-z]{2,}$/

export const isSudachiContentWord = (token: SudachiLexeme) => {
  const word = token.dictionaryForm.trim()
  const primaryPartOfSpeech = token.partsOfSpeech[0] || ''
  if (!word || word === '*' || !CONTENT_PARTS_OF_SPEECH.has(primaryPartOfSpeech)) {
    return false
  }
  if (token.partsOfSpeech[1] === '非自立可能') return false
  const normalizedWord = word.normalize('NFKC')
  if (
    !JAPANESE_WORD_PATTERN.test(normalizedWord) &&
    !LATIN_WORD_PATTERN.test(normalizedWord)
  ) return false
  if (/^[\p{Script=Hiragana}ー]$/u.test(word)) return false
  return true
}

export const buildVocabularyCandidates = (
  tokens: SudachiToken[],
  existingWords: Iterable<string> = [],
  limit = 60,
): VocabularyCandidate[] => {
  const existing = new Set(
    Array.from(existingWords, word => word.normalize('NFKC').trim()).filter(Boolean),
  )
  const counts = new Map<string, VocabularyCandidate>()

  tokens.forEach(token => {
    if (!isSudachiContentWord(token)) return
    const word = token.dictionaryForm.normalize('NFKC').trim()
    if (existing.has(word) || existing.has(token.surface)) return
    const current = counts.get(word)
    if (current) {
      current.count += 1
      return
    }
    counts.set(word, {
      word,
      surface: token.surface,
      reading: token.dictionaryReading || token.reading,
      partOfSpeech: token.partsOfSpeech[0] || '',
      count: 1,
    })
  })

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word, 'ja'))
    .slice(0, Math.max(0, limit))
}

export const buildWordFrequency = (tokens: SudachiToken[]): WordFrequencyRow[] => {
  const rows = new Map<
    string,
    VocabularyCandidate & { documentIndexes: Set<number> }
  >()

  tokens.forEach(token => {
    if (!isSudachiContentWord(token)) return
    const word = token.dictionaryForm.normalize('NFKC').trim()
    const current = rows.get(word)
    if (current) {
      current.count += 1
      current.documentIndexes.add(token.textIndex)
      return
    }
    rows.set(word, {
      word,
      surface: token.surface,
      reading: token.dictionaryReading || token.reading,
      partOfSpeech: token.partsOfSpeech[0] || '',
      count: 1,
      documentIndexes: new Set([token.textIndex]),
    })
  })

  return [...rows.values()]
    .map(({ documentIndexes, ...row }) => ({
      ...row,
      documentCount: documentIndexes.size,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.documentCount - left.documentCount ||
        left.word.localeCompare(right.word, 'ja'),
    )
}

export const mergeWordFrequencyRows = (
  documents: WordFrequencyRow[][],
): WordFrequencyRow[] => {
  const merged = new Map<string, WordFrequencyRow>()

  documents.forEach(rows => {
    rows.forEach(row => {
      const current = merged.get(row.word)
      if (current) {
        current.count += row.count
        current.documentCount += row.documentCount
        return
      }
      merged.set(row.word, { ...row })
    })
  })

  return [...merged.values()].sort(
    (left, right) =>
      right.count - left.count ||
      right.documentCount - left.documentCount ||
      left.word.localeCompare(right.word, 'ja'),
  )
}
