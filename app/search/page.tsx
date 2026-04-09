'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  searchGlobalContent,
  type GlobalSearchResult,
} from '@/app/actions/globalSearch'

const typeLabelMap: Record<GlobalSearchResult['type'], string> = {
  vocabulary: '单词',
  sentence: '句子',
  passage: '阅读',
  quiz: '题库',
  question: '题目',
  dialogue: '听力',
}

const typeBadgeClassMap: Record<GlobalSearchResult['type'], string> = {
  vocabulary:
    'border-indigo-200 bg-indigo-50 text-indigo-700',
  sentence:
    'border-blue-200 bg-blue-50 text-blue-700',
  passage:
    'border-emerald-200 bg-emerald-50 text-emerald-700',
  quiz:
    'border-amber-200 bg-amber-50 text-amber-700',
  question:
    'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
  dialogue:
    'border-cyan-200 bg-cyan-50 text-cyan-700',
}

const highlightKeyword = (text: string, keyword?: string) => {
  if (!keyword || !text) return text

  const parts = text.split(new RegExp(`(${keyword})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase() ? (
      <mark
        key={i}
        className='rounded-sm bg-yellow-200/90 px-0.5 font-bold text-slate-900'>
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

export default function SearchPage() {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const grouped = useMemo(() => {
    return results.reduce<Record<string, GlobalSearchResult[]>>((acc, item) => {
      if (!acc[item.type]) acc[item.type] = []
      acc[item.type].push(item)
      return acc
    }, {})
  }, [results])
  const groupedEntries = useMemo(() => Object.entries(grouped), [grouped])

  const onSearch = async () => {
    const q = keyword.trim()
    setHasSearched(true)
    if (!q) {
      setResults([])
      return
    }
    setIsSearching(true)
    const next = await searchGlobalContent(q)
    setResults(next)
    setIsSearching(false)
  }

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-5 md:px-6 md:py-8'>
      <div className='mx-auto max-w-4xl'>
        <section className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5'>
          <h1 className='text-2xl font-black text-slate-900 md:text-3xl'>
            全局搜索
          </h1>
          <p className='mt-1 text-sm text-slate-500'>
            一次搜索单词、句子、阅读、题目和来源，直接跳转。
          </p>
          <div className='mt-3 flex gap-2'>
            <input
              type='text'
              value={keyword}
              onChange={e => setKeyword(e.currentTarget.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void onSearch()
              }}
              placeholder='输入关键词，例如：啓発 / communication / N1'
              className='h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
            />
            <button
              type='button'
              onClick={() => void onSearch()}
              className='ui-btn ui-btn-primary h-10 rounded-xl px-4'>
              {isSearching ? '搜索中...' : '搜索'}
            </button>
          </div>
          {hasSearched && (
            <div className='mt-3 flex flex-wrap gap-1.5'>
              <span className='rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
                共 {results.length} 条
              </span>
              {groupedEntries.map(([type, items]) => (
                <span
                  key={`search-count-${type}`}
                  className='rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
                  {typeLabelMap[type as GlobalSearchResult['type']]} {items.length}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className='mt-4 space-y-3'>
          {!hasSearched && (
            <div className='rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500'>
              输入关键词开始检索。
            </div>
          )}

          {hasSearched && !isSearching && results.length === 0 && (
            <div className='rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500'>
              没有匹配结果，换个关键词试试。
            </div>
          )}

          {groupedEntries.map(([type, items]) => (
            <section
              key={`search-group-${type}`}
              className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
              <header className='flex items-center justify-between border-b border-slate-100 px-3 py-2.5 md:px-4'>
                <h2 className='text-sm font-bold text-slate-800 md:text-base'>
                  {typeLabelMap[type as GlobalSearchResult['type']] || type}
                </h2>
                <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                  {items.length}
                </span>
              </header>
              <div className='divide-y divide-slate-100'>
                {items.map(item => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className='block px-3 py-2.5 transition-colors hover:bg-slate-50 md:px-4'>
                    <div className='grid grid-cols-[auto_1fr] items-start gap-2.5'>
                      <span
                        className={`inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-bold ${
                          typeBadgeClassMap[item.type]
                        }`}>
                        {typeLabelMap[item.type]}
                      </span>
                      <div className='min-w-0'>
                        <div className='flex items-center gap-2'>
                          <p className='truncate text-[15px] font-bold text-slate-900'>
                            {highlightKeyword(item.title, item.keyword)}
                          </p>
                          {item.meta && (
                            <span className='truncate text-[11px] text-slate-400'>
                              {item.meta}
                            </span>
                          )}
                        </div>
                        {item.snippet && (
                          <p className='mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-600'>
                            {highlightKeyword(item.snippet, item.keyword)}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </section>
      </div>
    </main>
  )
}
