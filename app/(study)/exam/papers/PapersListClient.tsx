'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import type { ExamHubLevelSummary } from '@/lib/repositories/exam'

type Props = {
  levels: ExamHubLevelSummary[]
  totalPaperCount: number
}

export default function PapersListClient({ levels, totalPaperCount }: Props) {
  const [query, setQuery] = useState('')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')

  const getLanguageLabel = (value: string | null) => (value || '未设置').trim()
  const getLevelLabel = (value: string | null) => (value || '未设置').trim()
  const allPapers = useMemo(
    () => levels.flatMap(level => level.papers.map(paper => ({ ...paper, groupTitle: level.title }))),
    [levels],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const languageOptions = useMemo(
    () =>
      Array.from(new Set(allPapers.map(paper => getLanguageLabel(paper.language)))).sort(
        (a, b) => a.localeCompare(b, 'zh-CN'),
      ),
    [allPapers],
  )
  const levelOptions = useMemo(
    () =>
      Array.from(new Set(allPapers.map(paper => getLevelLabel(paper.level)))).sort(
        (a, b) => a.localeCompare(b, 'zh-CN'),
      ),
    [allPapers],
  )
  const filteredLevels = useMemo(
    () =>
      levels
        .map(level => ({
          ...level,
          papers: level.papers.filter(paper => {
            if (
              languageFilter !== 'all' &&
              getLanguageLabel(paper.language) !== languageFilter
            ) {
              return false
            }
            if (
              levelFilter !== 'all' &&
              getLevelLabel(paper.level) !== levelFilter
            ) {
              return false
            }
            if (!normalizedQuery) return true

            const searchable = [
              paper.name,
              paper.description || '',
              paper.language || '',
              paper.level || '',
              level.title,
            ]
              .join(' ')
              .toLowerCase()
            return searchable.includes(normalizedQuery)
          }),
        }))
        .filter(level => level.papers.length > 0),
    [languageFilter, levelFilter, levels, normalizedQuery],
  )
  const filteredPaperCount = filteredLevels.reduce(
    (sum, level) => sum + level.papers.length,
    0,
  )
  const totalQuestionCount = allPapers.reduce(
    (sum, paper) => sum + paper.questionCount,
    0,
  )
  const totalAttemptCount = allPapers.reduce(
    (sum, paper) => sum + paper.attemptCount,
    0,
  )
  const papersWithAccuracy = allPapers.filter(
    paper => paper.attemptAccuracyPct !== null,
  )
  const averageAccuracy =
    papersWithAccuracy.length > 0
      ? Math.round(
          papersWithAccuracy.reduce(
            (sum, paper) => sum + (paper.attemptAccuracyPct || 0),
            0,
          ) / papersWithAccuracy.length,
        )
      : null
  const recentPapers = useMemo(
    () =>
      [...allPapers]
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5),
    [allPapers],
  )
  const hasActiveFilter =
    normalizedQuery || languageFilter !== 'all' || levelFilter !== 'all'

  const formatDate = (value: string | Date) =>
    new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value))

  const resetFilters = () => {
    setQuery('')
    setLanguageFilter('all')
    setLevelFilter('all')
  }

  const groupByLanguageAndLevel = (papers: ExamHubLevelSummary['papers']) => {
    const languageMap = new Map<
      string,
      Map<string, ExamHubLevelSummary['papers']>
    >()
    for (const paper of papers) {
      const language = getLanguageLabel(paper.language)
      const level = getLevelLabel(paper.level)
      if (!languageMap.has(language)) {
        languageMap.set(language, new Map())
      }
      const levelMap = languageMap.get(language)!
      const bucket = levelMap.get(level) || []
      bucket.push(paper)
      levelMap.set(level, bucket)
    }
    return Array.from(languageMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], 'zh-CN'),
    )
  }

  return (
    <div className='min-h-screen bg-[#f7f8fb] pb-12 font-sans text-slate-900'>
      <div className='border-b border-slate-200 bg-white'>
        <div className='mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8'>
          <div className='flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between'>
            <div className='max-w-3xl'>
              <p className='text-xs font-black uppercase tracking-[0.22em] text-indigo-700'>
                Exam Papers
              </p>
              <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl'>
                试卷库
              </h1>
              <p className='mt-3 text-sm leading-6 text-slate-600'>
                按集合、语言和等级浏览试卷。你可以直接开始答题，也可以用自定义抽题快速组合一轮练习。
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Link href='/exam' className='ui-btn'>
                训练中心
              </Link>
              <Link href='/exam/papers/custom' className='ui-btn'>
                自定义抽题
              </Link>
              <Link href='/papers/manage' className='ui-btn ui-btn-primary'>
                管理试卷
              </Link>
            </div>
          </div>

          <div className='mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <div className='rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3'>
              <p className='text-xs font-bold text-slate-500'>试卷总数</p>
              <p className='mt-1 text-2xl font-black text-slate-950'>
                {totalPaperCount}
              </p>
            </div>
            <div className='rounded-lg border border-slate-200 bg-slate-50 px-4 py-3'>
              <p className='text-xs font-bold text-slate-500'>总题量</p>
              <p className='mt-1 text-2xl font-black text-slate-950'>
                {totalQuestionCount}
              </p>
            </div>
            <div className='rounded-lg border border-teal-200 bg-teal-50 px-4 py-3'>
              <p className='text-xs font-bold text-slate-500'>练习次数</p>
              <p className='mt-1 text-2xl font-black text-slate-950'>
                {totalAttemptCount}
              </p>
            </div>
            <div className='rounded-lg border border-amber-200 bg-amber-50 px-4 py-3'>
              <p className='text-xs font-bold text-slate-500'>平均正确率</p>
              <p className='mt-1 text-2xl font-black text-slate-950'>
                {averageAccuracy !== null ? `${averageAccuracy}%` : '--'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className='mx-auto grid max-w-7xl gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8'>
        <main className='space-y-5'>
          <section className='border border-slate-200 bg-white p-4'>
            <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] lg:items-end'>
              <div>
                <label className='mb-1.5 block text-xs font-black text-slate-600'>
                  搜索试卷
                </label>
                <input
                  value={query}
                  onChange={event => setQuery(event.currentTarget.value)}
                  placeholder='输入试卷名、描述、语言或等级'
                  className='h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
                />
              </div>
              <div>
                <label className='mb-1.5 block text-xs font-black text-slate-600'>
                  语言
                </label>
                <select
                  value={languageFilter}
                  onChange={event => setLanguageFilter(event.currentTarget.value)}
                  className='h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'>
                  <option value='all'>全部语言</option>
                  {languageOptions.map(language => (
                    <option key={`language-${language}`} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className='mb-1.5 block text-xs font-black text-slate-600'>
                  等级
                </label>
                <select
                  value={levelFilter}
                  onChange={event => setLevelFilter(event.currentTarget.value)}
                  className='h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'>
                  <option value='all'>全部等级</option>
                  {levelOptions.map(level => (
                    <option key={`level-${level}`} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type='button'
                onClick={resetFilters}
                disabled={!hasActiveFilter}
                className='h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'>
                清空
              </button>
            </div>
            <p className='mt-3 text-xs font-bold text-slate-500'>
              当前显示 {filteredPaperCount} / {totalPaperCount} 套试卷
            </p>
          </section>

          {filteredLevels.length === 0 ? (
            <section className='border border-dashed border-slate-300 bg-white p-10 text-center'>
              <p className='text-base font-black text-slate-900'>
                没有找到匹配的试卷
              </p>
              <p className='mt-2 text-sm text-slate-500'>
                换个关键词，或者清空筛选后再看一次。
              </p>
              <button
                type='button'
                onClick={resetFilters}
                className='ui-btn ui-btn-primary mt-5'>
                清空筛选
              </button>
            </section>
          ) : (
            filteredLevels.map(level => (
              <section
                key={level.id}
                id={`paper-level-${level.id}`}
                className='scroll-mt-6 border border-slate-200 bg-white'>
                <div className='flex flex-col gap-2 border-b border-slate-200 px-4 py-4 md:flex-row md:items-end md:justify-between'>
                  <div>
                    <h2 className='text-xl font-black text-slate-950'>
                      {level.title}
                    </h2>
                    <p className='mt-1 text-sm text-slate-500'>
                      {level.papers.length} 套试卷，按语言和等级归档。
                    </p>
                  </div>
                  <span className='text-sm font-bold text-indigo-700'>
                    {level.papers.reduce((sum, paper) => sum + paper.questionCount, 0)} 题
                  </span>
                </div>

                <div className='space-y-6 p-4'>
                  {groupByLanguageAndLevel(level.papers).map(
                    ([language, levelMap]) => (
                      <section key={`${level.id}-${language}`} className='space-y-3'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <h3 className='text-sm font-black text-slate-800'>
                            {language}
                          </h3>
                          <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-500'>
                            {Array.from(levelMap.values()).reduce(
                              (sum, papers) => sum + papers.length,
                              0,
                            )}{' '}
                            套
                          </span>
                        </div>

                        {Array.from(levelMap.entries())
                          .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
                          .map(([paperLevel, papers]) => (
                            <div
                              key={`${level.id}-${language}-${paperLevel}`}
                              className='space-y-3'>
                              <div className='flex items-center justify-between gap-2'>
                                <p className='text-xs font-black uppercase text-slate-500'>
                                  {paperLevel}
                                </p>
                                <span className='text-xs font-bold text-slate-400'>
                                  {papers.length} 套
                                </span>
                              </div>
                              <div className='grid grid-cols-1 gap-3 xl:grid-cols-2'>
                                {papers.map(paper => (
                                  <article
                                    key={paper.id}
                                    className='rounded-lg border border-slate-200 bg-white p-4 transition hover:border-indigo-300 hover:bg-indigo-50/30'>
                                    <div className='flex items-start justify-between gap-3'>
                                      <div className='min-w-0'>
                                        <h3 className='line-clamp-2 text-lg font-black leading-snug text-slate-950'>
                                          {paper.name}
                                        </h3>
                                        <p className='mt-1 text-xs font-semibold text-slate-500'>
                                          更新 {formatDate(paper.updatedAt)}
                                        </p>
                                      </div>
                                      <span className='shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-black text-slate-600'>
                                        {paper.questionCount} 题
                                      </span>
                                    </div>

                                    <div className='mt-3 grid grid-cols-3 gap-2 text-center'>
                                      <div className='rounded-md bg-slate-50 px-2 py-2'>
                                        <p className='text-[11px] font-bold text-slate-500'>
                                          模块
                                        </p>
                                        <p className='mt-1 text-sm font-black text-slate-900'>
                                          {paper.moduleCount}
                                        </p>
                                      </div>
                                      <div className='rounded-md bg-slate-50 px-2 py-2'>
                                        <p className='text-[11px] font-bold text-slate-500'>
                                          做题
                                        </p>
                                        <p className='mt-1 text-sm font-black text-slate-900'>
                                          {paper.attemptCount}
                                        </p>
                                      </div>
                                      <div className='rounded-md bg-slate-50 px-2 py-2'>
                                        <p className='text-[11px] font-bold text-slate-500'>
                                          正确率
                                        </p>
                                        <p className='mt-1 text-sm font-black text-slate-900'>
                                          {paper.attemptAccuracyPct !== null
                                            ? `${paper.attemptAccuracyPct}%`
                                            : '--'}
                                        </p>
                                      </div>
                                    </div>

                                    <div className='mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-600'>
                                      <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1'>
                                        阅读 {paper.passageCount}
                                      </span>
                                      <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1'>
                                        听力 {paper.lessonCount}
                                      </span>
                                      <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1'>
                                        语法 {paper.quizQuestionCount}
                                      </span>
                                    </div>

                                    {paper.description ? (
                                      <p className='mt-3 line-clamp-2 text-sm leading-6 text-slate-600'>
                                        {paper.description}
                                      </p>
                                    ) : null}

                                    <div className='mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4'>
                                      <Link
                                        href={`/exam/papers/${encodeURIComponent(paper.id)}/do`}
                                        className='ui-btn ui-btn-sm ui-btn-primary'>
                                        开始答题
                                      </Link>
                                      <Link
                                        href={`/exam/papers/${encodeURIComponent(paper.id)}`}
                                        className='ui-btn ui-btn-sm'>
                                        详情
                                      </Link>
                                    </div>
                                  </article>
                                ))}
                              </div>
                            </div>
                          ))}
                      </section>
                    ),
                  )}
                </div>
              </section>
            ))
          )}
        </main>

        <aside className='space-y-5 lg:sticky lg:top-5 lg:self-start'>
          <section className='border border-slate-200 bg-white p-4'>
            <h2 className='text-base font-black text-slate-950'>快速定位</h2>
            <div className='mt-3 space-y-2'>
              {levels.map(level => (
                <a
                  key={`nav-${level.id}`}
                  href={`#paper-level-${level.id}`}
                  className='flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50'>
                  <span className='truncate'>{level.title}</span>
                  <span className='ml-2 shrink-0 text-xs text-slate-400'>
                    {level.papers.length}
                  </span>
                </a>
              ))}
            </div>
          </section>

          <section className='border border-slate-200 bg-white p-4'>
            <h2 className='text-base font-black text-slate-950'>最近更新</h2>
            <div className='mt-3 divide-y divide-slate-100'>
              {recentPapers.map(paper => (
                <Link
                  key={`recent-${paper.id}`}
                  href={`/exam/papers/${encodeURIComponent(paper.id)}`}
                  className='block py-3 transition hover:bg-slate-50'>
                  <p className='line-clamp-2 text-sm font-bold text-slate-950'>
                    {paper.name}
                  </p>
                  <p className='mt-1 text-xs text-slate-500'>
                    {paper.groupTitle} · {formatDate(paper.updatedAt)}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section className='border border-slate-200 bg-white p-4'>
            <h2 className='text-base font-black text-slate-950'>练习建议</h2>
            <div className='mt-3 space-y-3 text-sm leading-6 text-slate-600'>
              <p>先用筛选找到当前等级，再从正确率低的试卷开始复盘。</p>
              <p>想混合阅读、听力和语法时，用自定义抽题会更快。</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
