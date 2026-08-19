'use client'

import { useEffect, useMemo, useState } from 'react'

import type {
  PracticeVocabularyAnalytics,
  PracticeVocabularyWordInsight,
} from '@/features/practice/domain/vocabulary-analytics'

type View = 'overview' | 'coverage' | 'profiles' | 'trends'

const PAGE_SIZE = 50
const KATAKANA_PATTERN = /^[\p{Script=Katakana}ー]+$/u
const TWO_KANJI_PATTERN = /^\p{Script=Han}{2}$/u
const KANJI_WORD_PATTERN = /\p{Script=Han}/u

const Ranking = ({
  title,
  rows,
  value,
}: {
  title: string
  rows: PracticeVocabularyWordInsight[]
  value: (row: PracticeVocabularyWordInsight) => number
}) => (
  <section className='rounded-xl border border-slate-200 bg-white p-4'>
    <h3 className='text-sm font-bold text-slate-950'>{title}</h3>
    <div className='mt-3 divide-y divide-slate-100'>
      {rows.slice(0, 12).map((row, index) => (
        <div key={row.word} className='grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 py-2 text-sm'>
          <span className='text-xs tabular-nums text-slate-400'>{index + 1}</span>
          <span className='truncate font-semibold text-slate-800'>{row.word}</span>
          <span className='text-xs font-semibold tabular-nums text-slate-500'>{value(row)} 次</span>
        </div>
      ))}
    </div>
  </section>
)

export default function PracticeVocabularyAnalyticsDialog({
  analytics,
}: {
  analytics: PracticeVocabularyAnalytics
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState<View>('overview')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const optionWords = useMemo(
    () =>
      analytics.words
        .filter(row => row.optionCount > 0)
        .sort((left, right) => right.optionCount - left.optionCount),
    [analytics.words],
  )
  const katakanaWords = useMemo(
    () => analytics.words.filter(row => KATAKANA_PATTERN.test(row.word)),
    [analytics.words],
  )
  const compounds = useMemo(
    () => analytics.words.filter(row => TWO_KANJI_PATTERN.test(row.word)),
    [analytics.words],
  )
  const testedWords = useMemo(
    () =>
      analytics.words
        .filter(row => row.targetCount > 0 && KANJI_WORD_PATTERN.test(row.word))
        .sort(
          (left, right) =>
            right.targetCount - left.targetCount || right.count - left.count,
        ),
    [analytics.words],
  )
  const coverageRows = useMemo(() => {
    const keyword = query.normalize('NFKC').trim().toLowerCase()
    return analytics.words
      .filter(row =>
        keyword
          ? `${row.word} ${row.reading} ${row.partOfSpeech}`
              .toLowerCase()
              .includes(keyword)
          : row.paperCount > 0,
      )
      .sort(
        (left, right) =>
          right.coverageRate - left.coverageRate ||
          right.count - left.count ||
          left.word.localeCompare(right.word, 'ja'),
      )
  }, [analytics.words, query])
  const totalPages = Math.max(1, Math.ceil(coverageRows.length / PAGE_SIZE))
  const normalizedPage = Math.min(page, totalPages)
  const visibleCoverageRows = coverageRows.slice(
    (normalizedPage - 1) * PAGE_SIZE,
    normalizedPage * PAGE_SIZE,
  )
  const trendRows = useMemo(() => {
    const examples = ['AI', 'SNS', '環境']
    const byWord = new Map(analytics.words.map(row => [row.word, row]))
    const exampleRows = examples.map(
      word =>
        byWord.get(word) || {
          word,
          reading: '',
          partOfSpeech: '',
          count: 0,
          paperCount: 0,
          coverageRate: 0,
          optionCount: 0,
          targetCount: 0,
          categoryCounts: {
            TEXT_VOCAB: 0,
            GRAMMAR: 0,
            READING: 0,
            LISTENING: 0,
          },
          yearCounts: {},
        },
    )
    const leaders = analytics.words
      .filter(row =>
        analytics.years.some(year => (row.yearCounts[year] || 0) > 0),
      )
      .filter(row => !examples.includes(row.word))
      .sort((left, right) => {
        const leftLatest = left.yearCounts[analytics.years.at(-1) || ''] || 0
        const rightLatest = right.yearCounts[analytics.years.at(-1) || ''] || 0
        const leftTotal = analytics.years.reduce(
          (sum, year) => sum + (left.yearCounts[year] || 0),
          0,
        )
        const rightTotal = analytics.years.reduce(
          (sum, year) => sum + (right.yearCounts[year] || 0),
          0,
        )
        return rightLatest - leftLatest || rightTotal - leftTotal
      })
    return [...exampleRows, ...leaders.slice(0, 17)]
  }, [analytics.words, analytics.years])

  useEffect(() => setPage(1), [query, view])
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
        disabled={analytics.totalPapers === 0}
        className='inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:border-slate-500 disabled:opacity-40 lg:w-auto'>
        词汇分析
      </button>

      {isOpen ? (
        <div className='fixed inset-0 z-[100]'>
          <button
            type='button'
            aria-label='关闭词汇分析窗口'
            onClick={() => setIsOpen(false)}
            className='absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]'
          />
          <section
            role='dialog'
            aria-modal='true'
            aria-labelledby='practice-vocabulary-analytics-title'
            className='absolute inset-x-3 top-1/2 mx-auto flex max-h-[min(90vh,56rem)] max-w-6xl -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-[#f8f7f3] shadow-2xl sm:inset-x-6'>
            <header className='flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6'>
              <div>
                <h2 id='practice-vocabulary-analytics-title' className='text-lg font-bold tracking-tight text-slate-950'>
                  试卷词汇分析
                </h2>
                <p className='mt-1 text-xs text-slate-500'>
                  {analytics.totalPapers} 套日语试卷 · {analytics.words.length} 个词 · {analytics.totalOccurrences} 次出现
                </p>
              </div>
              <button type='button' onClick={() => setIsOpen(false)} className='px-2 py-1 text-sm font-semibold text-slate-500 hover:text-slate-950'>
                关闭
              </button>
            </header>

            <nav aria-label='词汇分析分类' className='flex gap-1 overflow-x-auto border-b border-slate-200 px-5 py-3 md:px-6'>
              {([
                ['overview', '高频概览'],
                ['coverage', '试卷覆盖率'],
                ['profiles', '题型画像'],
                ['trends', '年份趋势'],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type='button'
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition ${
                    view === key
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-500 hover:bg-white hover:text-slate-900'
                  }`}>
                  {label}
                </button>
              ))}
            </nav>

            <div className='min-h-0 overflow-y-auto px-5 py-5 md:px-6'>
              {view === 'overview' ? (
                <div className='space-y-5'>
                  <section>
                    <div className='flex items-end justify-between gap-3'>
                      <h3 className='text-sm font-bold text-slate-950'>最常出现的汉字</h3>
                      <span className='text-xs text-slate-400'>出现次数 / 覆盖试卷</span>
                    </div>
                    <div className='mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-10'>
                      {analytics.kanji.slice(0, 20).map(item => (
                        <div key={item.character} className='rounded-xl border border-slate-200 bg-white p-3 text-center'>
                          <p className='text-xl font-bold text-slate-950'>{item.character}</p>
                          <p className='mt-1 text-[10px] tabular-nums text-slate-400'>{item.count} / {item.paperCount}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <Ranking title='选项词频' rows={optionWords} value={row => row.optionCount} />
                    <Ranking title='片假名词频' rows={katakanaWords} value={row => row.count} />
                    <Ranking title='最常出现的二字熟语' rows={compounds} value={row => row.count} />
                    <Ranking title='最常作为考点的汉字词' rows={testedWords} value={row => row.targetCount} />
                  </div>
                </div>
              ) : null}

              {view === 'coverage' ? (
                <div>
                  <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
                    <label className='text-xs font-semibold text-slate-500 sm:w-80'>
                      查找词语
                      <input
                        type='search'
                        value={query}
                        onChange={event => setQuery(event.currentTarget.value)}
                        placeholder='例如：取り組む'
                        className='mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
                      />
                    </label>
                    <p className='text-xs text-slate-500'>{coverageRows.length} 个词</p>
                  </div>
                  <div className='mt-4 divide-y divide-slate-200 border-y border-slate-200'>
                    {visibleCoverageRows.map(row => (
                      <div key={row.word} className='grid gap-3 py-4 sm:grid-cols-[minmax(9rem,1fr)_repeat(4,minmax(5rem,auto))] sm:items-center'>
                        <div>
                          <p className='font-bold text-slate-950'>{row.word}</p>
                          <p className='mt-0.5 text-xs text-slate-400'>{row.reading || row.partOfSpeech || '—'}</p>
                        </div>
                        <div><p className='text-[10px] font-semibold text-slate-400'>总出现</p><p className='mt-1 text-sm font-bold tabular-nums'>{row.count} 次</p></div>
                        <div><p className='text-[10px] font-semibold text-slate-400'>出现试卷</p><p className='mt-1 text-sm font-bold tabular-nums'>{row.paperCount} / {analytics.totalPapers} 套</p></div>
                        <div><p className='text-[10px] font-semibold text-slate-400'>覆盖率</p><p className='mt-1 text-sm font-bold tabular-nums'>{row.coverageRate}%</p></div>
                        <div><p className='text-[10px] font-semibold text-slate-400'>作为考点</p><p className='mt-1 text-sm font-bold tabular-nums'>{row.targetCount} 次</p></div>
                      </div>
                    ))}
                    {visibleCoverageRows.length === 0 ? (
                      <p className='py-12 text-center text-sm text-slate-500'>没有找到这个词。</p>
                    ) : null}
                  </div>
                  <div className='mt-4 flex items-center justify-end gap-2'>
                    <span className='text-xs text-slate-500'>第 {normalizedPage}/{totalPages} 页</span>
                    <button type='button' disabled={normalizedPage <= 1} onClick={() => setPage(current => Math.max(1, current - 1))} className='ui-btn ui-btn-sm disabled:opacity-40'>上一页</button>
                    <button type='button' disabled={normalizedPage >= totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))} className='ui-btn ui-btn-sm disabled:opacity-40'>下一页</button>
                  </div>
                </div>
              ) : null}

              {view === 'profiles' ? (
                <div>
                  <p className='mb-4 text-xs text-slate-500'>各题型中最常出现的词，包含原文、题干和选项。</p>
                  <div className='grid gap-4 md:grid-cols-2'>
                    {analytics.profiles.map(profile => (
                      <section key={profile.key} className='rounded-xl border border-slate-200 bg-white p-4'>
                        <div className='flex items-end justify-between gap-3'>
                          <div>
                            <h3 className='font-bold text-slate-950'>{profile.label}</h3>
                            <p className='mt-1 text-xs text-slate-400'>{profile.uniqueWords} 个词 · {profile.totalOccurrences} 次</p>
                          </div>
                        </div>
                        <div className='mt-3 grid grid-cols-2 gap-x-5'>
                          {profile.topWords.slice(0, 16).map((item, index) => (
                            <div key={item.word} className='flex items-center justify-between gap-2 border-t border-slate-100 py-2 text-sm'>
                              <span className='min-w-0 truncate'><span className='mr-2 text-xs text-slate-300'>{index + 1}</span>{item.word}</span>
                              <span className='text-xs tabular-nums text-slate-400'>{item.count}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              ) : null}

              {view === 'trends' ? (
                <div>
                  <p className='mb-4 text-xs text-slate-500'>按试卷年份统计出现次数；未标年份的试卷不计入趋势。</p>
                  <div className='overflow-x-auto border-y border-slate-200'>
                    <table className='w-full min-w-[38rem] border-collapse text-left'>
                      <thead>
                        <tr className='text-xs text-slate-500'>
                          <th className='px-3 py-3 font-medium'>词语</th>
                          {analytics.years.map(year => <th key={year} className='px-3 py-3 text-right font-medium'>{year}</th>)}
                          <th className='px-3 py-3 text-right font-medium'>合计</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-slate-200'>
                        {trendRows.map(row => {
                          const total = analytics.years.reduce((sum, year) => sum + (row.yearCounts[year] || 0), 0)
                          return (
                            <tr key={row.word} className='text-sm'>
                              <td className='px-3 py-3 font-semibold text-slate-900'>{row.word}</td>
                              {analytics.years.map(year => <td key={year} className='px-3 py-3 text-right tabular-nums text-slate-600'>{row.yearCounts[year] || 0}</td>)}
                              <td className='px-3 py-3 text-right font-bold tabular-nums text-slate-900'>{total}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
