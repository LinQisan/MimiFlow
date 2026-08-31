'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { SourceType } from '@prisma/client'
import { useTextSelection } from '@/hooks/useTextSelection'
import { saveReadingProgress } from '@/features/reading/progress-actions'
import {
  annotateJapaneseText,
  annotateJapaneseTextWithSudachi,
  formatJapaneseTextWithRubyNotation,
  formatJapaneseTextWithSudachiRubyNotation,
} from '@/utils/language/japaneseRuby'
import {
  buildPronunciationMapForText,
  buildSurfaceAliasMapForText,
} from '@/utils/vocabulary/japaneseInflection'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { hasVocabularyMeaning } from '@/utils/vocabulary/vocabularyMeaning'
import type { PaperWordbookDistribution } from '@/features/practice/domain/paper-word-frequency'
import WordbookDistributionChart from '@/components/vocabulary/WordbookDistributionChart'
import { removeRepeatedEbookHeadings } from '@/lib/ebooks/chapter-display'
import {
  parseArticleContentBlocks,
  type ArticleContentBlock,
} from '@/features/reading/domain/article-blocks'
import {
  parseArticleFootnotes,
  type ArticleFootnote,
} from '@/features/reading/domain/article-footnotes'
import { copyText } from '@/features/reading/ui/copy-text'
import type { SudachiLexeme } from '@/modules/language/domain/sudachi'
import PronunciationSourceSelector, {
  PRONUNCIATION_SOURCE_STORAGE_KEY,
  type PronunciationSource,
} from '@/components/ui/PronunciationSourceSelector'
import {
  readUserStorageValue,
  useCurrentUser,
  userStorageKey,
} from '@/context/UserContext'
import {
  useStudyTextHighlights,
  resolveWordbookHighlightSlot,
  wordbookHighlightKeyClass,
} from '@/hooks/useStudyTextHighlights'
import LearningPointHighlightPanel from '@/modules/knowledge/learning-records/components/LearningPointHighlightPanel'
import VocabularyWordbookInspector from '@/modules/knowledge/vocabulary/components/VocabularyWordbookInspector'

const MathExpression = dynamic(
  () => import('@/features/reading/ui/MathExpression'),
)
const WordTooltip = dynamic(() => import('@/components/exam/WordTooltip'))

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
  initialVocabularyMetaMap: Record<string, VocabularyMeta>
  initialSudachiPronunciationMap?: Record<string, string>
  initialSudachiLexicon?: Record<string, SudachiLexeme>
  initialWordbookDistributionWords?: string[]
  sudachiAvailable?: boolean
  initialProgressPercent?: number
  mode?: 'article' | 'ebook'
  documentTitle?: string
}) {
  const currentUser = useCurrentUser()
  const pronunciationStorageKey = userStorageKey(
    currentUser.id,
    PRONUNCIATION_SOURCE_STORAGE_KEY,
  )
  const initialChapterIndex =
    chapters.length > 1
      ? Math.min(
          chapters.length - 1,
          Math.floor((Math.max(0, initialProgressPercent) / 100) * chapters.length),
        )
      : 0
  const [activeChapterIndex, setActiveChapterIndex] =
    useState(initialChapterIndex)
  const [selectionEnabled, setSelectionEnabled] = useState(true)
  const [rubyEnabled, setRubyEnabled] = useState(true)
  const [pronunciationSource, setPronunciationSourceState] =
    useState<PronunciationSource>(sudachiAvailable ? 'sudachi' : 'personal')
  const [automaticPronunciationAvailable, setAutomaticPronunciationAvailable] =
    useState(sudachiAvailable)
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
  const [inspectedWord, setInspectedWord] = useState<{
    word: string
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
        setWordbookDistribution(null)
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setWordbookDistributionWords(Object.keys(initialVocabularyMetaMap))
      })

    return () => controller.abort()
  }, [analysisTexts, initialVocabularyMetaMap, mode, sudachiAvailable])

  useEffect(() => {
    if (mode !== 'article') return
    const stored = readUserStorageValue(
      currentUser.id,
      PRONUNCIATION_SOURCE_STORAGE_KEY,
    )
    if (
      stored === 'personal' ||
      (stored === 'sudachi' && automaticPronunciationAvailable)
    ) {
      setPronunciationSourceState(stored)
    }
  }, [
    automaticPronunciationAvailable,
    currentUser.id,
    mode,
    pronunciationStorageKey,
  ])

  const setPronunciationSource = (source: PronunciationSource) => {
    if (source === 'sudachi' && !automaticPronunciationAvailable) return
    setPronunciationSourceState(source)
    window.localStorage.setItem(pronunciationStorageKey, source)
  }

  const handleCopyContent = async () => {
    const text = activeChapter?.text || content
    if (!text.trim()) return
    try {
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
          const pron = meta.pronunciations[0]
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
  const annotationAnchorPrefix = `article-${articleId}-${activeChapterIndex}-annotation`

  const activeChapterAnnotations = useMemo(() => {
    const chapterText = footnoteDocument.body
    const wordsWithMeanings = Object.entries(localVocabularyMetaMap)
      .filter(([, meta]) => hasVocabularyMeaning(meta))
      .map(([word]) => word)
    const aliasMap = buildSurfaceAliasMapForText(
      chapterText,
      wordsWithMeanings,
    )
    const firstOccurrenceByWord = new Map<
      string,
      { word: string; surface: string; position: number; meta: VocabularyMeta }
    >()

    Object.entries(aliasMap).forEach(([surface, word]) => {
      const position = chapterText.indexOf(surface)
      const meta = localVocabularyMetaMap[word]
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
          left.position - right.position || right.surface.length - left.surface.length,
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
  }, [footnoteDocument.body, localVocabularyMetaMap])

  useEffect(() => {
    if (mode !== 'article' || !noteEnabled) return
    const scrollToArticleHash = () => {
      let targetId = ''
      try {
        targetId = decodeURIComponent(window.location.hash.slice(1))
      } catch {
        return
      }
      if (!targetId.startsWith(`${annotationAnchorPrefix}-`)) return
      window.requestAnimationFrame(() => {
        document.getElementById(targetId)?.scrollIntoView({ block: 'start' })
      })
    }
    scrollToArticleHash()
    window.addEventListener('hashchange', scrollToArticleHash)
    return () => window.removeEventListener('hashchange', scrollToArticleHash)
  }, [
    activeChapterAnnotations.length,
    annotationAnchorPrefix,
    mode,
    noteEnabled,
    pronunciationSource,
    rubyEnabled,
    sudachiLexicon,
  ])

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

  const annotatedChapterBody = useMemo(() => {
    if (!noteEnabled) return footnoteDocument.body
    let next = footnoteDocument.body
    ;[...activeChapterAnnotations]
      .sort((left, right) => right.position - left.position)
      .forEach(annotation => {
        const markerPosition = annotation.position + annotation.surface.length
        next = `${next.slice(0, markerPosition)}[[ARTICLE_ANNOTATION_${annotation.label}]]${next.slice(markerPosition)}`
      })
    return next
  }, [activeChapterAnnotations, footnoteDocument.body, noteEnabled])

  const wordbookHighlightGroups = useMemo(
    () =>
      (wordbookDistribution?.wordbooks || [])
        .map(wordbook => ({
          id: wordbook.id,
          label: wordbook.pathLabel,
          words: wordbook.matchedWords,
          slot: resolveWordbookHighlightSlot(wordbook.pathLabel),
        }))
        .sort(
          (left, right) =>
            left.slot - right.slot ||
            Number(!/\/\s*N[1-5]\s*$/i.test(left.label)) -
              Number(!/\/\s*N[1-5]\s*$/i.test(right.label)) ||
            left.label.localeCompare(right.label, 'ja'),
        ),
    [wordbookDistribution],
  )
  const visibleWordbookHighlightGroups = useMemo(
    () =>
      wordbookHighlightGroups.filter(group => !hiddenWordbookIds.has(group.id)),
    [hiddenWordbookIds, wordbookHighlightGroups],
  )
  const { learningPoints, isLoadingLearningPoints } = useStudyTextHighlights({
    rootRef: readerRef,
    contentKey: `${articleId}:${activeChapterIndex}:${noteEnabled}:${rubyEnabled}:${pronunciationSource}:${Object.keys(sudachiLexicon).length}`,
    showLearningPoints: learningPointsEnabled,
    showWordbooks: noteEnabled,
    wordbookGroups: visibleWordbookHighlightGroups,
    onWordbookWordClick: setInspectedWord,
  })

  const contentBlocks = useMemo(() => {
    const items = splitParagraphs(annotatedChapterBody)
    const visibleItems = mode !== 'ebook'
      ? items
      : removeRepeatedEbookHeadings(
          items,
          documentTitle,
          activeChapter?.title || '',
        )
    return parseArticleContentBlocks(visibleItems)
  }, [activeChapter?.title, annotatedChapterBody, documentTitle, mode])

  const renderInlineText = (text: string) => {
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
      const annotationPattern = /\[\[ARTICLE_ANNOTATION_(\d+)\]\]/g
      let annotationCursor = 0
      let annotationMatch: RegExpExecArray | null
      let annotationIndex = 0
      const pushJapaneseSegment = (segment: string, segmentKey: string) => {
        if (!segment) return
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
                  },
                ),
              }}
            />,
          )
          return
        }
        if (!rubyEnabled) {
          parts.push(
            <span
              key={segmentKey}
              className={underlined ? 'exam-text-underline' : ''}>
              {segment}
            </span>,
          )
          return
        }
        const pronMap =
          pronunciationSource === 'sudachi'
            ? sudachiPronunciationMap
            : buildPronunciationMapForText(segment, selectedPronunciationMap)
        parts.push(
          <span
            key={segmentKey}
            className={`${underlined ? 'exam-text-underline ' : ''}[&_rt]:text-[0.6em] [&_ruby]:mx-0.5`}
            dangerouslySetInnerHTML={{
              __html: annotateJapaneseText(segment, pronMap, {
                rubyClassName: 'text-slate-900',
                rtClassName: 'text-slate-500',
                groupKanji: pronunciationSource === 'sudachi',
              }),
            }}
          />,
        )
      }

      while ((annotationMatch = annotationPattern.exec(value)) !== null) {
        pushJapaneseSegment(
          value.slice(annotationCursor, annotationMatch.index),
          `${key}-text-${annotationIndex}`,
        )
        const label = Number(annotationMatch[1])
        parts.push(
          <sup key={`${key}-annotation-${annotationIndex}`} className='mx-0.5'>
            <a
              id={`${annotationAnchorPrefix}-${label}-ref`}
              href={`#${annotationAnchorPrefix}-${label}`}
              className='rounded px-0.5 text-[0.65em] font-semibold text-slate-500 no-underline transition hover:bg-slate-100 hover:text-slate-950'>
              释{label}
            </a>
          </sup>,
        )
        annotationCursor = annotationMatch.index + annotationMatch[0].length
        annotationIndex += 1
      }
      pushJapaneseSegment(
        value.slice(annotationCursor),
        `${key}-text-${annotationIndex}`,
      )
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
                        {renderInlineText(cell)}
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
        {renderInlineText(block.text)}
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
          <div className='mt-2 border-t border-slate-200 pt-2'>
            <div className='mb-2 flex items-center justify-between gap-3 text-[11px] text-slate-400'>
              <span>单词本高亮</span>
              <button
                type='button'
                onClick={() =>
                  setHiddenWordbookIds(current =>
                    current.size > 0
                      ? new Set()
                      : new Set(wordbookHighlightGroups.map(group => group.id)),
                  )
                }
                className='font-semibold text-slate-500 transition hover:text-slate-900'>
                {hiddenWordbookIds.size > 0 ? '全部显示' : '全部隐藏'}
              </button>
            </div>
            <div className='flex flex-wrap justify-end gap-1.5'>
              {wordbookHighlightGroups.map(group => {
                const hidden = hiddenWordbookIds.has(group.id)
                const parts = group.label
                  .split(/\s*\/\s*/)
                  .map(part => part.trim())
                  .filter(Boolean)
                const shortName = parts.at(-1) || group.label
                return (
                  <button
                    key={group.id}
                    type='button'
                    aria-pressed={!hidden}
                    onClick={() =>
                      setHiddenWordbookIds(current => {
                        const next = new Set(current)
                        if (next.has(group.id)) next.delete(group.id)
                        else next.add(group.id)
                        return next
                      })
                    }
                    title={`${hidden ? '显示' : '隐藏'} ${group.label}`}
                    className={`flex h-7 items-center gap-1.5 rounded-md border bg-white px-2 text-left transition ${
                      hidden
                        ? 'border-dashed border-slate-200 text-slate-400 opacity-65 hover:opacity-100'
                        : `border-b-2 border-x-slate-200 border-t-slate-200 text-slate-700 ${wordbookHighlightKeyClass(group.slot)}`
                    }`}>
                    <span
                      aria-hidden='true'
                      className={`size-2 shrink-0 rounded-full border-4 ${
                        hidden
                          ? 'border-slate-300'
                          : wordbookHighlightKeyClass(group.slot)
                      }`}
                    />
                    <span className='text-xs font-semibold'>{shortName}</span>
                    <span className='text-[10px] tabular-nums text-slate-400'>
                      {group.words.length}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {learningPointsEnabled ? (
        <div className='mx-auto mb-6 max-w-[44rem]'>
          <LearningPointHighlightPanel
            points={learningPoints}
            isLoading={isLoadingLearningPoints}
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
              <h3 className='text-xl font-black text-slate-900'>
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
                            {renderInlineText(footnote.term)}：
                          </strong>
                        ) : null}
                        {renderInlineText(footnote.definition)}
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

          {noteEnabled && activeChapterAnnotations.length > 0 ? (
            <aside aria-label='文章注释' className='mt-12'>
              <ol className='space-y-2.5 text-sm leading-7 text-slate-600'>
                {activeChapterAnnotations.map(
                  ({ word, meta, label }) => (
                    <li
                      key={word}
                      id={`${annotationAnchorPrefix}-${label}`}
                      className='scroll-mt-24 grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-2 border-b border-slate-100 pb-2.5 last:border-b-0'>
                      <span className='text-xs font-semibold tabular-nums text-slate-400'>
                        释{label}
                      </span>
                      <span>
                        <strong className='font-semibold text-slate-800'>
                          {word}
                        </strong>
                        <span className='ml-2 text-slate-500'>
                          {[meta.pronunciations[0], ...meta.meanings]
                            .filter(
                              (value): value is string =>
                                typeof value === 'string',
                            )
                            .map(value => value.trim())
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <a
                        href={`#${annotationAnchorPrefix}-${label}-ref`}
                        aria-label={`返回释${label}在正文中的位置`}
                        className='text-xs text-slate-400 transition hover:text-slate-900'>
                        ↩
                      </a>
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
            onSaved={({ word, meta }) =>
              setLocalVocabularyMetaMap(prev => ({
                ...prev,
                [word]: meta,
              }))
            }
          />
        </>
      ) : null}

      {inspectedWord ? (
        <VocabularyWordbookInspector
          word={inspectedWord.word}
          x={inspectedWord.x}
          y={inspectedWord.y}
          onClose={() => setInspectedWord(null)}
          onSaved={({ word, meta, membershipsChanged }) => {
            setLocalVocabularyMetaMap(current => ({ ...current, [word]: meta }))
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
