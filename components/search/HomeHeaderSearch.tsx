'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  searchGlobalContent,
  type GlobalSearchResult,
  type GlobalSearchType,
} from '@/app/actions/globalSearch'

const SEARCH_TYPES: GlobalSearchType[] = [
  'vocabulary',
  'sentence',
  'passage',
  'quiz',
  'question',
  'dialogue',
]

const TYPE_LABEL: Record<GlobalSearchType, string> = {
  vocabulary: '单词',
  sentence: '句子',
  passage: '阅读',
  quiz: '题库',
  question: '题目',
  dialogue: '听力',
}

function highlight(text: string, keyword: string) {
  if (!keyword.trim()) return text
  const pieces = text.split(new RegExp(`(${keyword})`, 'gi'))
  return pieces.map((piece, idx) =>
    piece.toLowerCase() === keyword.toLowerCase() ? (
      <mark key={idx} className='rounded-sm bg-slate-200 px-0.5'>
        {piece}
      </mark>
    ) : (
      piece
    ),
  )
}

export default function HomeHeaderSearch() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const mobileSheetRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const previewResults = useMemo(() => results.slice(0, 7), [results])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const closeSearch = () => setExpanded(false)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(event.target as Node)) return
      if (
        mobileSheetRef.current &&
        mobileSheetRef.current.contains(event.target as Node)
      ) {
        return
      }
      closeSearch()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    if (!expanded) return
    const q = keyword.trim()
    if (!q) {
      setResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timer = window.setTimeout(() => {
      void searchGlobalContent(q, { types: SEARCH_TYPES })
        .then(next => setResults(next))
        .finally(() => setIsSearching(false))
    }, 180)

    return () => window.clearTimeout(timer)
  }, [expanded, keyword])

  useEffect(() => {
    if (!expanded) return
    window.setTimeout(() => inputRef.current?.focus(), 60)
  }, [expanded, isMobile])

  const renderResultList = () => (
    <>
      {isSearching && (
        <div className='px-3 py-7 text-center text-sm text-slate-500'>搜索中...</div>
      )}

      {!isSearching && keyword.trim() && previewResults.length === 0 && (
        <div className='px-3 py-7 text-center text-sm text-slate-500'>没有匹配结果</div>
      )}

      {!isSearching && !keyword.trim() && (
        <div className='px-3 py-7 text-center text-sm text-slate-500'>
          输入关键词，直接跳转到内容
        </div>
      )}

      {!isSearching &&
        previewResults.map(item => (
          <Link
            key={`home-search-${item.id}`}
            href={item.href}
            onClick={closeSearch}
            className='block rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-slate-200 hover:bg-slate-50'>
            <div className='flex items-center gap-2'>
              <span className='ui-tag ui-tag-muted h-5 px-2 text-[10px]'>
                {TYPE_LABEL[item.type]}
              </span>
              <p className='truncate text-sm font-semibold text-slate-900'>
                {highlight(item.title, keyword.trim())}
              </p>
            </div>
            <p className='mt-1 line-clamp-2 text-xs text-slate-600'>
              {highlight(item.snippet, keyword.trim())}
            </p>
          </Link>
        ))}
    </>
  )

  return (
    <div ref={rootRef} className='relative' suppressHydrationWarning>
      <div
        className={`relative flex h-9 items-center overflow-hidden rounded-full border bg-white transition-[width,box-shadow,border-color] duration-250 ${
          expanded && !isMobile
            ? 'w-[min(19rem,calc(100vw-2rem))] border-slate-300 shadow-[0_0_0_3px_rgba(15,23,42,0.08)]'
            : 'w-9 border-slate-200'
        }`}>
        <button
          type='button'
          aria-label='搜索'
          onClick={() => {
            setExpanded(prev => !prev)
          }}
          className='inline-flex h-9 w-9 shrink-0 items-center justify-center text-slate-500 transition-colors hover:text-slate-900'>
          <svg
            className='h-4 w-4'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            viewBox='0 0 24 24'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M21 21l-4.35-4.35m0 0A7.5 7.5 0 105.4 5.4a7.5 7.5 0 0011.25 11.25z'
            />
          </svg>
        </button>

        <input
          ref={inputRef}
          value={keyword}
          onChange={event => setKeyword(event.target.value)}
          onFocus={() => setExpanded(true)}
          placeholder='搜索单词、句子、题目'
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          suppressHydrationWarning
          className={`h-9 w-full bg-transparent pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 transition-opacity duration-150 ${
            expanded && !isMobile ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>

      {expanded && !isMobile && (
        <div className='ui-pop ui-pop-surface fixed left-4 right-4 top-[4.75rem] z-[140] overflow-hidden md:absolute md:left-auto md:right-0 md:top-[calc(100%+0.4rem)] md:w-[min(22rem,calc(100vw-2rem))]'>
          <div className='max-h-[56vh] overflow-y-auto p-1.5'>
            {renderResultList()}
          </div>
        </div>
      )}

      {expanded && isMobile && (
        <div className='fixed inset-0 z-[160] bg-slate-950/20 backdrop-blur-[2px]'>
          <button
            type='button'
            aria-label='关闭搜索'
            className='absolute inset-0 cursor-default'
            onClick={closeSearch}
          />
          <div
            ref={mobileSheetRef}
            className='absolute left-3 right-3 top-16 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.14)]'>
            <div className='flex items-center gap-2 border-b border-slate-100 px-3 py-3'>
              <input
                ref={inputRef}
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
                placeholder='搜索单词、句子、题目'
                autoComplete='off'
                autoCorrect='off'
                autoCapitalize='off'
                spellCheck={false}
                className='h-10 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400'
              />
              <button
                type='button'
                onClick={closeSearch}
                className='ui-btn ui-btn-sm h-10 px-3 text-xs'>
                关闭
              </button>
            </div>
            <div className='max-h-[68vh] overflow-y-auto p-1.5'>
              {renderResultList()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
