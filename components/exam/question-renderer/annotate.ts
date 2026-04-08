import { annotateJapaneseHtml } from '@/hooks/usePronunciationPrefs'
import type { ExamAnnotationSettings } from './types'

const BLANK_TOKEN_GLOBAL = /([（(]\s*[）)]|[＿_]{2,}|[★＊])/g

const toRichHtml = (text: string) => (text || '').replace(/\n/g, '<br/>')

const withTargetHighlight = (html: string, targetWord?: string | null) => {
  const token = (targetWord || '').trim()
  if (!token) return html

  return html.replace(
    token,
    `<span class="mx-1 border-b-2 border-black px-1 font-bold">${token}</span>`,
  )
}

const withFillBlankHint = (html: string) =>
  html.replace(
    BLANK_TOKEN_GLOBAL,
    '<span class="mx-1 inline-block min-w-12 border-b-2 border-dashed border-indigo-400 px-2 text-indigo-500">（ ）</span>',
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
