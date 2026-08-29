const KANJI_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]/

export const escapeHtml = (text: string) =>
  text
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
const hasInlineKanaReading = (text: string) => {
  INLINE_KANA_READING_PATTERN.lastIndex = 0
  return INLINE_KANA_READING_PATTERN.test(text)
}
const hasJapanese = (text: string) => /[\u3040-\u30ffー\u4e00-\u9fff]/.test(text)
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
  const compactPron = cleanPron.replace(/[\s\u3000]+/g, '')
  if (!cleanWord) return ''
  if (!cleanPron) return escapeHtml(cleanWord)
  const rubyClass = options?.rubyClassName
    ? ` class="${options.rubyClassName}"`
    : ''
  const rtClass = options?.rtClassName ? ` class="${options.rtClassName}"` : ''
  const buildRuby = (base: string, pron: string) =>
    `<ruby${rubyClass}>${escapeHtml(base)}<rt${rtClass} aria-hidden="true" data-context-ignore="true">${escapeHtml(pron)}</rt></ruby>`

  // Sudachi keeps an authored reading such as 辿（たど）っ inside one token and
  // may report たどっ for the whole token. Use the authored kana for the kanji
  // ruby so the following small っ is not pulled into the annotation.
  if (hasInlineKanaReading(cleanWord)) {
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
    const kanjiChars = wordChars.filter(isKanjiChar)
    if (tokens.length === kanjiChars.length) {
      let tokenIndex = 0
      const manual = wordChars
        .map(ch => {
          if (!isKanjiChar(ch)) return escapeHtml(ch)
          const reading = tokens[tokenIndex] || ''
          tokenIndex += 1
          return reading ? buildRuby(ch, reading) : escapeHtml(ch)
        })
        .join('')
      if (manual) return manual
    }
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
    if (options?.groupKanji && pronRun) {
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

export const annotateJapaneseText = (
  text: string,
  pronMap: Record<string, string>,
  options?: {
    rubyClassName?: string
    rtClassName?: string
    groupKanji?: boolean
  },
) => {
  const entries = Object.entries(pronMap)
    .filter(([word, pron]) => hasJapanese(word) && !!pron.trim())
    .sort((a, b) => b[0].length - a[0].length)
  if (entries.length === 0) return escapeHtml(text)

  const bestByStart = new Map<number, { word: string; pron: string; length: number }>()
  for (const [word, pron] of entries) {
    let from = 0
    while (from < text.length) {
      const start = text.indexOf(word, from)
      if (start === -1) break
      const prev = bestByStart.get(start)
      if (!prev || word.length > prev.length) {
        bestByStart.set(start, { word, pron, length: word.length })
      }
      from = start + 1
    }
  }

  let cursor = 0
  let html = ''
  while (cursor < text.length) {
    const match = bestByStart.get(cursor)
    if (!match) {
      html += escapeHtml(text[cursor])
      cursor += 1
      continue
    }
    html += buildJapaneseRubyHtml(match.word, match.pron, options)
    cursor += match.length
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
  const entries = Object.values(lexicon)
    .filter(item => item.surface && text.includes(item.surface))
    .sort((left, right) => right.surface.length - left.surface.length)
  const bestByStart = new Map<
    number,
    { lexeme: JapaneseRubyLexeme; length: number }
  >()
  entries.forEach(lexeme => {
    let from = 0
    while (from < text.length) {
      const start = text.indexOf(lexeme.surface, from)
      if (start === -1) break
      const previous = bestByStart.get(start)
      if (!previous || lexeme.surface.length > previous.length) {
        bestByStart.set(start, { lexeme, length: lexeme.surface.length })
      }
      from = start + 1
    }
  })
  return bestByStart
}

export const formatJapaneseTextWithRubyNotation = (
  text: string,
  pronunciationMap: Record<string, string>,
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
    output +=
      normalizeComparable(match.word) ===
      normalizeComparable(match.pronunciation)
        ? match.word
        : `{${match.word}|${match.pronunciation}}`
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
  if (hasInlineKanaReading(word)) {
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
  const pronunciationChars = Array.from(pronunciation.replace(/[\s\u3000]+/g, ''))
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
  },
) => {
  const bestByStart = buildBestLexemeMatches(text, lexicon)
  if (bestByStart.size === 0) return escapeHtml(text)

  let cursor = 0
  let html = ''
  while (cursor < text.length) {
    const match = bestByStart.get(cursor)
    if (!match) {
      html += escapeHtml(text[cursor])
      cursor += 1
      continue
    }

    const { lexeme } = match
    const pronunciation = options?.useSudachiReading
      ? lexeme.reading
      : (
          options?.pronunciationMap?.[lexeme.surface] ||
          options?.pronunciationMap?.[lexeme.dictionaryForm] ||
          ''
        ).trim()
    const tokenHtml =
      options?.rubyEnabled &&
      pronunciation &&
      (!options.useSudachiReading ||
        shouldShowSudachiRuby(lexeme, pronunciation))
        ? buildJapaneseRubyHtml(lexeme.surface, pronunciation, {
            rubyClassName: options.rubyClassName,
            rtClassName: options.rtClassName,
            groupKanji: Boolean(options.useSudachiReading),
          })
        : escapeHtml(lexeme.surface)
    const partOfSpeech = lexeme.partsOfSpeech[0] || ''
    html += `<span data-sudachi-token="true" data-sudachi-surface="${escapeHtml(lexeme.surface)}" data-sudachi-lemma="${escapeHtml(lexeme.dictionaryForm)}" data-sudachi-normalized="${escapeHtml(lexeme.normalizedForm)}" data-sudachi-reading="${escapeHtml(lexeme.dictionaryReading || lexeme.reading)}" data-sudachi-pos="${escapeHtml(partOfSpeech)}">${tokenHtml}</span>`
    cursor += match.length
  }

  return html
}
