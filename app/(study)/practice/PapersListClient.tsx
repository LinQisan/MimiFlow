'use client'

import { useMemo } from 'react'
import Link from 'next/link'

import type { ExamHubLevelSummary } from '@/lib/repositories/exam'
import CustomSelect from '@/components/ui/CustomSelect'
import PaperLibraryItem from '@/features/practice/ui/PaperLibraryItem'
import { usePaperLibraryState } from '@/features/practice/hooks/usePaperLibraryState'
import {
  filterPaperLevels,
  getPaperFilterOptions,
  getPaperLibraryStats,
  groupPapersByLanguageAndLevel,
} from '@/features/practice/domain/paper-library'

type Props = {
  levels: ExamHubLevelSummary[]
  totalPaperCount: number
}

export default function PapersListClient({ levels, totalPaperCount }: Props) {
  const {
    query,
    setQuery,
    language,
    setLanguage,
    level,
    setLevel,
    reset,
  } = usePaperLibraryState()
  const allPapers = useMemo(() => levels.flatMap(item => item.papers), [levels])
  const stats = useMemo(() => getPaperLibraryStats(allPapers), [allPapers])
  const filterOptions = useMemo(() => getPaperFilterOptions(allPapers), [allPapers])
  const filteredLevels = useMemo(
    () => filterPaperLevels(levels, { query, language, level }),
    [language, level, levels, query],
  )
  const filteredPaperCount = filteredLevels.reduce(
    (sum, item) => sum + item.papers.length,
    0,
  )
  const hasActiveFilter =
    Boolean(query.trim()) || language !== 'all' || level !== 'all'

  return (
    <div className='min-h-screen bg-[#f6f5f1] pb-16 font-sans text-slate-900'>
      <header className='bg-[#f6f5f1]'>
        <div className='mx-auto max-w-7xl px-4 pb-6 pt-0 md:px-8 md:pb-7 md:pt-0'>
          <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center'>
          <dl className='grid grid-cols-2 border-b border-slate-900/10 py-4 md:grid-cols-4'>
            <div className='border-r border-slate-900/10 pr-4'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>试卷</dt>
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{totalPaperCount}</dd>
            </div>
            <div className='pl-4 md:border-r md:border-slate-900/10 md:pr-4'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>题目</dt>
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{stats.questions}</dd>
            </div>
            <div className='mt-4 border-r border-slate-900/10 pr-4 md:mt-0 md:pl-4'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>累计练习</dt>
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{stats.attempts}</dd>
            </div>
            <div className='mt-4 pl-4 md:mt-0'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>平均正确率</dt>
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>
                {stats.averageAccuracy !== null ? `${stats.averageAccuracy}%` : '—'}
              </dd>
            </div>
          </dl>
          <Link
            href='/practice/custom'
            className='inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 lg:w-auto'>
            自定义抽题
          </Link>
          </div>
        </div>
      </header>

      <div className='mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10 lg:py-11'>
        <aside className='lg:sticky lg:top-24 lg:self-start'>
          <div className='rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_36px_-32px_rgba(15,23,42,0.5)]'>
            <div className='flex items-center justify-between gap-3'>
              <h2 className='text-sm font-semibold text-slate-950'>筛选试卷</h2>
              {hasActiveFilter ? (
                <button type='button' onClick={reset} className='text-xs font-semibold text-slate-400 transition hover:text-slate-900'>
                  重置
                </button>
              ) : null}
            </div>
            <div className='mt-4 space-y-4'>
              <label className='block'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>关键词</span>
                <input
                  value={query}
                  onChange={event => setQuery(event.currentTarget.value)}
                  placeholder='试卷名或年份'
                  className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200'
                />
              </label>
              <label className='block'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>语言</span>
                <CustomSelect value={language} onChange={event => setLanguage(event.currentTarget.value)} className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                  <option value='all'>全部语言</option>
                  {filterOptions.languages.map(item => <option key={item} value={item}>{item}</option>)}
                </CustomSelect>
              </label>
              <label className='block'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>等级</span>
                <CustomSelect value={level} onChange={event => setLevel(event.currentTarget.value)} className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                  <option value='all'>全部等级</option>
                  {filterOptions.levels.map(item => <option key={item} value={item}>{item}</option>)}
                </CustomSelect>
              </label>
            </div>
            <p className='mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500'>
              当前显示 <strong className='font-semibold text-slate-900'>{filteredPaperCount}</strong> 套试卷
            </p>
          </div>

          {filteredLevels.length > 1 ? (
            <nav aria-label='试卷分组' className='mt-5 hidden space-y-1 lg:block'>
              <p className='mb-2 px-2 text-[11px] font-bold tracking-[0.08em] text-slate-400'>试卷分组</p>
              {filteredLevels.map(item => (
                <a key={item.id} href={`#paper-level-${item.id}`} className='flex items-center justify-between rounded-lg px-2 py-2 text-sm text-slate-600 transition hover:bg-white hover:text-slate-950'>
                  <span>{item.title}</span>
                  <span className='text-xs tabular-nums text-slate-400'>{item.papers.length}</span>
                </a>
              ))}
            </nav>
          ) : null}
        </aside>

        <main className='min-w-0'>
          {filteredLevels.length === 0 ? (
            <section className='rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center'>
              <p className='text-lg font-semibold text-slate-950'>没有找到匹配的试卷</p>
              <p className='mt-2 text-sm text-slate-500'>尝试缩短关键词，或者清空语言与等级筛选。</p>
              <button type='button' onClick={reset} className='ui-btn ui-btn-primary mt-5'>清空筛选</button>
            </section>
          ) : (
            <div className='space-y-10'>
              {filteredLevels.map(levelGroup => (
                <section key={levelGroup.id} id={`paper-level-${levelGroup.id}`} className='scroll-mt-24'>
                  {filteredLevels.length > 1 ? (
                    <div className='mb-5 flex items-end justify-between gap-4 border-b border-slate-900/10 pb-3'>
                      <div>
                        <p className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>COLLECTION</p>
                        <h2 className='mt-1 text-xl font-semibold tracking-tight text-slate-950'>{levelGroup.title}</h2>
                      </div>
                      <span className='text-xs font-medium text-slate-500'>{levelGroup.papers.length} 套试卷</span>
                    </div>
                  ) : null}

                  <div className='space-y-8'>
                    {groupPapersByLanguageAndLevel(levelGroup.papers).map(group => (
                      <section key={`${levelGroup.id}-${group.language}-${group.level}`}>
                        <div className='mb-3 flex items-center gap-3'>
                          <h2 className='text-sm font-semibold text-slate-800'>{group.language} · {group.level}</h2>
                          <span className='h-px flex-1 bg-slate-900/10' />
                          <span className='text-xs tabular-nums text-slate-400'>{group.papers.length} 套</span>
                        </div>
                        <div className='space-y-3'>
                          {group.papers.map(paper => <PaperLibraryItem key={paper.id} paper={paper} />)}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
