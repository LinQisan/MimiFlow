'use client'

import dynamic from 'next/dynamic'
import { useCallback, useRef, useState } from 'react'

import type {
  ExamHubPaperSummary,
  PracticePerformanceGroup,
} from '@/lib/repositories/exam'
import type {
  PracticeVocabularyAnalyticsSummary,
  PracticeVocabularyAnalyticsWordsResponse,
} from '@/features/practice/domain/vocabulary-analytics'

const PerformanceStatsDialog = dynamic(
  () => import('@/features/practice/ui/PerformanceStatsDialog'),
)
const PracticeVocabularyAnalyticsDialog = dynamic(
  () => import('@/features/practice/ui/PracticeVocabularyAnalyticsDialog'),
)

type LoadState = 'idle' | 'loading' | 'error'

export function PerformanceStatsLauncher({
  averageAccuracy,
  papers,
}: {
  averageAccuracy: number | null
  papers: ExamHubPaperSummary[]
}) {
  const [groups, setGroups] = useState<PracticePerformanceGroup[] | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('idle')

  const openDialog = async () => {
    setLoadState('loading')
    try {
      const response = await fetch('/api/practice/performance', {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('request failed')
      const data = (await response.json()) as PracticePerformanceGroup[]
      setGroups(data)
      setLoadState('idle')
    } catch {
      setLoadState('error')
    }
  }

  return (
    <>
      <button
        type='button'
        aria-haspopup='dialog'
        aria-expanded={groups !== null}
        onClick={() => void openDialog()}
        disabled={averageAccuracy === null || loadState === 'loading'}
        className='group mt-1 inline-flex items-baseline gap-2 text-left disabled:cursor-default'>
        <span className='text-xl font-semibold tabular-nums text-slate-950'>
          {averageAccuracy !== null ? `${averageAccuracy}%` : '—'}
        </span>
        {averageAccuracy !== null ? (
          <span className='text-[11px] font-semibold text-slate-400 transition group-hover:text-slate-700'>
            {loadState === 'loading'
              ? '加载中'
              : loadState === 'error'
                ? '重试'
                : '查看详情'}
          </span>
        ) : null}
      </button>

      {groups !== null ? (
        <PerformanceStatsDialog
          groups={groups}
          averageAccuracy={averageAccuracy}
          papers={papers}
          initialOpen
          hideTrigger
          onDismiss={() => setGroups(null)}
        />
      ) : null}
    </>
  )
}

export function VocabularyAnalyticsLauncher({
  disabled = false,
}: {
  disabled?: boolean
}) {
  const [summary, setSummary] =
    useState<PracticeVocabularyAnalyticsSummary | null>(null)
  const [wordsData, setWordsData] =
    useState<PracticeVocabularyAnalyticsWordsResponse | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const summaryRequestRef = useRef<
    Promise<PracticeVocabularyAnalyticsSummary> | null
  >(null)
  const wordsRequestRef = useRef<
    Promise<PracticeVocabularyAnalyticsWordsResponse> | null
  >(null)

  const loadSummary = useCallback(() => {
    if (summary) return Promise.resolve(summary)
    if (summaryRequestRef.current) return summaryRequestRef.current

    setLoadState('loading')
    const request = fetch('/api/practice/vocabulary-analytics', {
      cache: 'no-store',
    }).then(
      async response => {
        if (!response.ok) throw new Error('request failed')
        return (await response.json()) as PracticeVocabularyAnalyticsSummary
      },
    )
    summaryRequestRef.current = request
      .then(data => {
        setSummary(data)
        setLoadState('idle')
        return data
      })
      .catch(error => {
        summaryRequestRef.current = null
        setLoadState('error')
        throw error
      })
    return summaryRequestRef.current
  }, [summary])

  const loadWords = useCallback(() => {
    if (wordsData) return Promise.resolve(wordsData)
    if (wordsRequestRef.current) return wordsRequestRef.current

    const request = fetch(
      '/api/practice/vocabulary-analytics/words?all=true',
      { cache: 'no-store' },
    ).then(async response => {
      if (!response.ok) throw new Error('request failed')
      return (await response.json()) as PracticeVocabularyAnalyticsWordsResponse
    })
    wordsRequestRef.current = request
      .then(data => {
        setWordsData(data)
        return data
      })
      .catch(error => {
        wordsRequestRef.current = null
        throw error
      })
    return wordsRequestRef.current
  }, [wordsData])

  const prefetchAnalytics = useCallback(() => {
    if (disabled || summary || summaryRequestRef.current) return
    void import('@/features/practice/ui/PracticeVocabularyAnalyticsDialog')
    void loadSummary().catch(() => undefined)
  }, [disabled, loadSummary, summary])

  const openDialog = async () => {
    if (summary) {
      setIsDialogOpen(true)
      return
    }
    try {
      await loadSummary()
      setIsDialogOpen(true)
    } catch {
      // The retry state is rendered on the launcher button.
    }
  }

  return (
    <>
      <button
        type='button'
        aria-haspopup='dialog'
        aria-expanded={isDialogOpen}
        onClick={() => void openDialog()}
        onPointerEnter={prefetchAnalytics}
        onFocus={prefetchAnalytics}
        disabled={disabled}
        className='inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 transition hover:border-slate-500 disabled:opacity-40 lg:w-auto'>
        {loadState === 'loading'
          ? '分析中…'
          : loadState === 'error'
            ? '加载失败，重试'
            : '词汇分析'}
      </button>

      {summary !== null && isDialogOpen ? (
        <PracticeVocabularyAnalyticsDialog
          summary={summary}
          initialWords={wordsData?.words}
          initialWordbooks={wordsData?.wordbooks}
          initialOpen
          hideTrigger
          onDismiss={() => setIsDialogOpen(false)}
          onLoadWords={loadWords}
          onWordMasteryChange={(word, mastered) =>
            setWordsData(current =>
              current
                ? {
                    ...current,
                    words: current.words.map(row =>
                      row.word === word
                        ? { ...row, isMastered: mastered }
                        : row,
                    ),
                  }
                : current,
            )
          }
        />
      ) : null}
    </>
  )
}
