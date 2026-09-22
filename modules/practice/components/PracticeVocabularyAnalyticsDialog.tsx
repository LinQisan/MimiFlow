'use client'

import {
  Fragment,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { mergeVocabularyScope, resolveVocabularyScopeIds } from '@/modules/practice/domain/vocabulary-scope'

import ControlDropdown from '@/modules/knowledge/vocabulary/components/ControlDropdown'
import { normalizeVocabularyWord } from '@/modules/knowledge/vocabulary/domain/normalized-word'
import { listWordbookFilterOptions, parseWordbookFilter } from '@/modules/knowledge/vocabulary/domain/wordbook-list'

import CustomSelect from '@/components/ui/CustomSelect'
import styles from './PracticeVocabularyAnalyticsDialog.module.css'
import type {
  PracticeVocabularyAnalytics,
  PracticeVocabularyAnalyticsSummary,
  PracticeVocabularyAnalyticsWordsResponse,
  PracticeVocabularyCategory,
  PracticeVocabularyWordInsight,
  PracticeVocabularyWordbookEntry,
  PracticeVocabularyWordbookOption,
} from '@/modules/practice/domain/vocabulary-analytics'
import {
  PRACTICE_VOCABULARY_CATEGORY_OPTIONS,
} from '@/modules/practice/domain/vocabulary-analytics'

type ScopeMode = 'all' | 'series' | 'wordbook'
type SortMode = 'coverage' | 'frequency' | 'alphabetical'
type MasteryFilter = 'all' | 'unmastered' | 'mastered'


const EMPTY_CATEGORY_COUNTS: Record<PracticeVocabularyCategory, number> = {
  TEXT_VOCAB: 0,
  GRAMMAR: 0,
  READING: 0,
  LISTENING: 0,
}

const emptyWordInsight = (
  entry: Pick<PracticeVocabularyWordbookEntry, 'word' | 'reading' | 'partOfSpeech' | 'wordbookIds' | 'isMastered'>,
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
  wordbookIds: entry.wordbookIds,
  isMastered: Boolean(entry.isMastered),
  categoryCounts: EMPTY_CATEGORY_COUNTS,
  yearCounts: {},
})

const focusableSelector = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function ScopeControls({ mode, scopeId, wordbooks, onChange, loading, error, analytics }: {
  analytics: PracticeVocabularyAnalytics | null
  mode: ScopeMode
  scopeId: string
  wordbooks: PracticeVocabularyWordbookOption[]
  onChange: (value: string) => void
  loading: boolean
  error: string
}) {
  const options = [
    { value: 'all', label: '全部试卷词汇' },
    ...listWordbookFilterOptions(wordbooks.map(book => ({
      id: book.id, name: book.name, seriesId: book.seriesId,
      seriesName: book.seriesTitle, count: book.totalCount,
    }))),
  ]
  return (
    <div className='shrink-0 px-4 py-2 sm:px-5 md:px-7'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='min-w-0 text-xs font-semibold text-slate-500'>词汇范围</span>
          <ControlDropdown
            ariaLabel='选择词汇范围'
            value={mode === 'all' ? 'all' : mode === 'series' ? `series:${scopeId}` : scopeId}
            onChange={onChange}
            options={options}
            className='w-[min(22rem,calc(100vw-8rem))]'
          />
        </div>
        {!loading && !error ? <ScopeStats analytics={analytics} loading={false} /> : null}
        {error || loading || mode !== 'all' ? <p className={`text-xs tabular-nums ${error ? 'font-semibold text-rose-600' : 'text-slate-500'}`} role={error ? 'alert' : undefined}>
          {error || (loading ? '读取词表中…' : mode === 'all' ? '' : '含未出现词汇')}
        </p> : null}
      </div>
    </div>
  )
}

function ScopeStats({ analytics, loading }: { analytics: PracticeVocabularyAnalytics | null; loading: boolean }) {
  if (!analytics) return <p className='ui-meta'>{loading ? '正在计算词汇范围…' : '等待词汇数据'}</p>
  const matched = analytics.words.filter(row => row.count > 0).length
  const mastered = analytics.words.filter(row => row.isMastered).length
  return <p className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600'>
    <span>范围 <strong className='tabular-nums text-slate-950'>{analytics.words.length}</strong> 词</span>
    {matched < analytics.words.length ? <span>已出现 <strong className='tabular-nums text-slate-950'>{matched}</strong> 词</span> : null}
    {matched < analytics.words.length ? <span>未出现 <strong className='tabular-nums'>{analytics.words.length - matched}</strong> 词</span> : null}
    <span>熟练 <strong className='tabular-nums'>{mastered}</strong> 词</span>
  </p>
}

function CoverageView({
  analytics,
  onMasteryChange,
}: {
  analytics: PracticeVocabularyAnalytics
  onMasteryChange: (word: string, mastered: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('coverage')
  const [posFilter, setPosFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | PracticeVocabularyCategory>('all')
  const [occurrenceFilter, setOccurrenceFilter] = useState('all')
  const [masteryFilter, setMasteryFilter] = useState<MasteryFilter>('all')
  const [pendingWords, setPendingWords] = useState<Set<string>>(() => new Set())
  const [preferenceError, setPreferenceError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const listRef = useRef<HTMLDivElement>(null)
  const [expandedWord, setExpandedWord] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query)

  const posOptions = useMemo(
    () => Array.from(new Set(analytics.words.map(row => row.partOfSpeech.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'ja')),
    [analytics.words],
  )
  const searchIndex = useMemo(() => new Map(analytics.words.map(row => [row.word, normalizeVocabularyWord(`${row.word} ${row.reading} ${row.partOfSpeech}`)])), [analytics.words])
  const sortedWords = useMemo(() => [...analytics.words].sort((left, right) => {
    if (sortMode === 'frequency') return right.count - left.count || right.paperCount - left.paperCount || left.word.localeCompare(right.word, 'ja')
    if (sortMode === 'alphabetical') return left.word.localeCompare(right.word, 'ja')
    return right.coverageRate - left.coverageRate || right.paperCount - left.paperCount || right.count - left.count || left.word.localeCompare(right.word, 'ja')
  }), [analytics.words, sortMode])
  const filteredRows = useMemo(() => {
    const keyword = normalizeVocabularyWord(deferredQuery)
    return sortedWords.filter(row => {
      const haystack = searchIndex.get(row.word) || ''
      const matchesQuery = !keyword || haystack.includes(keyword)
      const matchesPos = posFilter === 'all' || row.partOfSpeech.trim() === posFilter
      const matchesCategory = categoryFilter === 'all' || row.categoryCounts[categoryFilter] > 0
      const matchesMastery = masteryFilter === 'all' || (masteryFilter === 'mastered' ? row.isMastered : !row.isMastered)
      const matchesOccurrence = occurrenceFilter === 'all' || (occurrenceFilter === 'matched' ? row.count > 0 : row.count === 0)
      return matchesQuery && matchesPos && matchesCategory && matchesMastery && matchesOccurrence
    })
  }, [categoryFilter, deferredQuery, masteryFilter, posFilter, sortedWords, occurrenceFilter, searchIndex])
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const normalizedPage = Math.min(page, totalPages)
  const visibleRows = filteredRows.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize)

  useEffect(() => setPage(1), [categoryFilter, deferredQuery, masteryFilter, posFilter, sortMode, occurrenceFilter, pageSize])

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 })
    setExpandedWord(null)
  }, [normalizedPage, categoryFilter, deferredQuery, masteryFilter, posFilter, sortMode, occurrenceFilter, pageSize])

  const updateMastery = async (row: PracticeVocabularyWordInsight, mastered: boolean) => {
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
      setPreferenceError('熟练标记保存失败，请重试。')
    } finally {
      setPendingWords(current => {
        const next = new Set(current)
        next.delete(row.word)
        return next
      })
    }
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className={styles.toolbar}>
        <label className='block text-xs font-semibold text-slate-500'>
          搜索词汇
          <input
            type='search'
            value={query}
            onChange={event => setQuery(event.currentTarget.value)}
            placeholder='搜索词汇、读音或词性'
            aria-label='搜索词汇、读音或词性'
            className='mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-base outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:text-sm'
          />
        </label>
        <div className={styles.mobileToggle}><button type='button' aria-expanded={showFilters} aria-controls='vocabulary-filters' onClick={() => setShowFilters(value => !value)} className='ui-btn ui-btn-sm w-full'>筛选与排序{[posFilter, categoryFilter, masteryFilter, occurrenceFilter].filter(value => value !== 'all').length > 0 ? ' · 已筛选' : ''} {showFilters ? '⌃' : '⌄'}</button></div>
        <div id='vocabulary-filters' className={styles.filters} data-expanded={showFilters}>
          <label className='min-w-0 text-xs font-semibold text-slate-500'>
            词性
            <CustomSelect aria-label='按词性筛选' value={posFilter} onChange={event => setPosFilter(event.currentTarget.value)} className='mt-1.5 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400'>
              <option value='all'>全部词性</option>
              {posOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </CustomSelect>
          </label>
          <label className='min-w-0 text-xs font-semibold text-slate-500'>
            题型
            <CustomSelect aria-label='按题型筛选' value={categoryFilter} onChange={event => { setCategoryFilter(event.currentTarget.value as 'all' | PracticeVocabularyCategory); setOccurrenceFilter('all') }} className='mt-1.5 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400'>
              <option value='all'>全部题型</option>
              {PRACTICE_VOCABULARY_CATEGORY_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
            </CustomSelect>
          </label>
          <label className='min-w-0 text-xs font-semibold text-slate-500'>
            排序
            <CustomSelect aria-label='选择词汇排序' value={sortMode} onChange={event => setSortMode(event.currentTarget.value as SortMode)} className='mt-1.5 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400'>
              <option value='coverage'>试卷覆盖</option>
              <option value='frequency'>覆盖题型数</option>
              <option value='alphabetical'>词语顺序</option>
            </CustomSelect>
          </label>
          <label className='min-w-0 text-xs font-semibold text-slate-500'>
            熟练度
            <CustomSelect aria-label='按熟练标记筛选' value={masteryFilter} onChange={event => setMasteryFilter(event.currentTarget.value as MasteryFilter)} className='mt-1.5 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400'>
              <option value='unmastered'>未熟练</option>
              <option value='mastered'>已熟练</option>
              <option value='all'>全部状态</option>
            </CustomSelect>
          </label>
          <label className='min-w-0 text-xs font-semibold text-slate-500'>
            出现情况
            <CustomSelect aria-label='按出现情况筛选' value={occurrenceFilter} onChange={event => { setOccurrenceFilter(event.currentTarget.value); if (event.currentTarget.value === 'absent') setCategoryFilter('all') }} className='mt-1.5 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700'>
              <option value='all'>全部词汇</option>
              <option value='matched'>已出现</option>
              <option value='absent'>未出现</option>
            </CustomSelect>
          </label>
          <button type='button' onClick={() => { setQuery(''); setPosFilter('all'); setCategoryFilter('all'); setMasteryFilter('all'); setOccurrenceFilter('all'); setSortMode('coverage'); setPage(1) }} className='ui-btn ui-btn-sm'>重置</button>
        </div>
      </div>
      {preferenceError ? <p role='alert' className='mt-3 text-xs font-semibold text-rose-600'>{preferenceError}</p> : null}
      <div className='flex shrink-0 items-center justify-between gap-3 pb-2 text-xs text-slate-500'>
        <span role='status'>{filteredRows.length.toLocaleString()} 词{filteredRows.length !== analytics.words.length ? ` / ${analytics.words.length.toLocaleString()}` : ''}{query !== deferredQuery ? ' · 筛选中…' : ''}</span>
        <details className='relative'>
          <summary className='cursor-pointer list-none py-1 text-slate-500'>统计说明 ⓘ</summary>
          <p className='absolute right-0 top-full z-30 w-64 rounded-md bg-white p-3 text-xs leading-6 text-slate-600 shadow-lg'>覆盖率按全部 {analytics.totalPapers} 套日语试卷计算，筛选题型不会改变统计口径。同一试卷、同一题型重复出现只计一次。熟练标记由你手动设置，与复习到期无关。</p>
        </details>
      </div>
      <div ref={listRef} className='min-h-0 flex-1 overflow-auto overscroll-contain' aria-label='词汇分析结果' tabIndex={0}>
        <table className='w-full min-w-[580px] border-collapse text-left text-sm'>
          <thead className='sticky top-0 z-10 bg-[#f8f7f3] text-xs text-slate-500'>
            <tr><th scope='col' className='w-[26%] px-2 py-2'>词汇 / 读音</th><th scope='col' className='w-[12%] px-2 py-2'>词性</th><th scope='col' className='w-[17%] px-2 py-2'>试卷覆盖</th><th scope='col' className='px-2 py-2'>出现题型</th><th scope='col' className='w-24 px-2 py-2'>熟练</th></tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              const expanded = expandedWord === row.word
              const detailId = `vocabulary-location-${index}`
              return <Fragment key={normalizeVocabularyWord(row.word)}>
                <tr className='hover:bg-white/60'>
                  <td className='px-2 py-2'>
                    <button type='button' aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpandedWord(expanded ? null : row.word)} className='flex min-h-9 items-center gap-2 text-left hover:text-indigo-700'>
                      <span aria-hidden='true' className='text-xs text-slate-400'>{expanded ? '▾' : '▸'}</span>
                      <span><span className='font-word-ja font-semibold' lang='ja'>{row.word}</span><span className='font-word-ja block text-xs text-slate-500' lang='ja'>{row.reading !== row.word ? row.reading : ''}</span></span>
                    </button>
                  </td>
                  <td className='px-2 py-2 text-xs text-slate-500'>{row.partOfSpeech || '—'}</td>
                  <td className='px-2 py-2 tabular-nums'><span className='font-semibold'>{row.paperCount} 套</span><span className='ml-2 text-xs text-slate-500'>{row.coverageRate}%</span></td>
                  <td className='px-2 py-2 text-xs text-slate-600'>{PRACTICE_VOCABULARY_CATEGORY_OPTIONS.filter(option => row.categoryCounts[option.key] > 0).map(option => option.label).join(' · ') || '未出现'}</td>
                  <td className='px-2 py-2'><label className='inline-flex min-h-9 cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-slate-600'><input type='checkbox' checked={row.isMastered} disabled={pendingWords.has(row.word)} onChange={event => void updateMastery(row, event.currentTarget.checked)} aria-label={`将${row.word}标记为熟练`} className='accent-slate-700' />{pendingWords.has(row.word) ? '保存中…' : row.isMastered ? '已熟练' : '未标记'}</label></td>
                </tr>
                {expanded ? <tr id={detailId} className='bg-slate-500/[0.025]'><td colSpan={5} className='px-5 py-4'>
                  <div className='mb-2 flex items-baseline justify-between gap-4'><h4 className='text-xs font-semibold text-slate-700'>出现位置 · {row.paperCount} 套试卷</h4><span className='text-xs text-slate-500'>共 {row.count} 个「试卷 × 题型」组合</span></div>
                  {row.occurrences?.length ? <ul className='space-y-2'>{row.occurrences.map(location => <li key={location.paperId} className='grid grid-cols-[minmax(12rem,1fr)_1fr] gap-4 py-2 text-xs'><a href={`/practice/${encodeURIComponent(location.paperId)}`} className='w-fit text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-indigo-700'>{location.paperTitle}</a><span className='text-slate-500'>{PRACTICE_VOCABULARY_CATEGORY_OPTIONS.filter(option => location.categories.includes(option.key)).map(option => option.label).join(' · ')}</span></li>)}</ul> : <p className='text-xs text-slate-500'>{row.count === 0 ? '未在本次分析的试卷中出现。' : '出现位置暂不可用，请关闭窗口并刷新页面。'}</p>}
                </td></tr> : null}
              </Fragment>
            })}
            {visibleRows.length === 0 ? <tr><td colSpan={5} className='py-12 text-center text-sm text-slate-500'>没有符合条件的词汇，可减少筛选条件或点击“重置”。</td></tr> : null}
          </tbody>
        </table>
      </div>
      <nav aria-label='词汇分页' className='flex shrink-0 flex-wrap items-center justify-between gap-2 pt-3 text-xs text-slate-500'>
        <label className='flex items-center gap-2'>每页
          <CustomSelect aria-label='每页词汇数' value={String(pageSize)} onChange={event => setPageSize(Number(event.currentTarget.value))} className='h-9 rounded-md border border-slate-200 bg-white px-2'>
            {[25, 50, 100].map(size => <option key={size} value={size}>{size} 词</option>)}
          </CustomSelect>
          <span className='hidden sm:inline'>{filteredRows.length ? (normalizedPage - 1) * pageSize + 1 : 0}–{Math.min(normalizedPage * pageSize, filteredRows.length)}</span>
        </label>
        <div className='flex items-center gap-2'>
          <button type='button' disabled={normalizedPage <= 1} onClick={() => setPage(normalizedPage - 1)} className='ui-btn ui-btn-sm disabled:opacity-40'>上一页</button>
          <label className='flex items-center gap-1'>
            <input aria-label='跳转到页码' type='number' min={1} max={totalPages} value={normalizedPage} onChange={event => { const next = Number(event.currentTarget.value); if (Number.isInteger(next) && next >= 1 && next <= totalPages) setPage(next) }} className='h-9 w-14 rounded-md border border-slate-200 bg-white px-2 text-center tabular-nums' /> / {totalPages}
          </label>
          <button type='button' disabled={normalizedPage >= totalPages} onClick={() => setPage(normalizedPage + 1)} className='ui-btn ui-btn-sm disabled:opacity-40'>下一页</button>
        </div>
      </nav>
    </div>
  )
}

function DetailLoadingView({ state, onRetry }: { state: 'idle' | 'loading' | 'error'; onRetry: () => void }) {
  return (
    <div className='ui-empty'>
      <p className='text-sm font-semibold text-slate-700'>{state === 'error' ? '词汇分析加载失败' : '正在准备词汇列表'}</p>
      <p className='mt-2 text-xs text-slate-400'>{state === 'loading' ? '正在读取详细词汇和词表关联…' : '打开此页后才会读取详细词汇。'}</p>
      {state === 'error' ? <button type='button' onClick={onRetry} className='ui-btn ui-btn-sm mt-4'>重试</button> : null}
    </div>
  )
}

export default function PracticeVocabularyAnalyticsDialog({
  summary,
  initialWords,
  initialWordbooks = [],
  initialOpen = false,
  hideTrigger = false,
  onDismiss,
  onLoadWords,
  onWordMasteryChange,
}: {
  summary: PracticeVocabularyAnalyticsSummary
  initialWords?: PracticeVocabularyWordInsight[]
  initialWordbooks?: PracticeVocabularyAnalyticsWordsResponse['wordbooks']
  initialOpen?: boolean
  hideTrigger?: boolean
  onDismiss?: () => void
  onLoadWords?: () => Promise<PracticeVocabularyAnalyticsWordsResponse>
  onWordMasteryChange?: (word: string, mastered: boolean) => void
}) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [words, setWords] = useState<PracticeVocabularyWordInsight[] | null>(() => initialWords || null)
  const [wordbooks, setWordbooks] = useState(initialWordbooks)
  const [detailLoadState, setDetailLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all')
  const [scopeId, setScopeId] = useState('')
  const [scopeEntries, setScopeEntries] = useState<PracticeVocabularyWordbookEntry[] | null>(null)
  const [scopeLoadState, setScopeLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [masteryOverrides, setMasteryOverrides] = useState<Record<string, boolean>>({})
  const detailRequestRef = useRef(0)
  const scopeRequestRef = useRef(0)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const detailedAnalytics = useMemo<PracticeVocabularyAnalytics | null>(
    () => words ? { ...summary, words, wordbooks } : null,
    [summary, wordbooks, words],
  )
  const seriesOptions = useMemo(() => {
    const groups = new Map<string, { id: string; title: string; count: number }>()
    wordbooks.forEach(wordbook => {
      const current = groups.get(wordbook.seriesId)
      if (current) current.count += 1
      else groups.set(wordbook.seriesId, { id: wordbook.seriesId, title: wordbook.seriesTitle, count: 1 })
    })
    return [...groups.values()]
  }, [wordbooks])
  const selectedWordbookIds = useMemo(
    () => resolveVocabularyScopeIds(wordbooks, scopeMode, scopeId),
    [scopeId, scopeMode, wordbooks],
  )
  const selectedIdsKey = JSON.stringify(selectedWordbookIds)
  const hasWords = words !== null
  const [loadedScopeKey, setLoadedScopeKey] = useState('')
  const [scopeRetry, setScopeRetry] = useState(0)

  const loadDetails = useCallback(async () => {
    if (detailedAnalytics) return detailedAnalytics
    if (!onLoadWords) {
      setDetailLoadState('error')
      throw new Error('词汇分析加载器不可用')
    }
    const requestId = ++detailRequestRef.current
    setDetailLoadState('loading')
    try {
      const result = await onLoadWords()
      if (requestId !== detailRequestRef.current) return null
      setWords(result.words)
      setWordbooks(result.wordbooks)
      setDetailLoadState('idle')
      return { ...summary, words: result.words, wordbooks: result.wordbooks }
    } catch (error) {
      if (requestId === detailRequestRef.current) setDetailLoadState('error')
      throw error
    }
  }, [detailedAnalytics, onLoadWords, summary])

  useEffect(() => {
    if (!isOpen || detailedAnalytics || detailLoadState !== 'idle') return
    void loadDetails().catch(() => undefined)
  }, [detailLoadState, detailedAnalytics, isOpen, loadDetails])

  useEffect(() => {
    if (scopeMode === 'series') {
      if (!scopeId || !seriesOptions.some(option => option.id === scopeId)) setScopeId(seriesOptions[0]?.id || '')
    } else if (scopeMode === 'wordbook') {
      if (!scopeId || !wordbooks.some(option => option.id === scopeId)) setScopeId(wordbooks[0]?.id || '')
    } else if (scopeId) {
      setScopeId('')
    }
  }, [scopeId, scopeMode, seriesOptions, wordbooks])

  useEffect(() => {
    const requestId = ++scopeRequestRef.current
    if (!isOpen || !hasWords || scopeMode === 'all' || selectedWordbookIds.length === 0) {
      setScopeEntries(null)
      setScopeLoadState('idle')
      return
    }
    const controller = new AbortController()
    const params = new URLSearchParams()
    selectedWordbookIds.forEach(id => params.append('id', id))
    setScopeEntries(null)
    setScopeLoadState('loading')
    void fetch(`/api/practice/vocabulary-wordbooks?${params.toString()}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async response => {
        if (!response.ok) throw new Error('request failed')
        return (await response.json()) as { words: PracticeVocabularyWordbookEntry[] }
      })
      .then(result => {
        if (controller.signal.aborted || requestId !== scopeRequestRef.current) return
        setLoadedScopeKey(selectedIdsKey)
        setScopeEntries(result.words)
        setScopeLoadState('idle')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (requestId === scopeRequestRef.current) setScopeLoadState('error')
      })
    return () => controller.abort()
  }, [isOpen, hasWords, scopeMode, selectedIdsKey, selectedWordbookIds, scopeRetry])

  const scopedAnalytics = useMemo(() => {
    if (!detailedAnalytics) return null
    const withMastery = (row: PracticeVocabularyWordInsight) => {
      const key = normalizeVocabularyWord(row.word)
      return masteryOverrides[key] === undefined ? row : { ...row, isMastered: masteryOverrides[key] }
    }
    if (scopeMode === 'all') return { ...detailedAnalytics, words: detailedAnalytics.words.map(withMastery) }
    if (selectedWordbookIds.length === 0) return { ...detailedAnalytics, words: [] }
    if (!scopeEntries || loadedScopeKey !== selectedIdsKey) return null
    return {
      ...detailedAnalytics,
      words: mergeVocabularyScope(detailedAnalytics.words, scopeEntries, emptyWordInsight, masteryOverrides),
    }
  }, [detailedAnalytics, masteryOverrides, scopeEntries, scopeMode, selectedWordbookIds, loadedScopeKey, selectedIdsKey])

  const closeDialog = useCallback(() => {
    setIsOpen(false)
    onDismiss?.()
  }, [onDismiss])

  useEffect(() => {
    if (!isOpen) {
      if (previousFocusRef.current) {
        const element = previousFocusRef.current
        previousFocusRef.current = null
        window.requestAnimationFrame(() => element.focus())
      }
      return
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current
    const focusInitial = window.requestAnimationFrame(() => closeButtonRef.current?.focus())
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDialog()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusInitial)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      const previous = previousFocusRef.current
      previousFocusRef.current = null
      if (previous?.isConnected) previous.focus()
    }
  }, [closeDialog, isOpen])

  const updateMastery = useCallback((word: string, mastered: boolean) => {
    const key = normalizeVocabularyWord(word)
    setMasteryOverrides(current => ({ ...current, [key]: mastered }))
    setWords(current => current ? current.map(row => normalizeVocabularyWord(row.word) === key ? { ...row, isMastered: mastered } : row) : current)
    onWordMasteryChange?.(word, mastered)
  }, [onWordMasteryChange])

  const selectScope = (value: string) => {
    const scope = parseWordbookFilter(value)
    startTransition(() => {
      setScopeMode(scope.kind === 'series' ? 'series' : scope.kind === 'wordbook' ? 'wordbook' : 'all')
      setScopeId(scope.kind === 'series' || scope.kind === 'wordbook' ? scope.id : '')
    })
  }

  return (
    <>
      {!hideTrigger ? (
        <button ref={triggerRef} type='button' aria-haspopup='dialog' aria-expanded={isOpen} onClick={() => setIsOpen(true)} disabled={summary.totalPapers === 0} className='inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:border-slate-500 disabled:opacity-40'>词汇分析</button>
      ) : null}
      {isOpen ? (
        <div className='fixed inset-0 z-[100]'>
          <button type='button' aria-label='关闭词汇分析窗口' onClick={closeDialog} tabIndex={-1} className='absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]' />
          <section ref={dialogRef} tabIndex={-1} role='dialog' aria-modal='true' aria-labelledby='practice-vocabulary-analytics-title' aria-describedby='practice-vocabulary-analytics-description' className='absolute inset-x-2 top-1/2 mx-auto flex h-[min(94dvh,58rem)] max-w-6xl -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/70 bg-[#f8f7f3] shadow-2xl outline-none sm:inset-x-5'>
            <header className='flex items-start justify-between gap-4 shrink-0 px-5 pb-2 pt-4 md:px-7'>
              <div>
                <h2 id='practice-vocabulary-analytics-title' className='mt-1 text-xl font-bold tracking-tight text-slate-950'>试卷词汇分析</h2>
                <p id='practice-vocabulary-analytics-description' className='mt-1.5 max-w-2xl text-xs text-slate-500'>{summary.totalPapers} 套日语试卷 · 点击词汇查看出现位置</p>
              </div>
              <button ref={closeButtonRef} type='button' aria-label='关闭词汇分析' onClick={closeDialog} className='grid size-9 shrink-0 place-items-center rounded-full bg-white text-lg leading-none text-slate-400 transition hover:bg-slate-950 hover:text-white'>×</button>
            </header>
            {detailedAnalytics ? (
              <ScopeControls
                analytics={scopedAnalytics}
                mode={scopeMode}
                scopeId={scopeId}
                wordbooks={wordbooks}
                onChange={selectScope}
                loading={scopeLoadState === 'loading'}
                error={scopeLoadState === 'error' ? '词表读取失败，请重试或重新选择范围。' : ''}
              />
            ) : null}
            <div className='flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-5 md:px-7'>
              <section className='flex min-h-0 flex-1 flex-col'>
                {scopedAnalytics ? <CoverageView key={`${scopeMode}:${scopeId}`} analytics={scopedAnalytics} onMasteryChange={updateMastery} /> : <DetailLoadingView state={detailLoadState === 'error' || scopeLoadState === 'error' ? 'error' : (detailLoadState === 'loading' || scopeLoadState === 'loading' ? 'loading' : 'idle')} onRetry={() => scopeMode !== 'all' && detailedAnalytics ? setScopeRetry(current => current + 1) : void loadDetails().catch(() => undefined)} />}
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
