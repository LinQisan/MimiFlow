'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SourceType } from '@prisma/client'
import WordTooltip from '@/components/exam/WordTooltip'
import { useTextSelection } from '@/hooks/useTextSelection'
import { saveReadingProgress } from '../../progress-actions'
import { annotateJapaneseText } from '@/utils/language/japaneseRuby'
import {
  buildPronunciationMapForText,
  buildSurfaceAliasMapForText,
} from '@/utils/vocabulary/japaneseInflection'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

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
  initialProgressPercent = 0,
}: {
  articleId: string
  content: string
  chapters: ReaderChapter[]
  initialVocabularyMetaMap: Record<string, VocabularyMeta>
  initialProgressPercent?: number
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
  const [noteEnabled, setNoteEnabled] = useState(true)
  const [readingProgress, setReadingProgress] = useState(
    Math.max(0, Math.min(100, initialProgressPercent)),
  )
  const readerRef = useRef<HTMLElement | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const restoredRef = useRef(false)
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
    if (readerChapters.length > 1 || restoredRef.current) return
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
  }, [initialProgressPercent, readerChapters.length])

  useEffect(() => {
    if (readerChapters.length > 1) return

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
  }, [articleId, readerChapters.length])

  useEffect(() => {
    if (readerChapters.length <= 1) return
    const nextProgress = ((activeChapterIndex + 1) / readerChapters.length) * 100
    setReadingProgress(nextProgress)
    void saveReadingProgress({
      articleId,
      progressPercent: nextProgress,
      lastPosition: `第 ${activeChapterIndex + 1}/${readerChapters.length} 页`,
    })
  }, [activeChapterIndex, articleId, readerChapters.length])

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

  const paragraphs = useMemo(
    () => splitParagraphs(activeChapter?.text || ''),
    [activeChapter],
  )

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

  const renderParagraph = (paragraph: string, index: number) => {
    if (!rubyEnabled) {
      return (
        <p key={index} className='text-base leading-8 text-slate-800 md:text-lg'>
          {paragraph}
        </p>
      )
    }

    const pronMap = buildPronunciationMapForText(paragraph, basePronMap)

    return (
      <p
        key={index}
        className='text-base leading-9 text-slate-800 md:text-lg [&_rt]:text-[0.62em] [&_ruby]:mx-0.5'
        dangerouslySetInnerHTML={{
          __html: annotateJapaneseText(paragraph, pronMap, {
            rubyClassName: 'text-slate-900',
            rtClassName: 'text-slate-500',
          }),
        }}
      />
    )
  }

  return (
    <section className='relative'>
      <div className='sticky top-0 z-30 -mx-2 mb-5 border-y border-slate-200 bg-slate-50/95 px-2 py-2 backdrop-blur md:mx-0 md:rounded-lg md:border md:bg-white/95 md:px-3'>
        <div className='flex flex-wrap items-center gap-2 md:gap-3'>
          <span className='shrink-0 text-sm font-bold tabular-nums text-slate-700'>
            阅读 {Math.round(readingProgress)}%
          </span>
          <div className='order-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 md:order-none md:flex-1'>
            <div
              className='h-full rounded-full bg-slate-900 transition-[width] duration-200'
              style={{ width: `${readingProgress}%` }}
            />
          </div>
          <div className='ml-auto flex shrink-0 gap-1.5'>
          <button
            type='button'
            onClick={() => setSelectionEnabled(value => !value)}
            aria-pressed={selectionEnabled}
            className={`h-8 rounded-lg border px-2.5 text-xs font-bold transition ${
              selectionEnabled
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}>
            划词
          </button>
          <button
            type='button'
            onClick={() => setRubyEnabled(value => !value)}
            aria-pressed={rubyEnabled}
            className={`h-8 rounded-lg border px-2.5 text-xs font-bold transition ${
              rubyEnabled
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}>
            注音
          </button>
          <button
            type='button'
            onClick={() => setNoteEnabled(value => !value)}
            aria-pressed={noteEnabled}
            className={`h-8 rounded-lg border px-2.5 text-xs font-bold transition ${
              noteEnabled
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}>
            注释
          </button>
          </div>
        </div>
      </div>

      <div
        className={`grid gap-5 ${
          readerChapters.length > 1
            ? 'lg:grid-cols-[15rem_minmax(0,1fr)]'
            : ''
        }`}>
        {readerChapters.length > 1 ? (
          <aside className='max-h-[32rem] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2'>
            {readerChapters.map((chapter, index) => (
              <button
                key={`${chapter.id}-${index}`}
                type='button'
                onClick={() => setActiveChapterIndex(index)}
                className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-bold transition ${
                  index === activeChapterIndex
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
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
            readerChapters.length > 1 ? '' : 'mx-auto w-full max-w-3xl'
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
                  上一页
                </button>
                <span className='text-xs font-bold text-slate-400'>
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
                  下一页
                </button>
              </div>
            </div>
          ) : null}

          <div className='space-y-6 px-1 py-1 md:px-3'>
            {paragraphs.length > 0 ? (
              paragraphs.map(renderParagraph)
            ) : (
              <p className='text-sm text-slate-500'>暂无正文内容。</p>
            )}
          </div>

          {noteEnabled && Object.keys(activeChapterMetaMap).length > 0 ? (
            <div className='mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4'>
              <h3 className='text-sm font-black text-slate-900'>本篇注释</h3>
              <div className='mt-3 grid gap-2 md:grid-cols-2'>
                {Object.entries(activeChapterMetaMap).map(([word, meta]) => (
                  <div
                    key={word}
                    className='rounded-xl border border-slate-200 bg-white px-3 py-2'>
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
            word={selection.text}
            x={selection.x}
            y={selection.y}
            isTop={selection.isTop}
            contextSentence={selection.contextSentence}
            sourceType={selection.sourceType}
            sourceId={selection.sourceId}
            initialMeta={localVocabularyMetaMap[selection.text]}
            onClose={closeSelection}
            onSaved={({ word, meta }) =>
              setLocalVocabularyMetaMap(prev => ({
                ...prev,
                [word]: meta,
                ...(selection.text && selection.text !== word
                  ? { [selection.text]: meta }
                  : {}),
              }))
            }
          />
        </>
      ) : null}
    </section>
  )
}
