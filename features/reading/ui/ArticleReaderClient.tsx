'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SourceType } from '@prisma/client'
import WordTooltip from '@/components/exam/WordTooltip'
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
import { removeRepeatedEbookHeadings } from '@/lib/ebooks/chapter-display'
import {
  parseArticleContentBlocks,
  type ArticleContentBlock,
} from '@/features/reading/domain/article-blocks'
import MathExpression from '@/features/reading/ui/MathExpression'
import ExtractVocabularyPanel from '@/features/reading/ui/ExtractVocabularyPanel'
import { copyText } from '@/features/reading/ui/copy-text'
import type {
  SudachiLexeme,
  VocabularyCandidate,
} from '@/features/reading/domain/sudachi'

type ReaderChapter = {
  id: string
  title: string
  text: string
  href: string
}

type PronunciationSource = 'sudachi' | 'personal'

const PRONUNCIATION_SOURCE_KEY = 'mimiflow_article_pronunciation_source'

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
  initialVocabularyCandidates = [],
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
  initialVocabularyCandidates?: VocabularyCandidate[]
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
  const [selectionEnabled, setSelectionEnabled] = useState(true)
  const [rubyEnabled, setRubyEnabled] = useState(true)
  const [pronunciationSource, setPronunciationSourceState] =
    useState<PronunciationSource>(sudachiAvailable ? 'sudachi' : 'personal')
  const [noteEnabled, setNoteEnabled] = useState(true)
  const [extractPanelOpen, setExtractPanelOpen] = useState(false)
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
  const { selection, closeSelection } = useTextSelection()
  const readerChapters =
    chapters.length > 0
      ? chapters
      : [{ id: 'article', title: '正文', text: content, href: '' }]
  const activeChapter =
    readerChapters[activeChapterIndex] || readerChapters[0]

  useEffect(() => {
    if (mode !== 'article') return
    const stored = window.localStorage.getItem(PRONUNCIATION_SOURCE_KEY)
    if (stored === 'personal' || (stored === 'sudachi' && sudachiAvailable)) {
      setPronunciationSourceState(stored)
    }
  }, [mode, sudachiAvailable])

  const setPronunciationSource = (source: PronunciationSource) => {
    if (source === 'sudachi' && !sudachiAvailable) return
    setPronunciationSourceState(source)
    window.localStorage.setItem(PRONUNCIATION_SOURCE_KEY, source)
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
              initialSudachiLexicon,
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
      ? initialSudachiPronunciationMap
      : basePronMap

  const contentBlocks = useMemo(() => {
    const items = splitParagraphs(activeChapter?.text || '')
    const visibleItems = mode !== 'ebook'
      ? items
      : removeRepeatedEbookHeadings(
          items,
          documentTitle,
          activeChapter?.title || '',
        )
    return parseArticleContentBlocks(visibleItems)
  }, [activeChapter, documentTitle, mode])

  const activeChapterMetaMap = useMemo(() => {
    const aliasMap = buildSurfaceAliasMapForText(
      activeChapter?.text || '',
      Object.keys(localVocabularyMetaMap),
    )
    const baseWords = new Set(Object.values(aliasMap))
    return Object.entries(localVocabularyMetaMap).reduce<
      Record<string, VocabularyMeta>
    >((acc, [word, meta]) => {
      if (baseWords.has(word)) acc[word] = meta
      return acc
    }, {})
  }, [activeChapter, localVocabularyMetaMap])

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
      if (mode === 'article' && Object.keys(initialSudachiLexicon).length > 0) {
        const personalPronunciationMap = buildPronunciationMapForText(
          value,
          basePronMap,
        )
        parts.push(
          <span
            key={key}
            className={`${underlined ? 'exam-text-underline ' : ''}[&_rt]:text-[0.6em] [&_ruby]:mx-0.5`}
            dangerouslySetInnerHTML={{
              __html: annotateJapaneseTextWithSudachi(
                value,
                initialSudachiLexicon,
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
          <span key={key} className={underlined ? 'exam-text-underline' : ''}>
            {value}
          </span>,
        )
        return
      }
      const pronMap =
        pronunciationSource === 'sudachi'
          ? initialSudachiPronunciationMap
          : buildPronunciationMapForText(value, selectedPronunciationMap)
      parts.push(
        <span
          key={key}
          className={`${underlined ? 'exam-text-underline ' : ''}[&_rt]:text-[0.6em] [&_ruby]:mx-0.5`}
          dangerouslySetInnerHTML={{
            __html: annotateJapaneseText(value, pronMap, {
              rubyClassName: 'text-slate-900',
              rtClassName: 'text-slate-500',
              groupKanji: pronunciationSource === 'sudachi',
            }),
          }}
        />,
      )
    }
    const pushText = (value: string, key: string) => {
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
            <div
              role='radiogroup'
              aria-label='注音来源'
              className='flex items-center gap-1 px-2'>
              <button
                type='button'
                role='radio'
                aria-checked={pronunciationSource === 'sudachi'}
                disabled={!sudachiAvailable}
                title={sudachiAvailable ? '显示 SudachiPy 自动注音' : 'SudachiPy 当前不可用'}
                onClick={() => setPronunciationSource('sudachi')}
                className={`rounded-full px-2 py-1 text-[11px] font-medium transition ${
                  pronunciationSource === 'sudachi'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                } disabled:cursor-not-allowed disabled:opacity-40`}>
                SudachiPy
              </button>
              <button
                type='button'
                role='radio'
                aria-checked={pronunciationSource === 'personal'}
                onClick={() => setPronunciationSource('personal')}
                className={`rounded-full px-2 py-1 text-[11px] font-medium transition ${
                  pronunciationSource === 'personal'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`}>
                我的
              </button>
            </div>
          ) : null}
          {mode === 'article' ? (
            <button
              type='button'
              onClick={() => setExtractPanelOpen(value => !value)}
              aria-pressed={extractPanelOpen}
              className={`h-7 border-0 px-3 text-xs font-medium transition ${
                extractPanelOpen
                  ? 'text-slate-950 underline decoration-slate-400 underline-offset-4'
                  : 'text-slate-500 hover:text-slate-900'
              }`}>
              提取生词
            </button>
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
          </div>
        </div>
      </div>

      {mode === 'article' && extractPanelOpen ? (
        <ExtractVocabularyPanel
          articleId={articleId}
          initialCandidates={initialVocabularyCandidates.filter(
            item => !localVocabularyMetaMap[item.word],
          )}
          onSaved={items =>
            setLocalVocabularyMetaMap(current => {
              const next = { ...current }
              items.forEach(item => {
                next[item.word] = item.meta
              })
              return next
            })
          }
        />
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

          {noteEnabled && Object.keys(activeChapterMetaMap).length > 0 ? (
            <div className='mt-12 border-y border-slate-200 py-6'>
              <h3 className='text-sm font-semibold text-slate-900'>本篇注释</h3>
              <div className='mt-4 divide-y divide-slate-200'>
                {Object.entries(activeChapterMetaMap).map(([word, meta]) => (
                  <div
                    key={word}
                    className='grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]'>
                    <p className='text-sm font-black text-slate-900'>{word}</p>
                    <p className='mt-1 text-xs text-slate-500'>
                      {[meta.pronunciations[0], meta.meanings[0]]
                        .filter(Boolean)
                        .join(' · ') || '暂无注释'}
                    </p>
                  </div>
                ))}
              </div>
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
    </section>
  )
}
