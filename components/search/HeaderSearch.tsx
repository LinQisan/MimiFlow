'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  searchGlobalContent,
  type GlobalSearchResult,
  type GlobalSearchType,
} from '@/app/actions/globalSearch'

const SEARCH_TYPES: Array<{ key: GlobalSearchType; label: string }> = [
  { key: 'vocabulary', label: '单词' },
  { key: 'sentence', label: '句子' },
  { key: 'passage', label: '阅读' },
  { key: 'quiz', label: '题库' },
  { key: 'question', label: '题目' },
  { key: 'dialogue', label: '听力' },
]

const typeLabelMap: Record<GlobalSearchType, string> = {
  vocabulary: '单词',
  sentence: '句子',
  passage: '阅读',
  quiz: '题库',
  question: '题目',
  dialogue: '听力',
}

const highlightKeyword = (text: string, keyword?: string) => {
  if (!keyword || !text) return text

  const parts = text.split(new RegExp(`(${keyword})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase() ? (
      <mark key={i} className='bg-yellow-200 font-medium'>
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

export default function HeaderSearch() {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<GlobalSearchType[]>(
    SEARCH_TYPES.map(item => item.key),
  )

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(event.target as Node)) return
      setOpen(false)
      setFilterOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [])

  const selectedCount = selectedTypes.length
  const filterHint =
    selectedCount === SEARCH_TYPES.length ? '全部' : `${selectedCount}类`

  const runSearch = async () => {
    const q = keyword.trim()
    if (!q) {
      router.push('/search')
      return
    }
    setIsSearching(true)
    setOpen(true)
    try {
      const next = await searchGlobalContent(q, { types: selectedTypes })
      setResults(next)
    } finally {
      setIsSearching(false)
    }
  }

  const grouped = useMemo(() => {
    return results.reduce<Record<string, number>>((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1
      return acc
    }, {})
  }, [results])

  const toggleType = (type: GlobalSearchType) => {
    setSelectedTypes(prev => {
      const has = prev.includes(type)
      if (has) {
        if (prev.length === 1) return prev
        return prev.filter(item => item !== type)
      }
      return [...prev, type]
    })
  }

  return (
    <div
      ref={rootRef}
      className='relative mx-3 hidden flex-1 md:block md:max-w-3xl lg:mx-6'>
      <form
        onSubmit={event => {
          event.preventDefault()
          void runSearch()
        }}
        suppressHydrationWarning
        role='search'
        autoComplete='off'
        noValidate
        className='relative flex items-center gap-1.5'>
        <div
          className={`relative flex-1 rounded-full border bg-gray-100/85 dark:bg-slate-900/80 px-3 transition-[background-color,border-color,box-shadow,transform] duration-200 ${
            focused
              ? 'border-indigo-300 dark:border-indigo-500/45 bg-white dark:bg-slate-900 shadow-[0_0_0_3px_rgba(99,102,241,0.15)]'
              : 'border-gray-200 dark:border-slate-700'
          }`}>
          <div className='pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400 dark:text-slate-400'>
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
          </div>
          <input
            suppressHydrationWarning
            value={keyword}
            onChange={event => setKeyword(event.currentTarget.value)}
            onFocus={() => {
              setFocused(true)
              if (results.length > 0) setOpen(true)
            }}
            onBlur={() => setFocused(false)}
            placeholder='搜索单词、句子、阅读、题目'
            autoComplete='off'
            autoCorrect='off'
            autoCapitalize='off'
            spellCheck={false}
            className='h-10 w-full bg-transparent pl-6 pr-2 text-sm font-medium text-gray-700 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none'
          />
        </div>

        <button
          type='button'
          onClick={() => setFilterOpen(prev => !prev)}
          className='ui-btn ui-btn-sm h-10 min-w-14 px-3 text-xs'
          title='筛选类型'>
          {filterHint}
        </button>

        <button
          type='submit'
          disabled={isSearching}
          className='ui-btn ui-btn-sm h-10 w-10 px-0'
          title='搜索'
          aria-label='搜索'>
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
      </form>

      {filterOpen && (
        <div className='ui-pop ui-pop-surface absolute right-0 top-[calc(100%+0.45rem)] z-[130] w-72 p-2'>
          <div className='mb-1 px-1 text-[11px] font-bold tracking-wide text-gray-400 dark:text-slate-400'>
            搜索类型
          </div>
          <div className='grid grid-cols-3 gap-1.5'>
            {SEARCH_TYPES.map(item => {
              const active = selectedTypes.includes(item.key)
              return (
                <button
                  key={`header-search-type-${item.key}`}
                  type='button'
                  onClick={() => toggleType(item.key)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/45 dark:bg-indigo-500/16 dark:text-indigo-200'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}>
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {open && (
        <div className='ui-pop ui-pop-surface absolute left-0 right-0 top-[calc(100%+0.55rem)] z-[120] overflow-hidden'>
          <div className='flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-3 py-2 text-[11px] font-semibold text-gray-500 dark:text-slate-400'>
            <div className='flex flex-wrap items-center gap-1.5'>
              <span>
                {isSearching ? '搜索中...' : `结果 ${results.length}`}
              </span>
              {Object.entries(grouped)
                .slice(0, 3)
                .map(([type, count]) => (
                  <span
                    key={`header-search-meta-${type}`}
                    className='ui-tag ui-tag-muted h-5 px-2 text-[10px]'>
                    {typeLabelMap[type as GlobalSearchType]} {count}
                  </span>
                ))}
            </div>
            <button
              type='button'
              onClick={() => setOpen(false)}
              className='text-gray-400 transition-colors hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300'>
              关闭
            </button>
          </div>

          <div className='max-h-[58vh] overflow-y-auto p-1.5'>
            {!isSearching && results.length === 0 && (
              <div className='px-3 py-8 text-center text-sm text-gray-500 dark:text-slate-400'>
                {keyword.trim() ? '没有匹配结果' : '输入关键词后点击搜索'}
              </div>
            )}

            {results.map(item => (
              <Link
                key={`header-search-${item.id}`}
                href={item.href}
                onClick={() => setOpen(false)}
                className='block rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-gray-200 hover:bg-gray-50 dark:hover:border-slate-700 dark:hover:bg-slate-800'>
                <div className='flex items-center gap-2'>
                  <span className='ui-tag ui-tag-info h-5 px-2 text-[10px]'>
                    {typeLabelMap[item.type]}
                  </span>
                  <p className='truncate text-sm font-semibold text-gray-900 dark:text-slate-100'>
                    {highlightKeyword(item.title, item.keyword)}
                  </p>
                  <span className='truncate text-[11px] text-gray-400 dark:text-slate-500'>
                    {item.meta}
                  </span>
                </div>
                <p className='mt-1 line-clamp-2 text-xs text-gray-600 dark:text-slate-300'>
                  {highlightKeyword(item.snippet, item.keyword)}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
