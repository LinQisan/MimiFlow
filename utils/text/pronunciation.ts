const normalizeComparable = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s|｜・·‧･]+/g, '')
    .trim()

export const sanitizePronunciation = (word: string, pronunciation: string) => {
  const cleanWord = word.trim()
  const cleanPron = pronunciation.trim()
  if (!cleanWord || !cleanPron) return ''
  if (normalizeComparable(cleanWord) === normalizeComparable(cleanPron)) return ''
  return cleanPron
}

export const sanitizePronunciations = (word: string, list: string[]) =>
  Array.from(
    new Set(
      list
        .map(item => sanitizePronunciation(word, item))
        .filter(Boolean),
    ),
  )

export const mergeVocabularyPronunciations = ({
  word,
  existing,
  incoming,
  preferIncoming = false,
}: {
  word: string
  existing: string[]
  incoming: string[]
  preferIncoming?: boolean
}) =>
  sanitizePronunciations(
    word,
    preferIncoming ? [...incoming, ...existing] : [...existing, ...incoming],
  )

const KANA_RUN_REGEX = /[\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu
const SIMPLE_KANA_REGEX = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u
const DICTIONARY_READING_NOTATION_REGEX = /[/／]|[（(][^）)]*[）)]/
const MAX_MATCH_VARIANTS = 24

const unique = (values: string[]) =>
  Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))

const normalizeKanaDisplayKey = (value: string) => {
  const normalized = value.normalize('NFKC').trim()
  if (!SIMPLE_KANA_REGEX.test(normalized)) return normalized
  return Array.from(normalized)
    .map(character => {
      const codepoint = character.codePointAt(0) || 0
      return codepoint >= 0x30a1 && codepoint <= 0x30f6
        ? String.fromCodePoint(codepoint - 0x60)
        : character
    })
    .join('')
}

const uniqueDisplayPronunciations = (values: string[]) => {
  const seen = new Set<string>()
  return values.map(value => value.trim()).filter(value => {
    if (!value) return false
    const key = normalizeKanaDisplayKey(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const splitOutsideParentheses = (value: string) => {
  const parts: string[] = []
  let depth = 0
  let start = 0
  let offset = 0
  for (const character of value) {
    if (character === '(') depth += 1
    else if (character === ')') depth = Math.max(0, depth - 1)
    else if (character === '/' && depth === 0) {
      parts.push(value.slice(start, offset))
      start = offset + character.length
    }
    offset += character.length
  }
  parts.push(value.slice(start))
  return parts.map(part => part.trim()).filter(Boolean)
}

const isMatchableJapaneseSurface = (value: string) =>
  Array.from(value).length >= 2 &&
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ]+$/u.test(
    value,
  )

const extractJapaneseRuns = (value: string) =>
  (value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ]+/gu) || [])
    .filter(isMatchableJapaneseSurface)

const extractJapaneseAffixes = (value: string) =>
  value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ]+/gu) || []

/**
 * Expands compact dictionary notation into sentence-matchable surface forms.
 * For example, `わりに / わりと / わりあい(に / と) わりと` becomes
 * `わりに`, `わりと`, `わりあいに`, and `わりあいと`.
 *
 * This intentionally stays separate from the display pronunciation: one
 * headword can have one ruby-safe reading while matching several written forms.
 */
export const extractVocabularyPronunciationVariants = (raw: string) => {
  const normalized = raw
    .normalize('NFKC')
    .replace(/／/g, '/')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .trim()
  if (!normalized) return []

  const variants: string[] = []
  splitOutsideParentheses(normalized).forEach(segment => {
    const group = segment.match(/^([^()]*)\(([^()]*)\)(.*)$/u)
    if (!group) {
      variants.push(...extractJapaneseRuns(segment))
      return
    }

    const prefix = group[1].trim()
    const options = splitOutsideParentheses(group[2])
      .flatMap(extractJapaneseAffixes)
    const rawSuffix = group[3]
    const separatedSuffix = /^\s+/u.test(rawSuffix)
    const suffixRuns = extractJapaneseRuns(rawSuffix)

    if (separatedSuffix) {
      options.forEach(option => variants.push(`${prefix}${option}`))
      variants.push(...suffixRuns)
      return
    }

    const suffix = rawSuffix.trim()
    if (options.length > 1) {
      options.forEach(option => variants.push(`${prefix}${option}${suffix}`))
    } else {
      variants.push(`${prefix}${suffix}`)
      options.forEach(option => variants.push(`${prefix}${option}${suffix}`))
    }
  })

  return unique(variants.filter(isMatchableJapaneseSurface)).slice(
    0,
    MAX_MATCH_VARIANTS,
  )
}

const COMPACT_READING_DELIMITER_REGEX = /[/／,，、；;\n\r]+/u

/**
 * Splits authored kana alternatives without treating manual ruby notation or
 * English IPA slash pairs as multiple readings. Dictionary-style optional
 * suffix notation is expanded with the same rules used for matching.
 */
export const splitVocabularyPronunciationAlternatives = (raw: string) => {
  const value = raw.trim()
  if (!value || /[{}|｜]/u.test(value)) return value ? [value] : []
  const normalized = value.normalize('NFKC')
  if (!/[぀-ヿ]/u.test(normalized)) return [value]
  if (!COMPACT_READING_DELIMITER_REGEX.test(normalized)) return [value]

  const simpleParts = normalized
    .split(COMPACT_READING_DELIMITER_REGEX)
    .map(item => item.trim())
    .filter(Boolean)
  if (simpleParts.length > 1 && simpleParts.every(item => SIMPLE_KANA_REGEX.test(item))) {
    return simpleParts
  }

  const expanded = /[/／]/u.test(normalized)
    ? extractVocabularyPronunciationVariants(normalized)
    : []
  if (expanded.length > 0) return expanded
  return normalized
    .split(COMPACT_READING_DELIMITER_REGEX)
    .map(item => item.trim())
    .filter(Boolean)
}

const literalKanaEdge = (word: string, edge: 'start' | 'end') => {
  const characters = Array.from(word.normalize('NFKC').trim())
  const ordered = edge === 'start' ? characters : [...characters].reverse()
  const result: string[] = []
  for (const character of ordered) {
    if (!SIMPLE_KANA_REGEX.test(character)) break
    result.push(character)
  }
  return edge === 'start' ? result.join('') : result.reverse().join('')
}

const selectDictionaryReadingCandidate = (word: string, value: string) => {
  const candidates = Array.from(
    new Set(value.normalize('NFKC').match(KANA_RUN_REGEX) || []),
  )
  if (candidates.length === 0) return ''

  const normalizedWord = word.normalize('NFKC').trim()
  const wordLength = Array.from(normalizedWord).length
  const kanjiCount = (normalizedWord.match(/\p{Script=Han}/gu) || []).length
  const expectedLength = wordLength + kanjiCount
  const kanaPrefix = literalKanaEdge(normalizedWord, 'start')
  const kanaSuffix = literalKanaEdge(normalizedWord, 'end')

  return candidates
    .map((candidate, index) => {
      const candidateLength = Array.from(candidate).length
      const score =
        (kanaPrefix && candidate.startsWith(kanaPrefix) ? 100 : 0) +
        (kanaSuffix && candidate.endsWith(kanaSuffix) ? 100 : 0) +
        (candidateLength >= wordLength ? 20 : 0) -
        Math.abs(candidateLength - expectedLength) * 5
      return { candidate, index, score }
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]
    ?.candidate || ''
}

/**
 * Selects a ruby-safe display reading from imported vocabulary data.
 * Dictionary exports sometimes merge several alternatives into one field, for
 * example `わりに / わりと / わりあい(に / と) わりと`. Ruby rendering must
 * receive one reading, while deliberate manual ruby formats remain untouched.
 */
export const selectVocabularyDisplayPronunciation = (
  word: string,
  pronunciations: string[],
) => {
  const values = sanitizePronunciations(word, pronunciations)
  const first = values[0] || ''
  if (!first || !DICTIONARY_READING_NOTATION_REGEX.test(first)) return first
  return selectDictionaryReadingCandidate(word, first) || first
}

export const getVocabularyDisplayPronunciations = (
  word: string,
  pronunciations: string[],
) =>
  uniqueDisplayPronunciations(
    sanitizePronunciations(word, pronunciations).flatMap(value =>
      (/[（(]/u.test(value)
        ? [value]
        : splitVocabularyPronunciationAlternatives(value)).map(candidate =>
        DICTIONARY_READING_NOTATION_REGEX.test(candidate)
          ? selectDictionaryReadingCandidate(word, candidate) || candidate
          : candidate,
      ),
    ),
  )

export const getVocabularyMatchVariants = (
  word: string,
  pronunciations: string[],
) => {
  const values = sanitizePronunciations(word, pronunciations)
  const displayPronunciation = selectVocabularyDisplayPronunciation(word, values)
  return uniqueDisplayPronunciations([
    displayPronunciation,
    ...values.flatMap(value =>
      splitVocabularyPronunciationAlternatives(value).flatMap(candidate =>
        DICTIONARY_READING_NOTATION_REGEX.test(candidate)
          ? extractVocabularyPronunciationVariants(candidate)
          : SIMPLE_KANA_REGEX.test(candidate)
            ? [candidate]
            : [],
      ),
    ),
  ])
    .filter(isMatchableJapaneseSurface)
    .slice(0, MAX_MATCH_VARIANTS)
}
