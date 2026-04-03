// app/articles/[id]/ArticleReaderUI.tsx
'use client'

import React, { useMemo, useState, useEffect, useRef } from 'react'
import { StudyTimeKind } from '@prisma/client'
import QuizEngineUI from '@/app/quizzes/QuizEngineUI'
import type { QuizAnswerMap } from '@/app/quizzes/QuizEngineUI'
import VocabularyTooltip, {
  TooltipSaveState,
} from '@/components/VocabularyTooltip'
import ToggleSwitch from '@/components/ToggleSwitch'
import { saveVocabulary } from '@/app/actions/content'
import {
  annotateJapaneseHtml,
  hasJapanese,
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import { inferContextualPos, posWordHighlightClass } from '@/utils/posTagger'
import { getPosOptions } from '@/utils/posTagger'
import useStudyTimeHeartbeat from '@/hooks/useStudyTimeHeartbeat'
import {
  getReadingBodyFontClass,
  getReadingFontClass,
} from '@/utils/readingTypography'

const MOBILE_COLLAPSED_HEIGHT = 72
const MOBILE_MIN_PANEL_HEIGHT = 22
const MOBILE_MAX_PANEL_HEIGHT = 82

type ArticleQuestionOption = {
  id: string
  text: string
  isCorrect: boolean
}

type ArticleQuestion = {
  id: string
  questionType: string
  prompt?: string | null
  contextSentence: string
  options: ArticleQuestionOption[]
}

type ArticleData = {
  id: string
  title: string
  content: string
  category?: { name: string } | null
  questions: ArticleQuestion[]
}

type VocabularyMeta = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

type SentenceMeaningRef = {
  sentence: string
  meaningIndex: number | null
}

type PosHighlightToken = {
  word: string
  className: string
}

const splitListInput = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const applyPosHighlightsToHtml = (
  html: string,
  tokens: PosHighlightToken[],
  enabled: boolean,
) => {
  if (!enabled || tokens.length === 0 || !html) return html
  const sorted = [...tokens].sort((a, b) => b.word.length - a.word.length)
  const chunks = html.split(/(<[^>]+>)/g)

  return chunks
    .map(chunk => {
      if (!chunk || (chunk.startsWith('<') && chunk.endsWith('>'))) return chunk
      let nextChunk = chunk
      sorted.forEach(token => {
        const regex = new RegExp(`(${escapeRegExp(token.word)})`, 'g')
        nextChunk = nextChunk.replace(
          regex,
          `<span class="rounded px-1 py-0.5 ${token.className}">$1</span>`,
        )
      })
      return nextChunk
    })
    .join('')
}

export default function ArticleReaderUI({
  article,
  pronunciationMap,
  vocabularyMetaMap,
  sentenceMeaningMap,
}: {
  article: ArticleData
  pronunciationMap: Record<string, string>
  vocabularyMetaMap: Record<string, VocabularyMeta>
  sentenceMeaningMap: Record<string, SentenceMeaningRef[]>
}) {
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()

  useStudyTimeHeartbeat({
    enabled: true,
    kind: StudyTimeKind.ARTICLE_READING,
    intervalMs: 60000,
  })

  const [localPronunciationMap, setLocalPronunciationMap] =
    useState(pronunciationMap)
  const [localVocabularyMetaMap, setLocalVocabularyMetaMap] =
    useState(vocabularyMetaMap)

  const articleTitleFontClass = useMemo(
    () => getReadingFontClass(`${article.title}\n${article.content}`),
    [article.title, article.content],
  )

  const articleBodyFontClass = useMemo(
    () => getReadingBodyFontClass(article.content),
    [article.content],
  )

  const quizVocabularyMetaMapByQuestion = useMemo(
    () =>
      article.questions.reduce<Record<string, Record<string, VocabularyMeta>>>(
        (acc, question) => {
          const entries = Object.entries(localVocabularyMetaMap).filter(
            ([word]) => question.contextSentence.includes(word),
          )
          if (entries.length === 0) return acc

          acc[question.id] = entries.reduce<Record<string, VocabularyMeta>>(
            (qAcc, [word, meta]) => {
              qAcc[word] = meta
              return qAcc
            },
            {},
          )
          return acc
        },
        {},
      ),
    [article.questions, localVocabularyMetaMap],
  )

  const hasQuestions = article.questions && article.questions.length > 0
  const [isQuizFinished, setIsQuizFinished] = useState(false)
  const [currentAnswers, setCurrentAnswers] = useState<QuizAnswerMap>({})
  const [gradedMap, setGradedMap] = useState<Record<string, boolean>>({})
  const [isMobile, setIsMobile] = useState(false)

  const articlePaneScrollRef = useRef<HTMLDivElement | null>(null)
  const quizPaneScrollRef = useRef<HTMLDivElement | null>(null)
  const dragHandleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [activeTooltip, setActiveTooltip] = useState<{
    word: string
    x: number
    y: number
    isTop: boolean
    contextSentence: string
    questionId: string
  } | null>(null)

  const [saveState, setSaveState] = useState<TooltipSaveState>('idle')
  const [saveWithPronunciation, setSaveWithPronunciation] = useState(false)
  const [saveWithMeaning, setSaveWithMeaning] = useState(false)
  const [tooltipPronunciation, setTooltipPronunciation] = useState('')
  const [tooltipPartOfSpeech, setTooltipPartOfSpeech] = useState('')
  const [tooltipMeaning, setTooltipMeaning] = useState('')

  const [bottomPanelHeight, setBottomPanelHeight] = useState(52)
  const [isDragging, setIsDragging] = useState(false)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)

  useEffect(() => {
    if (!isMobile) {
      setIsPanelCollapsed(false)
      return
    }
    setBottomPanelHeight(prev =>
      Math.min(
        MOBILE_MAX_PANEL_HEIGHT,
        Math.max(MOBILE_MIN_PANEL_HEIGHT, prev),
      ),
    )
  }, [isMobile])

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsDragging(true)
    if (isPanelCollapsed) setIsPanelCollapsed(false)
  }

  useEffect(() => {
    const handleDrag = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return

      let clientY = 0
      if ('touches' in e) {
        clientY = e.touches[0].clientY
      } else {
        clientY = (e as MouseEvent).clientY
      }

      const windowHeight = window.innerHeight
      let newHeightPercent = ((windowHeight - clientY) / windowHeight) * 100

      if (newHeightPercent < MOBILE_MIN_PANEL_HEIGHT) {
        newHeightPercent = MOBILE_MIN_PANEL_HEIGHT
      }
      if (newHeightPercent > MOBILE_MAX_PANEL_HEIGHT) {
        newHeightPercent = MOBILE_MAX_PANEL_HEIGHT
      }

      setBottomPanelHeight(newHeightPercent)
    }

    const stopDrag = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener('mousemove', handleDrag)
      window.addEventListener('touchmove', handleDrag, { passive: false })
      window.addEventListener('mouseup', stopDrag)
      window.addEventListener('touchend', stopDrag)
    }

    return () => {
      window.removeEventListener('mousemove', handleDrag)
      window.removeEventListener('touchmove', handleDrag)
      window.removeEventListener('mouseup', stopDrag)
      window.removeEventListener('touchend', stopDrag)
    }
  }, [isDragging])

  useEffect(() => {
    const hideTooltip = () => setActiveTooltip(null)
    const articlePane = articlePaneScrollRef.current
    const quizPane = quizPaneScrollRef.current

    window.addEventListener('scroll', hideTooltip, { passive: true })
    window.addEventListener('resize', hideTooltip)
    articlePane?.addEventListener('scroll', hideTooltip, { passive: true })
    quizPane?.addEventListener('scroll', hideTooltip, { passive: true })

    return () => {
      window.removeEventListener('scroll', hideTooltip)
      window.removeEventListener('resize', hideTooltip)
      articlePane?.removeEventListener('scroll', hideTooltip)
      quizPane?.removeEventListener('scroll', hideTooltip)
    }
  }, [])

  const handleTextSelection = () => {
    setTimeout(() => {
      const selection = window.getSelection()
      const text = selection?.toString().trim()

      if (!selection || !text || text.length === 0 || text.length > 25) {
        if (!text) setActiveTooltip(null)
        return
      }

      if (!selection.rangeCount) return
      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      let y = rect.top - 10
      let isTop = true

      if (isMobile || rect.top < 60) {
        y = rect.bottom + 10
        isTop = false
      }

      let pureContextSentence = text

      if (article.content) {
        const domContext = selection.anchorNode?.textContent?.trim() || text

        const rawSentences = article.content
          .replace(/([。！？\n])/g, '$1|')
          .split('|')
          .map((s: string) => s.trim())
          .filter(Boolean)

        const exactMatch = rawSentences.find(
          (s: string) =>
            s.includes(text) &&
            (s.includes(domContext) ||
              domContext.includes(s) ||
              s.includes(domContext.substring(0, 5))),
        )

        pureContextSentence =
          exactMatch ||
          rawSentences.find((s: string) => s.includes(text)) ||
          text
      }

      setActiveTooltip({
        word: text,
        x,
        y,
        isTop,
        questionId: article.id,
        contextSentence: pureContextSentence,
      })

      const existingMeta = localVocabularyMetaMap[text]
      const pronList = existingMeta?.pronunciations || []
      const partOfSpeechList = inferContextualPos(
        text,
        pureContextSentence,
        existingMeta?.partsOfSpeech || [],
      )
      const meaningList = existingMeta?.meanings || []

      setTooltipPronunciation(pronList.join('\n'))
      setTooltipPartOfSpeech(partOfSpeechList.join('\n'))
      setTooltipMeaning(meaningList.join('\n'))
      setSaveWithPronunciation(hasJapanese(text))
      setSaveWithMeaning(true)
      setSaveState('idle')
    }, 50)
  }

  const handleSaveWord = async (word: string) => {
    if (!activeTooltip) return

    setSaveState('saving')
    const pronunciationList = splitListInput(tooltipPronunciation)
    const partOfSpeechList = splitListInput(tooltipPartOfSpeech)
    const meaningList = splitListInput(tooltipMeaning)
    const firstPron = pronunciationList[0]

    const res = await saveVocabulary(
      word,
      activeTooltip.contextSentence,
      'ARTICLE_TEXT',
      article.id,
      saveWithPronunciation ? firstPron : undefined,
      saveWithPronunciation ? pronunciationList : [],
      saveWithMeaning ? meaningList : [],
      partOfSpeechList[0],
      partOfSpeechList,
    )

    if (!res.success && res.state === 'already_exists') {
      const existingMeta = localVocabularyMetaMap[word] || {
        pronunciations: [],
        partsOfSpeech: [],
        meanings: [],
      }

      if (saveWithPronunciation && firstPron) {
        setLocalPronunciationMap(prev => ({ ...prev, [word]: firstPron }))
      }

      if (saveWithPronunciation || saveWithMeaning) {
        setLocalVocabularyMetaMap(prev => ({
          ...prev,
          [word]: {
            pronunciations: saveWithPronunciation
              ? pronunciationList
              : existingMeta.pronunciations,
            partsOfSpeech:
              partOfSpeechList.length > 0
                ? partOfSpeechList
                : existingMeta.partsOfSpeech,
            meanings: saveWithMeaning ? meaningList : existingMeta.meanings,
          },
        }))
      }

      setSaveState('already_exists')
      setTimeout(() => setActiveTooltip(null), 1500)
    } else if (res.success) {
      const existingMeta = localVocabularyMetaMap[word] || {
        pronunciations: [],
        partsOfSpeech: [],
        meanings: [],
      }

      if (saveWithPronunciation && firstPron) {
        setLocalPronunciationMap(prev => ({
          ...prev,
          [word]: firstPron,
        }))
      }

      setLocalVocabularyMetaMap(prev => ({
        ...prev,
        [word]: {
          pronunciations: saveWithPronunciation
            ? pronunciationList
            : existingMeta.pronunciations,
          partsOfSpeech:
            partOfSpeechList.length > 0
              ? partOfSpeechList
              : existingMeta.partsOfSpeech,
          meanings: saveWithMeaning ? meaningList : existingMeta.meanings,
        },
      }))

      setSaveState('success')
      setTimeout(() => setActiveTooltip(null), 1500)
    } else {
      setSaveState('error')
    }
  }

  const renderArticleContent = () => {
    let htmlContent = article.content || ''
    let counter = 1

    if (hasQuestions) {
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

      const replaceFirst = (
        source: string,
        target: string,
        replacement: string,
      ) => {
        const index = source.indexOf(target)
        if (index < 0) return { next: source, replaced: false }

        const next =
          source.slice(0, index) +
          replacement +
          source.slice(index + target.length)

        return { next, replaced: true }
      }

      const replaceBySerialToken = (
        source: string,
        serial: string,
        replacement: string,
      ) => {
        if (!serial) return { next: source, replaced: false }
        const escapedSerial = escapeRegExp(serial)

        const precisePatterns = [
          new RegExp(`\\[\\s*${escapedSerial}\\s*\\]`),
          new RegExp(`［\\s*${escapedSerial}\\s*］`),
          new RegExp(`\\(\\s*${escapedSerial}\\s*\\)`),
          new RegExp(`（\\s*${escapedSerial}\\s*）`),
          new RegExp(`【\\s*${escapedSerial}\\s*】`),
          new RegExp(`「\\s*${escapedSerial}\\s*」`),
          new RegExp(`『\\s*${escapedSerial}\\s*』`),
        ]

        for (const pattern of precisePatterns) {
          const match = source.match(pattern)
          if (!match?.[0]) continue
          return replaceFirst(source, match[0], replacement)
        }

        const loosePattern = new RegExp(`(^|\\D)(${escapedSerial})(\\D|$)`)
        if (!loosePattern.test(source)) return { next: source, replaced: false }

        const next = source.replace(
          loosePattern,
          (_match, prefix: string, _token: string, suffix: string) =>
            `${prefix}${replacement}${suffix}`,
        )

        return { next, replaced: next !== source }
      }

      article.questions.forEach(q => {
        const correctOption = q.options?.find(opt => opt.isCorrect)
        const anchorSentence = q.contextSentence || q.prompt || ''
        if (!correctOption || !correctOption.text) return

        const serial =
          extractSerial(q.prompt || '') ||
          extractSerial(anchorSentence) ||
          extractSerial(q.contextSentence || '')

        const isThisQuestionGraded = isQuizFinished || gradedMap[q.id]
        const selectedOptId = currentAnswers[q.id]
        const selectedOpt = q.options?.find(o => o.id === selectedOptId)

        let replacementHtml = ''

        if (!isThisQuestionGraded) {
          if (selectedOpt) {
            replacementHtml = `<span class="article-blank-filled inline-block mx-1 border-b-2 border-indigo-500 px-1 py-0 text-indigo-700 font-semibold align-baseline transition-all duration-300">${selectedOpt.text}</span>`
          } else {
            replacementHtml = `<span class="article-blank-empty inline-block mx-1 border-b-2 border-gray-400 px-3 py-0 text-gray-400 font-semibold select-none tracking-wide align-baseline">(${counter})</span>`
          }
        } else if (!selectedOpt) {
          replacementHtml = `<span class="inline-flex items-center gap-2 mx-1 align-baseline"><span class="article-blank-missed inline-block border-b-2 border-amber-500 px-2 py-0 text-amber-700 font-semibold bg-amber-50">(${counter})</span><span class="article-blank-correct text-xs md:text-sm font-semibold text-emerald-700">正确：${correctOption.text}</span></span>`
        } else if (!selectedOpt.isCorrect) {
          replacementHtml = `<span class="inline-flex items-center gap-2 mx-1 align-baseline"><span class="article-blank-wrong inline-block border-b-2 border-red-500 px-2 py-0 text-red-700 font-semibold bg-red-50">${selectedOpt.text}</span><span class="article-blank-correct text-xs md:text-sm font-semibold text-emerald-700">正确：${correctOption.text}</span></span>`
        } else {
          replacementHtml = `<span class="article-blank-ok inline-block mx-1 border-b-2 border-emerald-500 px-2 py-0 text-emerald-700 font-semibold bg-emerald-50 align-baseline">${correctOption.text}</span>`
        }

        let replaced = false

        if (serial) {
          const byToken = replaceBySerialToken(
            htmlContent,
            serial,
            replacementHtml,
          )
          htmlContent = byToken.next
          replaced = byToken.replaced
        }

        if (!replaced && anchorSentence) {
          let processedSentence = anchorSentence
          const sentenceToken = replaceBySerialToken(
            processedSentence,
            serial,
            replacementHtml,
          )

          if (sentenceToken.replaced) {
            processedSentence = sentenceToken.next
          } else if (processedSentence.includes(correctOption.text)) {
            processedSentence = processedSentence.replace(
              correctOption.text,
              replacementHtml,
            )
          } else {
            processedSentence = `${processedSentence}${replacementHtml}`
          }

          const bySentence = replaceFirst(
            htmlContent,
            anchorSentence,
            processedSentence,
          )
          htmlContent = bySentence.next
          replaced = bySentence.replaced
        }

        if (replaced) counter += 1
      })
    }

    const posHighlightTokens: PosHighlightToken[] = Object.entries(
      localVocabularyMetaMap,
    )
      .filter(([word, meta]) => {
        if (!showMeaning) return false
        if (!htmlContent.includes(word)) return false
        return (meta.partsOfSpeech || []).length > 0
      })
      .map(([word, meta]) => {
        const contextualPos = inferContextualPos(
          word,
          article.content || '',
          meta.partsOfSpeech || [],
        )
        const primaryPos = contextualPos[0]
        if (!primaryPos) return null
        return {
          word,
          className: posWordHighlightClass(primaryPos),
        }
      })
      .filter((item): item is PosHighlightToken => item !== null)

    const highlightedHtml = applyPosHighlightsToHtml(
      htmlContent,
      posHighlightTokens,
      showMeaning,
    )

    const renderedHtml = annotateJapaneseHtml(
      highlightedHtml,
      localPronunciationMap,
      showPronunciation,
      {
        showMeaning,
        vocabularyMetaMap: localVocabularyMetaMap,
        sentenceMeaningMap,
      },
    )

    return (
      <div className='w-full theme-page-article'>
        <div className='mb-5 rounded-3xl border border-gray-200/80 bg-white/85 px-4 py-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80 md:mb-6 md:px-6 md:py-5'>
          <div className='mb-4 flex flex-wrap items-start justify-between gap-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <ToggleSwitch
                label='注音'
                checked={showPronunciation}
                onChange={setShowPronunciation}
              />
              <ToggleSwitch
                label='释义'
                checked={showMeaning}
                onChange={setShowMeaning}
              />
            </div>
          </div>

          <h1
            className={`text-3xl font-black leading-snug text-gray-900 dark:text-slate-100 md:text-4xl ${articleTitleFontClass}`}>
            {article.category?.name}
          </h1>
        </div>

        <div
          onMouseUp={handleTextSelection}
          onTouchEnd={handleTextSelection}
          className={`rounded-3xl border border-gray-200/80 bg-white/88 px-4 py-5 text-lg leading-[2.08] text-gray-800 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/82 dark:text-slate-200 md:px-6 md:py-7 md:text-xl md:leading-[2.35] whitespace-pre-wrap select-text ${articleBodyFontClass}
          [&_u]:rounded-md
          [&_u]:bg-indigo-50
          [&_u]:px-1.5
          [&_u]:py-0.5
          [&_u]:font-bold
          [&_u]:text-indigo-600
          [&_u]:underline
          [&_u]:decoration-2
          [&_u]:underline-offset-4
          [&_u]:decoration-indigo-400
          dark:[&_u]:bg-indigo-500/15
          dark:[&_u]:text-indigo-300
          dark:[&_u]:decoration-indigo-500
          [&_rt]:text-[10px]
          [&_rt]:font-bold
          [&_rt]:text-indigo-500
          dark:[&_rt]:text-indigo-300`}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>
    )
  }

  const renderTooltip = () =>
    activeTooltip ? (
      <VocabularyTooltip
        {...activeTooltip}
        saveState={saveState}
        onSaveWord={handleSaveWord}
        enablePronunciation
        pronunciationValue={tooltipPronunciation}
        saveWithPronunciation={saveWithPronunciation}
        onPronunciationChange={setTooltipPronunciation}
        onSaveWithPronunciationChange={setSaveWithPronunciation}
        partOfSpeechValue={tooltipPartOfSpeech}
        onPartOfSpeechChange={setTooltipPartOfSpeech}
        partOfSpeechOptions={
          activeTooltip
            ? getPosOptions(activeTooltip.word, activeTooltip.contextSentence)
            : []
        }
        meaningValue={tooltipMeaning}
        saveWithMeaning={saveWithMeaning}
        onMeaningChange={setTooltipMeaning}
        onSaveWithMeaningChange={setSaveWithMeaning}
      />
    ) : null

  if (!hasQuestions) {
    return (
      <div
        className='theme-page-article min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-white px-4 pb-24 pt-4 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 md:px-8 md:pb-32 md:pt-8'
        onClick={() => setActiveTooltip(null)}>
        {renderTooltip()}

        <div className='mx-auto max-w-5xl'>
          <div className='mx-auto w-full max-w-4xl'>
            {renderArticleContent()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className='theme-page-article flex h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 overflow-hidden'
      onClick={() => setActiveTooltip(null)}>
      {renderTooltip()}

      <main
        ref={articlePaneScrollRef}
        className='relative min-w-0 flex-1 overflow-y-auto no-scrollbar'
        style={{
          paddingBottom:
            hasQuestions && isMobile && !isPanelCollapsed
              ? `calc(${bottomPanelHeight}dvh + env(safe-area-inset-bottom))`
              : isPanelCollapsed
                ? `calc(${MOBILE_COLLAPSED_HEIGHT}px + env(safe-area-inset-bottom))`
                : '0px',
        }}>
        <div
          className={`mx-auto w-full max-w-5xl px-4 pt-4 md:px-6 md:pt-6 lg:px-8 lg:pt-8 ${
            isMobile ? 'pb-8' : 'pb-10'
          }`}>
          <div className='mx-auto w-full max-w-4xl'>
            {renderArticleContent()}
            <div className={isMobile ? 'h-24' : 'h-0'} />
          </div>
        </div>
      </main>

      <aside
        className={[
          'z-30 flex flex-col border-gray-200/90 bg-white/92 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/94',
          'transition-all duration-300 ease-out',
          isMobile
            ? 'fixed inset-x-0 bottom-0 rounded-t-[28px] border-t shadow-[0_-14px_40px_-16px_rgba(0,0,0,0.18)]'
            : 'w-full border-l md:sticky md:top-0 md:h-screen md:w-[560px] lg:w-[620px] xl:w-[700px]',
        ].join(' ')}
        style={
          isMobile
            ? {
                height: isPanelCollapsed
                  ? `calc(${MOBILE_COLLAPSED_HEIGHT}px + env(safe-area-inset-bottom))`
                  : `calc(${bottomPanelHeight}dvh + env(safe-area-inset-bottom))`,
                paddingBottom: 'env(safe-area-inset-bottom)',
              }
            : undefined
        }>
        <div className='md:hidden relative shrink-0 rounded-t-[28px] border-b border-gray-100 bg-white/95 px-4 pt-2 pb-3 dark:border-slate-800 dark:bg-slate-900/95'>
          <button
            onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
            className='absolute left-4 top-2.5 rounded-lg p-1.5 text-gray-400 transition-colors hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300'>
            {isPanelCollapsed ? (
              <svg
                className='h-6 w-6'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2.5}
                  d='M5 15l7-7 7 7'
                />
              </svg>
            ) : (
              <svg
                className='h-6 w-6'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2.5}
                  d='M19 9l-7 7-7-7'
                />
              </svg>
            )}
          </button>

          <div className='flex flex-col items-center'>
            <div
              ref={dragHandleRef}
              onMouseDown={startDrag}
              onTouchStart={startDrag}
              className='mt-1 h-1.5 w-16 rounded-full bg-gray-300 transition-colors hover:bg-gray-400 active:cursor-grabbing dark:bg-slate-600 dark:hover:bg-slate-500'
            />
            <span className='mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400'>
              {isPanelCollapsed ? '上滑或点击展开题目' : '拖拽调整阅读视野'}
            </span>
            <span className='mt-1 text-[11px] font-bold text-indigo-500 dark:text-indigo-300'>
              共 {article.questions.length} 题
            </span>
          </div>
        </div>

        <div className='hidden shrink-0 border-b border-gray-100/90 bg-white/75 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70 md:block'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <div className='text-sm font-semibold text-gray-900 dark:text-slate-100'>
                阅读题目
              </div>
              <p className='mt-1 text-xs text-gray-500 dark:text-slate-400'>
                共 {article.questions.length} 题
              </p>
            </div>

            <div className='rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300'>
              边读边做
            </div>
          </div>
        </div>

        <div
          ref={quizPaneScrollRef}
          className={`${isPanelCollapsed && isMobile ? 'hidden' : 'flex'} min-h-0 flex-1 overflow-y-auto no-scrollbar`}>
          <div className='w-full px-3 py-4 md:px-5 md:py-6 lg:px-7 lg:py-8'>
            <div className='mx-auto w-full max-w-[920px]'>
              <QuizEngineUI
                quiz={{ questions: article.questions }}
                backUrl='/articles'
                onFinish={() => setIsQuizFinished(true)}
                onAnswerChange={setCurrentAnswers}
                onGradedChange={map => setGradedMap(map)}
                isArticleMode={true}
                vocabularyMetaMapByQuestion={quizVocabularyMetaMapByQuestion}
                aiPromptContext={{
                  sourceLabel: '阅读文章',
                  articleTitle: article.title || '',
                  articleText: article.content || '',
                }}
              />
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
