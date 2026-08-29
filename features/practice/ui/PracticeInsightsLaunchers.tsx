'use client'

import dynamic from 'next/dynamic'
import { useCallback, useRef, useState } from 'react'

import type {
  ExamHubPaperSummary,
  PracticePerformanceGroup,
} from '@/lib/repositories/exam'
import type { PracticeVocabularyAnalytics } from '@/features/practice/domain/vocabulary-analytics'

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
  const [analytics, setAnalytics] =
    useState<PracticeVocabularyAnalytics | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const requestRef = useRef<Promise<PracticeVocabularyAnalytics> | null>(null)

  const loadAnalytics = useCallback(() => {
    if (analytics) return Promise.resolve(analytics)
    if (requestRef.current) return requestRef.current

    setLoadState('loading')
    requestRef.current = fetch('/api/practice/vocabulary-analytics').then(
      async response => {
        if (!response.ok) throw new Error('request failed')
        return (await response.json()) as PracticeVocabularyAnalytics
      },
    )
    requestRef.current = requestRef.current
      .then(data => {
        setAnalytics(data)
        setLoadState('idle')
        return data
      })
      .catch(error => {
        requestRef.current = null
        setLoadState('error')
        throw error
      })
    return requestRef.current
  }, [analytics])

  const prefetchAnalytics = useCallback(() => {
    if (disabled || analytics || requestRef.current) return
    void import('@/features/practice/ui/PracticeVocabularyAnalyticsDialog')
    void loadAnalytics().catch(() => undefined)
  }, [analytics, disabled, loadAnalytics])

  const openDialog = async () => {
    if (analytics) {
      setIsDialogOpen(true)
      return
    }
    try {
      await loadAnalytics()
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

      {analytics !== null && isDialogOpen ? (
        <PracticeVocabularyAnalyticsDialog
          analytics={analytics}
          initialOpen
          hideTrigger
          onDismiss={() => setIsDialogOpen(false)}
          onWordMasteryChange={(word, mastered) =>
            setAnalytics(current =>
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
