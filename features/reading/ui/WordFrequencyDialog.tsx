'use client'

import { useEffect, useMemo, useState } from 'react'

import CustomSelect from '@/components/ui/CustomSelect'
import {
  mergeWordFrequencyRows,
  type WordFrequencyRow,
} from '@/features/reading/domain/sudachi'

export type FrequencyMaterial = {
  id: string
  kind: 'news' | 'exam' | 'article'
  year: string
  rows: WordFrequencyRow[]
}

type FrequencyScope = 'all' | FrequencyMaterial['kind']

const PAGE_SIZE = 50

export default function WordFrequencyDialog({
  materials,
}: {
  materials: FrequencyMaterial[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [scope, setScope] = useState<FrequencyScope>('all')
  const [year, setYear] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const years = useMemo(
    () =>
      Array.from(new Set(materials.map(item => item.year).filter(Boolean))).sort(
        (left, right) => right.localeCompare(left, 'zh-CN', { numeric: true }),
      ),
    [materials],
  )
  const totalRows = useMemo(
    () => mergeWordFrequencyRows(materials.map(item => item.rows)),
    [materials],
  )
  const filteredMaterials = useMemo(
    () =>
      materials.filter(
        item =>
          (scope === 'all' || item.kind === scope) &&
          (year === 'all' || item.year === year),
      ),
    [materials, scope, year],
  )
  const filteredRows = useMemo(() => {
    const keyword = query.normalize('NFKC').trim().toLowerCase()
    const rows = mergeWordFrequencyRows(filteredMaterials.map(item => item.rows))
    if (!keyword) return rows
    return rows.filter(item =>
      `${item.word} ${item.reading} ${item.partOfSpeech}`
        .toLowerCase()
        .includes(keyword),
    )
  }, [filteredMaterials, query])
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

  useEffect(() => setPage(1), [query, scope, year])

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
        disabled={materials.length === 0}
        className='group mt-1 inline-flex items-baseline gap-2 text-left disabled:cursor-default'>
        <span className='text-xl font-semibold tabular-nums text-slate-950'>
          {totalRows.length || '—'}
        </span>
        {materials.length > 0 ? (
          <span className='text-[11px] font-semibold text-slate-400 transition group-hover:text-slate-700'>
            查看详情
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className='fixed inset-0 z-[100]'>
          <button
            type='button'
            aria-label='关闭词频窗口'
            onClick={() => setIsOpen(false)}
            className='absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]'
          />
          <section
            role='dialog'
            aria-modal='true'
            aria-labelledby='word-frequency-dialog-title'
            className='absolute inset-x-3 top-1/2 mx-auto flex max-h-[min(86vh,52rem)] max-w-5xl -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-[#f8f7f3] shadow-2xl sm:inset-x-6'>
            <header className='flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6'>
              <div>
                <h2
                  id='word-frequency-dialog-title'
                  className='text-lg font-bold tracking-tight text-slate-950'>
                  阅读词频
                </h2>
                <p className='mt-1 text-xs text-slate-500'>
                  按原形合并，可按材料类型和年份筛选。
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
              <div className='grid gap-3 border-b border-slate-200 pb-5 sm:grid-cols-3'>
                <label className='text-xs font-semibold text-slate-500'>
                  材料范围
                  <CustomSelect
                    aria-label='词频材料范围'
                    value={scope}
                    onChange={event => setScope(event.currentTarget.value as FrequencyScope)}
                    className='mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none'>
                    <option value='all'>全部文章</option>
                    <option value='news'>仅新闻</option>
                    <option value='exam'>仅真题文章</option>
                    <option value='article'>仅独立文章</option>
                  </CustomSelect>
                </label>
                <label className='text-xs font-semibold text-slate-500'>
                  年份
                  <CustomSelect
                    aria-label='词频年份'
                    value={year}
                    onChange={event => setYear(event.currentTarget.value)}
                    className='mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none'>
                    <option value='all'>全部年份</option>
                    {years.map(item => (
                      <option key={item} value={item}>{item} 年</option>
                    ))}
                  </CustomSelect>
                </label>
                <label className='text-xs font-semibold text-slate-500'>
                  查找词语
                  <input
                    type='search'
                    value={query}
                    onChange={event => setQuery(event.currentTarget.value)}
                    placeholder='原形、读音或词性'
                    className='mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
                  />
                </label>
              </div>

              <div className='flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-slate-500'>
                <p>
                  <strong className='font-semibold text-slate-900'>{filteredMaterials.length}</strong> 篇材料 ·{' '}
                  <strong className='font-semibold text-slate-900'>{filteredRows.length}</strong> 个词
                </p>
                <p>{totalOccurrences} 次出现</p>
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
                        <th className='px-3 py-3 text-right font-medium'>材料</th>
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
              <span className='mr-1 text-xs text-slate-500'>
                第 {normalizedPage}/{totalPages} 页
              </span>
              <button
                type='button'
                disabled={normalizedPage <= 1}
                onClick={() => setPage(current => Math.max(1, current - 1))}
                className='ui-btn ui-btn-sm disabled:opacity-40'>
                上一页
              </button>
              <button
                type='button'
                disabled={normalizedPage >= totalPages}
                onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                className='ui-btn ui-btn-sm disabled:opacity-40'>
                下一页
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  )
}
