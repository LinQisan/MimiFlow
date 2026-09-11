import type { SudachiLexeme, SudachiToken } from './sudachi.ts'
import { formatJapaneseTextWithSudachiRubyNotation } from '../../../utils/language/japaneseRuby.ts'

/**
 * Format one analyzed text from its occurrence-level Sudachi tokens.
 *
 * The shared lexicon keeps only one entry per surface, so it cannot represent
 * two readings for the same surface in a batch. Sudachi token offsets provide
 * that missing occurrence context. They are validated against the original
 * text before use; malformed or incompatible offsets use the lexicon formatter
 * so this path never drops or rewrites source characters.
 * Sudachi reports offsets in Unicode code points, while JavaScript slices by
 * UTF-16 units, hence the explicit boundary map.
 */
export function formatJapaneseTextWithSudachiTokens(
  text: string,
  tokens: SudachiToken[],
  textIndex: number,
  fallbackLexicon: Record<string, SudachiLexeme>,
): string {
  const fallback = () =>
    formatJapaneseTextWithSudachiRubyNotation(text, fallbackLexicon)
  const contextualTokens = tokens
    .filter(token => token.textIndex === textIndex)
    .sort((left, right) => left.begin - right.begin || left.end - right.end)
  if (contextualTokens.length === 0) return fallback()

  const boundaries = [0]
  let jsOffset = 0
  for (const character of text) {
    jsOffset += character.length
    boundaries.push(jsOffset)
  }

  let cursor = 0
  let notation = ''
  for (const token of contextualTokens) {
    if (
      !Number.isInteger(token.begin) ||
      !Number.isInteger(token.end) ||
      token.begin < 0 ||
      token.end <= token.begin ||
      token.end >= boundaries.length
    ) {
      return fallback()
    }
    const start = boundaries[token.begin]
    const end = boundaries[token.end]
    if (start < cursor || text.slice(start, end) !== token.surface) {
      return fallback()
    }

    notation += text.slice(cursor, start)
    notation += token.reading.trim()
      ? formatJapaneseTextWithSudachiRubyNotation(text.slice(start, end), {
          [token.surface]: token,
        })
      : text.slice(start, end)
    cursor = end
  }

  return notation + text.slice(cursor)
}
