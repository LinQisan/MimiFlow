'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import CustomSelect from '@/components/ui/CustomSelect'
import type {
  ExamHubPaperSummary,
  PracticePerformanceGroup,
} from '@/lib/repositories/exam'

const formatDuration = (milliseconds: number | null) => {
  if (milliseconds === null) return '—'
  const seconds = Math.max(0, Math.round(milliseconds / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return remainingSeconds > 0
    ? `${minutes} 分 ${remainingSeconds} 秒`
    : `${minutes} 分`
}

const formatLanguage = (language: string) => {
  const normalized = language.trim().toLowerCase()
  if (
    normalized === 'ja' ||
    normalized.startsWith('ja-') ||
    normalized === 'japanese'
  ) return '日语'
  if (
    normalized === 'en' ||
    normalized.startsWith('en-') ||
    normalized === 'english'
  ) return '英语'
  if (normalized === 'zh' || normalized.startsWith('zh-')) return '中文'
  return language
}

export default function PerformanceStatsDialog({
  groups,
  averageAccuracy,
  papers,
  initialOpen = false,
  hideTrigger = false,
  onDismiss,
}: {
  groups: PracticePerformanceGroup[]
  averageAccuracy: number | null
  papers: ExamHubPaperSummary[]
  initialOpen?: boolean
  hideTrigger?: boolean
  onDismiss?: () => void
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [resetState, setResetState] = useState<'idle' | 'resetting' | 'error'>(
    'idle',
  )
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false)
  const [activeGroupKey, setActiveGroupKey] = useState(groups[0]?.key || '')
  const [resetScope, setResetScope] = useState<'all' | 'language' | 'paper'>(
    'all',
  )
  const languageTargets = useMemo(
    () =>
      Array.from(
        new Set(
          papers
            .map(paper => (paper.language || '').trim())
            .filter(Boolean),
        ),
      ),
    [papers],
  )
  const [resetLanguage, setResetLanguage] = useState(
    languageTargets[0] || '',
  )
  const [resetPaperId, setResetPaperId] = useState(papers[0]?.id || '')
  const closeDialog = useCallback(() => {
    setIsOpen(false)
    onDismiss?.()
  }, [onDismiss])
  const activeGroup =
    groups.find(group => group.key === activeGroupKey) || groups[0]
  const categories = useMemo(() => {
    if (!activeGroup) return []
    return Array.from(
      activeGroup.questionTypes.reduce<
        Map<string, typeof activeGroup.questionTypes>
      >((index, item) => {
        const rows = index.get(item.category) || []
        rows.push(item)
        index.set(item.category, rows)
        return index
      }, new Map()),
    ).map(([title, rows]) => ({ title, rows }))
  }, [activeGroup])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isResetConfirmOpen) {
        setIsResetConfirmOpen(false)
        return
      }
      closeDialog()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDialog, isOpen, isResetConfirmOpen])

  const handleReset = async () => {
    setResetState('resetting')
    try {
      const response = await fetch('/api/quiz-attempts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: resetScope,
          language: resetScope === 'language' ? resetLanguage : undefined,
          paperId: resetScope === 'paper' ? resetPaperId : undefined,
        }),
      })
      const result = (await response.json()) as { success?: boolean }
      if (!response.ok || !result.success) {
        setResetState('error')
        return
      }
      closeDialog()
      setIsResetConfirmOpen(false)
      setResetState('idle')
      router.refresh()
    } catch {
      setResetState('error')
    }
  }

  const selectedPaper = papers.find(paper => paper.id === resetPaperId)
  const resetTargetLabel =
    resetScope === 'language'
      ? formatLanguage(resetLanguage)
      : resetScope === 'paper'
        ? selectedPaper?.name || '这套试卷'
        : '全部统计'

  return (
    <>
      {!hideTrigger ? (
        <button
          type='button'
          aria-haspopup='dialog'
          aria-expanded={isOpen}
          onClick={() => setIsOpen(true)}
          disabled={groups.length === 0}
          className='group mt-1 inline-flex items-baseline gap-2 text-left disabled:cursor-default'>
          <span className='text-xl font-semibold tabular-nums text-slate-950'>
            {averageAccuracy !== null ? `${averageAccuracy}%` : '—'}
          </span>
          {groups.length > 0 ? (
            <span className='text-[11px] font-semibold text-slate-400 transition group-hover:text-slate-700'>
              查看详情
            </span>
          ) : null}
        </button>
      ) : null}

      {isOpen ? (
        <div className='fixed inset-0 z-[100]'>
          <button
            type='button'
            aria-label='关闭统计窗口'
            onClick={closeDialog}
            className='absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]'
          />
          <section
            role='dialog'
            aria-modal='true'
            aria-labelledby='performance-dialog-title'
            className='absolute inset-x-3 top-1/2 mx-auto flex max-h-[min(80vh,46rem)] max-w-4xl -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-[#f8f7f3] shadow-2xl sm:inset-x-6'>
            <header className='flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 md:px-6'>
              <div>
                <h2
                  id='performance-dialog-title'
                  className='text-lg font-bold tracking-tight text-slate-950'>
                  题型表现
                </h2>
                <p className='mt-1 text-xs text-slate-500'>
                  正确率按作答次数统计；平均用时不计入未记录时长的作答。
                </p>
              </div>
              <button
                type='button'
                onClick={closeDialog}
                className='px-2 py-1 text-sm font-semibold text-slate-500 hover:text-slate-950'>
                关闭
              </button>
            </header>

            {activeGroup ? (
              <div className='min-h-0 overflow-y-auto px-5 py-5 md:px-6'>
                <div className='grid gap-4 border-b border-slate-200 pb-5 sm:grid-cols-[minmax(12rem,1fr)_repeat(3,auto)] sm:items-end'>
                  <label className='text-xs font-semibold text-slate-500'>
                    {activeGroup.level ? '语言与等级' : '语言'}
                    <CustomSelect
                      aria-label='统计语言与等级'
                      value={activeGroup.key}
                      onChange={event => setActiveGroupKey(event.target.value)}
                      className='mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none'>
                      {groups.map(group => (
                        <option key={group.key} value={group.key}>
                          {formatLanguage(group.language)}
                          {group.level ? ` · ${group.level}` : ''}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                  <div>
                    <p className='text-[11px] font-semibold text-slate-400'>作答</p>
                    <p className='mt-1 font-bold tabular-nums text-slate-950'>
                      {activeGroup.attemptCount}
                    </p>
                  </div>
                  <div>
                    <p className='text-[11px] font-semibold text-slate-400'>正确率</p>
                    <p className='mt-1 font-bold tabular-nums text-slate-950'>
                      {activeGroup.accuracyPct}%
                    </p>
                  </div>
                  <div>
                    <p className='text-[11px] font-semibold text-slate-400'>平均用时</p>
                    <p className='mt-1 font-bold tabular-nums text-slate-950'>
                      {formatDuration(activeGroup.averageTimeMs)}
                    </p>
                  </div>
                </div>

                <div className='mt-2'>
                  {categories.map(category => (
                    <section key={category.title} className='py-4'>
                      <h3 className='mb-2 text-xs font-bold tracking-wide text-slate-500'>
                        {category.title}
                      </h3>
                      <div className='border-y border-slate-200'>
                        {category.rows.map(row => (
                          <div
                            key={row.key}
                            className='grid grid-cols-[minmax(0,1fr)_4.5rem_5rem] items-center gap-3 border-b border-slate-200 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_5rem_6rem_7rem]'>
                            <div className='min-w-0'>
                              <p className='truncate text-sm font-semibold text-slate-900'>
                                {row.label}
                              </p>
                              <p className='mt-0.5 text-[11px] text-slate-400 md:hidden'>
                                {row.attemptCount} 次作答
                              </p>
                            </div>
                            <span className='hidden text-right text-xs tabular-nums text-slate-500 md:block'>
                              {row.attemptCount} 次
                            </span>
                            <span className='text-right text-sm font-bold tabular-nums text-slate-900'>
                              {row.accuracyPct}%
                            </span>
                            <span className='text-right text-xs font-semibold tabular-nums text-slate-500'>
                              {formatDuration(row.averageTimeMs)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : (
              <p className='px-6 py-12 text-center text-sm text-slate-500'>
                暂无练习记录
              </p>
            )}
            <footer className='relative border-t border-slate-200 px-5 py-4 md:px-6'>
              {isResetConfirmOpen ? (
                <div
                  role='alertdialog'
                  aria-modal='false'
                  aria-labelledby='reset-confirm-title'
                  className='absolute bottom-[calc(100%-0.5rem)] right-5 z-10 w-[min(20rem,calc(100%-2.5rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl md:right-6'>
                  <p
                    id='reset-confirm-title'
                    className='truncate text-sm font-semibold text-slate-900'>
                    重置“{resetTargetLabel}”？
                  </p>
                  <p className='mt-1 text-xs text-slate-400'>仅清除统计记录。</p>
                  <div className='mt-3 flex justify-end gap-2'>
                    <button
                      type='button'
                      onClick={() => setIsResetConfirmOpen(false)}
                      className='rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100'>
                      取消
                    </button>
                    <button
                      type='button'
                      onClick={() => void handleReset()}
                      disabled={resetState === 'resetting'}
                      className='rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50'>
                      {resetState === 'resetting' ? '重置中' : '确认重置'}
                    </button>
                  </div>
                </div>
              ) : null}
              <div className='grid gap-3 sm:grid-cols-[10rem_minmax(12rem,1fr)_auto] sm:items-end'>
                <label className='text-[11px] font-semibold text-slate-500'>
                  重置范围
                  <CustomSelect
                    aria-label='重置统计范围'
                    value={resetScope}
                    onChange={event => {
                      const nextScope = event.currentTarget.value as
                        | 'all'
                        | 'language'
                        | 'paper'
                      setResetScope(nextScope)
                      if (
                        nextScope === 'language' &&
                        activeGroup &&
                        languageTargets.includes(activeGroup.language)
                      ) {
                        setResetLanguage(activeGroup.language)
                      }
                    }}
                    className='mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none'>
                    <option value='all'>全部</option>
                    <option value='language'>按语言</option>
                    <option value='paper'>按试卷</option>
                  </CustomSelect>
                </label>
                {resetScope === 'language' ? (
                  <label className='text-[11px] font-semibold text-slate-500'>
                    语言
                    <CustomSelect
                      aria-label='要重置的语言'
                      value={resetLanguage}
                      onChange={event => setResetLanguage(event.target.value)}
                      className='mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none'>
                      {languageTargets.map(item => (
                        <option key={item} value={item}>
                          {formatLanguage(item)}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                ) : resetScope === 'paper' ? (
                  <label className='text-[11px] font-semibold text-slate-500'>
                    试卷
                    <CustomSelect
                      aria-label='要重置的试卷'
                      value={resetPaperId}
                      onChange={event => setResetPaperId(event.target.value)}
                      className='mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none'>
                      {papers.map(paper => (
                        <option key={paper.id} value={paper.id}>
                          {paper.name}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                ) : (
                  <p className='pb-2 text-[11px] text-slate-400'>
                    所有统计
                  </p>
                )}
                <button
                  type='button'
                  onClick={() => {
                    setResetState('idle')
                    setIsResetConfirmOpen(true)
                  }}
                  disabled={resetState === 'resetting'}
                  className='shrink-0 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-wait disabled:opacity-50'>
                  {resetState === 'resetting' ? '重置中' : '重置统计'}
                </button>
              </div>
              {resetState === 'error' ? (
                <span className='sr-only' role='alert'>
                  重置失败，请稍后重试
                </span>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
    </>
  )
}
