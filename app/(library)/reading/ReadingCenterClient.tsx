'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import CustomSelect from '@/components/ui/CustomSelect'
import WordFrequencyDialog, {
  type FrequencyMaterial,
} from '@/features/reading/ui/WordFrequencyDialog'
import DeleteEbookButton from './DeleteEbookButton'
import {
  getNewsEditionLabel,
  getNewsTypeLabel,
  type NewsColumn,
  type NewsSource,
  type NewsType,
} from '@/features/reading/domain/news-metadata'
import {
  buildFacetedNewsOptions,
  changeReadingFilter,
  DEFAULT_READING_FILTERS,
  normalizeReadingFilters,
  serializeReadingFilters,
  type ReadingFilterState,
  type ReadingMaterialFilter,
  type ReadingMaterialKind,
  type ReadingSortMode,
} from '@/features/reading/domain/reading-filters'

export type ReadingCenterItem = {
  id: string
  title: string
  shortTitle: string
  hasAuthenticTitle: boolean
  summary: string
  kind: ReadingMaterialKind
  year: string
  publishedDate: string
  sourceLabel: string
  progress: number
  chapterCount: number
  questionCount: number
  order: number
  newsSource: NewsSource
  newsType: NewsType
  newsSection: string
  newsColumn: NewsColumn
  newsEdition: string
  newsTopic: string
}

const PAGE_SIZE = 12
const GROUPS: Array<{ kind: ReadingCenterItem['kind']; label: string }> = [
  { kind: 'news', label: '新闻' },
  { kind: 'exam', label: '真题文章' },
  { kind: 'article', label: '独立文章' },
  { kind: 'ebook', label: '电子书' },
]

export default function ReadingCenterClient({
  items,
  frequencyMaterials,
  initialFilters,
}: {
  items: ReadingCenterItem[]
  frequencyMaterials: FrequencyMaterial[]
  initialFilters: ReadingFilterState
}) {
  const [filters, setFilters] = useState(() =>
    normalizeReadingFilters(items, initialFilters),
  )
  const {
    query,
    kind,
    year,
    sort,
    newsSource,
    newsType,
    newsSection,
    newsColumn,
    newsEdition,
    newsTopic,
    page,
  } = filters

  const years = useMemo(
    () =>
      Array.from(new Set(
        items
          .filter(item => kind === 'all' || item.kind === kind)
          .map(item => item.year)
          .filter(Boolean),
      )).sort(
        (left, right) => right.localeCompare(left, 'zh-CN', { numeric: true }),
      ),
    [items, kind],
  )
  const counts = useMemo(
    () => ({
      news: items.filter(item => item.kind === 'news').length,
      exam: items.filter(item => item.kind === 'exam').length,
    }),
    [items],
  )
  const newsFilterOptions = useMemo(() => {
    const options = buildFacetedNewsOptions(items, filters)
    options.newsSection.sort((a, b) => a.localeCompare(b, 'ja'))
    options.newsTopic.sort((a, b) => a.localeCompare(b, 'ja'))
    return options
  }, [filters, items])
  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return items
      .filter(item => {
        if (kind !== 'all' && item.kind !== kind) return false
        if (year !== 'all' && item.year !== year) return false
        if (newsSource !== 'all' && item.newsSource !== newsSource) return false
        if (newsType !== 'all' && item.newsType !== newsType) return false
        if (newsSection !== 'all' && item.newsSection !== newsSection) return false
        if (newsColumn !== 'all' && item.newsColumn !== newsColumn) return false
        if (newsEdition !== 'all' && item.newsEdition !== newsEdition) return false
        if (newsTopic !== 'all' && item.newsTopic !== newsTopic) return false
        if (
          keyword &&
          !`${item.title} ${item.shortTitle} ${item.summary} ${item.sourceLabel} ${item.newsSource} ${item.newsType} ${item.newsSection} ${item.newsColumn} ${item.newsTopic}`
            .toLowerCase()
            .includes(keyword)
        ) return false
        return true
      })
      .sort((left, right) => {
        if (sort === 'title') return left.title.localeCompare(right.title, 'ja')
        const leftDate = /^\d{4}-\d{1,2}-\d{1,2}$/.test(left.publishedDate)
          ? left.publishedDate
          : left.year
        const rightDate = /^\d{4}-\d{1,2}-\d{1,2}$/.test(right.publishedDate)
          ? right.publishedDate
          : right.year
        const dateOrder = rightDate.localeCompare(leftDate, 'zh-CN', { numeric: true })
        const newestOrder = dateOrder || left.order - right.order
        return sort === 'oldest' ? -newestOrder : newestOrder
      })
  }, [items, kind, newsColumn, newsEdition, newsSection, newsSource, newsTopic, newsType, query, sort, year])
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const normalizedPage = Math.min(page, totalPages)
  const visibleItems = filteredItems.slice(
    (normalizedPage - 1) * PAGE_SIZE,
    normalizedPage * PAGE_SIZE,
  )
  const visibleGroups = GROUPS.map(group => ({
    ...group,
    items: visibleItems.filter(item => item.kind === group.kind),
  })).filter(group => group.items.length > 0)
  const hasActiveFilters = Object.entries(filters).some(([key, value]) =>
    key !== 'page' && value !== DEFAULT_READING_FILTERS[key as keyof ReadingFilterState],
  )

  const updateFilter = (
    key: keyof ReadingFilterState,
    value: string | number,
  ) => setFilters(current => changeReadingFilter(items, current, key, value))

  const resetFilters = () => {
    setFilters(DEFAULT_READING_FILTERS)
  }

  const queryString = useMemo(
    () => serializeReadingFilters({ ...filters, page: normalizedPage }),
    [filters, normalizedPage],
  )

  useEffect(() => {
    const nextUrl = queryString ? `/reading?${queryString}` : '/reading'
    window.history.replaceState(window.history.state, '', nextUrl)
  }, [queryString])

  return (
    <div className='min-h-screen bg-[#f6f5f1] pb-16 font-sans text-slate-900'>
      <h1 className='sr-only'>阅读中心</h1>
      <header className='bg-[#f6f5f1]'>
        <div className='mx-auto max-w-7xl px-4 pb-6 pt-0 md:px-8 md:pb-7'>
          <dl className='grid grid-cols-2 border-b border-slate-900/10 py-4 md:grid-cols-4'>
            <div className='border-r border-slate-900/10 pr-4'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>阅读材料</dt>
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{items.length}</dd>
            </div>
            <div className='pl-4 md:border-r md:border-slate-900/10 md:pr-4'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>新闻</dt>
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{counts.news}</dd>
            </div>
            <div className='mt-4 border-r border-slate-900/10 pr-4 md:mt-0 md:pl-4'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>真题文章</dt>
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{counts.exam}</dd>
            </div>
            <div className='mt-4 pl-4 md:mt-0'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>词频</dt>
              <dd>
                <WordFrequencyDialog materials={frequencyMaterials} />
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className='mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10 lg:py-11'>
        <aside className='lg:sticky lg:top-24 lg:self-start'>
          <div className='rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_36px_-32px_rgba(15,23,42,0.5)]'>
            <div className='flex items-center justify-between gap-3'>
              <h2 className='text-sm font-semibold text-slate-950'>筛选阅读</h2>
              {hasActiveFilters ? (
                <button
                  type='button'
                  onClick={resetFilters}
                  className='text-xs font-semibold text-slate-400 transition hover:text-slate-900'>
                  重置
                </button>
              ) : null}
            </div>
            <div className='mt-4 space-y-4'>
              <label className='block'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>关键词</span>
                <input
                  type='search'
                  value={query}
                  onChange={event => updateFilter('query', event.currentTarget.value)}
                  placeholder='标题、来源或摘要'
                  className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200'
                />
              </label>
              <label className='block'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>材料类型</span>
                <CustomSelect
                  value={kind}
                  onChange={event => updateFilter('kind', event.currentTarget.value as ReadingMaterialFilter)}
                  className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                  <option value='all'>全部材料</option>
                  <option value='news'>新闻</option>
                  <option value='exam'>真题文章</option>
                  <option value='article'>独立文章</option>
                  <option value='ebook'>电子书</option>
                </CustomSelect>
              </label>
              <label className='block'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>年份</span>
                <CustomSelect
                  value={year}
                  onChange={event => updateFilter('year', event.currentTarget.value)}
                  className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                  <option value='all'>全部年份</option>
                  {years.map(item => (
                    <option key={item} value={item}>{item} 年</option>
                  ))}
                </CustomSelect>
              </label>
              <div className='border-t border-slate-100 pt-4'>
                <p className='mb-3 text-[11px] font-bold tracking-[0.06em] text-slate-400'>新闻筛选</p>
                <div className='space-y-3'>
                  <label className='block'>
                    <span className='mb-1.5 block text-[11px] font-bold text-slate-500'>来源</span>
                    <CustomSelect value={newsSource} onChange={event => updateFilter('newsSource', event.currentTarget.value)}
                      className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                      <option value='all'>全部来源</option>
                      {newsFilterOptions.newsSource.map(item => <option key={item} value={item}>{item}</option>)}
                    </CustomSelect>
                  </label>
                  <label className='block'>
                    <span className='mb-1.5 block text-[11px] font-bold text-slate-500'>类型</span>
                    <CustomSelect value={newsType} onChange={event => updateFilter('newsType', event.currentTarget.value)}
                      className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                      <option value='all'>全部类型</option>
                      {(['news', 'editorial', 'column'] as const)
                        .filter(item => newsFilterOptions.newsType.includes(item))
                        .map(item => <option key={item} value={item}>{getNewsTypeLabel(item)}</option>)}
                    </CustomSelect>
                  </label>
                  <label className='block'>
                    <span className='mb-1.5 block text-[11px] font-bold text-slate-500'>版面</span>
                    <CustomSelect value={newsSection} onChange={event => updateFilter('newsSection', event.currentTarget.value)}
                      className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                      <option value='all'>全部版面</option>
                      {newsFilterOptions.newsSection.map(item => <option key={item} value={item}>{item}</option>)}
                    </CustomSelect>
                  </label>
                  <label className='block'>
                    <span className='mb-1.5 block text-[11px] font-bold text-slate-500'>刊面</span>
                    <CustomSelect value={newsEdition} onChange={event => updateFilter('newsEdition', event.currentTarget.value)}
                      className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                      <option value='all'>全部刊面</option>
                      {newsFilterOptions.newsEdition.map(item => <option key={item} value={item}>{getNewsEditionLabel(item)}</option>)}
                    </CustomSelect>
                  </label>
                  <label className='block'>
                    <span className='mb-1.5 block text-[11px] font-bold text-slate-500'>主题</span>
                    <CustomSelect value={newsTopic} onChange={event => updateFilter('newsTopic', event.currentTarget.value)}
                      className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                      <option value='all'>全部主题</option>
                      {newsFilterOptions.newsTopic.map(item => <option key={item} value={item}>{item}</option>)}
                    </CustomSelect>
                  </label>
                  <label className='block'>
                    <span className='mb-1.5 block text-[11px] font-bold text-slate-500'>专栏</span>
                    <CustomSelect value={newsColumn} onChange={event => updateFilter('newsColumn', event.currentTarget.value)}
                      className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                      <option value='all'>全部专栏</option>
                      {newsFilterOptions.newsColumn.map(item => <option key={item} value={item}>{item}</option>)}
                    </CustomSelect>
                  </label>
                </div>
              </div>
              <label className='block'>
                <span className='mb-1.5 block text-[11px] font-bold tracking-[0.06em] text-slate-500'>排序方式</span>
                <CustomSelect
                  value={sort}
                  onChange={event => updateFilter('sort', event.currentTarget.value as ReadingSortMode)}
                  className='h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-semibold text-slate-700 outline-none'>
                  <option value='newest'>最新材料优先</option>
                  <option value='oldest'>最早材料优先</option>
                  <option value='title'>按标题排序</option>
                </CustomSelect>
              </label>
            </div>
            <p className='mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500'>
              当前显示 <strong className='font-semibold text-slate-900'>{filteredItems.length}</strong> 条材料
            </p>
          </div>
        </aside>

        <main className='min-w-0'>
          {visibleGroups.length === 0 ? (
            <section className='rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center'>
              <p className='text-lg font-semibold text-slate-950'>没有找到匹配的阅读材料</p>
              <p className='mt-2 text-sm text-slate-500'>尝试缩短关键词，或者清空类型与年份筛选。</p>
              <button type='button' onClick={resetFilters} className='ui-btn ui-btn-primary mt-5'>清空筛选</button>
            </section>
          ) : (
            <div className='space-y-10'>
              {visibleGroups.map(group => (
                <section key={group.kind}>
                  <div className='mb-5 flex items-end justify-between gap-4 border-b border-slate-900/10 pb-3'>
                    <div>
                      <p className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>READING</p>
                      <h2 className='mt-1 text-xl font-semibold tracking-tight text-slate-950'>{group.label}</h2>
                    </div>
                    <span className='text-xs font-medium text-slate-500'>{group.items.length} 条</span>
                  </div>
                  <div className='space-y-3'>
                    {group.items.map(item => {
                      const ebook = item.kind === 'ebook'
                      const href = ebook
                        ? `/reading/ebooks/${encodeURIComponent(item.id)}`
                        : `/reading/articles/${encodeURIComponent(item.id)}`
                      return (
                        <article
                          key={item.id}
                          className='rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-[0_12px_36px_-32px_rgba(15,23,42,0.5)] md:px-6'>
                          <Link href={href} className='group block'>
                            <div className='flex items-start justify-between gap-3'>
                              <div className='min-w-0'>
                                <p className='text-[11px] font-semibold tracking-[0.08em] text-slate-400'>{item.sourceLabel}</p>
                                {item.hasAuthenticTitle ? (
                                  <h3 className='mt-2 line-clamp-2 text-base font-semibold leading-6 text-slate-900 group-hover:text-slate-600'>{item.shortTitle}</h3>
                                ) : null}
                              </div>
                              <span className='shrink-0 border-l border-slate-300 pl-3 text-[11px] font-medium tracking-wide text-slate-600'>
                                {ebook
                                  ? `${Math.max(1, item.chapterCount)} 个章节`
                                  : item.kind === 'exam'
                                    ? `${item.questionCount} 题`
                                    : group.label}
                              </span>
                            </div>
                            <p className={`${item.hasAuthenticTitle ? 'mt-3' : 'mt-4'} line-clamp-2 text-sm leading-7 text-slate-600`}>{item.summary}</p>
                            <div className='mt-4'>
                              <div className='flex items-center justify-between text-xs font-semibold text-slate-500'>
                                <span>{item.progress > 0 ? '继续阅读' : '尚未开始'}</span>
                                <span>{item.progress}%</span>
                              </div>
                              <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100'>
                                <div className='h-full rounded-full bg-slate-900' style={{ width: `${item.progress}%` }} />
                              </div>
                            </div>
                          </Link>
                          {ebook ? (
                            <div className='mt-4 flex justify-end border-t border-slate-100 pt-3'>
                              <DeleteEbookButton id={item.id} title={item.title} />
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <nav aria-label='阅读材料分页' className='mt-8 flex items-center justify-end gap-2'>
              <span className='mr-1 text-xs text-slate-500'>第 {normalizedPage}/{totalPages} 页</span>
              <button
                type='button'
                disabled={normalizedPage <= 1}
                onClick={() => setFilters(current => ({ ...current, page: Math.max(1, current.page - 1) }))}
                className='ui-btn ui-btn-sm disabled:opacity-40'>上一页</button>
              <button
                type='button'
                disabled={normalizedPage >= totalPages}
                onClick={() => setFilters(current => ({ ...current, page: Math.min(totalPages, current.page + 1) }))}
                className='ui-btn ui-btn-sm disabled:opacity-40'>下一页</button>
            </nav>
          ) : null}
        </main>
      </div>
    </div>
  )
}
