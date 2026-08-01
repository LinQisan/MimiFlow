'use client'

// Practice library client.

import { useMemo, useState } from 'react'
import Link from 'next/link'

import type { ExamHubLevelSummary } from '@/lib/repositories/exam'
import CustomSelect from '@/components/ui/CustomSelect'

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
    () => levels.flatMap(level => level.papers),
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
    const groups = new Map<
      string,
      {
        language: string
        level: string
        papers: ExamHubLevelSummary['papers']
      }
    >()
    for (const paper of papers) {
      const language = getLanguageLabel(paper.language)
      const level = getLevelLabel(paper.level)
      const key = `${language}\u0000${level}`
      const group = groups.get(key) || { language, level, papers: [] }
      group.papers.push(paper)
      groups.set(key, group)
    }
    return Array.from(groups.values()).sort(
      (a, b) =>
        a.language.localeCompare(b.language, 'zh-CN') ||
        a.level.localeCompare(b.level, 'zh-CN'),
    )
  }

  return (
    <div className='min-h-screen bg-slate-50 pb-12 font-sans text-slate-900'>
      <div>
        <div className='mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-7'>
          <div className='flex items-center justify-between gap-4'>
            <div className='min-w-0'>
              <h1 className='text-3xl font-black tracking-tight text-slate-950'>
                试卷库
              </h1>
            </div>
            <div className='flex shrink-0 flex-wrap gap-2'>
              <Link href='/practice/custom' className='ui-btn'>
                自定义抽题
              </Link>
            </div>
          </div>

          <div className='mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-200 pt-3 text-xs text-slate-500 md:text-sm'>
            <span>{totalPaperCount} 套试卷</span>
            <span>{totalQuestionCount} 题</span>
            <span>{totalAttemptCount} 次练习</span>
            {averageAccuracy !== null ? <span>平均正确率 {averageAccuracy}%</span> : null}
          </div>
        </div>
      </div>

      <div className='mx-auto max-w-6xl px-4 md:px-6'>
        <main className='space-y-5'>
          <section className='border-y border-slate-200 py-5'>
            <div className='grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_auto] lg:items-end'>
              <div className='col-span-2 lg:col-span-1'>
                <label className='mb-1 block text-xs font-bold text-slate-600'>
                  搜索
                </label>
                <input
                  value={query}
                  onChange={event => setQuery(event.currentTarget.value)}
                  placeholder='试卷名、描述、语言或等级'
                  className='h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
                />
              </div>
              <div>
                <label className='mb-1 block text-xs font-bold text-slate-600'>
                  语言
                </label>
                <CustomSelect
                  value={languageFilter}
                  onChange={event => setLanguageFilter(event.currentTarget.value)}
                  className='h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
                  <option value='all'>全部语言</option>
                  {languageOptions.map(language => (
                    <option key={`language-${language}`} value={language}>
                      {language}
                    </option>
                  ))}
                </CustomSelect>
              </div>
              <div>
                <label className='mb-1 block text-xs font-bold text-slate-600'>
                  等级
                </label>
                <CustomSelect
                  value={levelFilter}
                  onChange={event => setLevelFilter(event.currentTarget.value)}
                  className='h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
                  <option value='all'>全部等级</option>
                  {levelOptions.map(level => (
                    <option key={`level-${level}`} value={level}>
                      {level}
                    </option>
                  ))}
                </CustomSelect>
              </div>
              {hasActiveFilter ? (
                <button
                  type='button'
                  onClick={resetFilters}
                  className='col-span-2 h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 lg:col-span-1'>
                  清空筛选
                </button>
              ) : null}
            </div>
            {hasActiveFilter ? (
              <p className='mt-3 text-xs font-bold text-slate-500'>
                找到 {filteredPaperCount} 套试卷
              </p>
            ) : null}
            {filteredLevels.length > 1 ? (
              <nav aria-label='试卷分组' className='mt-3 flex flex-wrap gap-2'>
                {filteredLevels.map(level => (
                  <a key={level.id} href={`#paper-level-${level.id}`} className='ui-tag'>
                    {level.title} {level.papers.length}
                  </a>
                ))}
              </nav>
            ) : null}
          </section>

          {filteredLevels.length === 0 ? (
            <section className='border border-dashed border-slate-300 bg-white p-8 text-center'>
              <p className='text-base font-black text-slate-900'>
                没有找到匹配的试卷
              </p>
              <button
                type='button'
                onClick={resetFilters}
                className='ui-btn ui-btn-primary mt-4'>
                清空筛选
              </button>
            </section>
          ) : (
            filteredLevels.map(level => (
              <section
                key={level.id}
                id={`paper-level-${level.id}`}
                className={`scroll-mt-6 ${
                  filteredLevels.length > 1
                    ? 'border border-slate-200 bg-white'
                    : ''
                }`}>
                {filteredLevels.length > 1 ? (
                  <div className='flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-4'>
                    <h2 className='text-lg font-black text-slate-950'>{level.title}</h2>
                    <span className='text-sm font-semibold text-slate-500'>
                      {level.papers.length} 套 · {level.papers.reduce((sum, paper) => sum + paper.questionCount, 0)} 题
                    </span>
                  </div>
                ) : null}

                <div className={filteredLevels.length > 1 ? 'space-y-6 p-4' : 'space-y-6'}>
                  {groupByLanguageAndLevel(level.papers).map(
                    group => (
                      <section key={`${level.id}-${group.language}-${group.level}`} className='space-y-2.5'>
                        <div className='flex items-center justify-between gap-3 border-b border-slate-200 pb-2'>
                          <h3 className='text-sm font-black text-slate-800'>
                            {group.language} · {group.level}
                          </h3>
                          <span className='text-xs font-semibold text-slate-500'>
                            {group.papers.length} 套
                          </span>
                        </div>
                        <div className='grid grid-cols-1 gap-2.5 lg:grid-cols-2'>
                                {group.papers.map(paper => (
                                  <article
                                    key={paper.id}
                                    className='rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-400'>
                                    <div className='flex items-start justify-between gap-3'>
                                      <div className='min-w-0'>
                                        <h3 className='line-clamp-2 text-base font-black leading-6 text-slate-950 md:text-lg'>
                                          {paper.name}
                                        </h3>
                                      </div>
                                      <span className='shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600'>
                                        {paper.questionCount} 题
                                      </span>
                                    </div>

                                    <p className='mt-2.5 text-xs font-semibold leading-5 text-slate-500'>
                                      更新 {formatDate(paper.updatedAt)} · {paper.moduleCount} 个模块 · {paper.attemptCount} 次练习 · 正确率 {paper.attemptAccuracyPct !== null ? `${paper.attemptAccuracyPct}%` : '--'}
                                    </p>
                                    <p className='mt-0.5 text-xs leading-5 text-slate-500'>
                                      阅读 {paper.passageCount} · 听力 {paper.lessonCount} · 语法 {paper.quizQuestionCount}
                                    </p>

                                    <div className='mt-3.5 flex flex-wrap gap-2'>
                                      <Link
                                        href={`/practice/${encodeURIComponent(paper.id)}/do`}
                                        className='ui-btn ui-btn-sm ui-btn-primary'>
                                        开始答题
                                      </Link>
                                      <Link
                                        href={`/practice/${encodeURIComponent(paper.id)}`}
                                        className='ui-btn ui-btn-sm'>
                                        详情
                                      </Link>
                                    </div>
                                  </article>
                                ))}
                        </div>
                      </section>
                    ),
                  )}
                </div>
              </section>
            ))
          )}
        </main>

      </div>
    </div>
  )
}
