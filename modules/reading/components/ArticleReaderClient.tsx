'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { SourceType } from '@prisma/client'
import { useTextSelection } from '@/hooks/useTextSelection'
import { saveReadingProgress } from '@/modules/reading/progress-actions'
import {
  annotateJapaneseText,
  annotateJapaneseTextWithSudachi,
  formatJapaneseTextWithRubyNotation,
  formatJapaneseTextWithSudachiRubyNotation,
} from '@/utils/language/japaneseRuby'
import {
  buildPronunciationMapForText,
} from '@/utils/vocabulary/japaneseInflection'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { applyVocabularyInspectorMetaUpdate } from '@/modules/knowledge/vocabulary/domain/inspector-meta'
import type { PaperWordbookDistribution } from '@/modules/practice/domain/paper-word-frequency'
import WordbookDistributionChart from '@/modules/knowledge/vocabulary/components/WordbookDistributionChart'
import { removeRepeatedEbookHeadings } from '@/lib/ebooks/chapter-display'
import {
  buildWordbookHighlightGroups,
  isJlptVisibleWithHiddenLevels,
} from '@/modules/reading/domain/wordbook-highlight-groups'
import { JLPT_LEVELS, type VocabularyJlptLevel } from '@/modules/knowledge/vocabulary/domain/jlpt'
import {
  parseArticleContentBlocks,
  type ArticleContentBlock,
} from '@/modules/reading/domain/article-blocks'
import {
  parseArticleFootnotes,
  type ArticleFootnote,
} from '@/modules/reading/domain/article-footnotes'
import { copyText } from '@/modules/reading/components/copy-text'
import type { SudachiLexeme } from '@/modules/language/domain/sudachi'
import PronunciationSourceSelector from '@/components/ui/PronunciationSourceSelector'
import { usePronunciationSource } from '@/modules/language/hooks/usePronunciationSource'
import {
  useStudyTextHighlights,
} from '@/modules/knowledge/learning-records/useStudyTextHighlights'
import LearningPointHighlightPanel from '@/modules/knowledge/learning-records/components/LearningPointHighlightPanel'
import VocabularyWordbookInspector from '@/modules/knowledge/vocabulary/components/VocabularyWordbookInspector'
import PersonalPronunciationText from '@/modules/language/components/PersonalPronunciationText'
import { occurrenceReadings, personalReadingCandidates, type PronunciationChoice } from '@/modules/language/domain/personal-pronunciation'
import WordbookHighlightSelector from '@/modules/reading/components/WordbookHighlightSelector'

const MathExpression = dynamic(
  () => import('@/modules/reading/components/MathExpression'),
)
const WordTooltip = dynamic(() => import('@/modules/knowledge/vocabulary/components/WordTooltip'))

type ReaderChapter = {
  id: string
  title: string
  text: string
  href: string
}

const splitParagraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map(item => item.trim())
    .filter(Boolean)

export default function ArticleReaderClient({
  articleId,
  content,
  chapters,
  initialVocabularyMetaMap,
  initialPronunciationChoices = [],
  initialSudachiPronunciationMap = {},
  initialSudachiLexicon = {},
  initialWordbookDistributionWords = [],
  sudachiAvailable = false,
  initialProgressPercent = 0,
  mode = 'article',
  documentTitle = '',
}: {
  articleId: string
  content: string
  chapters: ReaderChapter[]
  initialPronunciationChoices?: PronunciationChoice[]
  initialVocabularyMetaMap: Record<string, VocabularyMeta>
  initialSudachiPronunciationMap?: Record<string, string>
  initialSudachiLexicon?: Record<string, SudachiLexeme>
  initialWordbookDistributionWords?: string[]
  sudachiAvailable?: boolean
  initialProgressPercent?: number
  mode?: 'article' | 'ebook'
  documentTitle?: string
}) {
  const initialChapterIndex =
    chapters.length > 1
      ? Math.min(
          chapters.length - 1,
          Math.floor((Math.max(0, initialProgressPercent) / 100) * chapters.length),
        )
      : 0
  const [activeChapterIndex, setActiveChapterIndex] =
    useState(initialChapterIndex)
  const [pronunciationChoices, setPronunciationChoices] = useState(initialPronunciationChoices)
  const [selectionEnabled, setSelectionEnabled] = useState(true)
  const [rubyEnabled, setRubyEnabled] = useState(true)
  const [automaticPronunciationAvailable, setAutomaticPronunciationAvailable] =
    useState(sudachiAvailable)
  const { pronunciationSource, setPronunciationSource } =
    usePronunciationSource(automaticPronunciationAvailable, {
      initialSource: sudachiAvailable ? 'sudachi' : 'personal',
      disabled: mode !== 'article',
    })
  const [sudachiPronunciationMap, setSudachiPronunciationMap] = useState(
    initialSudachiPronunciationMap,
  )
  const [sudachiLexicon, setSudachiLexicon] = useState(initialSudachiLexicon)
  const [wordbookDistributionWords, setWordbookDistributionWords] = useState(
    initialWordbookDistributionWords,
  )
  const [noteEnabled, setNoteEnabled] = useState(true)
  const [learningPointsEnabled, setLearningPointsEnabled] = useState(false)
  const [hiddenWordbookIds, setHiddenWordbookIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [hiddenJlptLevels, setHiddenJlptLevels] = useState<Set<VocabularyJlptLevel>>(
    () => new Set(),
  )
  const [inspectedWord, setInspectedWord] = useState<{
    word: string
    matchedVariant: string
    wordbookId: string
    x: number
    y: number
  } | null>(null)
  const [wordbookDistribution, setWordbookDistribution] =
    useState<PaperWordbookDistribution | null>(null)
  const [distributionLoadState, setDistributionLoadState] = useState<
    'idle' | 'loading' | 'error'
  >('idle')
  const [distributionRetryKey, setDistributionRetryKey] = useState(0)
  const [copyLabel, setCopyLabel] = useState('复制正文')
  const [readingProgress, setReadingProgress] = useState(
    Math.max(0, Math.min(100, initialProgressPercent)),
  )
  const readerRef = useRef<HTMLElement | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const restoredRef = useRef(false)
  const chapterProgressInitializedRef = useRef(false)
  const [localVocabularyMetaMap, setLocalVocabularyMetaMap] = useState(
    initialVocabularyMetaMap,
  )
  const { selection, closeSelection } = useTextSelection(selectionEnabled)
  const readerChapters =
    chapters.length > 0
      ? chapters
      : [{ id: 'article', title: '正文', text: content, href: '' }]
  const activeChapter =
    readerChapters[activeChapterIndex] || readerChapters[0]
  const analysisTexts = useMemo(
    () => chapters.length > 0 ? chapters.map(chapter => chapter.text) : [content],
    [chapters, content],
  )

  useEffect(() => {
    if (mode !== 'article' || sudachiAvailable) return

    const controller = new AbortController()
    void fetch('/api/pronunciation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts: analysisTexts,
        includeWordbookAnalysis: true,
      }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('request failed')
        return (await response.json()) as {
          available: boolean
          pronunciationMap: Record<string, string>
          lexicon: Record<string, SudachiLexeme>
          wordbookDistributionWords?: string[]
          wordbookDistribution?: PaperWordbookDistribution
        }
      })
      .then(result => {
        setAutomaticPronunciationAvailable(result.available)
        setSudachiPronunciationMap(result.pronunciationMap)
        setSudachiLexicon(result.lexicon)
        setWordbookDistributionWords(
          result.wordbookDistributionWords?.length
            ? result.wordbookDistributionWords
            : Object.keys(initialVocabularyMetaMap),
        )
        setWordbookDistribution(result.wordbookDistribution || null)
        setDistributionLoadState('idle')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setWordbookDistributionWords(Object.keys(initialVocabularyMetaMap))
      })

    return () => controller.abort()
  }, [analysisTexts, initialVocabularyMetaMap, mode, sudachiAvailable])

  const handleCopyContent = async () => {
    const text = activeChapter?.text || content
    if (!text.trim()) return
    try {
      const copyReadings: Record<number, string> = {}
      let sourceCursor = 0
      readerRef.current?.querySelectorAll<HTMLElement>('[data-pronunciation-location]').forEach(element => {
        const sourceText = element.dataset.pronunciationText || ''
        const location = element.dataset.pronunciationLocation || ''
        const start = text.indexOf(sourceText, sourceCursor)
        if (!sourceText || start < 0) return
        Object.entries(occurrenceReadings(sourceText, location, pronunciationChoices)).forEach(([offset, reading]) => {
          copyReadings[start + Number(offset)] = reading
        })
        sourceCursor = start + sourceText.length
      })
      const textToCopy = !rubyEnabled
        ? text
        : pronunciationSource === 'sudachi'
          ? formatJapaneseTextWithSudachiRubyNotation(
              text,
              sudachiLexicon,
            )
          : formatJapaneseTextWithRubyNotation(
              text,
              buildPronunciationMapForText(text, basePronMap),
              copyReadings,
            )
      await copyText(textToCopy)
      setCopyLabel('已复制')
      window.setTimeout(() => setCopyLabel('复制正文'), 1400)
    } catch {
      setCopyLabel('复制失败')
      window.setTimeout(() => setCopyLabel('复制正文'), 1400)
    }
  }

  useEffect(() => {
    if (mode !== 'ebook' || readerChapters.length > 1 || restoredRef.current)
      return
    restoredRef.current = true
    if (initialProgressPercent <= 1 || initialProgressPercent >= 98) return

    const timer = window.setTimeout(() => {
      const reader = readerRef.current
      if (!reader) return
      const readerTop = reader.getBoundingClientRect().top + window.scrollY
      const readableHeight = Math.max(0, reader.scrollHeight - window.innerHeight * 0.55)
      window.scrollTo({
        top: readerTop + readableHeight * (initialProgressPercent / 100),
        behavior: 'instant',
      })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [initialProgressPercent, mode, readerChapters.length])

  useEffect(() => {
    if (mode !== 'ebook' || readerChapters.length > 1) return

    const onScroll = () => {
      const reader = readerRef.current
      if (!reader) return
      const readerTop = reader.getBoundingClientRect().top + window.scrollY
      const readableHeight = Math.max(1, reader.scrollHeight - window.innerHeight * 0.55)
      const nextProgress = Math.max(
        0,
        Math.min(100, ((window.scrollY - readerTop) / readableHeight) * 100),
      )
      setReadingProgress(nextProgress)
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => {
        void saveReadingProgress({
          articleId,
          progressPercent: nextProgress,
          lastPosition: `阅读到 ${Math.round(nextProgress)}%`,
        })
      }, 700)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [articleId, mode, readerChapters.length])

  useEffect(() => {
    if (readerChapters.length <= 1) return
    if (!chapterProgressInitializedRef.current) {
      chapterProgressInitializedRef.current = true
      return
    }
    const nextProgress = ((activeChapterIndex + 1) / readerChapters.length) * 100
    setReadingProgress(nextProgress)
    void saveReadingProgress({
      articleId,
      progressPercent: nextProgress,
      lastPosition:
        mode === 'ebook'
          ? `第 ${activeChapterIndex + 1}/${readerChapters.length} 章`
          : `第 ${activeChapterIndex + 1}/${readerChapters.length} 页`,
    })
  }, [activeChapterIndex, articleId, mode, readerChapters.length])

  const basePronMap = useMemo(
    () =>
      Object.entries(localVocabularyMetaMap).reduce<Record<string, string>>(
        (acc, [word, meta]) => {
          const pron = personalReadingCandidates(word, { [word]: meta })[0]
          if (pron) acc[word] = pron
          return acc
        },
        {},
      ),
    [localVocabularyMetaMap],
  )

  const selectedPronunciationMap =
    pronunciationSource === 'sudachi'
      ? sudachiPronunciationMap
      : basePronMap

  const footnoteDocument = useMemo(
    () => parseArticleFootnotes(activeChapter?.text || ''),
    [activeChapter],
  )
  const footnoteById = useMemo(
    () =>
      new Map(
        footnoteDocument.footnotes.map(footnote => [footnote.id, footnote]),
      ),
    [footnoteDocument.footnotes],
  )
  const footnoteAnchorPrefix = `article-${articleId}-${activeChapterIndex}-note`

  useEffect(() => {
    if (
      !noteEnabled ||
      wordbookDistribution ||
      wordbookDistributionWords.length === 0
    ) {
      return
    }
    const controller = new AbortController()
    setDistributionLoadState('loading')
    void fetch('/api/reading/wordbook-distribution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: wordbookDistributionWords }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('request failed')
        return (await response.json()) as PaperWordbookDistribution
      })
      .then(distribution => {
        setWordbookDistribution(distribution)
        setDistributionLoadState('idle')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setDistributionLoadState('error')
      })
    return () => controller.abort()
  }, [
    wordbookDistributionWords,
    noteEnabled,
    distributionRetryKey,
    wordbookDistribution,
  ])

  const wordbookHighlightGroups = useMemo(
    () => buildWordbookHighlightGroups(wordbookDistribution?.wordbooks || [], footnoteDocument.body),
    [footnoteDocument.body, wordbookDistribution],
  )
  const wordbookSurfaceToBaseWord = useMemo(
    () =>
      Object.assign(
        {},
        ...wordbookHighlightGroups.map(group => group.aliases || {}),
      ) as Record<string, string>,
    [wordbookHighlightGroups],
  )
  const visibleWordbookSourceGroups = useMemo(
    () =>
      wordbookHighlightGroups.filter(group => !hiddenWordbookIds.has(group.id)),
    [hiddenWordbookIds, wordbookHighlightGroups],
  )
  const visibleWordbookHighlightGroups = useMemo(
    () =>
      visibleWordbookSourceGroups
        .map(group => ({
          ...group,
          words: group.words.filter(word =>
            isJlptVisibleWithHiddenLevels(
              group.jlptByWord?.[word] || [],
              hiddenJlptLevels,
            ),
          ),
          canonicalWords: (group.canonicalWords || []).filter(word =>
            isJlptVisibleWithHiddenLevels(
              group.jlptByWord?.[word] || [],
              hiddenJlptLevels,
            ),
          ),
        }))
        .filter(group => group.words.length > 0),
    [hiddenJlptLevels, visibleWordbookSourceGroups],
  )
  const wordbookTokenWords = useMemo(
    () =>
      noteEnabled
        ? Array.from(
            new Set(
              visibleWordbookSourceGroups.flatMap(group => group.words),
            ),
          )
        : [],
    [noteEnabled, visibleWordbookSourceGroups],
  )
  const handleWordbookVisibilityChange = useCallback(
    (wordbookIds: string[], visible: boolean) =>
      setHiddenWordbookIds(current => {
        const next = new Set(current)
        wordbookIds.forEach(id => {
          if (visible) next.delete(id)
          else next.add(id)
        })
        return next
      }),
    [],
  )
  const handleJlptVisibilityChange = useCallback(
    (levels: VocabularyJlptLevel[], visible: boolean) =>
      setHiddenJlptLevels(current => {
        const next = new Set(current)
        levels.forEach(level => {
          if (visible) next.delete(level)
          else next.add(level)
        })
        return next
      }),
    [],
  )
  const handleAllHighlightVisibilityChange = useCallback(
    (visible: boolean) => {
      setHiddenWordbookIds(
        visible
          ? new Set()
          : new Set(wordbookHighlightGroups.map(group => group.id)),
      )
      setHiddenJlptLevels(
        visible ||
          !wordbookHighlightGroups.some(group =>
            Object.values(group.jlptByWord || {}).some(levels => levels.length > 0),
          )
          ? new Set()
          : new Set(JLPT_LEVELS),
      )
    },
    [wordbookHighlightGroups],
  )
  const handleWordbookWordClick = useCallback(
    (payload: { word: string; wordbookId: string; x: number; y: number }) =>
      setInspectedWord({
        ...payload,
        word: wordbookSurfaceToBaseWord[payload.word] || payload.word,
        matchedVariant:
          wordbookHighlightGroups
            .find(group =>
              group.wordbookIdsByWord?.[payload.word]?.includes(
                payload.wordbookId,
              ) || group.id === payload.wordbookId,
            )
            ?.variants?.[payload.word] || payload.word,
      }),
    [wordbookHighlightGroups, wordbookSurfaceToBaseWord],
  )
  const {
    learningPoints,
    isLoadingLearningPoints,
    learningPointSelection,
    closeLearningPoint,
    inspectLearningPoint,
    inspectLearningPointWord,
  } = useStudyTextHighlights({
    rootRef: readerRef,
    contentKey: `${articleId}:${activeChapterIndex}:${noteEnabled}:${rubyEnabled}:${pronunciationSource}:${Object.keys(sudachiLexicon).length}:${JSON.stringify(pronunciationChoices)}`,
    showLearningPoints: learningPointsEnabled,
    showWordbooks: noteEnabled,
    wordbookGroups: visibleWordbookHighlightGroups,
    onWordbookWordClick: handleWordbookWordClick,
  })

  const contentBlocks = useMemo(() => {
    const items = splitParagraphs(footnoteDocument.body)
    const visibleItems = mode !== 'ebook'
      ? items
      : removeRepeatedEbookHeadings(
          items,
          documentTitle,
          activeChapter?.title || '',
        )
    return parseArticleContentBlocks(visibleItems)
  }, [activeChapter?.title, documentTitle, footnoteDocument.body, mode])

  const renderInlineText = (text: string, location = 'body') => {
    const pattern = /\\\(([^\n]+?)\\\)|(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g
    const parts: React.ReactNode[] = []
    let cursor = 0
    let match: RegExpExecArray | null

    const pushTextSegment = (
      value: string,
      key: string,
      underlined = false,
    ) => {
      if (!value) return
      const pushJapaneseSegment = (segment: string, segmentKey: string) => {
        if (!segment) return
        if (mode === 'article' && pronunciationSource === 'personal') {
          parts.push(<PersonalPronunciationText key={`${activeChapter.id}:${location}:${segmentKey}`}
            materialId={articleId} location={`${activeChapter.id}:${location}:${segmentKey}`}
            text={segment} metadata={localVocabularyMetaMap}
            lexicalSurfaces={Object.values(sudachiLexicon).map(lexeme => lexeme.surface)}
            pronunciationMap={buildPronunciationMapForText(segment, basePronMap)}
            onInspect={(surface, x, y) => {
              const group = wordbookHighlightGroups.find(item => item.wordbookIdsByWord[surface]?.length)
              const wordbookId = group?.wordbookIdsByWord[surface]?.[0]
              if (wordbookId) handleWordbookWordClick({ word: surface, wordbookId, x, y })
            }}
            choices={pronunciationChoices} rubyEnabled={rubyEnabled} tokenWords={wordbookTokenWords}
            className={`${underlined ? 'exam-text-underline ' : ''}[&_rt]:text-[0.6em] [&_ruby]:mx-0.5`}
            onSaved={choice => setPronunciationChoices(current => [
              ...current.filter(item => item.location !== choice.location || item.start !== choice.start), choice,
            ])} />)
          return
        }
        if (mode === 'article' && Object.keys(sudachiLexicon).length > 0) {
          const personalPronunciationMap = buildPronunciationMapForText(
            segment,
            basePronMap,
          )
          parts.push(
            <span
              key={segmentKey}
              className={`${underlined ? 'exam-text-underline ' : ''}[&_rt]:text-[0.6em] [&_ruby]:mx-0.5`}
              dangerouslySetInnerHTML={{
                __html: annotateJapaneseTextWithSudachi(
                  segment,
                  sudachiLexicon,
                  {
                    pronunciationMap: personalPronunciationMap,
                    useSudachiReading: pronunciationSource === 'sudachi',
                    rubyEnabled,
                    rubyClassName: 'text-slate-900',
                    rtClassName: 'text-slate-500',
                    tokenClassName: 'vocab-token',
                    tokenWords: wordbookTokenWords,
                  },
                ),
              }}
            />,
          )
          return
        }
        const pronMap =
          pronunciationSource === 'sudachi'
            ? sudachiPronunciationMap
            : buildPronunciationMapForText(segment, selectedPronunciationMap)
        if (!rubyEnabled) {
          parts.push(
            <span
              key={segmentKey}
              className={underlined ? 'exam-text-underline' : ''}
              dangerouslySetInnerHTML={{
                __html: annotateJapaneseText(segment, pronMap, {
                  rubyEnabled: false,
                  tokenClassName: 'vocab-token',
                  tokenWords: wordbookTokenWords,
                }),
              }}
            />,
          )
          return
        }
        parts.push(
          <span
            key={segmentKey}
            className={`${underlined ? 'exam-text-underline ' : ''}[&_rt]:text-[0.6em] [&_ruby]:mx-0.5`}
            dangerouslySetInnerHTML={{
              __html: annotateJapaneseText(segment, pronMap, {
                rubyClassName: 'text-slate-900',
                rtClassName: 'text-slate-500',
                groupKanji: pronunciationSource === 'sudachi',
                tokenClassName: 'vocab-token',
                tokenWords: wordbookTokenWords,
              }),
            }}
          />,
        )
      }

      pushJapaneseSegment(value, `${key}-text`)
    }
    const pushMarkedText = (value: string, key: string) => {
      if (!value) return
      const markerPattern = /\+\+([\s\S]+?)\+\+/g
      let markerCursor = 0
      let markerMatch: RegExpExecArray | null
      let markerIndex = 0
      while ((markerMatch = markerPattern.exec(value)) !== null) {
        pushTextSegment(
          value.slice(markerCursor, markerMatch.index),
          `${key}-plain-${markerIndex}`,
        )
        pushTextSegment(
          markerMatch[1] || '',
          `${key}-underline-${markerIndex}`,
          true,
        )
        markerCursor = markerMatch.index + markerMatch[0].length
        markerIndex += 1
      }
      pushTextSegment(value.slice(markerCursor), `${key}-plain-${markerIndex}`)
    }
    const pushText = (value: string, key: string) => {
      if (!value) return
      const referencePattern = /\[\^([A-Za-z0-9_-]+)\]/g
      let referenceCursor = 0
      let referenceMatch: RegExpExecArray | null
      let referenceIndex = 0
      while ((referenceMatch = referencePattern.exec(value)) !== null) {
        pushMarkedText(
          value.slice(referenceCursor, referenceMatch.index),
          `${key}-content-${referenceIndex}`,
        )
        const footnote = footnoteById.get(referenceMatch[1])
        if (footnote) {
          const noteLabel = `注${footnote.label}`
          parts.push(
            <sup key={`${key}-note-${referenceIndex}`} className='mx-0.5'>
              <a
                id={`${footnoteAnchorPrefix}-${footnote.id}-ref`}
                href={`#${footnoteAnchorPrefix}-${footnote.id}`}
                title={
                  footnote.term
                    ? `${footnote.term}：${footnote.definition}`
                    : footnote.definition
                }
                className='rounded px-0.5 text-[0.65em] font-semibold text-slate-500 no-underline transition hover:bg-slate-100 hover:text-slate-950'>
                {noteLabel}
              </a>
            </sup>,
          )
        } else if (!footnote) {
          pushTextSegment(
            referenceMatch[0],
            `${key}-unknown-note-${referenceIndex}`,
          )
        }
        referenceCursor = referenceMatch.index + referenceMatch[0].length
        referenceIndex += 1
      }
      pushMarkedText(
        value.slice(referenceCursor),
        `${key}-content-${referenceIndex}`,
      )
    }

    while ((match = pattern.exec(text)) !== null) {
      pushText(text.slice(cursor, match.index), `text-${cursor}`)
      parts.push(
        <MathExpression
          key={`math-${match.index}`}
          expression={(match[1] || match[2] || '').trim()}
        />,
      )
      cursor = match.index + match[0].length
    }
    pushText(text.slice(cursor), `text-${cursor}`)
    return parts
  }

  const renderContentBlock = (block: ArticleContentBlock, index: number) => {
    if (block.type === 'math') {
      return (
        <div
          key={`math-${index}`}
          className='my-7 rounded-xl bg-slate-100/70 px-4 py-3 text-slate-950'>
          <MathExpression expression={block.expression} displayMode />
        </div>
      )
    }

    if (block.type === 'table') {
      const bodyRows = block.hasHeader ? block.rows.slice(1) : block.rows
      return (
        <div key={`table-${index}`} className='overflow-x-auto rounded-xl border border-slate-200 bg-white'>
          <table className='w-full min-w-[34rem] border-collapse text-left text-sm text-slate-800'>
            {block.hasHeader ? (
              <thead className='bg-slate-50'>
                <tr>
                  {block.rows[0].map((cell, cellIndex) => (
                    <th key={cellIndex} scope='col' className='border-b border-r border-slate-200 px-4 py-3 font-semibold last:border-r-0'>
                      {cell || '\u00a0'}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={rowIndex} className='border-b border-slate-100 last:border-b-0'>
                  {row.map((cell, cellIndex) => {
                    const Cell = block.hasHeader && cellIndex === 0 ? 'th' : 'td'
                    return (
                      <Cell
                        key={cellIndex}
                        {...(Cell === 'th' ? { scope: 'row' as const } : {})}
                        className={`border-r border-slate-100 px-4 py-3 align-top last:border-r-0 ${Cell === 'th' ? 'whitespace-nowrap bg-slate-50/60 font-semibold' : ''}`}>
                        {renderInlineText(cell, `block-${index}-row-${rowIndex}-cell-${cellIndex}`)}
                      </Cell>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    return (
      <p
        key={`text-${index}`}
        className='whitespace-pre-line text-justify [text-justify:inter-ideograph] text-[1.05rem] leading-[2.15] text-slate-800 md:text-[1.15rem] md:leading-[2.25]'>
        {renderInlineText(block.text, `block-${index}`)}
      </p>
    )
  }

  return (
    <section className='relative'>
      <div
        className={
          mode === 'ebook'
            ? 'sticky top-3 z-30 mx-auto mb-10 max-w-4xl rounded-2xl border border-slate-200 bg-white/92 px-4 py-3 shadow-sm backdrop-blur md:mb-14 md:px-5'
            : 'mx-auto mb-6 max-w-[44rem]'
        }>
        <div
          className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${mode === 'article' ? 'justify-end' : ''}`}>
          {mode === 'ebook' ? (
            <>
              <span className='shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] tabular-nums text-slate-500'>
                阅读进度
              </span>
              <div className='h-px min-w-24 flex-1 overflow-hidden bg-slate-300'>
                <div
                  className='h-full bg-slate-900 transition-[width] duration-200'
                  style={{ width: `${readingProgress}%` }}
                />
              </div>
              <span className='w-9 text-right text-xs tabular-nums text-slate-500'>
                {Math.round(readingProgress)}%
              </span>
            </>
          ) : null}
          <div className='flex w-full shrink-0 items-center justify-end divide-x divide-slate-300 sm:w-auto'>
          <button
            type='button'
            onClick={() => setSelectionEnabled(value => !value)}
            aria-pressed={selectionEnabled}
            className={`h-7 border-0 px-3 text-xs font-medium transition ${
              selectionEnabled
                ? 'text-slate-950 underline decoration-slate-400 underline-offset-4'
                : 'text-slate-400 hover:text-slate-700'
            }`}>
            划词
          </button>
          <button
            type='button'
            onClick={() => setRubyEnabled(value => !value)}
            aria-pressed={rubyEnabled}
            className={`h-7 border-0 px-3 text-xs font-medium transition ${
              rubyEnabled
                ? 'text-slate-950 underline decoration-slate-400 underline-offset-4'
                : 'text-slate-400 hover:text-slate-700'
            }`}>
            注音
          </button>
          {mode === 'article' && rubyEnabled ? (
            <div className='px-1'>
              <PronunciationSourceSelector
                value={pronunciationSource}
                onChange={setPronunciationSource}
                sudachiAvailable={automaticPronunciationAvailable}
              />
            </div>
          ) : null}
          {mode === 'article' ? (
            <button
              type='button'
              onClick={() => void handleCopyContent()}
              className='h-7 border-0 px-3 text-xs font-medium text-slate-950 underline decoration-slate-400 underline-offset-4 transition hover:text-slate-700'>
              <span aria-live='polite'>{copyLabel}</span>
            </button>
          ) : null}
          <button
            type='button'
            onClick={() => setNoteEnabled(value => !value)}
            aria-pressed={noteEnabled}
            className={`h-7 border-0 px-3 text-xs font-medium transition ${
              noteEnabled
                ? 'text-slate-950 underline decoration-slate-400 underline-offset-4'
                : 'text-slate-400 hover:text-slate-700'
            }`}>
            注释
          </button>
          <button
            type='button'
            onClick={() => setLearningPointsEnabled(value => !value)}
            aria-pressed={learningPointsEnabled}
            className={`h-7 border-0 px-3 text-xs font-medium transition ${
              learningPointsEnabled
                ? 'text-slate-950 underline decoration-slate-400 underline-offset-4'
                : 'text-slate-400 hover:text-slate-700'
            }`}>
            学习点
          </button>
          </div>
        </div>
        {noteEnabled && wordbookHighlightGroups.length > 0 ? (
          <WordbookHighlightSelector
            groups={wordbookHighlightGroups}
            hiddenWordbookIds={hiddenWordbookIds}
            onVisibilityChange={handleWordbookVisibilityChange}
            hiddenJlptLevels={hiddenJlptLevels}
            onJlptVisibilityChange={handleJlptVisibilityChange}
            onAllVisibilityChange={handleAllHighlightVisibilityChange}
          />
        ) : null}
      </div>

      {learningPointsEnabled || (noteEnabled && learningPoints.length > 0) ? (
        <div className='mx-auto mb-6 max-w-[44rem]'>
          <LearningPointHighlightPanel
            points={learningPoints}
            isLoading={isLoadingLearningPoints}
            selection={learningPointSelection}
            onClose={closeLearningPoint}
            onInspect={inspectLearningPoint}
            onInspectWord={inspectLearningPointWord}
          />
        </div>
      ) : null}

      <div
        className={`mx-auto grid max-w-5xl gap-8 ${
          readerChapters.length > 1
            ? 'lg:grid-cols-[13rem_minmax(0,44rem)] lg:justify-center'
            : ''
        }`}>
        {readerChapters.length > 1 ? (
          <aside className='max-h-[32rem] overflow-y-auto border-y border-slate-200 py-2'>
            {readerChapters.map((chapter, index) => (
              <button
                key={`${chapter.id}-${index}`}
                type='button'
                onClick={() => setActiveChapterIndex(index)}
                className={`block w-full border-b border-slate-100 px-2 py-3 text-left text-sm font-medium transition ${
                  index === activeChapterIndex
                    ? 'text-slate-950 underline underline-offset-4'
                    : 'text-slate-500 hover:text-slate-900'
                }`}>
                <span className='block truncate'>{chapter.title}</span>
              </button>
            ))}
          </aside>
        ) : null}

        <article
          ref={readerRef}
          data-source-type={SourceType.ARTICLE_TEXT}
          data-source-id={articleId}
          data-context-block
          className={`min-w-0 space-y-5 ${
            readerChapters.length > 1 ? '' : 'mx-auto w-full max-w-[44rem]'
          }`}>
          {readerChapters.length > 1 ? (
            <div className='flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between'>
              <h3 className='text-xl font-bold text-slate-900'>
                {activeChapter.title}
              </h3>
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={() =>
                    setActiveChapterIndex(index => Math.max(0, index - 1))
                  }
                  disabled={activeChapterIndex === 0}
                  className='h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'>
                  {mode === 'ebook' ? '上一章' : '上一页'}
                </button>
                <span className='text-xs font-bold text-slate-400'>
                  {mode === 'ebook' ? '章节 ' : ''}
                  {activeChapterIndex + 1}/{readerChapters.length}
                </span>
                <button
                  type='button'
                  onClick={() =>
                    setActiveChapterIndex(index =>
                      Math.min(readerChapters.length - 1, index + 1),
                    )
                  }
                  disabled={activeChapterIndex >= readerChapters.length - 1}
                  className='h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'>
                  {mode === 'ebook' ? '下一章' : '下一页'}
                </button>
              </div>
            </div>
          ) : null}

          <div className='font-reading-body-ja space-y-8 px-1 py-1 md:px-2'>
            {contentBlocks.length > 0 ? (
              contentBlocks.map(renderContentBlock)
            ) : (
              <p className='text-sm text-slate-500'>暂无正文内容。</p>
            )}
          </div>

          {footnoteDocument.footnotes.length > 0 ? (
            <aside aria-label='文章脚注' className='mt-12'>
              <ol className='space-y-2.5 text-sm leading-7 text-slate-600'>
                {footnoteDocument.footnotes.map(
                  (footnote: ArticleFootnote) => (
                    <li
                      key={footnote.id}
                      id={`${footnoteAnchorPrefix}-${footnote.id}`}
                      className='scroll-mt-24 grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-2 border-b border-slate-100 pb-2.5 last:border-b-0'>
                      <span className='text-xs font-semibold tabular-nums text-slate-400'>
                        注{footnote.label}
                      </span>
                      <span>
                        {footnote.term ? (
                          <strong className='font-semibold text-slate-800'>
                            {renderInlineText(footnote.term, `note-${footnote.id}-term`)}：
                          </strong>
                        ) : null}
                        {renderInlineText(footnote.definition, `note-${footnote.id}-definition`)}
                      </span>
                      {footnoteDocument.body.includes(`[^${footnote.id}]`) ? (
                        <a
                          href={`#${footnoteAnchorPrefix}-${footnote.id}-ref`}
                          aria-label={`返回注${footnote.label}在正文中的位置`}
                          className='text-xs text-slate-400 transition hover:text-slate-900'>
                          ↩
                        </a>
                      ) : null}
                    </li>
                  ),
                )}
              </ol>
            </aside>
          ) : null}

          {noteEnabled && wordbookDistributionWords.length > 0 ? (
            <div className='mt-12'>
              {wordbookDistribution ? (
                <WordbookDistributionChart
                  distribution={wordbookDistribution}
                  title='本文单词书分布'
                  description={`按正文中的 ${wordbookDistribution.totalWords} 个去重词统计；单词书归属仅用于分布，不会生成释义注号。`}
                />
              ) : distributionLoadState === 'error' ? (
                <button
                  type='button'
                  onClick={() => setDistributionRetryKey(value => value + 1)}
                  className='ui-btn text-xs text-slate-500'>
                  分布加载失败，重试
                </button>
              ) : (
                <p className='border-y border-slate-200 py-5 text-xs text-slate-400'>
                  正在统计本文的单词书分布…
                </p>
              )}
            </div>
          ) : null}
        </article>
      </div>

      {selectionEnabled && selection.isVisible && selection.sourceType !== '' ? (
        <>
          <div className='pointer-events-none fixed inset-0 z-40'>
            {selection.rects.map((rect, index) => (
              <span
                key={`${rect.left}-${rect.top}-${index}`}
                className='absolute rounded-[2px] bg-blue-400/35'
                style={{
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                }}
              />
            ))}
          </div>
          <WordTooltip
            word={selection.detectedWord?.surface || selection.text}
            x={selection.x}
            y={selection.y}
            isTop={selection.isTop}
            contextSentence={selection.contextSentence}
            sourceType={selection.sourceType}
            sourceId={selection.sourceId}
            initialMeta={
              localVocabularyMetaMap[
                selection.detectedWord?.dictionaryForm || selection.text
              ] ||
              localVocabularyMetaMap[selection.detectedWord?.surface || ''] ||
              localVocabularyMetaMap[selection.text]
            }
            detectedWord={selection.detectedWord}
            onClose={closeSelection}
            onSaved={update =>
              setLocalVocabularyMetaMap(prev => applyVocabularyInspectorMetaUpdate(prev, update))
            }
          />
        </>
      ) : null}

      {inspectedWord ? (
        <VocabularyWordbookInspector
          word={inspectedWord.word}
          matchedVariant={inspectedWord.matchedVariant}
          wordbookId={inspectedWord.wordbookId}
          x={inspectedWord.x}
          y={inspectedWord.y}
          onClose={() => setInspectedWord(null)}
          onSaved={({ membershipsChanged, ...update }) => {
            setLocalVocabularyMetaMap(current => applyVocabularyInspectorMetaUpdate(current, update))
            if (membershipsChanged) {
              setWordbookDistribution(null)
              setDistributionRetryKey(value => value + 1)
            }
          }}
        />
      ) : null}
    </section>
  )
}
