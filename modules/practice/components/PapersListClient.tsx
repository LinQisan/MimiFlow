'use client'

import { useDeferredValue, useMemo } from 'react'
import Link from 'next/link'

import type {
  ExamHubLevelSummary,
} from '@/lib/repositories/exam'
import CustomSelect from '@/components/ui/CustomSelect'
import PaperLibraryItem from '@/modules/practice/components/PaperLibraryItem'
import {
  PerformanceStatsLauncher,
  VocabularyAnalyticsLauncher,
} from '@/modules/practice/components/PracticeInsightsLaunchers'
import { usePaperLibraryState } from '@/modules/practice/hooks/usePaperLibraryState'
import {
  filterPaperLevels,
  getPaperFilterOptions,
  getPaperLibraryStats,
  paperLanguageUsesLevels,
} from '@/modules/practice/domain/paper-library'

type Props = {
  levels: ExamHubLevelSummary[]
  totalPaperCount: number
}

export default function PapersListClient({
  levels,
  totalPaperCount,
}: Props) {
  const {
    query,
    setQuery,
    language,
    setLanguage,
    level,
    setLevel,
    sort,
    setSort,
    reset,
  } = usePaperLibraryState()
  const deferredQuery = useDeferredValue(query)
  const allPapers = useMemo(() => levels.flatMap(item => item.papers), [levels])
  const stats = useMemo(() => getPaperLibraryStats(allPapers), [allPapers])
  const filterOptions = useMemo(() => getPaperFilterOptions(allPapers), [allPapers])
  const filteredLevels = useMemo(
    () =>
      filterPaperLevels(levels, {
        query: deferredQuery,
        language,
        level,
        sort,
      }),
    [deferredQuery, language, level, levels, sort],
  )
  const filteredPaperCount = filteredLevels.reduce(
    (sum, item) => sum + item.papers.length,
    0,
  )
  const hasActiveFilter =
    Boolean(query.trim()) ||
    language !== 'all' ||
    level !== 'all' ||
    sort !== 'newest'
  const showLevelFilter = paperLanguageUsesLevels(language)

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
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{stats.completedPractices}</dd>
            </div>
            <div className='mt-4 pl-4 md:mt-0'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>平均正确率</dt>
              <dd>
                <PerformanceStatsLauncher
                  averageAccuracy={stats.averageAccuracy}
                  papers={allPapers}
                />
              </dd>
            </div>
          </dl>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <VocabularyAnalyticsLauncher disabled={totalPaperCount === 0} />
            <Link
              href='/practice/custom'
              className='inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 lg:w-auto'>
              自定义抽题
            </Link>
          </div>
          </div>
        </div>
      </header>

      <div className='mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10 lg:py-11'>
        <aside className='lg:sticky lg:top-24 lg:self-start'>
          <div className='border-b border-slate-200 py-4 lg:border-b-0 lg:py-0'>
            <div className='flex items-center justify-between gap-3'>
              <h2 className='ui-section-head'>筛选</h2>
              <div className='flex items-center gap-2'>
                <span className='ui-meta'>
                  {filteredPaperCount} 套
                </span>
                {hasActiveFilter ? (
                  <button type='button' onClick={reset} className='text-xs font-semibold text-slate-400 transition hover:text-slate-900'>
                    清除
                  </button>
                ) : null}
              </div>
            </div>
            <div className={`mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:gap-4 ${
              showLevelFilter
                ? 'md:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]'
                : 'md:grid-cols-[minmax(0,1.35fr)_repeat(2,minmax(0,1fr))]'
            }`}>
              <label className='block sm:col-span-2 md:col-span-1 lg:col-span-1'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>关键词</span>
                <input
                  value={query}
                  onChange={event => setQuery(event.currentTarget.value)}
                  placeholder='试卷名或年份'
                  className='h-10 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white'
                />
              </label>
              <label className='block'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>语言</span>
                <CustomSelect value={language} onChange={event => {
                  const nextLanguage = event.currentTarget.value
                  setLanguage(nextLanguage)
                  if (!paperLanguageUsesLevels(nextLanguage)) setLevel('all')
                }} className='h-10 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                  <option value='all'>全部语言</option>
                  {filterOptions.languages.map(item => <option key={item} value={item}>{item}</option>)}
                </CustomSelect>
              </label>
              {showLevelFilter ? <label className='block'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>等级</span>
                <CustomSelect value={level} onChange={event => setLevel(event.currentTarget.value)} className='h-10 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                  <option value='all'>全部等级</option>
                  {filterOptions.levels.map(item => <option key={item} value={item}>{item}</option>)}
                </CustomSelect>
              </label> : null}
              <label className='block'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>排序方式</span>
                <CustomSelect value={sort} onChange={event => setSort(event.currentTarget.value as typeof sort)} className='h-10 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                  <option value='newest'>最新试卷优先</option>
                  <option value='oldest'>最早试卷优先</option>
                  <option value='name'>按名称排序</option>
                </CustomSelect>
              </label>
            </div>
          </div>

          {filteredLevels.length > 1 ? (
            <nav aria-label='试卷分组' className='mt-5 hidden space-y-1 lg:block'>
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
            <section className='ui-empty'>
              <p className='text-sm font-semibold text-slate-800'>没有找到匹配的试卷</p>
              <p className='mt-1'>尝试缩短关键词，或者清空语言与等级筛选。</p>
              <button type='button' onClick={reset} className='ui-btn ui-btn-primary mt-5'>清空筛选</button>
            </section>
          ) : (
            <div className='space-y-10'>
              {filteredLevels.map(levelGroup => (
                <section key={levelGroup.id} id={`paper-level-${levelGroup.id}`} className='scroll-mt-24'>
                  {filteredLevels.length > 1 ? (
                    <div className='mb-5 flex items-baseline gap-3'>
                      <h2 className='text-xl font-semibold tracking-tight text-slate-950'>{levelGroup.title}</h2>
                      <span className='text-xs font-medium text-slate-500'>{levelGroup.papers.length} 套试卷</span>
                    </div>
                  ) : null}

                  <div className='space-y-7'>
                    {levelGroup.papers.map(paper => (
                      <PaperLibraryItem key={paper.id} paper={paper} />
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
