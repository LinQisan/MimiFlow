import { annotateJapaneseHtml } from '@/hooks/usePronunciationPrefs'
import { escapeHtml } from '@/utils/language/japaneseRuby'
import type { ExamAnnotationSettings } from './types'

const BLANK_TOKEN_GLOBAL = /([（(]\s*[）)]|[＿_]{2,}|[★＊])/g

const toRichHtml = (text: string) => escapeHtml(text || '').replace(/\n/g, '<br/>')

const withTargetHighlight = (html: string, targetWord?: string | null) => {
  const token = (targetWord || '').trim()
  if (!token) return html
  const escapedToken = escapeHtml(token)

  return html.replace(
    escapedToken,
    `<span class="mx-1 border-b-2 border-black px-1 font-bold">${escapedToken}</span>`,
  )
}

const withFillBlankHint = (html: string) =>
  html.replace(
    BLANK_TOKEN_GLOBAL,
    '<span class="mx-1 inline-block min-w-12 border-b-2 border-dashed border-slate-400 px-2 text-slate-500">（ ）</span>',
  )

export const annotateExamText = ({
  text,
  targetWord,
  fillBlank = false,
  settings,
}: {
  text: string
  targetWord?: string | null
  fillBlank?: boolean
  settings: ExamAnnotationSettings
}) => {
  const html = toRichHtml(text)
  const highlighted = fillBlank ? withFillBlankHint(html) : withTargetHighlight(html, targetWord)

  return annotateJapaneseHtml(
    highlighted,
    settings.pronunciationMap,
    settings.showPronunciation,
    {
      showMeaning: settings.showMeaning,
      vocabularyMetaMap: settings.vocabularyMetaMap,
      sentenceMeaningMap: {},
    },
  )
}
