import { buildJapaneseRubyHtml } from '../../../../utils/language/japaneseRuby.ts'

const escapeHtml = (text?: string | null) =>
  (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const KANJI_SURFACE_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff々〆ヵヶ]/

// Version 4 invalidates entries materialized before contextual token readings
// and the narrow Sudachi 交通の便 correction were applied.
export const PRONUNCIATION_VERSION = 4

export type PronunciationSegment = {
  text: string
  reading?: string
}

export type RubyHighlightRange = {
  start: number
  end: number
}

export type VocabularyPronunciationData = {
  segments: PronunciationSegment[]
  reading?: string
}

export function isPronunciationUpToDate(item: {
  pronunciationData?: unknown
  pronunciationVersion?: number | null
}): boolean {
  if (!item || !item.pronunciationData) return false
  if (item.pronunciationVersion !== PRONUNCIATION_VERSION) return false
  const normalized = normalizePronunciationData(item.pronunciationData)
  return Boolean(normalized && normalized.segments && normalized.segments.length > 0)
}

export function normalizePronunciationData(
  data: unknown,
): VocabularyPronunciationData | null {
  if (!data) return null
  let parsed: unknown = data
  if (typeof data === 'string') {
    try {
      parsed = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.segments)) return null

  const segments: PronunciationSegment[] = []
  for (const item of obj.segments) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.text !== 'string' || !row.text) continue
    segments.push({
      text: row.text,
      ...(typeof row.reading === 'string' && row.reading.trim()
        ? { reading: row.reading.trim() }
        : {}),
    })
  }

  if (segments.length === 0) return null
  const reading = typeof obj.reading === 'string' ? obj.reading.trim() : undefined

  return { segments, ...(reading ? { reading } : {}) }
}

export function parseRubyNotationToSegments(
  notation: string,
): PronunciationSegment[] {
  if (!notation) return []
  const segments: PronunciationSegment[] = []
  let cursor = 0
  while (cursor < notation.length) {
    const braceStart = notation.indexOf('{', cursor)
    if (braceStart === -1) {
      segments.push({ text: notation.slice(cursor) })
      break
    }
    if (braceStart > cursor) {
      segments.push({ text: notation.slice(cursor, braceStart) })
    }

    const braceEnd = notation.indexOf('}', braceStart + 1)
    const separator = notation.indexOf('|', braceStart + 1)
    if (
      braceEnd > separator &&
      separator > braceStart + 1 &&
      braceEnd > separator + 1
    ) {
      segments.push({
        text: notation.slice(braceStart + 1, separator),
        reading: notation.slice(separator + 1, braceEnd).trim(),
      })
      cursor = braceEnd + 1
      continue
    }

    // Keep malformed or literal braces in the source instead of silently
    // dropping the remainder of the notation.
    segments.push({ text: '{' })
    cursor = braceStart + 1
  }
  return segments
}

export function renderRubySegmentsHtml(
  segments: PronunciationSegment[],
  options?: {
    rubyClassName?: string
    rtClassName?: string
    highlightClassName?: string
    highlightRanges?: RubyHighlightRange[]
  },
): string {
  if (!segments || segments.length === 0) return ''

  const ranges = (options?.highlightRanges || [])
    .map(range => ({
      start: Math.max(0, Math.min(range.start, range.end)),
      end: Math.max(range.start, range.end),
    }))
    .filter(range => range.end > range.start)
    .sort((left, right) => left.start - right.start)
  const highlightClass = options?.highlightClassName
    ? escapeHtml(options.highlightClassName)
    : ''
  let cursor = 0

  const renderSegment = (seg: PronunciationSegment) => {
    if (!seg.reading || !KANJI_SURFACE_PATTERN.test(seg.text)) {
      return escapeHtml(seg.text)
    }
    return buildJapaneseRubyHtml(seg.text, seg.reading, {
      rubyClassName: options?.rubyClassName,
      rtClassName: options?.rtClassName,
      groupKanji: true,
    })
  }

  const wrapHighlight = (html: string) =>
    highlightClass ? `<span class="${highlightClass}">${html}</span>` : html

  return segments
    .map(seg => {
      const start = cursor
      const end = start + seg.text.length
      cursor = end
      const overlaps = ranges.filter(
        range => range.start < end && range.end > start,
      )
      if (overlaps.length === 0 || !highlightClass) {
        return renderSegment(seg)
      }

      // A ruby segment is kept intact when a match cuts through it, because
      // its reading belongs to the complete surface. Sentence tokenization
      // normally aligns matches to segment boundaries; this fallback keeps
      // the reading correct for the few compound/substring cases that do not.
      if (seg.reading && KANJI_SURFACE_PATTERN.test(seg.text)) {
        return wrapHighlight(renderSegment(seg))
      }

      const boundaries = new Set<number>([start, end])
      overlaps.forEach(range => {
        boundaries.add(Math.max(start, range.start))
        boundaries.add(Math.min(end, range.end))
      })
      const sortedBoundaries = [...boundaries].sort((left, right) => left - right)
      return sortedBoundaries
        .slice(0, -1)
        .map((pieceStart, index) => {
          const pieceEnd = sortedBoundaries[index + 1]
          const piece = escapeHtml(
            seg.text.slice(pieceStart - start, pieceEnd - start),
          )
          const highlighted = overlaps.some(
            range => range.start <= pieceStart && range.end >= pieceEnd,
          )
          return highlighted ? wrapHighlight(piece) : piece
        })
        .join('')
    })
    .join('')
}
