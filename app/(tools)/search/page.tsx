'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  searchGlobalContent,
  type GlobalSearchResult,
  type GlobalSearchType,
} from '@/features/search/actions'

const SEARCH_TYPES: Array<{
  key: GlobalSearchType
  label: string
  description: string
}> = [
  { key: 'vocabulary', label: '单词', description: '释义、读音' },
  { key: 'sentence', label: '句子', description: '例句、来源' },
  { key: 'passage', label: '阅读', description: '文章正文' },
  { key: 'quiz', label: '题集', description: '练习材料' },
  { key: 'question', label: '题目', description: '题干、选项' },
  { key: 'dialogue', label: '音频字幕', description: '听力、跟读、影视' },
]

const typeConfig: Record<
  GlobalSearchType,
  { label: string; badge: string; dot: string }
> = {
  vocabulary: {
    label: '单词',
    badge: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    dot: 'bg-indigo-500',
  },
  sentence: {
    label: '句子',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    dot: 'bg-blue-500',
  },
  passage: {
    label: '阅读',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  quiz: {
    label: '题集',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  question: {
    label: '题目',
    badge: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
    dot: 'bg-fuchsia-500',
  },
  dialogue: {
    label: '音频字幕',
    badge: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    dot: 'bg-cyan-500',
  },
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const highlightKeyword = (text: string, keyword?: string) => {
  const q = keyword?.trim()
  if (!q || !text) return text
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'))
  return parts.map((part, index) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        className='rounded bg-amber-100 px-0.5 font-bold text-slate-950'>
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

export default function SearchPage() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const requestIdRef = useRef(0)
  const [keyword, setKeyword] = useState('')
  const [searchedKeyword, setSearchedKeyword] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [selectedTypes, setSelectedTypes] = useState<GlobalSearchType[]>(
    SEARCH_TYPES.map(item => item.key),
  )
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const counts = useMemo(
    () =>
      results.reduce<Partial<Record<GlobalSearchType, number>>>((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1
        return acc
      }, {}),
    [results],
  )

  const groups = useMemo(
    () =>
      SEARCH_TYPES.map(type => ({
        ...type,
        items: results.filter(item => item.type === type.key),
      })).filter(group => group.items.length > 0),
    [results],
  )

  const runSearch = async (
    nextTypes: GlobalSearchType[] = selectedTypes,
    explicitKeyword?: string,
  ) => {
    const q = (explicitKeyword ?? keyword).trim()
    setHasSearched(true)
    setSearchedKeyword(q)
    if (!q) {
      setResults([])
      setIsSearching(false)
      window.history.replaceState(null, '', '/search')
      inputRef.current?.focus()
      return
    }

    const requestId = ++requestIdRef.current
    setIsSearching(true)
    const params = new URLSearchParams()
    params.set('q', q)
    if (nextTypes.length !== SEARCH_TYPES.length) {
      params.set('types', nextTypes.join(','))
    }
    window.history.replaceState(null, '', `/search?${params.toString()}`)

    try {
      const next = await searchGlobalContent(q, { types: nextTypes })
      if (requestId === requestIdRef.current) setResults(next)
    } finally {
      if (requestId === requestIdRef.current) setIsSearching(false)
    }
  }

  const toggleType = (type: GlobalSearchType) => {
    const next = selectedTypes.includes(type)
      ? selectedTypes.filter(item => item !== type)
      : [...selectedTypes, type]
    if (next.length === 0) return
    setSelectedTypes(next)
    if (hasSearched && keyword.trim()) void runSearch(next)
  }

  const clearSearch = () => {
    requestIdRef.current += 1
    setKeyword('')
    setSearchedKeyword('')
    setResults([])
    setHasSearched(false)
    setIsSearching(false)
    window.history.replaceState(null, '', '/search')
    inputRef.current?.focus()
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialKeyword = params.get('q')?.trim() || ''
    const requestedTypes = (params.get('types') || '')
      .split(',')
      .filter((type): type is GlobalSearchType =>
        SEARCH_TYPES.some(item => item.key === type),
      )
    const initialTypes = requestedTypes.length
      ? requestedTypes
      : SEARCH_TYPES.map(item => item.key)
    setSelectedTypes(initialTypes)
    if (initialKeyword) {
      setKeyword(initialKeyword)
      void runSearch(initialTypes, initialKeyword)
    }
    window.setTimeout(() => inputRef.current?.focus(), 80)
    // Initial URL hydration only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault()
        inputRef.current?.focus()
      }
      if (event.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-8 md:py-8'>
      <div className='mx-auto max-w-7xl'>
        <section className='overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm'>
          <div className='p-5 md:p-8'>
            <form
              role='search'
              className='mt-5 flex flex-col gap-2 sm:flex-row'
              onSubmit={event => {
                event.preventDefault()
                void runSearch()
              }}>
              <div className='relative min-w-0 flex-1'>
                <svg aria-hidden='true' className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' fill='none' stroke='currentColor' strokeWidth={2} viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' d='M21 21l-4.35-4.35m0 0A7.5 7.5 0 105.4 5.4a7.5 7.5 0 0011.25 11.25z' />
                </svg>
                <input
                  ref={inputRef}
                  type='search'
                  value={keyword}
                  onChange={event => setKeyword(event.currentTarget.value)}
                  placeholder='例如：啓発、コミュニケーション、N1'
                  aria-label='搜索关键词'
                  autoComplete='off'
                  className='h-13 w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-11 text-base font-medium text-slate-800 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100'
                />
                {keyword ? (
                  <button type='button' onClick={clearSearch} aria-label='清除搜索' className='absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700'>×</button>
                ) : null}
              </div>
              <button type='submit' disabled={isSearching} className='ui-btn ui-btn-primary h-13 rounded-2xl px-6 text-sm font-bold disabled:opacity-60'>
                {isSearching ? '正在搜索…' : '搜索'}
              </button>
            </form>
          </div>

          <div className='border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:px-8'>
            <div className='flex items-center justify-between gap-3'>
              <p className='text-xs font-bold text-slate-500'>搜索范围</p>
              <button
                type='button'
                onClick={() => {
                  const allTypes = SEARCH_TYPES.map(item => item.key)
                  setSelectedTypes(allTypes)
                  if (hasSearched && keyword.trim()) void runSearch(allTypes)
                }}
                className='text-xs font-semibold text-slate-500 hover:text-slate-900'>
                选择全部
              </button>
            </div>
            <div className='mt-2 flex flex-wrap gap-2'>
              {SEARCH_TYPES.map(item => {
                const active = selectedTypes.includes(item.key)
                return (
                  <button
                    key={item.key}
                    type='button'
                    aria-pressed={active}
                    onClick={() => toggleType(item.key)}
                    className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${active ? 'border-slate-300 bg-white text-slate-900 shadow-sm' : 'border-transparent bg-transparent text-slate-400 hover:bg-white/70'}`}>
                    <span className={`h-2 w-2 rounded-full ${active ? typeConfig[item.key].dot : 'bg-slate-300'}`} />
                    {item.label}
                    {hasSearched && counts[item.key] ? (
                      <span className='text-slate-400'>{counts[item.key]}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className='mt-5'>
          {!hasSearched ? (
            <div className='divide-y divide-slate-200 border-y border-slate-200'>
              {SEARCH_TYPES.map(item => (
                <button key={item.key} type='button' onClick={() => { setSelectedTypes([item.key]); inputRef.current?.focus() }} className='grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 bg-white px-4 py-3 text-left transition hover:bg-slate-50'>
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${typeConfig[item.key].dot}`} />
                  <h2 className='text-sm font-black text-slate-900'>{item.label}</h2>
                  <p className='col-start-2 mt-0.5 text-xs text-slate-500'>{item.description}</p>
                </button>
              ))}
            </div>
          ) : isSearching ? (
            <div className='space-y-3' aria-live='polite' aria-label='正在搜索'>
              {[0, 1, 2].map(item => (
                <div key={item} className='animate-pulse rounded-2xl border border-slate-200 bg-white p-5'>
                  <div className='h-4 w-28 rounded bg-slate-200' />
                  <div className='mt-4 h-4 w-2/3 rounded bg-slate-100' />
                  <div className='mt-2 h-3 w-1/2 rounded bg-slate-100' />
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <div className='rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center'>
              <p className='text-lg font-black text-slate-800'>没有找到“{searchedKeyword}”</p>
              <p className='mt-2 text-sm text-slate-500'>尝试缩短关键词、切换搜索范围，或使用日文原词。</p>
              <button type='button' onClick={clearSearch} className='ui-btn ui-btn-sm mt-5'>重新搜索</button>
            </div>
          ) : (
            <div className='grid gap-5 lg:grid-cols-[190px_minmax(0,1fr)]'>
              <aside className='h-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-20'>
                <p className='px-2 pb-2 text-xs font-black text-slate-400'>结果概览</p>
                <div className='space-y-1'>
                  <a href='#search-results' className='flex items-center justify-between rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white'>全部结果 <span>{results.length}</span></a>
                  {groups.map(group => (
                    <a key={group.key} href={`#search-${group.key}`} className='flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-950'>
                      {group.label}<span className='text-slate-400'>{group.items.length}</span>
                    </a>
                  ))}
                </div>
              </aside>

              <div id='search-results' className='min-w-0 space-y-4 scroll-mt-20'>
                <div className='flex flex-wrap items-baseline justify-between gap-2 px-1'>
                  <h2 className='text-lg font-black text-slate-900'>“{searchedKeyword}”的搜索结果</h2>
                  <p className='text-xs font-semibold text-slate-500'>共 {results.length} 条</p>
                </div>
                {groups.map(group => (
                  <section id={`search-${group.key}`} key={group.key} className='scroll-mt-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'>
                    <header className='flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3 md:px-5'>
                      <div className='flex items-center gap-2'>
                        <span className={`h-2.5 w-2.5 rounded-full ${typeConfig[group.key].dot}`} />
                        <h3 className='text-sm font-black text-slate-900'>{group.label}</h3>
                      </div>
                      <span className='text-xs font-bold text-slate-400'>{group.items.length}</span>
                    </header>
                    <div className='divide-y divide-slate-100'>
                      {group.items.map(item => (
                        <Link key={item.id} href={item.targetHref || item.href} className='group block px-4 py-4 transition hover:bg-slate-50 md:px-5'>
                          <div className='flex min-w-0 items-start gap-3'>
                            <span className={`mt-0.5 inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[11px] font-bold ${typeConfig[item.type].badge}`}>
                              {typeConfig[item.type].label}
                            </span>
                            <div className='min-w-0 flex-1'>
                              <div className='flex min-w-0 items-center gap-2'>
                                <p className='min-w-0 truncate text-[15px] font-bold text-slate-900'>{highlightKeyword(item.title, item.keyword || searchedKeyword)}</p>
                                {item.meta ? <span className='hidden max-w-52 truncate text-[11px] text-slate-400 sm:inline'>{item.meta}</span> : null}
                              </div>
                              {item.snippet ? <p className='mt-1 line-clamp-2 text-xs leading-5 text-slate-600'>{highlightKeyword(item.snippet, item.keyword || searchedKeyword)}</p> : null}
                              {item.meta ? <p className='mt-1 truncate text-[11px] text-slate-400 sm:hidden'>{item.meta}</p> : null}
                            </div>
                            <span aria-hidden='true' className='mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600'>→</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
