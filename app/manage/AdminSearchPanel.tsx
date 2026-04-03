// app/admin/AdminSearchPanel.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import {
  searchGlobalCorpus,
  type GlobalCorpusSearchResult,
} from './searchActions'
import { saveVocabulary } from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'

const splitIntoSentences = (text: string) => {
  if (!text) return []
  const regex = /[^。！？.!?\n]+[。！？.!?\n]*/g
  return text.match(regex) || [text]
}

const SourceBadge = ({ type }: { type: string }) => {
  switch (type) {
    case 'AUDIO_DIALOGUE':
      return (
        <span className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100'>
          🎧 听力
        </span>
      )
    case 'ARTICLE_TEXT':
      return (
        <span className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100'>
          📄 阅读
        </span>
      )
    case 'QUIZ_QUESTION':
      return (
        <span className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-100'>
          📝 题目
        </span>
      )
    default:
      return (
        <span className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-50 text-gray-600 border border-gray-100'>
          🏷️ 其他
        </span>
      )
  }
}

export default function AdminSearchPanel() {
  const dialog = useDialog()
  const [keyword, setKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<GlobalCorpusSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false) // 控制搜索结果面板的悬浮展开
  const searchRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭搜索面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      )
        setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyword.trim()) return
    setIsSearching(true)
    setIsOpen(true)
    const results = await searchGlobalCorpus(keyword)
    setSearchResults(results)
    setIsSearching(false)
  }

  const handleAddVocab = async (item: GlobalCorpusSearchResult) => {
    const word = await dialog.prompt(`请输入要提取的生词：\n\n"${item.text}"`, {
      title: '提取生词',
      defaultValue: keyword,
      confirmText: '提取',
    })
    if (!word) return
    const sentences = splitIntoSentences(item.text)
    const targetSentence =
      sentences.find(s => s.toLowerCase().includes(word.toLowerCase())) ||
      item.text
    const res = await saveVocabulary(
      word,
      targetSentence.trim(),
      item.type,
      String(item.id),
    )
    await dialog.alert(res.message)
    setIsOpen(false)
  }

  return (
    <div className='relative w-full max-w-2xl mx-auto' ref={searchRef}>
      {/* 极简顶部搜索条 */}
      <form onSubmit={handleSearch} className='flex items-center relative'>
        <div className='absolute left-3 text-gray-400'>🔍</div>
        <input
          type='text'
          placeholder='全站语料雷达：输入词汇或考点...'
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          onFocus={() => {
            if (searchResults.length > 0) setIsOpen(true)
          }}
          className='w-full pl-10 pr-24 py-2 bg-gray-100/80 hover:bg-gray-100 border border-transparent focus:border-indigo-300 rounded-full focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all outline-none text-sm font-medium'
        />
        <button
          disabled={isSearching}
          type='submit'
          className='absolute right-1 top-1 bottom-1 px-4 bg-gray-900 text-white rounded-full font-bold hover:bg-gray-800 transition-all text-xs whitespace-nowrap disabled:opacity-50'>
          {isSearching ? '检索中...' : '深度搜索'}
        </button>
      </form>

      {/* 🌟 核心：绝对定位的悬浮搜索结果面板 */}
      {isOpen && searchResults.length > 0 && (
        <div className='absolute top-full mt-3 left-0 right-0 bg-white shadow-indigo-500/10 border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2'>
          <div className='p-3 bg-gray-50/50 border-b border-gray-100 text-xs font-bold text-gray-500 flex justify-between'>
            <span>搜索结果 ({searchResults.length})</span>
            <button
              onClick={() => setIsOpen(false)}
              className='text-gray-400 hover:text-gray-600'>
              关闭 ✕
            </button>
          </div>
          <div className='space-y-1 max-h-[60vh] overflow-y-auto p-2 custom-scrollbar'>
            {searchResults.map(item => (
              <div
                key={`${item.type}-${item.id}`}
                className='p-3 bg-white hover:bg-gray-50 flex flex-col md:flex-row justify-between items-start gap-3 transition-colors border border-transparent hover:border-gray-100'>
                <div className='flex-1'>
                  <div className='flex items-center flex-wrap gap-2 mb-1.5'>
                    <SourceBadge type={item.type} />
                    <span className='text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded'>
                      {item.categoryName}
                    </span>
                    <span className='text-[11px] text-gray-400 font-medium'>
                      {item.sourceTitle}
                    </span>
                  </div>
                  <p className='text-gray-700 text-xs md:text-sm font-medium leading-relaxed'>
                    {item.text}
                  </p>
                </div>
                <button
                  onClick={() => handleAddVocab(item)}
                  className='shrink-0 text-xs font-bold bg-white border border-indigo-200 text-indigo-600 px-3 py-1.5 hover:bg-indigo-50 transition-colors'>
                  + 提取
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
