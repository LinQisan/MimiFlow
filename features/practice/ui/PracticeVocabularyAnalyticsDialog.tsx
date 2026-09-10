'use client'

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { mergeVocabularyScope, resolveVocabularyScopeIds } from '@/modules/practice/domain/vocabulary-scope'

import CustomSelect from '@/components/ui/CustomSelect'
import type {
  PracticeVocabularyAnalytics,
  PracticeVocabularyAnalyticsSummary,
  PracticeVocabularyAnalyticsWordsResponse,
  PracticeVocabularyCategory,
  PracticeVocabularyWordInsight,
  PracticeVocabularyWordbookEntry,
  PracticeVocabularyWordbookOption,
} from '@/features/practice/domain/vocabulary-analytics'
import {
  normalizePracticeVocabularyWord,
  PRACTICE_VOCABULARY_CATEGORY_OPTIONS,
} from '@/features/practice/domain/vocabulary-analytics'

type ScopeMode = 'all' | 'series' | 'wordbook'
type SortMode = 'coverage' | 'frequency' | 'tested' | 'alphabetical'
type MasteryFilter = 'all' | 'unmastered' | 'mastered'

const PAGE_SIZE = 50

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

function ScopeControls({
  mode,
  scopeId,
  wordbooks,
  seriesOptions,
  onModeChange,
  onScopeChange,
  loading,
  error,
}: {
  mode: ScopeMode
  scopeId: string
  wordbooks: PracticeVocabularyWordbookOption[]
  seriesOptions: Array<{ id: string; title: string; count: number }>
  onModeChange: (mode: ScopeMode) => void
  onScopeChange: (id: string) => void
  loading: boolean
  error: string
}) {
  return (
    <div className='border-b border-slate-200 bg-white/70 px-4 py-3 sm:px-5 md:px-7'>
      <div className='flex flex-wrap items-end gap-3'>
        <label className='text-xs font-semibold text-slate-500'>
          分析范围
          <CustomSelect
            aria-label='选择分析范围'
            value={mode}
            onChange={event => onModeChange(event.currentTarget.value as ScopeMode)}
            className='mt-1.5 h-10 min-w-44 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400'>
            <option value='all'>全部试卷词汇</option>
            <option value='series'>整本书</option>
            <option value='wordbook'>单个词表</option>
          </CustomSelect>
        </label>
        {mode === 'series' ? (
          <label className='w-full sm:w-auto sm:min-w-56 text-xs font-semibold text-slate-500'>
            选择书本
            <CustomSelect
              aria-label='选择书本'
              value={scopeId}
              onChange={event => onScopeChange(event.currentTarget.value)}
              className='mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400'>
              {seriesOptions.map(option => (
                <option key={option.id} value={option.id}>{option.title} · {option.count} 个词表</option>
              ))}
            </CustomSelect>
          </label>
        ) : null}
        {mode === 'wordbook' ? (
          <label className='w-full sm:w-auto sm:min-w-64 text-xs font-semibold text-slate-500'>
            选择词表
            <CustomSelect
              aria-label='选择词表'
              value={scopeId}
              onChange={event => onScopeChange(event.currentTarget.value)}
              className='mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-slate-400'>
              {wordbooks.map(option => (
                <option key={option.id} value={option.id}>{option.pathLabel}</option>
              ))}
            </CustomSelect>
          </label>
        ) : null}
        <p className={`pb-2 text-xs tabular-nums ${error ? 'font-semibold text-rose-600' : 'text-slate-500'}`} role={error ? 'alert' : undefined}>
          {error || (loading ? '正在读取词表内容…' : mode === 'all' ? '试卷中出现过的词汇' : '包含词表中未出现在试卷的词')}
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warn' }) {
  const valueClass = tone === 'success' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-950'
  return (
    <div className='border-t border-slate-200 pt-2.5'>
      <p className='text-[11px] font-semibold text-slate-400'>{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}

function ScopeStats({ analytics, loading }: { analytics: PracticeVocabularyAnalytics | null; loading: boolean }) {
  if (!analytics) {
    return <p className='text-xs text-slate-500'>{loading ? '正在计算当前范围…' : '打开词汇列表后显示当前范围统计。'}</p>
  }
  const matched = analytics.words.filter(row => row.count > 0).length
  const absent = analytics.words.length - matched
  const mastered = analytics.words.filter(row => row.isMastered).length
  return (
    <div className='grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4'>
      <Stat label='范围词汇' value={`${analytics.words.length} 个`} />
      <Stat label='试卷中有匹配' value={`${matched} 个`} />
      <Stat label='试卷中未出现' value={`${absent} 个`} tone={absent > 0 ? 'warn' : 'default'} />
      <Stat label='已标记熟练' value={`${mastered} 个`} tone={mastered > 0 ? 'success' : 'default'} />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-[10px] font-semibold text-slate-400'>{label}</p>
      <p className='mt-1 text-sm font-bold tabular-nums text-slate-800'>{value}</p>
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
  const [sortMode, setSortMode] = useState<SortMode>('coverage')
  const [posFilter, setPosFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | PracticeVocabularyCategory>('all')
  const [occurrenceFilter, setOccurrenceFilter] = useState('all')
  const [masteryFilter, setMasteryFilter] = useState<MasteryFilter>('unmastered')
  const [pendingWords, setPendingWords] = useState<Set<string>>(() => new Set())
  const [preferenceError, setPreferenceError] = useState('')
  const [page, setPage] = useState(1)
  const deferredQuery = useDeferredValue(query)

  const posOptions = useMemo(
    () => Array.from(new Set(analytics.words.map(row => row.partOfSpeech.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'ja')),
    [analytics.words],
  )
  const sortedWords = useMemo(() => [...analytics.words].sort((left, right) => {
    if (sortMode === 'frequency') return right.count - left.count || right.paperCount - left.paperCount || left.word.localeCompare(right.word, 'ja')
    if (sortMode === 'tested') return right.targetCount - left.targetCount || right.count - left.count || left.word.localeCompare(right.word, 'ja')
    if (sortMode === 'alphabetical') return left.word.localeCompare(right.word, 'ja')
    return right.coverageRate - left.coverageRate || right.paperCount - left.paperCount || right.count - left.count || left.word.localeCompare(right.word, 'ja')
  }), [analytics.words, sortMode])
  const filteredRows = useMemo(() => {
    const keyword = deferredQuery.normalize('NFKC').trim().toLocaleLowerCase('ja')
    return sortedWords.filter(row => {
      const haystack = normalizePracticeVocabularyWord(`${row.word} ${row.reading} ${row.partOfSpeech}`)
      const matchesQuery = !keyword || haystack.includes(keyword)
      const matchesPos = posFilter === 'all' || row.partOfSpeech.trim() === posFilter
      const matchesCategory = categoryFilter === 'all' || row.categoryCounts[categoryFilter] > 0
      const matchesMastery = masteryFilter === 'all' || (masteryFilter === 'mastered' ? row.isMastered : !row.isMastered)
      const matchesOccurrence = occurrenceFilter === 'all' || (occurrenceFilter === 'matched' ? row.count > 0 : row.count === 0)
      return matchesQuery && matchesPos && matchesCategory && matchesMastery && matchesOccurrence
    })
  }, [categoryFilter, deferredQuery, masteryFilter, posFilter, sortedWords, occurrenceFilter])
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const normalizedPage = Math.min(page, totalPages)
  const visibleRows = filteredRows.slice((normalizedPage - 1) * PAGE_SIZE, normalizedPage * PAGE_SIZE)

  useEffect(() => setPage(1), [categoryFilter, deferredQuery, masteryFilter, posFilter, sortMode, occurrenceFilter])

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
      <div className='flex flex-col gap-3 border-b border-slate-200 pb-4 xl:flex-row xl:items-end xl:justify-between'>
        <label className='text-xs font-semibold text-slate-500 lg:w-72'>
          搜索词汇
          <input
            type='search'
            value={query}
            onChange={event => setQuery(event.currentTarget.value)}
            placeholder='例如：取り組む'
            aria-label='搜索词汇、读音或词性'
            className='mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-base outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:text-sm'
          />
        </label>
        <div className='flex flex-wrap items-end gap-2'>
          <label className='text-xs font-semibold text-slate-500'>
            词性
            <CustomSelect aria-label='按词性筛选' value={posFilter} onChange={event => setPosFilter(event.currentTarget.value)} className='mt-1.5 h-10 min-w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400'>
              <option value='all'>全部词性</option>
              {posOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </CustomSelect>
          </label>
          <label className='text-xs font-semibold text-slate-500'>
            题型
            <CustomSelect aria-label='按题型筛选' value={categoryFilter} onChange={event => setCategoryFilter(event.currentTarget.value as 'all' | PracticeVocabularyCategory)} className='mt-1.5 h-10 min-w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400'>
              <option value='all'>全部题型</option>
              {PRACTICE_VOCABULARY_CATEGORY_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
            </CustomSelect>
          </label>
          <label className='text-xs font-semibold text-slate-500'>
            排序
            <CustomSelect aria-label='选择词汇排序' value={sortMode} onChange={event => setSortMode(event.currentTarget.value as SortMode)} className='mt-1.5 h-10 min-w-28 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400'>
              <option value='coverage'>试卷覆盖</option>
              <option value='frequency'>出现单元数</option>
              <option value='tested'>考点单元数</option>
              <option value='alphabetical'>词语顺序</option>
            </CustomSelect>
          </label>
          <label className='text-xs font-semibold text-slate-500'>
            熟练状态
            <CustomSelect aria-label='按熟练状态筛选' value={masteryFilter} onChange={event => setMasteryFilter(event.currentTarget.value as MasteryFilter)} className='mt-1.5 h-10 min-w-28 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400'>
              <option value='unmastered'>待复习</option>
              <option value='mastered'>已熟练</option>
              <option value='all'>全部状态</option>
            </CustomSelect>
          </label>
          <label className='text-xs font-semibold text-slate-500'>
            试卷匹配
            <CustomSelect aria-label='按试卷匹配筛选' value={occurrenceFilter} onChange={event => setOccurrenceFilter(event.currentTarget.value)} className='mt-1.5 h-10 min-w-28 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700'>
              <option value='all'>全部词汇</option>
              <option value='matched'>试卷中出现</option>
              <option value='absent'>尚未出现</option>
            </CustomSelect>
          </label>
          <p className='pb-2 text-xs tabular-nums text-slate-500'>{filteredRows.length} 个词</p>
        </div>
      </div>
      {preferenceError ? <p role='alert' className='mt-3 text-xs font-semibold text-rose-600'>{preferenceError}</p> : null}
      <div className='mt-4 divide-y divide-slate-200 border-y border-slate-200'>
        {visibleRows.map(row => (
          <div key={normalizePracticeVocabularyWord(row.word)} className='grid grid-cols-2 gap-3 py-3.5 sm:grid-cols-[minmax(10rem,1fr)_repeat(4,minmax(5rem,auto))_auto] sm:items-center'>
            <div className='col-span-2 sm:col-span-1'>
              <div className='flex flex-wrap items-center gap-1.5'>
                <p className='font-word-ja font-bold text-slate-950' lang='ja'>{row.word}</p>
                {row.targetCount > 0 ? <span className='ui-tag ui-tag-warn'>考点</span> : null}
                {row.isMastered ? <span className='ui-tag ui-tag-success'>已熟练</span> : row.count === 0 ? <span className='ui-tag ui-tag-muted'>未出现在试卷</span> : null}
              </div>
              <p className='font-word-ja mt-0.5 text-xs text-slate-500' lang='ja'>{[row.reading, row.partOfSpeech].filter(Boolean).join(' · ') || '—'}</p>
            </div>
            <Metric label='出现单元数' value={`${row.count}`} />
            <Metric label='涉及试卷' value={`${row.paperCount} / ${analytics.totalPapers}`} />
            <Metric label='试卷覆盖率' value={`${row.coverageRate}%`} />
            <Metric label='考点单元数' value={`${row.targetCount}`} />
            <button type='button' disabled={pendingWords.has(row.word)} onClick={() => void updateMastery(row, !row.isMastered)} className='ui-btn ui-btn-sm whitespace-nowrap disabled:opacity-40'>
              {pendingWords.has(row.word) ? '保存中…' : row.isMastered ? '恢复待复习' : '标记熟练'}
            </button>
          </div>
        ))}
        {visibleRows.length === 0 ? <p className='py-12 text-center text-sm text-slate-500'>没有符合当前筛选条件的词汇。</p> : null}
      </div>
      <div className='mt-4 flex items-center justify-end gap-2'>
        <span className='text-xs text-slate-500'>第 {normalizedPage}/{totalPages} 页</span>
        <button type='button' disabled={normalizedPage <= 1} onClick={() => setPage(current => Math.max(1, current - 1))} className='ui-btn ui-btn-sm disabled:opacity-40'>上一页</button>
        <button type='button' disabled={normalizedPage >= totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))} className='ui-btn ui-btn-sm disabled:opacity-40'>下一页</button>
      </div>
      <p className='mt-3 text-[11px] text-slate-400'>“出现单元数”按试卷与题型组合计数；“考点单元数”统计被标注为考查词或从正确答案提取的词，同一单元内不重复计数。</p>
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
      const key = normalizePracticeVocabularyWord(row.word)
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
    const key = normalizePracticeVocabularyWord(word)
    setMasteryOverrides(current => ({ ...current, [key]: mastered }))
    setWords(current => current ? current.map(row => normalizePracticeVocabularyWord(row.word) === key ? { ...row, isMastered: mastered } : row) : current)
    onWordMasteryChange?.(word, mastered)
  }, [onWordMasteryChange])

  const selectMode = (mode: ScopeMode) => {
    startTransition(() => {
      setScopeMode(mode)
      if (mode === 'all') setScopeId('')
      else if (mode === 'series') setScopeId(seriesOptions[0]?.id || '')
      else setScopeId(wordbooks[0]?.id || '')
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
          <section ref={dialogRef} tabIndex={-1} role='dialog' aria-modal='true' aria-labelledby='practice-vocabulary-analytics-title' aria-describedby='practice-vocabulary-analytics-description' className='absolute inset-x-2 top-1/2 mx-auto flex max-h-[min(94vh,58rem)] max-w-6xl -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/70 bg-[#f8f7f3] shadow-2xl outline-none sm:inset-x-5'>
            <header className='flex items-start justify-between gap-4 border-b border-slate-200 px-5 pb-4 pt-5 md:px-7'>
              <div>
                <p className='text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400'>Practice vocabulary</p>
                <h2 id='practice-vocabulary-analytics-title' className='mt-1 text-xl font-bold tracking-tight text-slate-950'>试卷词汇分析</h2>
                <p id='practice-vocabulary-analytics-description' className='mt-1.5 max-w-2xl text-xs text-slate-500'>按当前范围查看试卷词汇覆盖，并标记需要继续复习的词。出现单元数按试卷与题型组合计数。</p>
              </div>
              <button ref={closeButtonRef} type='button' aria-label='关闭词汇分析' onClick={closeDialog} className='grid size-9 shrink-0 place-items-center rounded-full bg-white text-lg leading-none text-slate-400 transition hover:bg-slate-950 hover:text-white'>×</button>
            </header>
            {detailedAnalytics ? (
              <ScopeControls
                mode={scopeMode}
                scopeId={scopeId}
                wordbooks={wordbooks}
                seriesOptions={seriesOptions}
                onModeChange={selectMode}
                onScopeChange={setScopeId}
                loading={scopeLoadState === 'loading'}
                error={scopeLoadState === 'error' ? '词表读取失败，请重试或重新选择范围。' : ''}
              />
            ) : null}
            <div className='min-h-0 overflow-y-auto px-4 py-5 sm:px-5 md:px-7 md:py-6'>
              <section className='border-b border-slate-200 pb-5'>
                <div className='flex flex-wrap items-baseline justify-between gap-2'>
                  <h3 className='ui-section-head'>{scopeMode === 'all' ? '全部试卷词汇' : scopeMode === 'series' ? seriesOptions.find(option => option.id === scopeId)?.title || '整本书' : wordbooks.find(option => option.id === scopeId)?.pathLabel || '单个词表'}</h3>
                  <p className='ui-meta'>{summary.totalPapers} 套试卷 · 当前范围</p>
                </div>
                <div className='mt-4'><ScopeStats analytics={scopedAnalytics} loading={detailLoadState === 'loading' || scopeLoadState === 'loading'} /></div>
              </section>
              <section className='pt-5'>
                {scopedAnalytics ? <CoverageView key={`${scopeMode}:${scopeId}`} analytics={scopedAnalytics} onMasteryChange={updateMastery} /> : <DetailLoadingView state={detailLoadState === 'error' || scopeLoadState === 'error' ? 'error' : (detailLoadState === 'loading' || scopeLoadState === 'loading' ? 'loading' : 'idle')} onRetry={() => scopeMode !== 'all' && detailedAnalytics ? setScopeRetry(current => current + 1) : void loadDetails().catch(() => undefined)} />}
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
