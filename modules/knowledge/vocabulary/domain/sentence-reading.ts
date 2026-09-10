import type { VocabularyPronunciationData } from './pronunciation.ts'

const normalizeReading = (value: string) => value.normalize('NFKC').replace(
  /[ァ-ヶ]/g,
  character => String.fromCharCode(character.charCodeAt(0) - 0x60),
)

/** Context may select an authored alternative, but must not invent a personal reading. */
export function selectSentenceOccurrenceReading(
  text: string,
  start: number,
  surface: string,
  candidates: string[],
  fallback: string,
  data?: VocabularyPronunciationData | null,
): string {
  if (!data || data.segments.map(segment => segment.text).join('') !== text ||
    text.slice(start, start + surface.length) !== surface) return fallback
  let cursor = 0
  let reading = ''
  let covered = 0
  for (const segment of data.segments) {
    const end = cursor + segment.text.length
    if (cursor >= start && end <= start + surface.length) {
      reading += segment.reading || segment.text
      covered += segment.text.length
    }
    cursor = end
  }
  if (covered !== surface.length || !reading) return fallback
  return candidates.find(candidate => normalizeReading(candidate) === normalizeReading(reading)) || fallback
}
