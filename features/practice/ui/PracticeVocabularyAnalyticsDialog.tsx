'use client'

import {
  memo,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'

import type {
  PracticeVocabularyAnalytics,
  PracticeVocabularyWordInsight,
  PracticeVocabularyWordbookEntry,
} from '@/features/practice/domain/vocabulary-analytics'
import {
  normalizePracticeVocabularyWord,
  rankPracticeVocabularyTrendWords,
} from '@/features/practice/domain/vocabulary-analytics'

type View = 'overview' | 'coverage' | 'profiles' | 'trends'
type CoverageSortMode = 'learning' | 'coverage' | 'frequency'

const PAGE_SIZE = 50
const KATAKANA_PATTERN = /^[\p{Script=Katakana}ー]+$/u
const TWO_KANJI_PATTERN = /^\p{Script=Han}{2}$/u
const KANJI_WORD_PATTERN = /\p{Script=Han}/u

const emptyWordInsight = (
  entry: PracticeVocabularyWordbookEntry,
): PracticeVocabularyWordInsight => ({
  word: entry.word,
  reading: entry.reading,
  partOfSpeech: entry.partOfSpeech,
  count: 0,
  paperCount: 0,
  coverageRate: 0,
  optionCount: 0,
  targetCount: 0,
  learningValue: 0,
  inWordbook: true,
  wordbookIds: entry.wordbookIds,
  wordbookNames: entry.wordbookNames,
  isMastered: false,
  categoryCounts: { TEXT_VOCAB: 0, GRAMMAR: 0, READING: 0, LISTENING: 0 },
  yearCounts: {},
})

const Ranking = memo(function Ranking({
  title,
  description,
  rows,
  value,
}: {
  title: string
  description: string
  rows: PracticeVocabularyWordInsight[]
  value: (row: PracticeVocabularyWordInsight) => number
}) {
  return (
    <section className='overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/30'>
      <div className='border-b border-slate-100 px-4 py-3'>
        <h3 className='text-sm font-bold text-slate-950'>{title}</h3>
        <p className='mt-0.5 text-[11px] text-slate-400'>{description}</p>
      </div>
      <ol className='grid grid-cols-2 gap-x-4 px-4 py-1 sm:grid-cols-1 lg:grid-cols-2'>
        {rows.slice(0, 10).map((row, index) => (
          <li
            key={row.word}
            className='grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-100 py-2.5 text-sm last:border-b-0'>
            <span className='text-[10px] font-semibold tabular-nums text-slate-300'>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className='truncate font-semibold text-slate-800'>{row.word}</span>
            <span className='text-[11px] font-semibold tabular-nums text-slate-400'>{value(row)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
})

function OverviewView({ analytics }: { analytics: PracticeVocabularyAnalytics }) {
  const rankings = useMemo(() => {
    const learningWords: PracticeVocabularyWordInsight[] = []
    const optionWords: PracticeVocabularyWordInsight[] = []
    const katakanaWords: PracticeVocabularyWordInsight[] = []
    const compounds: PracticeVocabularyWordInsight[] = []
    const testedWords: PracticeVocabularyWordInsight[] = []

    for (const row of analytics.words) {
      const usefulCandidate = !row.isMastered
      if (usefulCandidate) learningWords.push(row)
      if (row.optionCount > 0 && usefulCandidate) optionWords.push(row)
      if (KATAKANA_PATTERN.test(row.word)) katakanaWords.push(row)
      if (TWO_KANJI_PATTERN.test(row.word) && usefulCandidate) compounds.push(row)
      if (row.targetCount > 0 && KANJI_WORD_PATTERN.test(row.word)) testedWords.push(row)
    }

    optionWords.sort((left, right) => right.optionCount - left.optionCount)
    testedWords.sort(
      (left, right) => right.targetCount - left.targetCount || right.count - left.count,
    )
    return { learningWords, optionWords, katakanaWords, compounds, testedWords }
  }, [analytics.words])

  return (
    <div className='space-y-6'>
      <section>
        <div className='flex items-end justify-between gap-3'>
          <div>
            <p className='text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400'>Kanji frequency</p>
            <h3 className='mt-1 text-base font-bold text-slate-950'>最常出现的汉字</h3>
          </div>
          <span className='hidden text-[11px] text-slate-400 sm:inline'>次数 · 覆盖试卷</span>
        </div>
        <div className='mt-3 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-10'>
          {analytics.kanji.slice(0, 20).map(item => (
            <div
              key={item.character}
              className='group rounded-xl border border-slate-200/90 bg-white px-1.5 py-2.5 text-center shadow-sm shadow-slate-200/20 transition hover:-translate-y-0.5 hover:border-slate-300'>
              <p className='text-2xl font-bold leading-none text-slate-950'>{item.character}</p>
              <p className='mt-2 whitespace-nowrap text-[10px] font-medium tabular-nums text-slate-400'>
                {item.count} 次 · {item.paperCount} 套
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className='grid gap-3 md:grid-cols-2'>
        <Ranking title='优先学习词汇' description='综合考点、跨卷覆盖、选项频率和词形复杂度' rows={rankings.learningWords} value={row => row.count} />
        <Ranking title='选项词频' description='最常作为干扰项或答案出现' rows={rankings.optionWords} value={row => row.optionCount} />
        <Ranking title='片假名词频' description='外来语与专有表达' rows={rankings.katakanaWords} value={row => row.count} />
        <Ranking title='二字熟语' description='高频汉字组合' rows={rankings.compounds} value={row => row.count} />
        <Ranking title='汉字考点' description='最常被直接设问' rows={rankings.testedWords} value={row => row.targetCount} />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className='text-[10px] font-semibold text-slate-400'>{label}</p><p className='mt-1 text-sm font-bold tabular-nums'>{value}</p></div>
}

function WordbookScopeFilter({
  analytics,
  selectedIds,
  includeOutside,
  visibleCount,
  isLoading,
  error,
  onToggleWordbook,
  onToggleOutside,
  onShowAll,
}: {
  analytics: PracticeVocabularyAnalytics
  selectedIds: Set<string>
  includeOutside: boolean
  visibleCount: number
  isLoading: boolean
  error: string
  onToggleWordbook: (id: string) => void
  onToggleOutside: () => void
  onShowAll: () => void
}) {
  const hasScope = selectedIds.size > 0 || includeOutside
  const label = !hasScope
    ? '全部词汇'
    : selectedIds.size === 0
      ? '未加入单词书'
      : `${selectedIds.size} 本${includeOutside ? ' + 未收录' : ''}`

  return (
    <div className='border-b border-slate-200 bg-white/70 px-4 py-3 sm:px-5 md:px-7'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-xs font-semibold text-slate-500'>分析范围</span>
          <details className='group relative'>
            <summary className='flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-400 [&::-webkit-details-marker]:hidden'>
              <span>{label}</span>
              <span aria-hidden='true' className='text-[10px] text-slate-400 transition group-open:rotate-180'>▼</span>
            </summary>
            <div className='absolute left-0 z-20 mt-2 w-[min(24rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl'>
              <div className='flex items-center justify-between border-b border-slate-100 px-3 py-2.5'>
                <p className='text-xs font-bold text-slate-800'>选择单词书（可多选）</p>
                <button type='button' onClick={onShowAll} className='text-xs font-semibold text-slate-500 hover:text-slate-950'>全部词汇</button>
              </div>
              <div className='max-h-72 overflow-y-auto p-2'>
                <label className='flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50'>
                  <input type='checkbox' checked={includeOutside} onChange={onToggleOutside} className='size-4 rounded border-slate-300' />
                  <span className='font-semibold text-slate-800'>未加入任何单词书</span>
                </label>
                {analytics.wordbooks.map(wordbook => (
                  <label
                    key={wordbook.id}
                    title={wordbook.pathLabel}
                    className='flex cursor-pointer items-center gap-2 rounded-lg py-2 pr-2.5 text-sm hover:bg-slate-50'
                    style={{ paddingLeft: `${0.625 + wordbook.depth * 1.1}rem` }}>
                    <input
                      type='checkbox'
                      checked={selectedIds.has(wordbook.id)}
                      onChange={() => onToggleWordbook(wordbook.id)}
                      className='size-4 shrink-0 rounded border-slate-300'
                    />
                    <span className='min-w-0 flex-1 truncate font-medium text-slate-700'>{wordbook.name}</span>
                    <span className='text-[11px] tabular-nums text-slate-400'>{wordbook.totalCount}</span>
                  </label>
                ))}
              </div>
            </div>
          </details>
        </div>
        <p className={`text-xs tabular-nums ${error ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
          {error || (isLoading ? '正在读取单词书…' : `${visibleCount} 个词`)}
        </p>
      </div>
    </div>
  )
}

function CoverageView({
  analytics,
  onMasteryChange,
}: {
  analytics: PracticeVocabularyAnalytics
  onMasteryChange: (word: string, mastered: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<CoverageSortMode>('learning')
  const [showLearned, setShowLearned] = useState(false)
  const [pendingWords, setPendingWords] = useState<Set<string>>(() => new Set())
  const [preferenceError, setPreferenceError] = useState('')
  const [page, setPage] = useState(1)
  const deferredQuery = useDeferredValue(query)
  const sortedWords = useMemo(
    () => [...analytics.words].sort((left, right) => {
      if (sortMode === 'frequency') {
        return right.count - left.count || right.paperCount - left.paperCount || left.word.localeCompare(right.word, 'ja')
      }
      if (sortMode === 'coverage') {
        return right.coverageRate - left.coverageRate || right.count - left.count || left.word.localeCompare(right.word, 'ja')
      }
      return right.learningValue - left.learningValue || right.targetCount - left.targetCount || right.count - left.count || left.word.localeCompare(right.word, 'ja')
    }),
    [analytics.words, sortMode],
  )
  const coverageRows = useMemo(() => {
    const keyword = deferredQuery.normalize('NFKC').trim().toLowerCase()
    return sortedWords.filter(row => {
      const matchesQuery = !keyword ||
        `${row.word} ${row.reading} ${row.partOfSpeech}`.toLowerCase().includes(keyword)
      const visibleByLearningState = keyword || showLearned || !row.isMastered
      return matchesQuery && visibleByLearningState
    })
  }, [deferredQuery, showLearned, sortedWords])
  const totalPages = Math.max(1, Math.ceil(coverageRows.length / PAGE_SIZE))
  const normalizedPage = Math.min(page, totalPages)
  const visibleRows = coverageRows.slice(
    (normalizedPage - 1) * PAGE_SIZE,
    normalizedPage * PAGE_SIZE,
  )

  useEffect(() => setPage(1), [analytics.words, deferredQuery, showLearned, sortMode])

  const updateMastery = async (
    row: PracticeVocabularyWordInsight,
    mastered: boolean,
  ) => {
    setPreferenceError('')
    setPendingWords(current => new Set(current).add(row.word))
    try {
      const response = await fetch('/api/practice/vocabulary-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: row.word, mastered }),
      })
      if (!response.ok) throw new Error('request failed')
      onMasteryChange(row.word, mastered)
    } catch {
      setPreferenceError('熟练状态保存失败，请重试。')
    } finally {
      setPendingWords(current => {
        const next = new Set(current)
        next.delete(row.word)
        return next
      })
    }
  }

  return (
    <div>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <label className='text-xs font-semibold text-slate-500 sm:w-80'>
          查找词语
          <input
            type='search'
            value={query}
            onChange={event => setQuery(event.currentTarget.value)}
            placeholder='例如：取り組む'
            className='mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
          />
        </label>
        <div className='flex flex-wrap items-center gap-2'>
          <label className='text-xs font-semibold text-slate-500'>
            排序
            <select value={sortMode} onChange={event => setSortMode(event.currentTarget.value as CoverageSortMode)} className='ml-2 h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400'>
              <option value='learning'>学习价值</option>
              <option value='coverage'>试卷覆盖率</option>
              <option value='frequency'>题型命中次数</option>
            </select>
          </label>
          <button type='button' aria-pressed={showLearned} onClick={() => setShowLearned(current => !current)} className={`h-9 rounded-lg border px-3 text-xs font-semibold transition ${showLearned ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>
            {showLearned ? '已显示熟练词' : '显示已熟练词'}
          </button>
          <p className='text-xs tabular-nums text-slate-500'>{coverageRows.length} 个词</p>
        </div>
      </div>
      {preferenceError ? (
        <p role='alert' className='mt-3 text-xs font-semibold text-rose-600'>
          {preferenceError}
        </p>
      ) : null}
      <div className='mt-4 divide-y divide-slate-200 border-y border-slate-200'>
        {visibleRows.map(row => (
          <div key={row.word} className='grid gap-3 py-3.5 sm:grid-cols-[minmax(9rem,1fr)_repeat(4,minmax(5rem,auto))_auto] sm:items-center'>
            <div>
              <div className='flex flex-wrap items-center gap-1.5'>
                <p className='font-bold text-slate-950'>{row.word}</p>
                {row.targetCount > 0 ? <span className='rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800'>考点</span> : null}
                {row.inWordbook ? <span title={row.wordbookNames.join('、')} className='rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700'>单词书</span> : null}
                {row.isMastered ? <span className='rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700'>已熟练</span> : null}
              </div>
              <p className='mt-0.5 text-xs text-slate-400'>{row.reading || row.partOfSpeech || '—'}</p>
            </div>
            <Metric label='题型命中' value={`${row.count} 次`} />
            <Metric label='出现试卷' value={`${row.paperCount} / ${analytics.totalPapers} 套`} />
            <Metric label='覆盖率' value={`${row.coverageRate}%`} />
            <Metric label='作为考点' value={`${row.targetCount} 次`} />
            <button
              type='button'
              disabled={pendingWords.has(row.word)}
              onClick={() => void updateMastery(row, !row.isMastered)}
              className='ui-btn ui-btn-sm whitespace-nowrap disabled:opacity-40'>
              {pendingWords.has(row.word)
                ? '保存中…'
                : row.isMastered
                  ? '恢复推荐'
                  : '标记熟练'}
            </button>
          </div>
        ))}
        {visibleRows.length === 0 ? <p className='py-12 text-center text-sm text-slate-500'>没有找到这个词。</p> : null}
      </div>
      <div className='mt-4 flex items-center justify-end gap-2'>
        <span className='text-xs text-slate-500'>第 {normalizedPage}/{totalPages} 页</span>
        <button type='button' disabled={normalizedPage <= 1} onClick={() => setPage(current => Math.max(1, current - 1))} className='ui-btn ui-btn-sm disabled:opacity-40'>上一页</button>
        <button type='button' disabled={normalizedPage >= totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))} className='ui-btn ui-btn-sm disabled:opacity-40'>下一页</button>
      </div>
    </div>
  )
}

function ProfilesView({ analytics }: { analytics: PracticeVocabularyAnalytics }) {
  return (
    <div>
      <p className='mb-4 text-xs text-slate-500'>各题型中最常出现的词，包含原文、题干和选项。</p>
      <div className='grid gap-4 md:grid-cols-2'>
        {analytics.profiles.map(profile => (
          <section key={profile.key} className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/30'>
            <h3 className='font-bold text-slate-950'>{profile.label}</h3>
            <p className='mt-1 text-xs text-slate-400'>{profile.uniqueWords} 个词 · {profile.totalOccurrences} 次命中</p>
            <div className='mt-3 grid grid-cols-2 gap-x-5'>
              {analytics.words
                .filter(row =>
                  !row.isMastered &&
                  row.categoryCounts[profile.key] > 0,
                )
                .slice(0, 16)
                .map((row, index) => (
                <div key={row.word} className='flex items-center justify-between gap-2 border-t border-slate-100 py-2 text-sm'>
                  <span className='min-w-0 truncate'><span className='mr-2 text-xs text-slate-300'>{index + 1}</span>{row.word}</span>
                  <span className='text-xs tabular-nums text-slate-400'>{row.categoryCounts[profile.key]}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function TrendsView({ analytics }: { analytics: PracticeVocabularyAnalytics }) {
  const trendRows = useMemo(
    () => rankPracticeVocabularyTrendWords(
      analytics.words.filter(row => !row.isMastered),
      analytics.years,
    ),
    [analytics.words, analytics.years],
  )

  return (
    <div>
      <p className='mb-4 text-xs text-slate-500'>按每年词频占比的变化排序，减少各年份试卷数量不同造成的偏差；只显示至少出现 2 次的词。</p>
      <div className='overflow-x-auto rounded-xl border border-slate-200 bg-white'>
        <table className='w-full min-w-[38rem] border-collapse text-left'>
          <thead><tr className='border-b border-slate-200 text-xs text-slate-500'><th className='px-3 py-3 font-medium'>词语</th>{analytics.years.map(year => <th key={year} className='px-3 py-3 text-right font-medium'>{year}</th>)}<th className='px-3 py-3 text-right font-medium'>合计</th></tr></thead>
          <tbody className='divide-y divide-slate-100'>
            {trendRows.map(row => {
              const total = analytics.years.reduce((sum, year) => sum + (row.yearCounts[year] || 0), 0)
              return <tr key={row.word} className='text-sm'><td className='px-3 py-3 font-semibold text-slate-900'>{row.word}</td>{analytics.years.map(year => <td key={year} className='px-3 py-3 text-right tabular-nums text-slate-600'>{row.yearCounts[year] || 0}</td>)}<td className='px-3 py-3 text-right font-bold tabular-nums text-slate-900'>{total}</td></tr>
            })}
            {trendRows.length === 0 ? (
              <tr><td colSpan={analytics.years.length + 2} className='px-4 py-12 text-center text-sm text-slate-400'>当前范围内没有足够的跨年词频数据。</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PracticeVocabularyAnalyticsDialog({
  analytics,
  initialOpen = false,
  hideTrigger = false,
  onDismiss,
  onWordMasteryChange,
}: {
  analytics: PracticeVocabularyAnalytics
  initialOpen?: boolean
  hideTrigger?: boolean
  onDismiss?: () => void
  onWordMasteryChange?: (word: string, mastered: boolean) => void
}) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [view, setView] = useState<View>('overview')
  const [words, setWords] = useState(analytics.words)
  const [selectedWordbookIds, setSelectedWordbookIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [includeOutside, setIncludeOutside] = useState(true)
  const [selectedWordbookEntries, setSelectedWordbookEntries] = useState<
    PracticeVocabularyWordbookEntry[]
  >([])
  const [wordbookLoadState, setWordbookLoadState] = useState<
    'idle' | 'loading' | 'error'
  >('idle')
  const personalizedAnalytics = useMemo(
    () => ({ ...analytics, words }),
    [analytics, words],
  )
  useEffect(() => {
    if (selectedWordbookIds.size === 0) {
      setSelectedWordbookEntries([])
      setWordbookLoadState('idle')
      return
    }
    const controller = new AbortController()
    const params = new URLSearchParams()
    selectedWordbookIds.forEach(id => params.append('id', id))
    setSelectedWordbookEntries([])
    setWordbookLoadState('loading')
    void fetch(`/api/practice/vocabulary-wordbooks?${params}`, {
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('request failed')
        return (await response.json()) as {
          words: PracticeVocabularyWordbookEntry[]
        }
      })
      .then(result => {
        setSelectedWordbookEntries(result.words)
        setWordbookLoadState('idle')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setWordbookLoadState('error')
      })
    return () => controller.abort()
  }, [selectedWordbookIds])
  const analyticsWithSelectedWordbooks = useMemo(() => {
    if (selectedWordbookEntries.length === 0) return personalizedAnalytics
    const byWord = new Map(
      personalizedAnalytics.words.map(row => [
        normalizePracticeVocabularyWord(row.word),
        row,
      ]),
    )
    selectedWordbookEntries.forEach(entry => {
      const key = normalizePracticeVocabularyWord(entry.word)
      const current = byWord.get(key)
      if (!current) {
        byWord.set(key, emptyWordInsight(entry))
        return
      }
      byWord.set(key, {
        ...current,
        inWordbook: true,
        wordbookIds: Array.from(new Set([
          ...current.wordbookIds,
          ...entry.wordbookIds,
        ])),
        wordbookNames: Array.from(new Set([
          ...current.wordbookNames,
          ...entry.wordbookNames,
        ])),
      })
    })
    return { ...personalizedAnalytics, words: [...byWord.values()] }
  }, [personalizedAnalytics, selectedWordbookEntries])
  const scopedAnalytics = useMemo(() => {
    const hasScope = selectedWordbookIds.size > 0 || includeOutside
    if (!hasScope) return analyticsWithSelectedWordbooks
    return {
      ...analyticsWithSelectedWordbooks,
      words: analyticsWithSelectedWordbooks.words.filter(row =>
        (includeOutside && row.wordbookIds.length === 0) ||
        row.wordbookIds.some(id => selectedWordbookIds.has(id)),
      ),
    }
  }, [analyticsWithSelectedWordbooks, includeOutside, selectedWordbookIds])
  const scopedOccurrences = useMemo(
    () => scopedAnalytics.words.reduce((sum, row) => sum + row.count, 0),
    [scopedAnalytics.words],
  )
  const closeDialog = useCallback(() => {
    setIsOpen(false)
    onDismiss?.()
  }, [onDismiss])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDialog()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDialog, isOpen])

  const switchView = (nextView: View) => {
    startTransition(() => setView(nextView))
  }

  const toggleWordbook = useCallback((id: string) => {
    setSelectedWordbookIds(current => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        if (current.size === 0) setIncludeOutside(false)
      }
      return next
    })
  }, [])

  const showAllWords = useCallback(() => {
    setSelectedWordbookIds(new Set())
    setIncludeOutside(false)
  }, [])

  const updateMastery = useCallback((word: string, mastered: boolean) => {
    setWords(current =>
      current.map(row =>
        row.word === word ? { ...row, isMastered: mastered } : row,
      ),
    )
    onWordMasteryChange?.(word, mastered)
  }, [onWordMasteryChange])

  return (
    <>
      {!hideTrigger ? (
        <button type='button' aria-haspopup='dialog' aria-expanded={isOpen} onClick={() => setIsOpen(true)} disabled={analytics.totalPapers === 0} className='inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:border-slate-500 disabled:opacity-40 lg:w-auto'>词汇分析</button>
      ) : null}

      {isOpen ? (
        <div className='fixed inset-0 z-[100]'>
          <button type='button' aria-label='关闭词汇分析窗口' onClick={closeDialog} className='absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]' />
          <section role='dialog' aria-modal='true' aria-labelledby='practice-vocabulary-analytics-title' className='absolute inset-x-2 top-1/2 mx-auto flex max-h-[min(94vh,58rem)] max-w-5xl -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-white/70 bg-[#f8f7f3] shadow-2xl sm:inset-x-5'>
            <header className='flex items-start justify-between gap-4 px-5 pb-4 pt-5 md:px-7'>
              <div>
                <p className='text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400'>Practice vocabulary</p>
                <h2 id='practice-vocabulary-analytics-title' className='mt-1 text-xl font-bold tracking-tight text-slate-950'>试卷词汇分析</h2>
                <div className='mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium tabular-nums text-slate-500'>
                  <span className='rounded-full bg-white px-2.5 py-1'>{analytics.totalPapers} 套试卷</span>
                  <span className='rounded-full bg-white px-2.5 py-1'>{scopedAnalytics.words.length} 个词</span>
                  <span className='rounded-full bg-white px-2.5 py-1'>{scopedOccurrences} 次题型命中</span>
                </div>
              </div>
              <button type='button' aria-label='关闭' onClick={closeDialog} className='grid size-9 shrink-0 place-items-center rounded-full bg-white text-lg leading-none text-slate-400 transition hover:bg-slate-950 hover:text-white'>×</button>
            </header>

            <nav aria-label='词汇分析分类' className='grid grid-cols-4 border-y border-slate-200 bg-white/60 px-2 sm:px-5'>
              {([['overview', '学习优先'], ['coverage', '词汇明细'], ['profiles', '题型画像'], ['trends', '年份趋势']] as const).map(([key, label]) => (
                <button key={key} type='button' aria-pressed={view === key} onClick={() => switchView(key)} className={`relative min-w-0 px-1 py-3 text-xs font-bold transition sm:px-3 ${view === key ? 'text-slate-950 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-slate-950' : 'text-slate-400 hover:text-slate-700'}`}>{label}</button>
              ))}
            </nav>

            <WordbookScopeFilter
              analytics={personalizedAnalytics}
              selectedIds={selectedWordbookIds}
              includeOutside={includeOutside}
              visibleCount={scopedAnalytics.words.length}
              isLoading={wordbookLoadState === 'loading'}
              error={wordbookLoadState === 'error' ? '单词书读取失败' : ''}
              onToggleWordbook={toggleWordbook}
              onToggleOutside={() => setIncludeOutside(current => !current)}
              onShowAll={showAllWords}
            />

            <div className='min-h-0 overflow-y-auto px-4 py-5 sm:px-5 md:px-7 md:py-6'>
              {view === 'overview' ? <OverviewView analytics={scopedAnalytics} /> : null}
              {view === 'coverage' ? <CoverageView analytics={scopedAnalytics} onMasteryChange={updateMastery} /> : null}
              {view === 'profiles' ? <ProfilesView analytics={scopedAnalytics} /> : null}
              {view === 'trends' ? <TrendsView analytics={scopedAnalytics} /> : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
