/** Shared kana comparison and okurigana alignment for every ruby renderer. */
const KANJI_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]/
export const isKanjiChar = (text: string) => KANJI_PATTERN.test(text)

export const normalizeKanaComparable = (value: string) =>
  Array.from(value.normalize('NFKC'))
    .map(character => {
      const codepoint = character.codePointAt(0) || 0
      return codepoint >= 0x30a1 && codepoint <= 0x30f6
        ? String.fromCodePoint(codepoint - 0x60)
        : character
    })
    .join('')

export const stripMatchingTrailingOkurigana = (reading: string, suffix: string) => {
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
export const findPronunciationBoundary = (
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

  // A terminal kana run is anchored to the END of the complete reading.
  // 素直な / すなおな must retain すなお on 素直, rather than stopping at
  // the な inside that stem. Internal okurigana still use forward matching.
  if (runEnd + literalRun.length === wordChars.length) {
    // Inflected tokens can contain only part of the written ending. Accept
    // that prefix only at the end of the reading, never inside its stem.
    for (let length = literalRun.length; length > 0; length -= 1) {
      const suffixStart = pronChars.length - length
      if (
        suffixStart > pronCursor &&
        literalRun.slice(0, length).every((character, offset) =>
          normalizeKanaComparable(character) ===
          normalizeKanaComparable(pronChars[suffixStart + offset]),
        )
      ) return suffixStart
    }
    return pronChars.length
  }

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
