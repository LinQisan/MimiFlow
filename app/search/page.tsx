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
  article: '阅读',
  quiz: '题库',
  question: '题目',
  dialogue: '听力',
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
    <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
      <div className='mx-auto max-w-5xl'>
        <section className='border-b border-gray-200 pb-4 md:pb-6'>
          <h1 className='text-3xl font-black text-gray-900 md:text-4xl'>全局搜索</h1>
          <p className='mt-2 text-sm text-gray-500'>
            一次搜索单词、句子、阅读、题目和来源，直接跳转。
          </p>
          <div className='mt-4 flex flex-col gap-2 sm:flex-row'>
            <input
              type='text'
              value={keyword}
              onChange={e => setKeyword(e.currentTarget.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void onSearch()
              }}
              placeholder='输入关键词，例如：冷淡 / communication / N1'
              className='flex-1 border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
            />
            <button
              type='button'
              onClick={() => void onSearch()}
              className='ui-btn ui-btn-primary'>
              {isSearching ? '搜索中...' : '搜索'}
            </button>
          </div>
        </section>

        <section className='mt-4 space-y-4'>
          {!hasSearched && (
            <div className='border-b border-dashed border-gray-300 py-12 text-center text-sm text-gray-500'>
              输入关键词开始检索。
            </div>
          )}

          {hasSearched && !isSearching && results.length === 0 && (
            <div className='border-b border-dashed border-gray-300 py-12 text-center text-sm text-gray-500'>
              没有匹配结果，换个关键词试试。
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => (
            <section
              key={`search-group-${type}`}
              className='border-b border-gray-200 pb-3'>
              <div className='mb-2 flex items-center justify-between'>
                <h2 className='text-base font-bold text-gray-800'>
                  {typeLabelMap[type as GlobalSearchResult['type']] || type}
                </h2>
                <span className='ui-tag ui-tag-muted'>{items.length}</span>
              </div>
              <div className='space-y-2'>
                {items.map(item => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className='block border-b border-gray-100 px-1 py-2 hover:bg-gray-50'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='ui-tag ui-tag-info'>
                        {typeLabelMap[item.type]}
                      </span>
                      <p className='text-sm font-bold text-gray-900'>{item.title}</p>
                      <span className='text-xs text-gray-400'>{item.meta}</span>
                    </div>
                    <p className='mt-1 text-sm text-gray-600'>{item.snippet}</p>
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

