import { annotateExamText } from './annotate'
import type { ExamAnnotationSettings, ExamQuestion } from './types'

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractSerial = (text: string) => {
  const normalized = (text || '').trim()
  if (!normalized) return ''

  const explicitToken = normalized.match(
    /\[\s*(\d+)\s*\]|［\s*(\d+)\s*］|\(\s*(\d+)\s*\)|（\s*(\d+)\s*）|【\s*(\d+)\s*】|「\s*(\d+)\s*」|『\s*(\d+)\s*』/,
  )

  if (explicitToken) {
    return (
      explicitToken[1] ||
      explicitToken[2] ||
      explicitToken[3] ||
      explicitToken[4] ||
      explicitToken[5] ||
      explicitToken[6] ||
      explicitToken[7] ||
      ''
    )
  }

  return normalized.match(/\b(\d{1,3})\b/)?.[1] || ''
}

const replaceFirst = (source: string, target: string, replacement: string) => {
  const index = source.indexOf(target)
  if (index < 0) return { next: source, replaced: false }

  return {
    next: source.slice(0, index) + replacement + source.slice(index + target.length),
    replaced: true,
  }
}

const replaceBySerialToken = (
  source: string,
  serial: string,
  replacement: string,
) => {
  if (!serial) return { next: source, replaced: false }

  const escaped = escapeRegExp(serial)
  const precisePatterns = [
    new RegExp(`\\[\\s*${escaped}\\s*\\]`),
    new RegExp(`［\\s*${escaped}\\s*］`),
    new RegExp(`\\(\\s*${escaped}\\s*\\)`),
    new RegExp(`（\\s*${escaped}\\s*）`),
    new RegExp(`【\\s*${escaped}\\s*】`),
    new RegExp(`「\\s*${escaped}\\s*」`),
    new RegExp(`『\\s*${escaped}\\s*』`),
  ]

  for (const pattern of precisePatterns) {
    const match = source.match(pattern)
    if (!match?.[0]) continue
    return replaceFirst(source, match[0], replacement)
  }
  return { next: source, replaced: false }
}

export const buildReadingPassageHtml = ({
  question,
  fillBlankQuestions,
  answerMap,
  isSubmitted,
  annotation,
}: {
  question: ExamQuestion
  fillBlankQuestions: ExamQuestion[]
  answerMap: Record<string, string>
  isSubmitted: boolean
  annotation: ExamAnnotationSettings
}) => {
  let htmlContent = question.passage?.content || ''
  if (!htmlContent) return ''

  if (fillBlankQuestions.length === 0) {
    return annotateExamText({ text: htmlContent, settings: annotation })
  }

  let counter = 1

  fillBlankQuestions.forEach(fillQuestion => {
    const options = fillQuestion.options || []
    const correctOption = options.find(option => option.isCorrect)
    if (!correctOption?.text) return

    const anchorSentence = fillQuestion.contextSentence || fillQuestion.prompt || ''
    const serial =
      extractSerial(fillQuestion.prompt || '') ||
      extractSerial(anchorSentence) ||
      extractSerial(fillQuestion.contextSentence || '')
    const displaySerial = serial || String(counter)

    const selectedOptId = answerMap[fillQuestion.id]
    const selectedOpt = options.find(option => option.id === selectedOptId)

    let replacementHtml = ''

    if (!isSubmitted) {
      if (selectedOpt) {
        replacementHtml = `<span class="article-blank-filled inline-block mx-1 border-b-2 border-indigo-500 px-1 py-0 text-indigo-700 font-semibold align-baseline transition-all duration-300">${selectedOpt.text}</span>`
      } else {
        replacementHtml = `<span class="article-blank-empty inline-block mx-1 border-b-2 border-gray-400 px-3 py-0 text-gray-400 font-semibold select-none tracking-wide align-baseline">(${displaySerial})</span>`
      }
    } else if (!selectedOpt) {
      replacementHtml = `<span class="inline-flex items-center gap-2 mx-1 align-baseline"><span class="article-blank-missed inline-block border-b-2 border-amber-500 px-2 py-0 text-amber-700 font-semibold bg-amber-50">(${displaySerial})</span><span class="article-blank-correct text-xs md:text-sm font-semibold text-emerald-700">正确：${correctOption.text}</span></span>`
    } else if (!selectedOpt.isCorrect) {
      replacementHtml = `<span class="inline-flex items-center gap-2 mx-1 align-baseline"><span class="article-blank-wrong inline-block border-b-2 border-red-500 px-2 py-0 text-red-700 font-semibold bg-red-50">${selectedOpt.text}</span><span class="article-blank-correct text-xs md:text-sm font-semibold text-emerald-700">正确：${correctOption.text}</span></span>`
    } else {
      replacementHtml = `<span class="article-blank-ok inline-block mx-1 border-b-2 border-emerald-500 px-2 py-0 text-emerald-700 font-semibold bg-emerald-50 align-baseline">${correctOption.text}</span>`
    }

    let replaced = false

    if (serial) {
      const byToken = replaceBySerialToken(htmlContent, serial, replacementHtml)
      htmlContent = byToken.next
      replaced = byToken.replaced
    }

    if (!replaced && anchorSentence) {
      let processedSentence = anchorSentence
      const sentenceToken = replaceBySerialToken(processedSentence, serial, replacementHtml)

      if (sentenceToken.replaced) {
        processedSentence = sentenceToken.next
      } else if (processedSentence.includes(correctOption.text)) {
        processedSentence = processedSentence.replace(correctOption.text, replacementHtml)
      } else {
        processedSentence = `${processedSentence}${replacementHtml}`
      }

      const bySentence = replaceFirst(htmlContent, anchorSentence, processedSentence)
      htmlContent = bySentence.next
      replaced = bySentence.replaced
    }

    if (replaced) counter += 1
  })

  return annotateExamText({ text: htmlContent, settings: annotation })
}
