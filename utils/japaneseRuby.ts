const KANA_REGEX = /[\u3040-\u30ffー]/
const KANJI_REGEX = /[\u4e00-\u9fff]/

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const isKanaChar = (ch: string) => KANA_REGEX.test(ch)
const isKanjiChar = (ch: string) => KANJI_REGEX.test(ch)
const hasKanji = (text: string) => KANJI_REGEX.test(text)
const hasJapanese = (text: string) => /[\u3040-\u30ffー\u4e00-\u9fff]/.test(text)
const normalizeComparable = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()

export const buildJapaneseRubyHtml = (
  word: string,
  pronunciation: string,
  options?: {
    rubyClassName?: string
    rtClassName?: string
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
    `<ruby${rubyClass}>${escapeHtml(base)}<rt${rtClass}>${escapeHtml(pron)}</rt></ruby>`

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
      wordChars[prefix] === pronChars[prefix]
    ) {
      prefix += 1
    }

    let suffix = 0
    while (
      suffix < wordChars.length - prefix &&
      suffix < pronChars.length - prefix &&
      wordChars[wordChars.length - 1 - suffix] ===
        pronChars[pronChars.length - 1 - suffix]
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

  // 手动拆分优先：例如 人間 -> にん|げん 或 にん げん（按汉字个数对应）
  if (cleanPron.includes('|') || /[\s\u3000]/.test(cleanPron)) {
    const tokens = cleanPron
      .split(/[|｜\s\u3000]+/)
      .map(item => item.trim())
      .filter(Boolean)
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
      const take = i === kanjiChars.length - 1
        ? leftPronLen
        : Math.max(1, Math.floor((leftPronLen - minNeed) / remainCount(i) + 1))
      const nextCursor = Math.min(chars.length, cursor + take)
      result.push(chars.slice(cursor, nextCursor).join(''))
      cursor = nextCursor
    }
    return result
  }

  let output = ''
  let wordCursor = 0
  let pronCursor = 0

  while (wordCursor < wordChars.length) {
    const ch = wordChars[wordCursor]
    if (!isKanjiChar(ch)) {
      if (pronCursor < pronChars.length && pronChars[pronCursor] === ch) {
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

    const nextLiteral = wordChars
      .slice(runEnd)
      .find(char => !isKanjiChar(char) && char.trim().length > 0)
    let pronBoundary = pronChars.length
    if (nextLiteral) {
      const searchStart = pronCursor
      for (let i = searchStart; i < pronChars.length; i += 1) {
        if (pronChars[i] === nextLiteral) {
          pronBoundary = i
          break
        }
      }
    }
    const pronRun = pronChars.slice(pronCursor, pronBoundary).join('')
    const readings = splitPronunciationForKanji(kanjiRun, pronRun)
    const kanjiChars = Array.from(kanjiRun)
    for (let i = 0; i < kanjiChars.length; i += 1) {
      const base = kanjiChars[i]
      const reading = readings[i] || ''
      output += reading ? buildRuby(base, reading) : escapeHtml(base)
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
  },
) => {
  const entries = Object.entries(pronMap)
    .filter(([word, pron]) => hasJapanese(word) && !!pron.trim())
    .sort((a, b) => b[0].length - a[0].length)
  if (entries.length === 0) return text

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
