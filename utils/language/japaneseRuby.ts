import { isJapaneseSurfaceOccurrenceAllowed } from '../vocabulary/japaneseInflection.ts'

const KANJI_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]/

export const escapeHtml = (text?: string | null) =>
  (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const isKanjiChar = (ch: string) => KANJI_REGEX.test(ch)
const hasKanji = (text: string) => KANJI_REGEX.test(text)
const hasNumber = (text: string) => /\p{Number}/u.test(text)
const INLINE_KANA_READING_PATTERN =
  /([\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]+)([（(])([\u3040-\u30ffー]+)([）)])/gu

/**
 * Single source of truth for what parenthesized kana in a surface means
 * relative to the authoritative reading.
 *
 * The surface describes *how it is written*; the reading (DB / Sudachi)
 * describes *how it is read* and always wins. `漢字(かな)` shapes resolve to:
 *
 * - `none`: no parenthesized kana — normal ruby alignment.
 * - `inline`: genuine authored inline notation — every paren group is covered
 *   by the reading (e.g. 今日(きょう) + きょう, 辿（たど）っ + たどっ).
 * - `suffix`: the reading ends with the trailing paren kana, so the parens
 *   are a spelling suffix/okurigana marker, not the kanji reading
 *   (e.g. 後(に) + のちに → stem のち + literal (に)).
 * - `literal`: incompatible — parens are plain surface text and the full
 *   reading still belongs to the kanji (e.g. 後(に) + あと).
 */
export type InlineKanaClassification =
  | { kind: 'none' }
  | { kind: 'inline'; groups: string[] }
  | { kind: 'suffix'; stemReading: string; suffixKana: string }
  | { kind: 'literal' }

export const classifyInlineKanaReading = (
  surface: string,
  pronunciation: string,
): InlineKanaClassification => {
  const groups = extractInlineKanaReadings(surface)
  if (groups.length === 0) return { kind: 'none' }
  const rawChars = Array.from(pronunciation.replace(/[\s\u3000]+/g, ''))
  if (rawChars.length === 0) return { kind: 'literal' }
  // Suffix first: a trailing okurigana-style marker must not swallow the
  // kanji reading. Match pairwise from the end so the stem keeps its
  // authored display form; require a non-empty stem.
  const tailGroup = groups[groups.length - 1]
  const normTail = Array.from(normalizeKanaComparable(tailGroup))
  if (normTail.length > 0 && rawChars.length > normTail.length) {
    let matched = true
    for (let i = 0; i < normTail.length; i++) {
      if (
        normalizeKanaComparable(rawChars[rawChars.length - 1 - i]) !==
        normTail[normTail.length - 1 - i]
      ) {
        matched = false
        break
      }
    }
    if (matched) {
      return {
        kind: 'suffix',
        stemReading: rawChars.slice(0, rawChars.length - normTail.length).join(''),
        suffixKana: tailGroup,
      }
    }
  }
  // Genuine inline notation only when the reading actually covers it.
  const comparable = normalizeKanaComparable(rawChars.join(''))
  const compatible = groups.every(
    group =>
      group.length > 0 &&
      comparable.includes(normalizeKanaComparable(group)),
  )
  if (compatible) return { kind: 'inline', groups }
  return { kind: 'literal' }
}

export const isInlineKanaReadingCompatible = (
  surface: string,
  reading: string,
): boolean => classifyInlineKanaReading(surface, reading).kind === 'inline'

/**
 * Every kana group annotated inline as `漢字(かな)` in a surface.
 * Parser used by {@link classifyInlineKanaReading}; plain matching without
 * any reading judgment.
 */
export const extractInlineKanaReadings = (word: string): string[] => {
  INLINE_KANA_READING_PATTERN.lastIndex = 0
  const groups: string[] = []
  for (const match of word.matchAll(INLINE_KANA_READING_PATTERN)) {
    groups.push(match[3] || '')
  }
  INLINE_KANA_READING_PATTERN.lastIndex = 0
  return groups.filter(Boolean)
}

const hasJapanese = (text: string) => /[\u3040-\u30ffー\u4e00-\u9fff]/.test(text)
const hasKana = (text: string) => /[\u3040-\u30ffー]/.test(text)
const normalizeKanaComparable = (value: string) =>
  Array.from(value.normalize('NFKC'))
    .map(character => {
      const codepoint = character.codePointAt(0) || 0
      return codepoint >= 0x30a1 && codepoint <= 0x30f6
        ? String.fromCodePoint(codepoint - 0x60)
        : character
    })
    .join('')
const normalizeComparable = (value: string) =>
  normalizeKanaComparable(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()
const splitPronunciationTokens = (value: string) =>
  value
    .split(/[|｜\s\u3000]+/)
    .map(item => item.trim())
    .filter(Boolean)

const splitPronunciationForKanji = (kanjiRun: string, pronRun: string) => {
  const kanjiChars = Array.from(kanjiRun)
  if (kanjiChars.length <= 1) return [pronRun]
  const chars = Array.from(pronRun)
  if (chars.length === 0) return kanjiChars.map(() => '')
  const result: string[] = []
  let cursor = 0
  const remainCount = (index: number) => kanjiChars.length - index
  for (let i = 0; i < kanjiChars.length; i += 1) {
    const leftPronLen = chars.length - cursor
    const minNeed = remainCount(i + 1)
    const take =
      i === kanjiChars.length - 1
        ? leftPronLen
        : Math.max(1, Math.floor((leftPronLen - minNeed) / remainCount(i) + 1))
    const nextCursor = Math.min(chars.length, cursor + take)
    result.push(chars.slice(cursor, nextCursor).join(''))
    cursor = nextCursor
  }
  return result
}

const stripMatchingTrailingOkurigana = (reading: string, suffix: string) => {
  const readingChars = Array.from(reading)
  const suffixChars = Array.from(suffix)
  if (suffixChars.length === 0 || readingChars.length <= suffixChars.length) {
    return reading
  }

  const offset = readingChars.length - suffixChars.length
  const matches = suffixChars.every(
    (character, index) =>
      normalizeKanaComparable(readingChars[offset + index]) ===
      normalizeKanaComparable(character),
  )
  return matches ? readingChars.slice(0, offset).join('') : reading
}

const NUMERIC_UNIT_READINGS: Record<string, string> = {
  十: 'じゅう',
  百: 'ひゃく',
  千: 'せん',
  万: 'まん',
  億: 'おく',
  兆: 'ちょう',
}

const resolveMixedNumericReading = (word: string, pronunciation: string) => {
  const match = word.match(/^(\p{Number}+(?:[.,，．]\p{Number}+)*)([十百千万億兆]+)$/u)
  if (!match) return null
  const unitReading = Array.from(match[2])
    .map(character => NUMERIC_UNIT_READINGS[character] || '')
    .join('')
  const comparablePronunciation = normalizeKanaComparable(pronunciation)
  if (!unitReading || !comparablePronunciation.endsWith(unitReading)) return null
  return { number: match[1], units: match[2], reading: unitReading }
}

const findPronunciationBoundary = (
  wordChars: string[],
  runEnd: number,
  pronChars: string[],
  pronCursor: number,
) => {
  const literalRun: string[] = []
  for (let index = runEnd; index < wordChars.length; index += 1) {
    const character = wordChars[index]
    if (isKanjiChar(character)) break
    if (character.trim()) literalRun.push(character)
  }
  if (literalRun.length === 0) return pronChars.length

  // The first matching kana can still belong to the kanji reading itself.
  // Keep at least one pronunciation character for the kanji run before
  // looking for the following okurigana. For example:
  // 聞き分け / ききわけ -> 聞(き) + き + 分(わ) + け
  // 示し / しめし       -> 示(しめ) + し
  const searchStart = Math.min(pronChars.length, pronCursor + 1)
  for (
    let index = searchStart;
    index <= pronChars.length - literalRun.length;
    index += 1
  ) {
    const matches = literalRun.every(
      (character, offset) =>
        normalizeKanaComparable(pronChars[index + offset]) ===
        normalizeKanaComparable(character),
    )
    if (matches) return index
  }

  // Sudachi may return only the current inflected stem. Matching the first
  // okurigana still keeps a trailing small っ outside the ruby in that case.
  for (let index = searchStart; index < pronChars.length; index += 1) {
    if (
      normalizeKanaComparable(pronChars[index]) ===
      normalizeKanaComparable(literalRun[0])
    ) {
      return index
    }
  }
  return pronChars.length
}

export const buildJapaneseRubyHtml = (
  word: string,
  pronunciation: string,
  options?: {
    rubyClassName?: string
    rtClassName?: string
    groupKanji?: boolean
  },
) => {
  const cleanWord = word.trim()
  const cleanPron = pronunciation.trim()
  // The authoritative reading, minus a trailing okurigana-style suffix marker
  // (後(に) + のちに → align 後 against のち; `(に)` stays literal).
  // Surfaces without such a suffix align against the full reading.
  const inlineClass = classifyInlineKanaReading(cleanWord, cleanPron)
  const compactPron = (
    inlineClass.kind === 'suffix' ? inlineClass.stemReading : cleanPron
  ).replace(/[\s\u3000]+/g, '')
  if (!cleanWord) return ''
  if (!cleanPron) return escapeHtml(cleanWord)
  const rubyClass = options?.rubyClassName
    ? ` class="${options.rubyClassName}"`
    : ''
  const rtClass = options?.rtClassName ? ` class="${options.rtClassName}"` : ''
  const buildRuby = (base: string, pron: string) =>
    `<ruby${rubyClass}>${escapeHtml(base)}<rt${rtClass} aria-hidden="true" data-context-ignore="true">${escapeHtml(pron)}</rt></ruby>`
  // A mixed-script word has a reliable boundary at its kana. Keep each
  // contiguous kanji run together so a reading such as 手探り / てさぐり
  // becomes 手探 / てさぐ + り, instead of guessing a per-kanji split.
  const groupKanjiRun =
    Boolean(options?.groupKanji) || (hasKanji(cleanWord) && hasKana(cleanWord))

  // Genuine authored inline notation only (e.g. 辿（たど）っ): the reading
  // itself decides, never the mere presence of parens. Suffix and literal
  // cases fall through to normal alignment below.
  if (inlineClass.kind === 'inline') {
    INLINE_KANA_READING_PATTERN.lastIndex = 0
    let inlineCursor = 0
    let inlineOutput = ''
    for (const match of cleanWord.matchAll(INLINE_KANA_READING_PATTERN)) {
      const start = match.index
      inlineOutput += escapeHtml(cleanWord.slice(inlineCursor, start))
      inlineOutput += buildRuby(match[1], match[3])
      inlineOutput += escapeHtml(`${match[2]}${match[3]}${match[4]}`)
      inlineCursor = start + match[0].length
    }
    inlineOutput += escapeHtml(cleanWord.slice(inlineCursor))
    return inlineOutput
  }

  // Sudachi combines numeric units such as １０万 into one token. Keep the
  // digits unannotated while retaining the useful reading on the unit kanji.
  if (hasKanji(cleanWord) && hasNumber(cleanWord)) {
    const mixedNumeric = resolveMixedNumericReading(cleanWord, compactPron)
    return mixedNumeric
      ? `${escapeHtml(mixedNumeric.number)}${buildRuby(mixedNumeric.units, mixedNumeric.reading)}`
      : escapeHtml(cleanWord)
  }

  const tryBuildFromMixedTokens = () => {
    const tokens = splitPronunciationTokens(cleanPron)
    if (tokens.length === 0) return null
    const hasColonToken = tokens.some(item => item.includes(':') || item.includes('：'))
    if (!hasColonToken) return null

    const wordChars = Array.from(cleanWord)
    const findFromCursor = (needle: string, cursor: number) => {
      if (!needle) return -1
      const tail = wordChars.slice(cursor).join('')
      if (tail.startsWith(needle)) return cursor
      const joined = wordChars.join('')
      return joined.indexOf(needle, cursor)
    }

    let cursor = 0
    let output = ''
    for (const token of tokens) {
      const normalized = token.replace('：', ':')
      const delimiterIndex = normalized.indexOf(':')
      if (delimiterIndex <= 0) {
        const literal = normalized
        const start = findFromCursor(literal, cursor)
        if (start < 0) return null
        output += escapeHtml(wordChars.slice(cursor, start).join(''))
        output += escapeHtml(literal)
        cursor = start + Array.from(literal).length
        continue
      }

      const base = normalized.slice(0, delimiterIndex).trim()
      const reading = normalized.slice(delimiterIndex + 1).trim()
      if (!base || !reading) return null
      const start = findFromCursor(base, cursor)
      if (start < 0) return null
      output += escapeHtml(wordChars.slice(cursor, start).join(''))

      const baseChars = Array.from(base)
      const hasKanjiInBase = baseChars.some(isKanjiChar)
      if (baseChars.length > 1 && hasKanjiInBase) {
        const allKanji = baseChars.every(isKanjiChar)
        if (allKanji && !options?.groupKanji) {
          const readings = splitPronunciationForKanji(base, reading)
          baseChars.forEach((ch, index) => {
            const piece = readings[index] || ''
            output += piece ? buildRuby(ch, piece) : escapeHtml(ch)
          })
        } else {
          output += buildRuby(base, reading)
        }
      } else {
        output += buildRuby(base, reading)
      }
      cursor = start + baseChars.length
    }

    output += escapeHtml(wordChars.slice(cursor).join(''))
    return output || null
  }

  // 片假名/平假名词也允许显示注音（例如外来语标英语读音）。
  if (!hasKanji(cleanWord)) {
    const sameAsWord = normalizeComparable(cleanWord) === normalizeComparable(cleanPron)
    if (sameAsWord) return escapeHtml(cleanWord)
    const wordChars = Array.from(cleanWord)
    const pronChars = Array.from(compactPron)
    let prefix = 0
    while (
      prefix < wordChars.length &&
      prefix < pronChars.length &&
      normalizeKanaComparable(wordChars[prefix]) ===
        normalizeKanaComparable(pronChars[prefix])
    ) {
      prefix += 1
    }

    let suffix = 0
    while (
      suffix < wordChars.length - prefix &&
      suffix < pronChars.length - prefix &&
      normalizeKanaComparable(wordChars[wordChars.length - 1 - suffix]) ===
        normalizeKanaComparable(pronChars[pronChars.length - 1 - suffix])
    ) {
      suffix += 1
    }

    const prefixWord = wordChars.slice(0, prefix).join('')
    const suffixWord =
      suffix > 0 ? wordChars.slice(wordChars.length - suffix).join('') : ''
    const coreWord = wordChars.slice(prefix, wordChars.length - suffix).join('')
    const corePron = pronChars.slice(prefix, pronChars.length - suffix).join('')

    if (!coreWord || !corePron) return escapeHtml(cleanWord)

    return `${escapeHtml(prefixWord)}${buildRuby(coreWord, corePron)}${escapeHtml(suffixWord)}`
  }

  const mixedTokenRuby = tryBuildFromMixedTokens()
  if (mixedTokenRuby) return mixedTokenRuby

  // 手动拆分优先：例如 人間 -> にん|げん 或 にん げん（按汉字个数对应）
  if (cleanPron.includes('|') || /[\s\u3000]/.test(cleanPron)) {
    const tokens = splitPronunciationTokens(cleanPron)
    const wordChars = Array.from(cleanWord)
    const manualMemo = new Map<string, string | null>()
    const buildManual = (wordIndex: number, tokenIndex: number): string | null => {
      const memoKey = `${wordIndex}:${tokenIndex}`
      const memoized = manualMemo.get(memoKey)
      if (memoized !== undefined) return memoized
      if (wordIndex >= wordChars.length) {
        const result = tokenIndex === tokens.length ? '' : null
        manualMemo.set(memoKey, result)
        return result
      }

      const ch = wordChars[wordIndex]
      if (!isKanjiChar(ch)) {
        // Most manual formats only list readings for kanji, so leave authored
        // kana in place. If a kana token is explicitly present, consume it
        // only when doing so allows the rest of the surface to align.
        const withoutToken = buildManual(wordIndex + 1, tokenIndex)
        if (withoutToken !== null) {
          const result = `${escapeHtml(ch)}${withoutToken}`
          manualMemo.set(memoKey, result)
          return result
        }
        const token = tokens[tokenIndex]
        if (
          token &&
          normalizeComparable(token) === normalizeComparable(ch)
        ) {
          const withToken = buildManual(wordIndex + 1, tokenIndex + 1)
          if (withToken !== null) {
            const result = `${escapeHtml(ch)}${withToken}`
            manualMemo.set(memoKey, result)
            return result
          }
        }
        manualMemo.set(memoKey, null)
        return null
      }

      const token = tokens[tokenIndex]
      if (!token) {
        manualMemo.set(memoKey, null)
        return null
      }
      const nextKana: string[] = []
      for (
        let nextIndex = wordIndex + 1;
        nextIndex < wordChars.length && !isKanjiChar(wordChars[nextIndex]);
        nextIndex += 1
      ) {
        if (!hasKana(wordChars[nextIndex])) break
        nextKana.push(wordChars[nextIndex])
      }
      const reading = stripMatchingTrailingOkurigana(token, nextKana.join(''))
      const rest = buildManual(wordIndex + 1, tokenIndex + 1)
      const result = rest === null ? null : `${buildRuby(ch, reading)}${rest}`
      manualMemo.set(memoKey, result)
      return result
    }
    const manual = buildManual(0, 0)
    if (manual !== null) return manual
  }

  const wordChars = Array.from(cleanWord)
  const pronChars = Array.from(compactPron)

  let output = ''
  let wordCursor = 0
  let pronCursor = 0

  while (wordCursor < wordChars.length) {
    const ch = wordChars[wordCursor]
    if (!isKanjiChar(ch)) {
      if (
        pronCursor < pronChars.length &&
        normalizeKanaComparable(pronChars[pronCursor]) ===
          normalizeKanaComparable(ch)
      ) {
        pronCursor += 1
      }
      output += escapeHtml(ch)
      wordCursor += 1
      continue
    }

    let runEnd = wordCursor
    while (runEnd < wordChars.length && isKanjiChar(wordChars[runEnd])) {
      runEnd += 1
    }
    const kanjiRun = wordChars.slice(wordCursor, runEnd).join('')

    const pronBoundary = findPronunciationBoundary(
      wordChars,
      runEnd,
      pronChars,
      pronCursor,
    )
    const pronRun = pronChars.slice(pronCursor, pronBoundary).join('')
    if (groupKanjiRun && pronRun) {
      output += buildRuby(kanjiRun, pronRun)
    } else {
      const readings = splitPronunciationForKanji(kanjiRun, pronRun)
      const kanjiChars = Array.from(kanjiRun)
      for (let i = 0; i < kanjiChars.length; i += 1) {
        const base = kanjiChars[i]
        const reading = readings[i] || ''
        output += reading ? buildRuby(base, reading) : escapeHtml(base)
      }
    }

    pronCursor = pronBoundary
    wordCursor = runEnd
  }

  if (!output) return escapeHtml(cleanWord)
  return output
}

const buildVocabularyTokenHtml = (
  surface: string,
  tokenHtml: string,
  className: string,
  additionalAttributes?: Record<string, string>,
) =>
  `<span class="${escapeHtml(className)}" data-vocab-token="true" data-vocab-surface="${escapeHtml(surface)}"${Object.entries(additionalAttributes || {})
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('')}>${tokenHtml}</span>`

export type JapaneseLexicalRange = {
  surface: string
  start: number
  end: number
}

/**
 * Find non-overlapping lexical ranges in the original source string.
 *
 * These offsets are JavaScript string offsets (the same UTF-16 coordinate
 * system used by DOM Range), and are deliberately calculated before any ruby
 * markup is generated. `rt` content is never part of this source coordinate
 * space.
 */
export const buildJapaneseLexicalRanges = (
  text: string,
  surfaces: string[],
  respectCompoundBoundary = true,
): JapaneseLexicalRange[] => {
  const candidatesByStart = new Map<number, JapaneseLexicalRange[]>()
  const uniqueSurfaces = Array.from(
    new Set(surfaces.map(surface => surface.trim()).filter(Boolean)),
  )

  uniqueSurfaces.forEach(surface => {
    let from = 0
    while (from <= text.length - surface.length) {
      const start = text.indexOf(surface, from)
      if (start < 0) break
      if (
        respectCompoundBoundary &&
        !isJapaneseSurfaceOccurrenceAllowed(text, start, surface)
      ) {
        from = start + Math.max(1, surface.length)
        continue
      }
      const candidates = candidatesByStart.get(start) || []
      candidates.push({
        surface,
        start,
        end: start + surface.length,
      })
      candidatesByStart.set(start, candidates)
      from = start + Math.max(1, surface.length)
    }
  })

  const ranges: JapaneseLexicalRange[] = []
  let cursor = 0
  while (cursor < text.length) {
    const candidates = candidatesByStart.get(cursor)
    const range = candidates?.reduce<JapaneseLexicalRange | undefined>(
      (longest, candidate) =>
        !longest || candidate.end - candidate.start > longest.end - longest.start
          ? candidate
          : longest,
      undefined,
    )
    if (!range) {
      cursor += 1
      continue
    }
    ranges.push(range)
    cursor = range.end
  }
  return ranges
}

export const annotateJapaneseText = (
  text: string,
  pronMap: Record<string, string>,
  options?: {
    rubyClassName?: string
    rtClassName?: string
    groupKanji?: boolean
    rubyEnabled?: boolean
    tokenClassName?: string
    lexicalBoundaries?: number[]
    occurrenceReadings?: Record<number, string>
    editableReadingSurfaces?: string[]
    tokenWords?: string[]
  },
) => {
  const entryByWord = new Map<string, { word: string; pron: string }>()
  Object.entries(pronMap)
    .filter(([word, pron]) => hasJapanese(word) && !!pron.trim())
    .forEach(([word, pron]) => entryByWord.set(word, { word, pron }))
  options?.tokenWords
    ?.map(word => word.trim())
    .filter(word => hasJapanese(word) && text.includes(word))
    .forEach(word => {
      if (!entryByWord.has(word)) {
        entryByWord.set(word, { word, pron: pronMap[word] || '' })
      }
    })
  const entries = [...entryByWord.values()].sort(
    (a, b) => b.word.length - a.word.length,
  )
  if (entries.length === 0) return escapeHtml(text)

  const entryBySurface = new Map(
    entries.map(entry => [entry.word, entry] as const),
  )
  const bestByStart = new Map<
    number,
    JapaneseLexicalRange & { word: string; pron: string }
  >()
  const boundaries = options?.lexicalBoundaries ? new Set(options.lexicalBoundaries) : null
  buildJapaneseLexicalRanges(
    text,
    entries.map(entry => entry.word),
  ).forEach(range => {
    if (boundaries && (!boundaries.has(range.start) || !boundaries.has(range.end))) return
    const entry = entryBySurface.get(range.surface)
    if (!entry) return
    bestByStart.set(range.start, {
      ...range,
      word: entry.word,
      pron: entry.pron,
    })
  })

  let cursor = 0
  let html = ''
  while (cursor < text.length) {
    const match = bestByStart.get(cursor)
    if (!match) {
      html += escapeHtml(text[cursor])
      cursor += 1
      continue
    }
    const tokenHtml =
      options?.rubyEnabled === false
        ? escapeHtml(match.word)
        : buildJapaneseRubyHtml(match.word, options?.occurrenceReadings?.[match.start] || match.pron, options)
    html += options?.tokenClassName
      ? buildVocabularyTokenHtml(match.word, tokenHtml, options.tokenClassName, {
          ...(options.editableReadingSurfaces?.includes(match.word) && match.pron ? { 'data-pronunciation-editable': 'true', role: 'button', tabindex: '0', 'aria-label': `修改「${match.word}」在此处的读音` } : {}),
          'data-vocab-start': String(match.start),
          'data-vocab-end': String(match.end),
        })
      : tokenHtml
    cursor = match.end
  }

  return html
}

export type JapaneseRubyLexeme = {
  surface: string
  dictionaryForm: string
  normalizedForm: string
  reading: string
  dictionaryReading: string
  partsOfSpeech: string[]
}

const shouldShowSudachiRuby = (
  lexeme: JapaneseRubyLexeme,
  pronunciation: string,
) =>
  hasKanji(lexeme.surface) &&
  Boolean(pronunciation.trim())

const buildBestLexemeMatches = (
  text: string,
  lexicon: Record<string, JapaneseRubyLexeme>,
) => {
  const entries = Object.values(lexicon).filter(item => item.surface)
  const lexemeBySurface = new Map(
    entries.map(lexeme => [lexeme.surface, lexeme] as const),
  )
  const bestByStart = new Map<
    number,
    JapaneseLexicalRange & { lexeme: JapaneseRubyLexeme; length: number }
  >()
  buildJapaneseLexicalRanges(
    text,
    entries.map(entry => entry.surface),
    false,
  ).forEach(range => {
    const lexeme = lexemeBySurface.get(range.surface)
    if (!lexeme) return
    bestByStart.set(range.start, {
      ...range,
      lexeme,
      length: range.end - range.start,
    })
  })
  return bestByStart
}

const buildBestSurfaceMatches = (text: string, surfaces: string[]) => {
  return new Map(
    buildJapaneseLexicalRanges(
      text,
      surfaces.filter(surface => hasJapanese(surface)),
    ).map(range => [range.start, range] as const),
  )
}

export const formatJapaneseTextWithRubyNotation = (
  text: string,
  pronunciationMap: Record<string, string>,
  occurrenceReadings: Record<number, string> = {},
) => {
  const entries = Object.entries(pronunciationMap)
    .filter(([word, pronunciation]) =>
      hasJapanese(word) && Boolean(pronunciation.trim()),
    )
    .sort((left, right) => right[0].length - left[0].length)
  const bestByStart = new Map<
    number,
    { word: string; pronunciation: string; length: number }
  >()
  entries.forEach(([word, pronunciation]) => {
    let from = 0
    while (from < text.length) {
      const start = text.indexOf(word, from)
      if (start === -1) break
      const previous = bestByStart.get(start)
      if (!previous || word.length > previous.length) {
        bestByStart.set(start, {
          word,
          pronunciation: pronunciation.trim(),
          length: word.length,
        })
      }
      from = start + 1
    }
  })

  let cursor = 0
  let output = ''
  while (cursor < text.length) {
    const match = bestByStart.get(cursor)
    if (!match) {
      output += text[cursor]
      cursor += 1
      continue
    }
    const reading = occurrenceReadings[cursor] || match.pronunciation
    output +=
      normalizeComparable(match.word) ===
      normalizeComparable(reading)
        ? match.word
        : `{${match.word}|${reading}}`
    cursor += match.length
  }
  return output
}

export const formatJapaneseTextWithSudachiRubyNotation = (
  text: string,
  lexicon: Record<string, JapaneseRubyLexeme>,
) => {
  const bestByStart = buildBestLexemeMatches(text, lexicon)
  let cursor = 0
  let output = ''
  while (cursor < text.length) {
    const match = bestByStart.get(cursor)
    if (!match) {
      output += text[cursor]
      cursor += 1
      continue
    }
    const pronunciation = match.lexeme.reading.trim()
    output += shouldShowSudachiRuby(match.lexeme, pronunciation)
      ? buildJapaneseRubyNotation(match.lexeme.surface, pronunciation)
      : match.lexeme.surface
    cursor += match.length
  }
  return output
}

const buildJapaneseRubyNotation = (word: string, pronunciation: string) => {
  // Same single judgment as the display path: only a genuine inline notation
  // takes the shortcut; suffix and literal cases align normally below.
  const inlineClass = classifyInlineKanaReading(word, pronunciation)
  if (inlineClass.kind === 'inline') {
    INLINE_KANA_READING_PATTERN.lastIndex = 0
    let cursor = 0
    let output = ''
    for (const match of word.matchAll(INLINE_KANA_READING_PATTERN)) {
      const start = match.index
      output += word.slice(cursor, start)
      output += `{${match[1]}|${match[3]}}${match[2]}${match[3]}${match[4]}`
      cursor = start + match[0].length
    }
    return output + word.slice(cursor)
  }
  if (hasKanji(word) && hasNumber(word)) {
    const mixedNumeric = resolveMixedNumericReading(word, pronunciation)
    return mixedNumeric
      ? `${mixedNumeric.number}{${mixedNumeric.units}|${mixedNumeric.reading}}`
      : word
  }
  const wordChars = Array.from(word)
  const pronunciationChars = Array.from(
    (inlineClass.kind === 'suffix'
      ? inlineClass.stemReading
      : pronunciation
    ).replace(/[\s\u3000]+/g, ''),
  )
  let output = ''
  let wordCursor = 0
  let pronunciationCursor = 0

  while (wordCursor < wordChars.length) {
    const character = wordChars[wordCursor]
    if (!isKanjiChar(character)) {
      if (
        normalizeKanaComparable(pronunciationChars[pronunciationCursor] || '') ===
        normalizeKanaComparable(character)
      ) {
        pronunciationCursor += 1
      }
      output += character
      wordCursor += 1
      continue
    }

    let runEnd = wordCursor
    while (runEnd < wordChars.length && isKanjiChar(wordChars[runEnd])) {
      runEnd += 1
    }
    const kanjiRun = wordChars.slice(wordCursor, runEnd).join('')
    const pronunciationEnd = findPronunciationBoundary(
      wordChars,
      runEnd,
      pronunciationChars,
      pronunciationCursor,
    )
    const reading = pronunciationChars
      .slice(pronunciationCursor, pronunciationEnd)
      .join('')
    output += reading ? `{${kanjiRun}|${reading}}` : kanjiRun
    pronunciationCursor = pronunciationEnd
    wordCursor = runEnd
  }

  return output
}

export const annotateJapaneseTextWithSudachi = (
  text: string,
  lexicon: Record<string, JapaneseRubyLexeme>,
  options?: {
    pronunciationMap?: Record<string, string>
    useSudachiReading?: boolean
    rubyEnabled?: boolean
    rubyClassName?: string
    rtClassName?: string
    tokenClassName?: string
    tokenWords?: string[]
  },
) => {
  const bestByStart = buildBestLexemeMatches(text, lexicon)
  const lexicalTokenByStart = buildBestSurfaceMatches(
    text,
    options?.tokenWords || [],
  )
  if (bestByStart.size === 0 && lexicalTokenByStart.size === 0) {
    return escapeHtml(text)
  }

  const tokenClassName = options?.tokenClassName || 'vocab-token'
  const renderLexemeContent = (lexeme: JapaneseRubyLexeme) => {
    const pronunciation = options?.useSudachiReading
      ? lexeme.reading
      : (
          options?.pronunciationMap?.[lexeme.surface] ||
          options?.pronunciationMap?.[lexeme.dictionaryForm] ||
          ''
        ).trim()
    return options?.rubyEnabled &&
      pronunciation &&
      (!options.useSudachiReading || shouldShowSudachiRuby(lexeme, pronunciation))
      ? buildJapaneseRubyHtml(lexeme.surface, pronunciation, {
          rubyClassName: options.rubyClassName,
          rtClassName: options.rtClassName,
          groupKanji: Boolean(options.useSudachiReading),
        })
      : escapeHtml(lexeme.surface)
  }
  const renderRange = (start: number, end: number) => {
    let rangeCursor = start
    let rangeHtml = ''
    const lexemes: JapaneseRubyLexeme[] = []
    while (rangeCursor < end) {
      const match = bestByStart.get(rangeCursor)
      if (!match || rangeCursor + match.length > end) {
        rangeHtml += escapeHtml(text[rangeCursor])
        rangeCursor += 1
        continue
      }
      rangeHtml += renderLexemeContent(match.lexeme)
      lexemes.push(match.lexeme)
      rangeCursor += match.length
    }
    return { html: rangeHtml, lexemes }
  }

  let cursor = 0
  let html = ''
  while (cursor < text.length) {
    const lexicalToken = lexicalTokenByStart.get(cursor)
    if (lexicalToken) {
      const tokenEnd = lexicalToken.end
      const renderedRange = renderRange(cursor, tokenEnd)
      html += buildVocabularyTokenHtml(
        lexicalToken.surface,
        renderedRange.html,
        tokenClassName,
        {
          'data-vocab-start': String(lexicalToken.start),
          'data-vocab-end': String(lexicalToken.end),
          'data-sudachi-token': 'true',
          'data-sudachi-surface': lexicalToken.surface,
          'data-sudachi-lemma': lexicalToken.surface,
          'data-sudachi-normalized': lexicalToken.surface,
          'data-sudachi-reading': renderedRange.lexemes
            .map(lexeme => lexeme.dictionaryReading || lexeme.reading)
            .join(''),
          'data-sudachi-pos': renderedRange.lexemes[0]?.partsOfSpeech?.[0] || '',
        },
      )
      cursor = tokenEnd
      continue
    }

    const match = bestByStart.get(cursor)
    if (!match) {
      html += escapeHtml(text[cursor])
      cursor += 1
      continue
    }

    const { lexeme } = match
    const tokenHtml = renderLexemeContent(lexeme)
    const partOfSpeech = lexeme.partsOfSpeech?.[0] || ''
    html += `<span class="${escapeHtml(tokenClassName)}" data-vocab-token="true" data-vocab-surface="${escapeHtml(lexeme.surface)}" data-vocab-start="${match.start}" data-vocab-end="${match.end}" data-sudachi-token="true" data-sudachi-surface="${escapeHtml(lexeme.surface)}" data-sudachi-lemma="${escapeHtml(lexeme.dictionaryForm || lexeme.surface)}" data-sudachi-normalized="${escapeHtml(lexeme.normalizedForm || lexeme.dictionaryForm || lexeme.surface)}" data-sudachi-reading="${escapeHtml(lexeme.dictionaryReading || lexeme.reading || '')}" data-sudachi-pos="${escapeHtml(partOfSpeech)}">${tokenHtml}</span>`
    cursor += match.length
  }

  return html
}
