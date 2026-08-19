const cleanInlineSelectionText = (value: string) =>
  value.replace(/\s+/g, ' ').trim()

const stripContextUiChrome = (value: string) =>
  (() => {
    let next = cleanInlineSelectionText(value)
    const leadingPatterns = [
      /^#\d+\s*/,
      /^(已收藏|收藏)\s*/,
      /^(笔记\*?|笔记)\s*/,
      /^(收起编辑|编辑)\s*/,
      /^(取消|保存笔记)\s*/,
    ]
    let changed = true
    while (changed && next) {
      changed = false
      for (const pattern of leadingPatterns) {
        const replaced = next.replace(pattern, '').trim()
        if (replaced !== next) {
          next = replaced
          changed = true
        }
      }
    }
    return next
  })()

export function extractSentenceContainingSelection(
  text: string,
  selectedText: string,
) {
  const normalizedText = stripContextUiChrome(text)
  const normalizedSelection = cleanInlineSelectionText(selectedText)
  if (!normalizedText || !normalizedSelection) return ''

  const selectionIndex = normalizedText
    .toLowerCase()
    .indexOf(normalizedSelection.toLowerCase())
  if (selectionIndex >= 0) {
    return extractSentenceAtOffset(normalizedText, selectionIndex)
  }

  // A short, single context block is still a useful sentence even when DOM
  // normalization changed the selected surface. Never fall back to a
  // multi-sentence article or transcript.
  const parts = splitSentenceSegments(normalizedText)
  return parts.length === 1 && normalizedText.length <= 500
    ? normalizedText
    : ''
}

const SENTENCE_END = new Set(['。', '！', '？', '!', '?', '.'])
const OPENING_QUOTES = new Map([
  ['「', '」'],
  ['『', '』'],
  ['“', '”'],
  ['‘', '’'],
  ['（', '）'],
  ['(', ')'],
  ['【', '】'],
])
const CLOSING_QUOTES = new Set(OPENING_QUOTES.values())
const QUOTED_SENTENCE_CONTINUATIONS = [
  'と',
  'って',
  'が',
  'を',
  'に',
  'へ',
  'で',
  'も',
  'の',
  'から',
  'まで',
  'より',
  'など',
]

type SentenceSegment = { text: string; start: number; end: number }

function isSentenceEnding(text: string, index: number) {
  const char = text[index]
  if (!SENTENCE_END.has(char)) return false
  if (char !== '.') return true
  return !(/\d/.test(text[index - 1] || '') && /\d/.test(text[index + 1] || ''))
}

function splitSentenceSegmentRanges(text: string): SentenceSegment[] {
  const segments: SentenceSegment[] = []
  const quoteStack: string[] = []
  let start = 0
  let index = 0

  while (index < text.length) {
    const char = text[index]
    const expectedClose = OPENING_QUOTES.get(char)
    if (expectedClose) {
      quoteStack.push(expectedClose)
      index += 1
      continue
    }
    if (CLOSING_QUOTES.has(char)) {
      if (quoteStack.at(-1) === char) quoteStack.pop()
      index += 1
      continue
    }
    if (!isSentenceEnding(text, index)) {
      index += 1
      continue
    }

    const endedInsideQuote = quoteStack.length > 0
    let end = index + 1
    while (end < text.length && isSentenceEnding(text, end)) end += 1
    while (end < text.length && CLOSING_QUOTES.has(text[end])) {
      if (quoteStack.at(-1) === text[end]) quoteStack.pop()
      end += 1
    }
    while (end < text.length && /\s/.test(text[end])) end += 1

    const remaining = text.slice(end)
    const continuesQuotedSentence =
      endedInsideQuote &&
      QUOTED_SENTENCE_CONTINUATIONS.some(token => remaining.startsWith(token))
    if (quoteStack.length > 0 || continuesQuotedSentence) {
      index = end
      continue
    }

    const segmentText = text.slice(start, end).trim()
    if (segmentText) segments.push({ text: segmentText, start, end })
    start = end
    index = end
  }

  const tail = text.slice(start).trim()
  if (tail) segments.push({ text: tail, start, end: text.length })
  return segments
}

export function splitSentenceSegments(text: string) {
  return splitSentenceSegmentRanges(stripContextUiChrome(text)).map(
    segment => segment.text,
  )
}

export function extractSentenceAtOffset(text: string, offset: number) {
  const normalizedText = stripContextUiChrome(text)
  if (!normalizedText) return ''
  const safeOffset = Math.max(0, Math.min(normalizedText.length - 1, offset))
  const matched = splitSentenceSegmentRanges(normalizedText).find(
    segment => safeOffset >= segment.start && safeOffset < segment.end,
  )
  return matched?.text || ''
}
