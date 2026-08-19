import { parseMultiQuizText } from './quiz-text-parser.ts'

const CIRCLED_OPTION_NUMBERS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

function normalizeOptionText(text: string) {
  return text.trim().replace(/\s+([。！？!?])/g, '$1')
}

function parseNumberedLines(text: string) {
  const options = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(
        new RegExp(
          `^(?:[（(]?)(?:\\d+|[A-Ha-h]|[${CIRCLED_OPTION_NUMBERS}])(?:[.．、:：)）\\]]?)[\\t 　]+(.+)$`,
        ),
      )
      return match ? normalizeOptionText(match[1]) : null
    })

  return options.length >= 2 && options.every(Boolean)
    ? (options as string[])
    : []
}

export function parseListeningOptionText(text: string) {
  // Option-only paste is the common path here. Parse it before the full quiz
  // parser so the first line (for example `1 option`) is not mistaken for a
  // question number.
  const numberedLines = parseNumberedLines(text)
  if (numberedLines.length >= 2) return numberedLines

  const draft = parseMultiQuizText(text)[0]
  if (!draft || draft.options.length < 2) return []

  return draft.options
    .map(option => normalizeOptionText(option.text))
    .filter(Boolean)
}
