'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import CustomSelect from '@/components/ui/CustomSelect'
import { formatNewsDate, getNewsEditionLabel } from '@/features/reading/domain/news-metadata'

type ReadingRow = {
  id: string
  title: string
  description: string
  author: string
  sourceKind: string
  publishedDate: string
  edition: string
  newsSeries: string
  pageNumber: string
  kind: 'article' | 'ebook'
  chapterCount: number
  questionCount: number
  paper: {
    id: string
    name: string
    level: string | null
    collectionType: string
  } | null
}

type ReadingFilters = {
  query: string
  status: string
  kind: string
  paper: string
  page: number
}

const PAGE_SIZE = 20

export default function ReadingListClient({
  rows,
  initialFilters,
}: {
  rows: ReadingRow[]
  initialFilters: ReadingFilters
}) {
  const [query, setQuery] = useState(initialFilters.query)
  const [status, setStatus] = useState(initialFilters.status)
  const [kind, setKind] = useState(initialFilters.kind)
  const [paper, setPaper] = useState(initialFilters.paper)
  const [page, setPage] = useState(initialFilters.page)

  const papers = useMemo(
    () =>
      Array.from(
        rows.reduce<Map<string, string>>((index, item) => {
          if (item.paper) index.set(item.paper.id, item.paper.name)
          return index
        }, new Map()),
      )
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')),
    [rows],
  )

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return rows.filter((item) => {
      if (
        keyword &&
        ![item.title, item.author, item.description, item.paper?.name || '']
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      ) {
        return false
      }
      if (kind !== 'all' && item.kind !== kind) return false
      if (
        status === 'missingQuestions' &&
        (item.kind === 'ebook' ||
          item.paper?.collectionType !== 'PAPER' ||
          item.questionCount > 0)
      ) {
        return false
      }
      if (
        status === 'hasQuestions' &&
        (item.kind === 'ebook' ||
          item.paper?.collectionType !== 'PAPER' ||
          item.questionCount === 0)
      ) {
        return false
      }
      if (paper === 'standalone' && item.paper) return false
      if (
        paper !== 'all' &&
        paper !== 'standalone' &&
        item.paper?.id !== paper
      ) {
        return false
      }
      return true
    })
  }, [kind, paper, query, rows, status])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const normalizedPage = Math.min(page, totalPages)
  const visibleRows = filteredRows.slice(
    (normalizedPage - 1) * PAGE_SIZE,
    normalizedPage * PAGE_SIZE,
  )
  const counts = useMemo(
    () => ({
      articles: rows.filter((item) => item.kind === 'article').length,
      ebooks: rows.filter((item) => item.kind === 'ebook').length,
      missingQuestions: rows.filter(
        (item) =>
          item.kind === 'article' &&
          item.paper?.collectionType === 'PAPER' &&
          item.questionCount === 0,
      ).length,
    }),
    [rows],
  )

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (status !== 'all') params.set('status', status)
    if (kind !== 'all') params.set('kind', kind)
    if (paper !== 'all') params.set('paper', paper)
    if (normalizedPage > 1) params.set('page', String(normalizedPage))
    return params.toString()
  }, [kind, normalizedPage, paper, query, status])

  useEffect(() => {
    const nextUrl = queryString
      ? `/manage/reading?${queryString}`
      : '/manage/reading'
    window.history.replaceState(null, '', nextUrl)
  }, [queryString])

  const resetFilters = () => {
    setQuery('')
    setStatus('all')
    setKind('all')
    setPaper('all')
    setPage(1)
  }

  const updateFilter = (update: () => void) => {
    update()
    setPage(1)
  }

  const returnTo = queryString
    ? `/manage/reading?${queryString}`
    : '/manage/reading'

  return (
    <main className="min-h-screen bg-[#f6f5f1] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 pt-6 md:pt-8">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) =>
                updateFilter(() => setQuery(event.target.value))
              }
              placeholder="搜索标题 / 作者 / 试卷"
              aria-label="搜索阅读材料"
              className="h-10 min-w-[16rem] flex-[1.5_1_20rem] rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
            <CustomSelect
              value={status}
              aria-label="题目状态"
              onChange={(event) =>
                updateFilter(() => setStatus(event.target.value))
              }
              className="h-10 min-w-[9rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none"
            >
              <option value="all">全部状态</option>
              <option value="missingQuestions">缺少题目</option>
              <option value="hasQuestions">已有题目</option>
            </CustomSelect>
            <CustomSelect
              value={kind}
              aria-label="材料类型"
              onChange={(event) =>
                updateFilter(() => setKind(event.target.value))
              }
              className="h-10 min-w-[9rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none"
            >
              <option value="all">全部类型</option>
              <option value="article">文章</option>
              <option value="ebook">电子书</option>
            </CustomSelect>
            <CustomSelect
              value={paper}
              aria-label="所属试卷"
              onChange={(event) =>
                updateFilter(() => setPaper(event.target.value))
              }
              className="h-10 min-w-[10rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none"
            >
              <option value="all">全部试卷</option>
              <option value="standalone">独立材料</option>
              {papers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </CustomSelect>
            <button
              type="button"
              onClick={resetFilters}
              className="ui-btn ui-btn-sm h-10 px-3 text-sm font-semibold"
            >
              重置筛选
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            文章 {counts.articles} 条 · 电子书 {counts.ebooks} 本 · 缺题{' '}
            {counts.missingQuestions} · 显示 {filteredRows.length}
          </p>
        </header>

        {totalPages > 1 ? (
          <div className="mb-3 flex items-center justify-end gap-2">
            <span className="text-xs text-slate-500">
              第 {normalizedPage}/{totalPages} 页
            </span>
            <button
              type="button"
              disabled={normalizedPage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="ui-btn ui-btn-sm disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={normalizedPage >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
              className="ui-btn ui-btn-sm disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        ) : null}

        {visibleRows.length === 0 ? (
          <p className="border-y border-slate-200 py-12 text-center text-sm text-slate-500">
            暂无符合条件的阅读材料
          </p>
        ) : (
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {visibleRows.map((item) => {
              const isEbook = item.kind === 'ebook'
              const needsQuestions =
                !isEbook &&
                item.paper?.collectionType === 'PAPER' &&
                item.questionCount === 0
              const statusText = isEbook
                ? `${item.chapterCount} 章`
                : needsQuestions
                  ? '缺少题目'
                  : item.paper?.collectionType === 'PAPER'
                    ? `${item.questionCount} 题`
                    : item.sourceKind === 'NEWS'
                      ? '新闻'
                      : '文章'
              const sourceTags =
                item.sourceKind === 'NEWS'
                  ? [
                      formatNewsDate(item.publishedDate),
                      item.newsSeries,
                      getNewsEditionLabel(item.edition),
                      item.pageNumber,
                    ].filter(Boolean)
                  : []
              return (
                <div
                  key={item.id}
                  className={`grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center ${
                    needsQuestions ? 'bg-rose-50/40' : ''
                  }`}
                >
                  <div className="min-w-0 md:pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        role="heading"
                        aria-level={2}
                        title={item.title}
                        className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 md:text-base"
                      >
                        {item.title}
                      </div>
                      {needsQuestions ? (
                        <span className="rounded border border-rose-100 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                          缺少题目
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {[
                        isEbook
                          ? '电子书'
                          : item.sourceKind === 'NEWS'
                            ? '新闻'
                            : '文章',
                        item.paper?.name,
                        item.author,
                        ...sourceTags,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      {' · '}
                      {statusText}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {!isEbook ? (
                      <Link
                        href={`/manage/reading/${item.id}?returnTo=${encodeURIComponent(returnTo)}`}
                        className={`ui-btn ui-btn-sm ${
                          needsQuestions ? 'ui-btn-primary' : ''
                        }`}
                      >
                        {needsQuestions ? '添加题目' : '编辑'}
                      </Link>
                    ) : null}
                    <Link
                      href={
                        isEbook
                          ? `/reading/ebooks/${item.id}`
                          : `/reading/articles/${item.id}`
                      }
                      className="ui-btn ui-btn-sm"
                    >
                      {isEbook ? '打开' : '预览'}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
