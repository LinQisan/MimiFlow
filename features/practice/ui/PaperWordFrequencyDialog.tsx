'use client'

import { useEffect, useMemo, useState } from 'react'

import type { WordFrequencyRow } from '@/features/reading/domain/sudachi'
import type { PaperFrequencySourceStats } from '@/features/practice/domain/paper-word-frequency'

const PAGE_SIZE = 50

export default function PaperWordFrequencyDialog({
  rows,
  stats,
}: {
  rows: WordFrequencyRow[]
  stats: PaperFrequencySourceStats
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const filteredRows = useMemo(() => {
    const keyword = query.normalize('NFKC').trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter(item =>
      `${item.word} ${item.reading} ${item.partOfSpeech}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [query, rows])
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const normalizedPage = Math.min(page, totalPages)
  const visibleRows = filteredRows.slice(
    (normalizedPage - 1) * PAGE_SIZE,
    normalizedPage * PAGE_SIZE,
  )
  const totalOccurrences = filteredRows.reduce(
    (sum, item) => sum + item.count,
    0,
  )

  useEffect(() => setPage(1), [query])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <>
      <button
        type='button'
        aria-haspopup='dialog'
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        disabled={rows.length === 0}
        className='ui-btn disabled:cursor-default disabled:opacity-40'>
        词频 {rows.length || '—'}
      </button>

      {isOpen ? (
        <div className='fixed inset-0 z-[100]'>
          <button
            type='button'
            aria-label='关闭试卷词频窗口'
            onClick={() => setIsOpen(false)}
            className='absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]'
          />
          <section
            role='dialog'
            aria-modal='true'
            aria-labelledby='paper-frequency-dialog-title'
            className='absolute inset-x-3 top-1/2 mx-auto flex max-h-[min(86vh,52rem)] max-w-5xl -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-[#f8f7f3] shadow-2xl sm:inset-x-6'>
            <header className='flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6'>
              <div>
                <h2
                  id='paper-frequency-dialog-title'
                  className='text-lg font-bold tracking-tight text-slate-950'>
                  试卷词频
                </h2>
                <p className='mt-1 text-xs text-slate-500'>
                  统计阅读原文、听力原文、题干和全部选项，并按原形合并。
                </p>
              </div>
              <button
                type='button'
                onClick={() => setIsOpen(false)}
                className='px-2 py-1 text-sm font-semibold text-slate-500 hover:text-slate-950'>
                关闭
              </button>
            </header>

            <div className='min-h-0 overflow-y-auto px-5 py-5 md:px-6'>
              <dl className='grid grid-cols-2 border-b border-slate-200 pb-5 sm:grid-cols-4'>
                <div className='border-r border-slate-200 pr-3'>
                  <dt className='text-[11px] font-semibold text-slate-400'>题目</dt>
                  <dd className='mt-1 font-bold tabular-nums text-slate-900'>{stats.questionCount}</dd>
                </div>
                <div className='pl-3 sm:border-r sm:border-slate-200 sm:pr-3'>
                  <dt className='text-[11px] font-semibold text-slate-400'>选项</dt>
                  <dd className='mt-1 font-bold tabular-nums text-slate-900'>{stats.optionCount}</dd>
                </div>
                <div className='mt-4 border-r border-slate-200 pr-3 sm:mt-0 sm:pl-3'>
                  <dt className='text-[11px] font-semibold text-slate-400'>阅读原文</dt>
                  <dd className='mt-1 font-bold tabular-nums text-slate-900'>{stats.readingTextCount}</dd>
                </div>
                <div className='mt-4 pl-3 sm:mt-0'>
                  <dt className='text-[11px] font-semibold text-slate-400'>听力原文</dt>
                  <dd className='mt-1 font-bold tabular-nums text-slate-900'>{stats.listeningTranscriptCount}</dd>
                </div>
              </dl>

              <div className='flex flex-col gap-3 py-4 sm:flex-row sm:items-end sm:justify-between'>
                <label className='text-xs font-semibold text-slate-500 sm:w-72'>
                  查找词语
                  <input
                    type='search'
                    value={query}
                    onChange={event => setQuery(event.currentTarget.value)}
                    placeholder='原形、读音或词性'
                    className='mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
                  />
                </label>
                <p className='text-xs text-slate-500'>
                  <strong className='font-semibold text-slate-900'>{filteredRows.length}</strong> 个词 · {totalOccurrences} 次出现
                </p>
              </div>

              {visibleRows.length > 0 ? (
                <div className='overflow-x-auto border-y border-slate-200'>
                  <table className='w-full min-w-[38rem] border-collapse text-left'>
                    <thead>
                      <tr className='text-xs text-slate-500'>
                        <th className='w-16 px-3 py-3 font-medium'>排名</th>
                        <th className='px-3 py-3 font-medium'>原形</th>
                        <th className='px-3 py-3 font-medium'>读音</th>
                        <th className='px-3 py-3 font-medium'>词性</th>
                        <th className='px-3 py-3 text-right font-medium'>次数</th>
                        <th className='px-3 py-3 text-right font-medium'>片段</th>
                      </tr>
                    </thead>
                    <tbody className='divide-y divide-slate-200'>
                      {visibleRows.map((item, index) => (
                        <tr key={item.word} className='text-sm'>
                          <td className='px-3 py-3 tabular-nums text-slate-400'>
                            {(normalizedPage - 1) * PAGE_SIZE + index + 1}
                          </td>
                          <td className='px-3 py-3 font-semibold text-slate-900'>{item.word}</td>
                          <td className='px-3 py-3 text-slate-600'>{item.reading || '—'}</td>
                          <td className='px-3 py-3 text-slate-500'>{item.partOfSpeech || '—'}</td>
                          <td className='px-3 py-3 text-right font-semibold tabular-nums text-slate-900'>{item.count}</td>
                          <td className='px-3 py-3 text-right tabular-nums text-slate-500'>{item.documentCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className='border-y border-slate-200 py-12 text-center text-sm text-slate-500'>
                  没有符合条件的词频。
                </p>
              )}
            </div>

            <footer className='flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 md:px-6'>
              <span className='mr-1 text-xs text-slate-500'>第 {normalizedPage}/{totalPages} 页</span>
              <button
                type='button'
                disabled={normalizedPage <= 1}
                onClick={() => setPage(current => Math.max(1, current - 1))}
                className='ui-btn ui-btn-sm disabled:opacity-40'>上一页</button>
              <button
                type='button'
                disabled={normalizedPage >= totalPages}
                onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                className='ui-btn ui-btn-sm disabled:opacity-40'>下一页</button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  )
}
