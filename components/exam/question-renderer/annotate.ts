import {
  annotateJapaneseText,
  annotateJapaneseTextWithSudachi,
  escapeHtml,
} from '@/utils/language/japaneseRuby'
import {
  buildPronunciationMapForText,
  resolveJapaneseTargetSurface,
} from '@/utils/vocabulary/japaneseInflection'
import { renderUnderlineMarkup } from '@/utils/text/underlineMarkup'
import type { ExamAnnotationSettings } from './types'

const BLANK_TOKEN_GLOBAL = /([（(]\s*[）)]|[＿_]{2,}|[★＊])/g

const toRichHtml = (text: string, preserveNewlines = false) => {
  const html = renderUnderlineMarkup(escapeHtml(text || ''))
  return preserveNewlines ? html : html.replace(/\n/g, '<br/>')
}

const withTargetHighlight = (html: string, targetWord?: string | null) => {
  const token = (targetWord || '').trim()
  if (!token) return html
  const escapedToken = escapeHtml(token)

  return html.replace(
    escapedToken,
    () =>
      `<span class="mx-1 inline-block whitespace-nowrap border-b-2 border-black px-1 font-bold">${escapedToken}</span>`,
  )
}

const withFillBlankHint = (html: string) =>
  html.replace(
    BLANK_TOKEN_GLOBAL,
    '<span class="mx-1 inline-block min-w-12 border-b-2 border-dashed border-slate-400 px-2 text-slate-500">（ ）</span>',
  )

const unescapeChunk = (raw: string) =>
  raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

export const annotateExamText = ({
  text,
  targetWord,
  fuzzyTarget = false,
  fillBlank = false,
  preserveNewlines = false,
  protectedTokens = [],
  settings,
}: {
  text: string
  targetWord?: string | null
  fuzzyTarget?: boolean
  fillBlank?: boolean
  preserveNewlines?: boolean
  protectedTokens?: readonly string[]
  settings: ExamAnnotationSettings
}) => {
  const html = toRichHtml(text, preserveNewlines)
  const highlighted = fillBlank
    ? withFillBlankHint(html)
    : withTargetHighlight(
        html,
        fuzzyTarget
          ? resolveJapaneseTargetSurface(text, targetWord || '')
          : targetWord,
      )

  const tokenWords = settings.tokenWords || []
  const hasTokenWords = tokenWords.length > 0
  const hasPronunciation = settings.showPronunciation

  if (!hasPronunciation && !hasTokenWords) {
    return highlighted
  }

  const useSudachi =
    Boolean(settings.sudachiLexicon) &&
    Object.keys(settings.sudachiLexicon || {}).length > 0

  // Generated blank and note markers must survive vocabulary tokenization intact.
  const protectedTokenSet = new Set(protectedTokens.filter(Boolean))
  const protectedPattern = [...protectedTokenSet]
    .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const chunks = highlighted.split(
    new RegExp(`(<[^>]+>${protectedPattern ? `|${protectedPattern}` : ''})`, 'g'),
  )
  const next = chunks.map(chunk => {
    if (!chunk) return ''
    if (protectedTokenSet.has(chunk)) return chunk
    if (chunk.startsWith('<') && chunk.endsWith('>')) return chunk

    const unescaped = unescapeChunk(chunk)
    if (!unescaped.trim()) return chunk

    if (useSudachi && settings.sudachiLexicon) {
      return annotateJapaneseTextWithSudachi(
        unescaped,
        settings.sudachiLexicon,
        {
          pronunciationMap: settings.pronunciationMap,
          useSudachiReading: settings.pronunciationSource === 'sudachi',
          rubyEnabled: settings.showPronunciation,
          rubyClassName: 'text-slate-900',
          rtClassName: 'text-slate-500',
          tokenClassName: hasTokenWords ? 'vocab-token' : undefined,
          tokenWords: hasTokenWords ? tokenWords : undefined,
        },
      )
    }

    const pronMap = settings.showPronunciation
      ? buildPronunciationMapForText(unescaped, settings.pronunciationMap)
      : {}

    return annotateJapaneseText(unescaped, pronMap, {
      rubyEnabled: settings.showPronunciation,
      rubyClassName: 'text-slate-900',
      rtClassName: 'text-slate-500',
      groupKanji: settings.groupKanji,
      tokenClassName: hasTokenWords ? 'vocab-token' : undefined,
      tokenWords: hasTokenWords ? tokenWords : undefined,
    })
  })

  return next.join('')
}
