// app/admin/manage/AdminSearchPanel.tsx
'use client'

import { useState, useEffect } from 'react'
import {
  searchGlobalDialogues,
  getAllVocabulariesAdmin,
  deleteVocabularyAdmin,
} from './searchActions'
import { saveVocabulary } from '@/app/actions/vocabulary' // 复用前台的添加生词 API

export default function AdminSearchPanel() {
  const [keyword, setKeyword] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const [vocabList, setVocabList] = useState<any[]>([])
  const [isLoadingVocabs, setIsLoadingVocabs] = useState(true)

  const fetchVocabs = async () => {
    setIsLoadingVocabs(true)
    const data = await getAllVocabulariesAdmin()
    setVocabList(data)
    setIsLoadingVocabs(false)
  }

  useEffect(() => {
    fetchVocabs()
  }, [])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyword) return
    setIsSearching(true)
    const results = await searchGlobalDialogues(keyword)
    setSearchResults(results)
    setIsSearching(false)
  }

  const handleAddVocab = async (dialogueId: number) => {
    const word = prompt('请输入要从这句中提取的生词：', keyword)
    if (!word) return
    const res = await saveVocabulary(word, dialogueId)
    alert(res.message)
    if (res.success) fetchVocabs()
  }

  const handleDeleteVocab = async (id: string, word: string) => {
    if (!confirm(`确定要删除生词 "${word}" 吗？`)) return
    const res = await deleteVocabularyAdmin(id)
    if (res.success) {
      setVocabList(prev => prev.filter(v => v.id !== id))
    } else {
      alert('删除失败')
    }
  }

  return (
    <div className='space-y-6 md:space-y-8 mb-10'>
      {/* 模块 1：全局搜索 */}
      <section className='bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-blue-100'>
        <h2 className='text-lg md:text-xl font-bold text-gray-800 mb-4 flex items-center gap-2'>
          <span>🔍</span> 全站语料搜索
        </h2>
        <form onSubmit={handleSearch} className='flex gap-2 md:gap-3 mb-4'>
          <input
            type='text'
            placeholder='输入想查询的词汇、短语...'
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            className='flex-1 p-2 md:p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm md:text-base'
          />
          <button
            disabled={isSearching}
            type='submit'
            className='px-4 md:px-6 py-2 md:py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition text-sm md:text-base whitespace-nowrap'>
            {isSearching ? '检索中...' : '搜索'}
          </button>
        </form>

        {searchResults.length > 0 && (
          <div className='space-y-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar'>
            {searchResults.map(dialogue => (
              <div
                key={dialogue.id}
                className='p-3 bg-gray-50 border border-gray-200 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-3 hover:border-blue-300'>
                <div className='flex-1'>
                  <p className='text-gray-800 text-sm md:text-base mb-1'>
                    {dialogue.text}
                  </p>
                  <p className='text-xs text-gray-400'>
                    来源: {dialogue.lesson.category.name} -{' '}
                    {dialogue.lesson.title}
                  </p>
                  {dialogue.vocabularies.length > 0 && (
                    <div className='mt-1 flex flex-wrap gap-1'>
                      {dialogue.vocabularies.map((v: any) => (
                        <span
                          key={v.id}
                          className='text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded'>
                          已收录: {v.word}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleAddVocab(dialogue.id)}
                  className='shrink-0 text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded hover:bg-blue-100 self-end md:self-auto'>
                  + 添加生词
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 模块 2：生词库管理 */}
      <section className='bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-orange-100'>
        <h2 className='text-lg md:text-xl font-bold text-gray-800 mb-4 flex justify-between items-center'>
          <div className='flex items-center gap-2'>
            <span>📚</span> 单词本管理
          </div>
          <span className='text-xs md:text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded'>
            共 {vocabList.length} 词
          </span>
        </h2>

        {isLoadingVocabs ? (
          <p className='text-sm text-gray-400'>加载生词中...</p>
        ) : (
          <div className='overflow-x-auto max-h-80 custom-scrollbar rounded-lg border border-gray-100'>
            <table className='w-full text-left text-sm text-gray-600'>
              <thead className='bg-gray-50 text-gray-500 sticky top-0 shadow-sm'>
                <tr>
                  <th className='px-3 py-2 md:px-4 md:py-3 whitespace-nowrap'>
                    生词
                  </th>
                  <th className='px-3 py-2 md:px-4 md:py-3 min-w-[200px]'>
                    绑定原句
                  </th>
                  <th className='px-3 py-2 md:px-4 md:py-3 text-right whitespace-nowrap'>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {vocabList.map(vocab => (
                  <tr
                    key={vocab.id}
                    className='border-b border-gray-50 hover:bg-gray-50'>
                    <td className='px-3 py-2 md:px-4 md:py-3 font-bold text-gray-800'>
                      {vocab.word}
                    </td>
                    <td className='px-3 py-2 md:px-4 md:py-3 text-xs md:text-sm'>
                      {vocab.dialogue.text}
                    </td>
                    <td className='px-3 py-2 md:px-4 md:py-3 text-right'>
                      <button
                        onClick={() => handleDeleteVocab(vocab.id, vocab.word)}
                        className='text-xs text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded'>
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
