'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import CustomSelect from '@/components/ui/CustomSelect'
import WordbookDistributionChart from '@/modules/knowledge/vocabulary/components/WordbookDistributionChart'
import {
  sortWordFrequencyRows,
  type WordFrequencyRow,
  type WordFrequencySortMode,
} from '@/modules/language/domain/sudachi'
import type {
  PaperFrequencySourceStats,
  PaperWordbookDistribution,
} from '@/modules/practice/domain/paper-word-frequency'

const EMPTY_ROWS: WordFrequencyRow[] = []
const EMPTY_STATS: PaperFrequencySourceStats = {
  questionCount: 0,
  optionCount: 0,
  readingTextCount: 0,
  listeningTranscriptCount: 0,
}
const EMPTY_DISTRIBUTION: PaperWordbookDistribution = {
  totalWords: 0,
  outsideCount: 0,
  outsideRate: 0,
  outsideWords: [],
  wordbooks: [],
}

export default function PaperWordFrequencyDialog({
  paperId,
}: {
  paperId: string
}) {
  const [data, setData] = useState<{
    rows: WordFrequencyRow[]
    stats: PaperFrequencySourceStats
    wordbookDistribution: PaperWordbookDistribution
  } | null>(null)
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [posFilter, setPosFilter] = useState('all')
  const [pageSize, setPageSize] = useState(50)
  const [view, setView] = useState<'frequency' | 'wordbooks'>('frequency')
  const deferredQuery = useDeferredValue(query)
  const listRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [page, setPage] = useState(1)
  const [sortMode, setSortMode] = useState<WordFrequencySortMode>('learning')
  const rows = data?.rows || EMPTY_ROWS
  const stats = data?.stats || EMPTY_STATS
  const wordbookDistribution =
    data?.wordbookDistribution || EMPTY_DISTRIBUTION
  const sortedRows = useMemo(() => sortWordFrequencyRows(rows, sortMode), [rows, sortMode])
  const searchIndex = useMemo(() => new Map(rows.map(item => [item.word,
    `${item.word} ${item.reading} ${item.partOfSpeech}`.normalize('NFKC').toLowerCase(),
  ])), [rows])
  const posOptions = useMemo(() => [...new Set(rows.map(row => row.partOfSpeech).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')), [rows])
  const filteredRows = useMemo(() => {
    const keyword = deferredQuery.normalize('NFKC').trim().toLowerCase()
    return sortedRows.filter(item => (posFilter === 'all' || item.partOfSpeech === posFilter) &&
      (!keyword || searchIndex.get(item.word)?.includes(keyword)))
  }, [deferredQuery, sortedRows, posFilter, searchIndex])
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const normalizedPage = Math.min(page, totalPages)
  const visibleRows = filteredRows.slice(
    (normalizedPage - 1) * pageSize,
    normalizedPage * pageSize,
  )
  const totalOccurrences = filteredRows.reduce(
    (sum, item) => sum + item.count,
    0,
  )

  useEffect(() => setPage(1), [deferredQuery, sortMode, posFilter, pageSize])
  useEffect(() => { listRef.current?.scrollTo({ top: 0 }) }, [normalizedPage, deferredQuery, sortMode, posFilter, pageSize, view])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); setIsOpen(false) }
      if (event.key !== 'Tab') return
      const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], summary, [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0)
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    const previousOverflow = document.body.style.overflow
    const trigger = triggerRef.current
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus())
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      trigger?.focus()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const openDialog = async () => {
    setIsOpen(true)
    if (data) {
      setIsOpen(true)
      return
    }
    setLoadState('loading')
    try {
      const response = await fetch(
        `/api/practice/${encodeURIComponent(paperId)}/word-frequency`,
      )
      if (!response.ok) throw new Error('request failed')
      const result = (await response.json()) as {
        rows: WordFrequencyRow[]
        stats: PaperFrequencySourceStats
        wordbookDistribution: PaperWordbookDistribution
      }
      setData(result)
      setLoadState('idle')
    } catch {
      setLoadState('error')
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type='button'
        aria-haspopup='dialog'
        aria-expanded={isOpen}
        onClick={() => void openDialog()}
        disabled={loadState === 'loading'}
        className='ui-btn disabled:cursor-default disabled:opacity-40'>
        {loadState === 'loading'
          ? '词频分析中…'
          : loadState === 'error'
            ? '词频加载失败，重试'
            : data
              ? `词频 ${rows.length}`
              : '词频'}
      </button>

      {isOpen ? (
        <div className='fixed inset-0 z-[100]'>
          <button
            type='button'
            aria-label='关闭试卷词频窗口'
            tabIndex={-1}
            onClick={() => setIsOpen(false)}
            className='absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]'
          />
          <section
            ref={dialogRef}
            role='dialog'
            aria-modal='true'
            aria-labelledby='paper-frequency-dialog-title'
            className='absolute inset-x-3 top-1/2 mx-auto flex h-[min(94dvh,58rem)] max-w-6xl -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-[#f8f7f3] shadow-2xl sm:inset-x-6'>
            <header className='flex items-start justify-between gap-4 shrink-0 px-5 pb-2 pt-4 md:px-6'>
              <div>
                <h2
                  id='paper-frequency-dialog-title'
                  className='text-lg font-bold tracking-tight text-slate-950'>
                  试卷词频
                </h2>
                <p className='mt-1 text-xs text-slate-500'>
                  {rows.length.toLocaleString()} 个词 · 题干、选项及阅读／听力原文
                </p>
              </div>
              <button
                ref={closeRef}
                type='button'
                aria-label='关闭试卷词频'
                onClick={() => setIsOpen(false)}
                className='px-2 py-1 text-sm font-semibold text-slate-500 hover:text-slate-950'>
                关闭
              </button>
            </header>

            <div className='flex shrink-0 items-center gap-2 px-5 py-2 md:px-6' role='group' aria-label='分析视图'>
              <button type='button' aria-pressed={view === 'frequency'} onClick={() => setView('frequency')} className={`ui-btn ui-btn-sm ${view === 'frequency' ? 'ui-btn-primary' : ''}`}>词频</button>
              <button type='button' aria-pressed={view === 'wordbooks'} onClick={() => setView('wordbooks')} className={`ui-btn ui-btn-sm ${view === 'wordbooks' ? 'ui-btn-primary' : ''}`}>单词书分布</button>
              <details className='relative ml-auto text-xs text-slate-500'>
                <summary className='cursor-pointer list-none py-2'>统计说明 ⓘ</summary>
                <p className='absolute right-0 top-full z-30 w-64 rounded-md bg-white p-3 leading-6 shadow-lg'>统计 {stats.questionCount} 道题、{stats.optionCount} 个选项、{stats.readingTextCount} 篇阅读和 {stats.listeningTranscriptCount} 段听力。“片段”表示包含该词的文本片段数。学习优先排序会降低基础词权重。</p>
              </details>
            </div>
            {!data ? <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-5 text-sm text-slate-500' role='status'>
              <p>{loadState === 'error' ? '词频加载失败' : '正在分析试卷词汇…'}</p>
              {loadState === 'error' ? <button type='button' onClick={() => void openDialog()} className='ui-btn ui-btn-sm'>重试</button> : null}
            </div> : view === 'wordbooks' ? <div className='min-h-0 flex-1 overflow-auto px-5 pb-4 md:px-6'>
              <WordbookDistributionChart distribution={wordbookDistribution} compact description='按去重词统计，同一词可命中多个单词书。点击条目查看命中词。' />
            </div> : <div className='flex min-h-0 flex-1 flex-col px-5 pb-4 md:px-6'>
              <div className='grid shrink-0 grid-cols-2 items-end gap-2 py-2 lg:grid-cols-[minmax(0,1fr)_10rem_12rem_auto]'>
                <label className='col-span-2 text-xs font-semibold text-slate-500 lg:col-span-1'>
                  查找词语
                  <input
                    type='search'
                    value={query}
                    onChange={event => setQuery(event.currentTarget.value)}
                    placeholder='原形、读音或词性'
                    aria-label='搜索词频'
                    className='mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-base sm:text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
                  />
                </label>
                <label className='min-w-0 text-xs font-semibold text-slate-500'>词性
                  <CustomSelect aria-label='词频词性筛选' value={posFilter} onChange={event => setPosFilter(event.currentTarget.value)} className='mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm'>
                    <option value='all'>全部词性</option>
                    {posOptions.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </CustomSelect>
                </label>
                <label className='text-xs font-semibold text-slate-500'>
                  排序方式
                  <CustomSelect
                    aria-label='词频排序方式'
                    value={sortMode}
                    onChange={event =>
                      setSortMode(event.currentTarget.value as WordFrequencySortMode)
                    }
                    className='mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none'>
                    <option value='learning'>学习优先（推荐）</option>
                    <option value='frequency'>出现次数</option>
                  </CustomSelect>
                </label>
                <button type='button' onClick={() => { setQuery(''); setPosFilter('all'); setSortMode('learning'); setPage(1) }} className='ui-btn ui-btn-sm col-span-2 lg:col-span-1'>重置</button>
              </div>
              <p role='status' className='shrink-0 py-2 text-xs text-slate-500'>{filteredRows.length.toLocaleString()} 词 · {totalOccurrences.toLocaleString()} 次出现{query !== deferredQuery ? ' · 筛选中…' : ''}</p>
              <div ref={listRef} tabIndex={0} aria-label='词频结果' className='min-h-0 flex-1 overflow-auto overscroll-contain'>
              {visibleRows.length > 0 ? (
                <div>
                  <table className='w-full min-w-0 sm:min-w-[27rem] border-collapse text-left'>
                    <thead className='sticky top-0 z-10 bg-[#f8f7f3]'>
                      <tr className='text-xs text-slate-500'>
                        <th scope='col' className='hidden w-16 px-3 py-2 font-medium sm:table-cell'>排名</th>
                        <th scope='col' className='px-3 py-2 font-medium'>词汇 / 读音</th>
                        <th scope='col' className='hidden px-3 py-2 font-medium sm:table-cell'>词性</th>
                        <th scope='col' className='px-3 py-2 text-right font-medium'>次数</th>
                        <th scope='col' className='px-3 py-2 text-right font-medium'>片段</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((item, index) => (
                        <tr key={item.word} className='text-sm hover:bg-white/60'>
                          <td className='hidden px-3 py-2 tabular-nums text-slate-400 sm:table-cell'>
                            {(normalizedPage - 1) * pageSize + index + 1}
                          </td>
                          <td className='px-3 py-2 font-word-ja' lang='ja'><span className='font-semibold text-slate-900'>{item.word}</span>{item.reading && item.reading !== item.word ? <span className='block text-xs text-slate-500'>{item.reading}</span> : null}<span className='block text-[11px] text-slate-400 sm:hidden'>{item.partOfSpeech}</span></td>
                          <td className='hidden px-3 py-2 text-slate-500 sm:table-cell'>{item.partOfSpeech || '—'}</td>
                          <td className='px-3 py-2 text-right font-semibold tabular-nums text-slate-900'>{item.count}</td>
                          <td className='px-3 py-2 text-right tabular-nums text-slate-500'>{item.documentCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className='py-12 text-center text-sm text-slate-500'>
                  没有符合条件的词频。
                </p>
              )}
              </div>

            <footer className='flex shrink-0 flex-wrap items-center justify-between gap-2 pt-3'>
              <label className='flex items-center gap-2 text-xs text-slate-500'>每页<CustomSelect aria-label='每页词频数' value={String(pageSize)} onChange={event => setPageSize(Number(event.currentTarget.value))} className='h-9 rounded-md border border-slate-200 bg-white px-2'>{[25,50,100].map(size => <option key={size} value={size}>{size} 词</option>)}</CustomSelect></label>
              <div className='flex items-center gap-2'>
              <label className='flex items-center gap-1 text-xs text-slate-500'><input aria-label='词频页码' type='number' min={1} max={totalPages} value={normalizedPage} onChange={event => { const next = Number(event.currentTarget.value); if (Number.isInteger(next) && next >= 1 && next <= totalPages) setPage(next) }} className='h-9 w-14 rounded-md border border-slate-200 bg-white px-2 text-center' /> / {totalPages}</label>
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
              </div>
            </footer>
            </div>}
          </section>
        </div>
      ) : null}
    </>
  )
}
