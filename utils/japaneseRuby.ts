const KANA_REGEX = /[\u3040-\u30ffー]/
const KANJI_REGEX = /[\u4e00-\u9fff]/

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isKanaChar = (ch: string) => KANA_REGEX.test(ch)
const hasKanji = (text: string) => KANJI_REGEX.test(text)

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
  if (!cleanWord) return ''
  if (!cleanPron || !hasKanji(cleanWord)) return escapeHtml(cleanWord)

  const wordChars = Array.from(cleanWord)
  const pronChars = Array.from(cleanPron)

  let prefix = 0
  while (
    prefix < wordChars.length &&
    prefix < pronChars.length &&
    wordChars[prefix] === pronChars[prefix] &&
    isKanaChar(wordChars[prefix])
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < wordChars.length - prefix &&
    suffix < pronChars.length - prefix &&
    wordChars[wordChars.length - 1 - suffix] ===
      pronChars[pronChars.length - 1 - suffix] &&
    isKanaChar(wordChars[wordChars.length - 1 - suffix])
  ) {
    suffix += 1
  }

  const prefixWord = wordChars.slice(0, prefix).join('')
  const suffixWord = suffix > 0 ? wordChars.slice(wordChars.length - suffix).join('') : ''
  const coreWord = wordChars.slice(prefix, wordChars.length - suffix).join('')
  const corePron = pronChars.slice(prefix, pronChars.length - suffix).join('')

  if (!coreWord || !corePron || !hasKanji(coreWord)) {
    return `<ruby${options?.rubyClassName ? ` class="${options.rubyClassName}"` : ''}>${escapeHtml(cleanWord)}<rt${options?.rtClassName ? ` class="${options.rtClassName}"` : ''}>${escapeHtml(cleanPron)}</rt></ruby>`
  }

  return `${escapeHtml(prefixWord)}<ruby${options?.rubyClassName ? ` class="${options.rubyClassName}"` : ''}>${escapeHtml(coreWord)}<rt${options?.rtClassName ? ` class="${options.rtClassName}"` : ''}>${escapeHtml(corePron)}</rt></ruby>${escapeHtml(suffixWord)}`
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
    .filter(([word, pron]) => hasKanji(word) && !!pron.trim())
    .sort((a, b) => b[0].length - a[0].length)
  if (entries.length === 0) return text

  let html = text
  for (const [word, pron] of entries) {
    const regex = new RegExp(escapeRegex(word), 'g')
    const rubyHtml = buildJapaneseRubyHtml(word, pron, options)
    html = html.replace(regex, rubyHtml)
  }
  return html
}

