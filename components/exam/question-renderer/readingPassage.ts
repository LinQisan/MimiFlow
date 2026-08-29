import { annotateExamText } from './annotate'
import { createTrustedMarkupSlots } from './trustedMarkup'
import type { ExamAnnotationSettings, ExamQuestion } from './types'
import { renderSafeStructuredText } from './structuredText'
import {
  parseArticleFootnotes,
  replaceArticleFootnoteReferences,
} from '@/features/reading/domain/article-footnotes'
import { buildSurfaceAliasMapForText } from '@/utils/vocabulary/japaneseInflection'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

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

const resolvePassageAnnotations = (
  text: string,
  vocabularyMetaMap: Record<string, VocabularyMeta>,
) => {
  const wordsWithMeanings = Object.entries(vocabularyMetaMap)
    .filter(([, meta]) => meta.meanings.some(meaning => meaning.trim()))
    .map(([word]) => word)
  const aliasMap = buildSurfaceAliasMapForText(text, wordsWithMeanings)
  const firstOccurrenceByWord = new Map<
    string,
    { word: string; surface: string; position: number; meta: VocabularyMeta }
  >()

  Object.entries(aliasMap).forEach(([surface, word]) => {
    const position = text.indexOf(surface)
    const meta = vocabularyMetaMap[word]
    if (position < 0 || !meta) return
    const current = firstOccurrenceByWord.get(word)
    if (
      !current ||
      position < current.position ||
      (position === current.position && surface.length > current.surface.length)
    ) {
      firstOccurrenceByWord.set(word, { word, surface, position, meta })
    }
  })

  const selected: Array<{
    word: string
    surface: string
    position: number
    meta: VocabularyMeta
  }> = []
  Array.from(firstOccurrenceByWord.values())
    .sort(
      (left, right) =>
        left.position - right.position ||
        right.surface.length - left.surface.length,
    )
    .forEach(candidate => {
      const candidateEnd = candidate.position + candidate.surface.length
      const overlaps = selected.some(item => {
        const itemEnd = item.position + item.surface.length
        return candidate.position < itemEnd && candidateEnd > item.position
      })
      if (!overlaps) selected.push(candidate)
    })

  return selected.map((item, index) => ({ ...item, label: index + 1 }))
}

type ReadingPassageBuildOptions = {
  question: ExamQuestion
  fillBlankQuestions: ExamQuestion[]
  answerMap: Record<string, string>
  submittedQuestionIds: string[]
  annotation: ExamAnnotationSettings
}

export const buildReadingPassageParts = ({
  question,
  fillBlankQuestions,
  answerMap,
  submittedQuestionIds,
  annotation,
}: ReadingPassageBuildOptions) => {
  const sourceContent = question.passage?.content || ''
  if (!sourceContent) {
    return { bodyHtml: '', footnotesHtml: '', annotationsHtml: '' }
  }

  const document = parseArticleFootnotes(sourceContent)
  let htmlContent = document.body
  const trustedMarkup = createTrustedMarkupSlots(htmlContent)
  const passageScope = `passage-${(
    question.passage?.id || question.id
  ).replace(/[^A-Za-z0-9_-]/g, '-')}`
  const footnoteScope = `${passageScope}-note`
  const annotationScope = `${passageScope}-annotation`
  const passageAnnotations = annotation.showMeaning
    ? resolvePassageAnnotations(document.body, annotation.vocabularyMetaMap)
    : []

  htmlContent = replaceArticleFootnoteReferences(
    htmlContent,
    document.footnotes,
    footnote =>
      trustedMarkup.add(
        `<sup class="mx-0.5"><a id="${footnoteScope}-${footnote.id}-ref" href="#${footnoteScope}-${footnote.id}" class="rounded px-0.5 text-[0.65em] font-semibold text-slate-500 no-underline hover:bg-slate-100 hover:text-slate-950">注${footnote.label}</a></sup>`,
      ),
  )

  const renderBody = () =>
    trustedMarkup.restore(
      renderSafeStructuredText(
        annotateExamText({
          text: htmlContent,
          preserveNewlines: true,
          settings: { ...annotation, showMeaning: false },
        }),
        { force: true },
      ),
    )
  const footnotesHtml = document.footnotes.length
    ? `<aside aria-label="文章脚注" class="mt-10"><ol class="space-y-2 text-sm leading-7 text-slate-600">${document.footnotes
        .map(footnote => {
          const noteText = footnote.term
            ? `${footnote.term}：${footnote.definition}`
            : footnote.definition
          const backLink = document.body.includes(`[^${footnote.id}]`)
            ? `<a href="#${footnoteScope}-${footnote.id}-ref" aria-label="返回正文" class="text-xs text-slate-400 hover:text-slate-900">↩</a>`
            : ''
          return `<li id="${footnoteScope}-${footnote.id}" class="scroll-mt-24 grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-2 border-b border-slate-100 pb-2 last:border-b-0"><span class="text-xs font-semibold tabular-nums text-slate-400">注${footnote.label}</span><span>${annotateExamText({ text: noteText, settings: { ...annotation, showMeaning: false } })}</span>${backLink}</li>`
        })
        .join('')}</ol></aside>`
    : ''

  const attachPassageAnnotations = () => {
    const attached = passageAnnotations.filter(item => {
      const surfacePosition = htmlContent.indexOf(item.surface)
      if (surfacePosition < 0) return false
      const marker = trustedMarkup.add(
        `<sup class="mx-0.5"><a id="${annotationScope}-${item.label}-ref" href="#${annotationScope}-${item.label}" class="rounded px-0.5 text-[0.65em] font-semibold text-slate-500 no-underline hover:bg-slate-100 hover:text-slate-950">释${item.label}</a></sup>`,
      )
      const markerPosition = surfacePosition + item.surface.length
      htmlContent = `${htmlContent.slice(0, markerPosition)}${marker}${htmlContent.slice(markerPosition)}`
      return true
    })
    return attached
  }

  const buildAnnotationsHtml = (
    attachedAnnotations: typeof passageAnnotations,
  ) =>
    attachedAnnotations.length
      ? `<aside aria-label="用户注释" class="mt-8"><ol class="space-y-2 text-sm leading-7 text-slate-600">${attachedAnnotations
        .map(item => {
          const meaning = item.meta.meanings
            .map(value => value.trim())
            .filter(Boolean)
            .join('；')
          return `<li id="${annotationScope}-${item.label}" class="scroll-mt-24 grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-2 border-b border-slate-100 pb-2 last:border-b-0"><span class="text-xs font-semibold tabular-nums text-slate-400">释${item.label}</span><span>${annotateExamText({ text: `${item.word}：${meaning}`, settings: { ...annotation, showMeaning: false } })}</span><a href="#${annotationScope}-${item.label}-ref" aria-label="返回正文" class="text-xs text-slate-400 hover:text-slate-900">↩</a></li>`
        })
        .join('')}</ol></aside>`
      : ''

  if (fillBlankQuestions.length === 0) {
    const annotationsHtml = buildAnnotationsHtml(attachPassageAnnotations())
    return { bodyHtml: renderBody(), footnotesHtml, annotationsHtml }
  }

  let counter = 1
  const submittedQuestionIdSet = new Set(submittedQuestionIds)

  const annotateOptionText = (text: string) =>
    annotateExamText({ text, settings: annotation })

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
    const shouldRevealAnswer = submittedQuestionIdSet.has(fillQuestion.id)

    const selectedOptionHtml = selectedOpt
      ? annotateOptionText(selectedOpt.text)
      : ''
    const correctOptionHtml = annotateOptionText(correctOption.text)
    let replacementHtml = ''

    if (!shouldRevealAnswer) {
      if (selectedOpt) {
        replacementHtml = `<span class="article-blank-filled inline-block mx-1 border-b-2 border-slate-900 px-1 py-0 text-slate-900 font-semibold align-baseline transition-all duration-300">${selectedOptionHtml}</span>`
      } else {
        replacementHtml = `<span class="article-blank-empty inline-block mx-1 border-b-2 border-slate-400 px-3 py-0 text-slate-400 font-semibold select-none tracking-wide align-baseline">(${displaySerial})</span>`
      }
    } else if (!selectedOpt) {
      replacementHtml = `<span class="inline-flex items-center gap-2 mx-1 align-baseline"><span class="article-blank-missed inline-block border-b-2 border-slate-500 px-2 py-0 text-slate-700 font-semibold bg-slate-100">(${displaySerial})</span><span class="article-blank-correct text-xs md:text-sm font-semibold text-slate-700">正确：${correctOptionHtml}</span></span>`
    } else if (!selectedOpt.isCorrect) {
      replacementHtml = `<span class="inline-flex items-center gap-2 mx-1 align-baseline"><span class="article-blank-wrong inline-block border-b-2 border-slate-900 px-2 py-0 text-slate-900 font-semibold bg-slate-100">${selectedOptionHtml}</span><span class="article-blank-correct text-xs md:text-sm font-semibold text-slate-700">正确：${correctOptionHtml}</span></span>`
    } else {
      replacementHtml = `<span class="article-blank-ok inline-block mx-1 border-b-2 border-slate-900 px-2 py-0 text-slate-900 font-semibold bg-slate-100 align-baseline">${correctOptionHtml}</span>`
    }

    const replacementToken = trustedMarkup.add(replacementHtml)

    let replaced = false

    if (serial) {
      const byToken = replaceBySerialToken(htmlContent, serial, replacementToken)
      htmlContent = byToken.next
      replaced = byToken.replaced
    }

    if (!replaced && anchorSentence) {
      let processedSentence = anchorSentence
      const sentenceToken = replaceBySerialToken(processedSentence, serial, replacementToken)

      if (sentenceToken.replaced) {
        processedSentence = sentenceToken.next
      } else if (processedSentence.includes(correctOption.text)) {
        processedSentence = processedSentence.replace(correctOption.text, replacementToken)
      } else {
        processedSentence = `${processedSentence}${replacementToken}`
      }

      const bySentence = replaceFirst(htmlContent, anchorSentence, processedSentence)
      htmlContent = bySentence.next
      replaced = bySentence.replaced
    }

    if (replaced) counter += 1
  })

  const annotationsHtml = buildAnnotationsHtml(attachPassageAnnotations())
  return { bodyHtml: renderBody(), footnotesHtml, annotationsHtml }
}
