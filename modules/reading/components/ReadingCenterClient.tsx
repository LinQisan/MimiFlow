'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import CustomSelect from '@/components/ui/CustomSelect'
import WordFrequencyDialog from '@/modules/reading/components/WordFrequencyDialog'
import DeleteEbookButton from './DeleteEbookButton'
import {
  getNewsTypeLabel,
  type NewsColumn,
  type NewsSource,
  type NewsType,
} from '@/modules/reading/domain/news-metadata'
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
} from '@/modules/reading/domain/reading-filters'

export type ReadingCenterItem = {
  id: string
  title: string
  shortTitle: string
  hasAuthenticTitle: boolean
  kind: ReadingMaterialKind
  year: string
  publishedDate: string
  sourceLabel: string
  chapterCount: number
  questionCount: number
  order: number
  newsSource: NewsSource
  newsType: NewsType
  newsSection: string
  newsColumn: NewsColumn
  newsEdition: string
  newsTopic: string
  examLevel: string
  examPaper: string
  examPaperName: string
  paperOrder: number
}

const PAGE_SIZE = 18
const EXAM_PAPERS_PER_PAGE = 3
const GROUPS: Array<{
  kind: ReadingCenterItem['kind']
  label: string
}> = [
  { kind: 'news', label: '新闻' },
  { kind: 'exam', label: '真题文章' },
  { kind: 'article', label: '独立文章' },
  { kind: 'ebook', label: '电子书' },
]

const SELECT_CLASS = 'h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200'

export default function ReadingCenterClient({
  items,
  frequencyMaterialCount,
  initialFilters,
}: {
  items: ReadingCenterItem[]
  frequencyMaterialCount: number
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
    examLevel,
    examPaper,
    page,
  } = filters
  const deferredQuery = useDeferredValue(query)

  const years = useMemo(
    () =>
      Array.from(new Set(
        items
          .filter(item =>
            (kind === 'all' || item.kind === kind) &&
            (kind !== 'exam' || examLevel === 'all' || item.examLevel === examLevel),
          )
          .map(item => item.year)
          .filter(Boolean),
      )).sort(
        (left, right) => right.localeCompare(left, 'zh-CN', { numeric: true }),
      ),
    [examLevel, items, kind],
  )
  const counts = useMemo(
    () => Object.fromEntries(
      GROUPS.map(group => [group.kind, items.filter(item => item.kind === group.kind).length]),
    ) as Record<ReadingMaterialKind, number>,
    [items],
  )
  const examFilterOptions = useMemo(() => {
    const examItems = items.filter(item => item.kind === 'exam')
    const levels = Array.from(new Set(examItems.map(item => item.examLevel).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }))
    const papers = Array.from(new Map(
      examItems
        .filter(item =>
          (examLevel === 'all' || item.examLevel === examLevel) &&
          (year === 'all' || item.year === year),
        )
        .map(item => [item.examPaper, { id: item.examPaper, name: item.examPaperName }]),
    ).values()).sort((left, right) =>
      right.name.localeCompare(left.name, 'zh-CN', { numeric: true }),
    )
    return { levels, papers }
  }, [examLevel, items, year])
  const newsFilterOptions = useMemo(() => {
    const options = buildFacetedNewsOptions(items, filters)
    options.newsSection.sort((a, b) => a.localeCompare(b, 'ja'))
    options.newsTopic.sort((a, b) => a.localeCompare(b, 'ja'))
    return options
  }, [filters, items])
  const filteredItems = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase()
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
        if (examLevel !== 'all' && item.examLevel !== examLevel) return false
        if (examPaper !== 'all' && item.examPaper !== examPaper) return false
        if (
          keyword &&
          !`${item.title} ${item.shortTitle} ${item.sourceLabel} ${item.newsSource} ${item.newsType} ${item.newsSection} ${item.newsColumn} ${item.newsTopic} ${item.examPaperName} ${item.examLevel}`
            .toLowerCase()
            .includes(keyword)
        ) return false
        return true
      })
      .sort((left, right) => {
        if (sort === 'title') return left.title.localeCompare(right.title, 'ja')
        if (left.kind === 'exam' && right.kind === 'exam') {
          const paperOrder = right.examPaperName.localeCompare(left.examPaperName, 'zh-CN', { numeric: true })
          const withinPaperOrder = left.paperOrder - right.paperOrder
          const examOrder = paperOrder || withinPaperOrder
          return sort === 'oldest' ? -paperOrder || withinPaperOrder : examOrder
        }
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
  }, [deferredQuery, examLevel, examPaper, items, kind, newsColumn, newsEdition, newsSection, newsSource, newsTopic, newsType, sort, year])
  const examPaperGroups = Array.from(
    filteredItems.reduce<Map<string, ReadingCenterItem[]>>((groups, item) => {
      const group = groups.get(item.examPaper) || []
      group.push(item)
      groups.set(item.examPaper, group)
      return groups
    }, new Map()).values(),
  )
  const totalPages = Math.max(1, Math.ceil(
    kind === 'exam'
      ? examPaperGroups.length / EXAM_PAPERS_PER_PAGE
      : filteredItems.length / PAGE_SIZE,
  ))
  const normalizedPage = Math.min(page, totalPages)
  const visibleItems = kind === 'exam'
    ? examPaperGroups
        .slice(
          (normalizedPage - 1) * EXAM_PAPERS_PER_PAGE,
          normalizedPage * EXAM_PAPERS_PER_PAGE,
        )
        .flat()
    : filteredItems.slice(
        (normalizedPage - 1) * PAGE_SIZE,
        normalizedPage * PAGE_SIZE,
      )
  const visibleGroups = kind === 'exam'
    ? Array.from(new Map(
        visibleItems.map(item => [item.examPaper, {
          key: item.examPaper,
          kind: item.kind,
          label: item.examPaperName,
          items: visibleItems.filter(candidate => candidate.examPaper === item.examPaper),
        }]),
      ).values())
    : kind === 'news'
      ? Array.from(new Map(
          visibleItems.map(item => {
            const section = item.newsColumn || item.newsSection || getNewsTypeLabel(item.newsType) || '新闻'
            const label = [item.newsSource || '报纸', section].filter(Boolean).join(' · ')
            const key = `${item.newsSource}:${section}`
            return [key, {
              key,
              kind: item.kind,
              label,
              items: visibleItems.filter(candidate => {
                const candidateSection = candidate.newsColumn || candidate.newsSection || getNewsTypeLabel(candidate.newsType) || '新闻'
                return candidate.newsSource === item.newsSource && candidateSection === section
              }),
            }]
          }),
        ).values())
    : GROUPS.map(group => ({
        key: group.kind,
        ...group,
        items: visibleItems.filter(item => item.kind === group.kind),
      })).filter(group => group.items.length > 0)
  const hasActiveFilters = Object.entries(filters).some(([key, value]) =>
    key !== 'page' &&
    key !== 'kind' &&
    value !== DEFAULT_READING_FILTERS[key as keyof ReadingFilterState],
  )

  const updateFilter = (
    key: keyof ReadingFilterState,
    value: string | number,
  ) => setFilters(current => changeReadingFilter(items, current, key, value))

  const resetFilters = () => {
    setFilters({ ...DEFAULT_READING_FILTERS, kind })
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
    <div className='min-h-screen bg-[#f6f5f1] pb-20 font-sans text-slate-900'>
      <h1 className='sr-only'>阅读材料</h1>

      <div className='mx-auto max-w-7xl px-4 md:px-8'>
        <div className='flex items-stretch gap-4 border-b border-slate-200'>
          <nav aria-label='阅读材料类型' className='flex min-w-0 flex-1 gap-6 overflow-x-auto'>
            {[
              { kind: 'all' as const, label: '全部材料', count: items.length },
              ...GROUPS
                .map(group => ({ ...group, count: counts[group.kind] }))
                .filter(group => group.count > 0 || kind === group.kind),
            ].map(option => (
              <button
                key={option.kind}
                type='button'
                aria-pressed={kind === option.kind}
                onClick={() => updateFilter('kind', option.kind as ReadingMaterialFilter)}
                className={`relative flex shrink-0 items-center gap-2 px-0 py-4 text-sm font-semibold transition-colors after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:origin-center after:scale-x-0 after:bg-slate-950 after:transition-transform focus:outline-none focus-visible:text-slate-950 focus-visible:after:scale-x-100 ${
                  kind === option.kind
                    ? 'text-slate-950 after:scale-x-100'
                    : 'text-slate-400 hover:text-slate-700'
                }`}>
                <span>{option.label}</span>
                <span className='text-[11px] font-medium tabular-nums text-slate-400'>{option.count}</span>
              </button>
            ))}
          </nav>
          <div className='flex shrink-0 items-center'>
            <WordFrequencyDialog materialCount={frequencyMaterialCount} />
          </div>
        </div>

        <section aria-label='筛选阅读材料' className='border-b border-slate-200 py-4'>
          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
            <input
              type='search'
              value={query}
              onChange={event => updateFilter('query', event.currentTarget.value)}
              placeholder={kind === 'exam' ? '搜索试卷、文章或等级' : '搜索标题或来源'}
              aria-label='搜索阅读材料'
              className={`${SELECT_CLASS} bg-transparent font-medium placeholder:font-normal placeholder:text-slate-400 lg:col-span-2`}
            />
            <CustomSelect value={year} onChange={event => updateFilter('year', event.currentTarget.value)} aria-label='筛选年份' className={SELECT_CLASS}>
              <option value='all'>全部年份</option>
              {years.map(item => <option key={item} value={item}>{item} 年</option>)}
            </CustomSelect>
            <CustomSelect value={sort} onChange={event => updateFilter('sort', event.currentTarget.value as ReadingSortMode)} aria-label='排序方式' className={SELECT_CLASS}>
              <option value='newest'>{kind === 'exam' ? '最新试卷优先' : '最新材料优先'}</option>
              <option value='oldest'>{kind === 'exam' ? '最早试卷优先' : '最早材料优先'}</option>
              <option value='title'>按标题排序</option>
            </CustomSelect>
          </div>

          {kind === 'exam' ? (
            <div className='mt-2 grid gap-2 sm:grid-cols-2'>
              {examFilterOptions.levels.length > 0 ? (
                <CustomSelect value={examLevel} onChange={event => updateFilter('examLevel', event.currentTarget.value)} aria-label='筛选等级' className={SELECT_CLASS}>
                  <option value='all'>全部等级</option>
                  {examFilterOptions.levels.map(item => <option key={item} value={item}>{item}</option>)}
                </CustomSelect>
              ) : null}
              <CustomSelect value={examPaper} onChange={event => updateFilter('examPaper', event.currentTarget.value)} aria-label='筛选试卷' className={SELECT_CLASS}>
                <option value='all'>全部试卷</option>
                {examFilterOptions.papers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </CustomSelect>
            </div>
          ) : null}

          {kind === 'news' ? (
            <div className='mt-2 grid gap-2 sm:grid-cols-3'>
              <CustomSelect value={newsSource} onChange={event => updateFilter('newsSource', event.currentTarget.value)} aria-label='筛选新闻来源' className={SELECT_CLASS}>
                <option value='all'>全部来源</option>
                {newsFilterOptions.newsSource.map(item => <option key={item} value={item}>{item}</option>)}
              </CustomSelect>
              <CustomSelect value={newsColumn} onChange={event => updateFilter('newsColumn', event.currentTarget.value)} aria-label='筛选新闻栏目' className={SELECT_CLASS}>
                <option value='all'>全部栏目</option>
                {newsFilterOptions.newsColumn.map(item => <option key={item} value={item}>{item}</option>)}
              </CustomSelect>
              <CustomSelect value={newsSection} onChange={event => updateFilter('newsSection', event.currentTarget.value)} aria-label='筛选新闻版面' className={SELECT_CLASS}>
                <option value='all'>全部版面</option>
                {newsFilterOptions.newsSection.map(item => <option key={item} value={item}>{item}</option>)}
              </CustomSelect>
            </div>
          ) : null}

          {hasActiveFilters ? (
            <div className='mt-3 flex justify-end'>
              <button type='button' onClick={resetFilters} className='text-xs font-semibold text-slate-500 transition hover:text-slate-950'>清空筛选</button>
            </div>
          ) : null}
        </section>

        <main className='min-w-0 pt-5'>
          {visibleGroups.length === 0 ? (
            <section className='ui-empty'>
              <p className='text-sm font-bold text-slate-800'>没有找到匹配的阅读材料</p>
              <p className='mt-1'>尝试缩短关键词，或者清空当前筛选。</p>
              <button type='button' onClick={resetFilters} className='ui-btn ui-btn-primary mt-5'>清空筛选</button>
            </section>
          ) : (
            <div className='space-y-8'>
              {visibleGroups.map(group => (
                <section key={group.key}>
                  <div className='flex items-center justify-between gap-4 border-b border-slate-300 py-3'>
                    <h2 className='text-sm font-semibold text-slate-950'>{group.label}</h2>
                    <span className='text-xs font-medium text-slate-500'>{group.items.length} 篇</span>
                  </div>
                  <div className='divide-y divide-slate-200'>
                    {group.items.map((item, itemIndex) => {
                      const ebook = item.kind === 'ebook'
                      const exam = item.kind === 'exam'
                      const href = ebook
                        ? `/reading/ebooks/${encodeURIComponent(item.id)}`
                        : `/reading/articles/${encodeURIComponent(item.id)}`
                      const displayTitle = item.hasAuthenticTitle
                        ? item.shortTitle
                        : exam
                          ? `阅读文章 ${String(itemIndex + 1).padStart(2, '0')}`
                          : '未命名文章'
                      return (
                        <article key={item.id} className='flex items-center gap-3 transition hover:bg-white/60'>
                          <Link href={href} prefetch={false} className='group grid min-w-0 flex-1 grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-4 py-3.5'>
                            <span className='truncate text-xs tabular-nums text-slate-400'>
                              {item.kind === 'news'
                                ? item.publishedDate
                                : exam
                                  ? kind === 'exam' ? String(itemIndex + 1).padStart(2, '0') : item.examPaperName
                                  : ebook ? '电子书' : item.year || '文章'}
                            </span>
                            <h3 className='truncate text-sm font-medium text-slate-800 transition group-hover:text-slate-950'>{displayTitle}</h3>
                            <span className='flex items-center gap-3 text-xs text-slate-400'>
                              <span className='hidden max-w-40 truncate sm:block'>
                                {item.kind === 'news'
                                  ? item.newsTopic || getNewsTypeLabel(item.newsType)
                                  : exam
                                    ? `${item.questionCount} 题`
                                    : ebook
                                      ? `${Math.max(1, item.chapterCount)} 章`
                                      : item.sourceLabel}
                              </span>
                              <span aria-hidden='true' className='transition group-hover:translate-x-0.5 group-hover:text-slate-800'>→</span>
                            </span>
                          </Link>
                          {ebook ? (
                            <div className='shrink-0'>
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
            <nav aria-label='阅读材料分页' className='mt-9 flex items-center justify-center gap-1'>
              <button
                type='button'
                aria-label='上一页'
                disabled={normalizedPage <= 1}
                onClick={() => setFilters(current => ({ ...current, page: Math.max(1, current.page - 1) }))}
                className='inline-flex size-7 items-center justify-center rounded-md text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40'>‹</button>
              <span className='ui-meta px-2 tabular-nums'>{normalizedPage} / {totalPages}</span>
              <button
                type='button'
                aria-label='下一页'
                disabled={normalizedPage >= totalPages}
                onClick={() => setFilters(current => ({ ...current, page: Math.min(totalPages, current.page + 1) }))}
                className='inline-flex size-7 items-center justify-center rounded-md text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40'>›</button>
            </nav>
          ) : null}
        </main>
      </div>
    </div>
  )
}
