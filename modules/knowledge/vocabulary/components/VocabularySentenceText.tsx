import { selectSentenceOccurrenceReading } from '@/modules/knowledge/vocabulary/domain/sentence-reading'
import {
  annotateJapaneseTextWithSudachi,
  buildJapaneseRubyHtml,
  escapeHtml,
  type JapaneseRubyLexeme,
} from '@/utils/language/japaneseRuby'
import {
  buildJapaneseVocabularySearchTerms,
  containsJapaneseVocabularyMatch,
} from '@/utils/vocabulary/japaneseInflection'

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

import {
  renderRubySegmentsHtml,
  type VocabularyPronunciationData,
} from '@/modules/knowledge/vocabulary/domain/pronunciation'

const SENTENCE_RUBY_CLASS = 'jp-ruby vocab-sentence-ruby'
const SENTENCE_RUBY_RT_CLASS = 'jp-ruby-rt vocab-sentence-ruby-rt'
const SENTENCE_TEXT_CLASS = 'vocab-sentence-text font-reading-body-ja'

export default function VocabularySentenceText({
  text,
  word,
  pronunciation,
  pronunciationData,
  matchVariants = [],
  partsOfSpeech = [],
  highlightClass,
  showPronunciation,
  pronunciationSource = 'personal',
  sudachiLexicon = {},
}: {
  text: string
  word: string
  pronunciation: string
  pronunciationData?: VocabularyPronunciationData | null
  matchVariants?: string[]
  partsOfSpeech?: string[]
  highlightClass: string
  showPronunciation: boolean
  pronunciationSource?: 'sudachi' | 'personal'
  sudachiLexicon?: Record<string, JapaneseRubyLexeme>
}) {
  if (!word) return <span>{text}</span>

  const additionalVariantSet = new Set(matchVariants.slice(1))
  const matchedSurfaces = buildJapaneseVocabularySearchTerms(
    word,
    partsOfSpeech,
    matchVariants.length > 0 ? matchVariants : [pronunciation],
  )
    .filter(surface =>
      containsJapaneseVocabularyMatch(
        text,
        surface,
        additionalVariantSet.has(surface),
      ),
    )
    .sort((left, right) => right.length - left.length)

  const sudachiAnnotate =
    showPronunciation &&
    pronunciationSource === 'sudachi' &&
    Object.keys(sudachiLexicon).length > 0
      ? (value: string) =>
          annotateJapaneseTextWithSudachi(value, sudachiLexicon, {
            useSudachiReading: true,
            rubyEnabled: true,
            rubyClassName: SENTENCE_RUBY_CLASS,
            rtClassName: SENTENCE_RUBY_RT_CLASS,
          })
      : null

  const materializedRubyRanges = matchedSurfaces.length
    ? Array.from(
        text.matchAll(
          new RegExp(
            `(${matchedSurfaces.map(escapeRegExp).join('|')})`,
            'gu',
          ),
        ),
      ).flatMap(match =>
        typeof match.index === 'number'
          ? [{ start: match.index, end: match.index + match[0].length }]
          : [],
      )
    : []

  // The DB materialization is the stable Sudachi source for this page. Use it
  // for the complete sentence even when the matched vocabulary is an inflected
  // surface (e.g. 持ち合わせて), instead of falling back to plain text when
  // the runtime lexicon is intentionally empty.
  if (
    showPronunciation &&
    pronunciationSource === 'sudachi' &&
    pronunciationData?.segments &&
    pronunciationData.segments.map(segment => segment.text).join('') === text
  ) {
    const materializedText = pronunciationData.segments
      .map(segment => segment.text)
      .join('')
    const html = renderRubySegmentsHtml(pronunciationData.segments, {
      rubyClassName: SENTENCE_RUBY_CLASS,
      rtClassName: SENTENCE_RUBY_RT_CLASS,
      ...(materializedText === text && materializedRubyRanges.length > 0
        ? {
            highlightClassName: `inline-block align-baseline rounded-sm px-1 py-0.5 font-semibold ${highlightClass}`,
            highlightRanges: materializedRubyRanges,
          }
        : {}),
    })
    return <span lang="ja" className={SENTENCE_TEXT_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
  }

  // Sudachi can ruby every token on its own: a missing headword surface
  // (e.g. parenthesized headwords like 後(に)) must not blank the whole
  // sentence. Only the highlight span depends on the match.
  if (matchedSurfaces.length === 0) {
    if (!sudachiAnnotate) return <span>{text}</span>
    return <span lang="ja" className={SENTENCE_TEXT_CLASS} dangerouslySetInnerHTML={{ __html: sudachiAnnotate(text) }} />
  }

  const surfaceSet = new Set(matchedSurfaces)
  const parts = text.split(
    new RegExp(`(${matchedSurfaces.map(escapeRegExp).join('|')})`, 'gu'),
  )

  if (sudachiAnnotate) {
    const html = parts
      .map(part =>
        surfaceSet.has(part)
          ? `<span class="inline-block align-baseline rounded-sm px-1 py-0.5 font-semibold ${highlightClass}">${sudachiAnnotate(part)}</span>`
          : sudachiAnnotate(part),
      )
      .join('')

    return <span lang="ja" className={SENTENCE_TEXT_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
  }

  const renderHighlightedSurface = (surface: string, start: number) => {
    if (!showPronunciation || !pronunciation) return escapeHtml(surface)

    const naAdjectiveStem = word.endsWith('な') ? word.slice(0, -1) : ''
    if (
      naAdjectiveStem &&
      surface.startsWith(naAdjectiveStem) &&
      pronunciation.length > 0
    ) {
      return `${buildJapaneseRubyHtml(naAdjectiveStem, pronunciation, {
        rubyClassName: `${SENTENCE_RUBY_CLASS} font-semibold text-slate-900`,
        rtClassName: SENTENCE_RUBY_RT_CLASS,
      })}${escapeHtml(surface.slice(naAdjectiveStem.length))}`
    }

    if (surface !== word) return escapeHtml(surface)
    const reading = selectSentenceOccurrenceReading(
      text, start, surface, [pronunciation, ...matchVariants], pronunciation, pronunciationData,
    )
    return buildJapaneseRubyHtml(surface, reading, {
      rubyClassName: `${SENTENCE_RUBY_CLASS} font-semibold text-slate-900`,
      rtClassName: SENTENCE_RUBY_RT_CLASS,
    })
  }
  const className =
    showPronunciation && pronunciation
      ? `inline-block align-baseline rounded-sm px-1 py-0.5 font-semibold ${highlightClass}`
      : `rounded px-1 py-0.5 font-semibold ${highlightClass}`
  const html = parts
    .map((part, index) => {
      const start = parts.slice(0, index).join('').length
      return surfaceSet.has(part)
        ? `<span class="${className}">${renderHighlightedSurface(part, start)}</span>`
        : escapeHtml(part)
    })
    .join('')

  return <span lang="ja" className={SENTENCE_TEXT_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
}
