'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { RetryQueueItem } from '@/app/actions/retry'
import {
  resetRetryQuestionAccuracy,
  submitRetryAnswer,
} from '@/app/actions/retry'
import { QuestionRenderer } from '@/components/exam/QuestionRenderer'
import type { ExamQuestion } from '@/components/exam/question-renderer/types'

type Summary = {
  dueCount: number
  totalCount: number
  nextDueAt: Date | string | null
}

type QueueItem = {
  retryId: string
}

const formatPercent = (value: number) => `${Math.round(value * 100)}%`

function formatDateTime(value: Date | string | null) {
  if (!value) return '无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function mapRetryItemToExamQuestion(item: RetryQueueItem): ExamQuestion {
  return {
    id: item.questionId,
    questionType: item.questionType,
    prompt: item.prompt,
    contextSentence: item.contextSentence,
    options: item.options,
    passageId: item.passageId,
    passage: item.passage,
    lessonId: item.lessonId,
    lesson: item.lesson,
  }
}

export default function ReviewQuestionClient({
  initialSummary,
  currentItem,
  queue,
  currentIndex,
}: {
  initialSummary: Summary
  currentItem: RetryQueueItem
  queue: QueueItem[]
  currentIndex: number
}) {
  const router = useRouter()
  const [item, setItem] = useState(currentItem)
  const [summary, setSummary] = useState(initialSummary)
  const [selectedOptionId, setSelectedOptionId] = useState<string>('')
  const [feedback, setFeedback] = useState<string>('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [resettingId, setResettingId] = useState<string | null>(null)

  const prevRetryId = currentIndex > 0 ? queue[currentIndex - 1]?.retryId : null
  const nextRetryId =
    currentIndex < queue.length - 1 ? queue[currentIndex + 1]?.retryId : null
  const examQuestion = useMemo(() => mapRetryItemToExamQuestion(item), [item])

  const handleSubmit = () => {
    if (!selectedOptionId) {
      setFeedback('请先选择一个选项。')
      return
    }
    if (isSubmitted) return

    startTransition(async () => {
      const result = await submitRetryAnswer(item.retryId, selectedOptionId)
      if (!result.success) {
        setFeedback(result.message || '提交失败。')
        return
      }

      setIsSubmitted(true)
      setSummary(prev => ({
        ...prev,
        dueCount: Math.max(0, prev.dueCount - 1),
        totalCount:
          result.done && result.isCorrect
            ? Math.max(0, prev.totalCount - 1)
            : prev.totalCount,
      }))

      const message = result.isCorrect
        ? result.done
          ? '阶段反馈：答对，已完成该错题回流。'
          : `阶段反馈：答对，已进入下一阶段（${result.nextInHours || 0}h 后）。`
        : `阶段反馈：答错，已重置阶段（${result.nextInHours || 24}h 后再试）。`
      setFeedback(message)
    })
  }

  const handleSoftReset = () => {
    if (resettingId) return

    setResettingId(item.retryId)
    startTransition(async () => {
      const result = await resetRetryQuestionAccuracy(item.questionId)
      if (!result.success) {
        setFeedback(result.message || '重置失败。')
        setResettingId(null)
        return
      }

      setItem(prev => ({
        ...prev,
        stats: result.stats ? { ...prev.stats, ...result.stats } : prev.stats,
      }))
      setFeedback(result.message || '已完成轻度重置。')
      setResettingId(null)
    })
  }

  return (
    <main className='min-h-screen bg-slate-50 pb-24'>
      <header className='sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-8'>
        <div className='mx-auto flex w-full max-w-7xl items-center justify-between gap-3'>
          <div>
            <h1 className='text-base font-black text-slate-900 md:text-lg'>错题回看</h1>
            <p className='text-xs text-slate-500'>
              第 {currentIndex + 1} / {queue.length} 题，到期 {summary.dueCount} 题
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <span className='rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700'>
              下一到期 {formatDateTime(summary.nextDueAt)}
            </span>
            <Link
              href='/'
              className='rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50'>
              首页
            </Link>
          </div>
        </div>
      </header>

      <div className='mx-auto w-full max-w-7xl space-y-4 px-4 py-4 md:px-8 md:py-6'>
        <section className='rounded-xl border border-slate-200 bg-white p-4'>
          <div className='mb-3 flex flex-wrap items-center gap-2 text-xs'>
            <span className='rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-600'>
              错题作答 {item.stats.attemptTotal} 次
            </span>
            <span className='rounded bg-red-50 px-2 py-0.5 font-semibold text-red-600'>
              阶段 {item.stage + 1}
            </span>
            <span className='rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700'>
              错误率徽章 {formatPercent(1 - item.stats.accuracy)}
            </span>
            <span className='rounded bg-blue-50 px-2 py-0.5 font-semibold text-blue-700'>
              优化后正确率 {formatPercent(item.stats.optimizedAccuracy)}
            </span>
            <span className='rounded bg-amber-50 px-2 py-0.5 font-semibold text-amber-700'>
              近期连对 {item.stats.recentStreak}
            </span>
          </div>

          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              disabled={isPending || isSubmitted}
              onClick={handleSubmit}
              className='rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60'>
              提交复盘
            </button>
            <button
              type='button'
              disabled={
                isPending || resettingId === item.retryId || !item.stats.resetEligible
              }
              onClick={handleSoftReset}
              className='rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-40'>
              轻度重置错误率
            </button>
            <span className='self-center text-[11px] text-slate-400'>
              满足条件后可轻度清理早期错误记录，逐步修复历史偏差。
            </span>
          </div>

          {feedback && <p className='mt-2 text-xs text-slate-500'>{feedback}</p>}
        </section>

        <QuestionRenderer
          question={examQuestion}
          onSelect={optionId => setSelectedOptionId(optionId)}
          currentAnswer={selectedOptionId}
          isSubmitted={isSubmitted}
          annotation={{
            showPronunciation: false,
            showMeaning: false,
            pronunciationMap: {},
            vocabularyMetaMap: {},
          }}
        />
      </div>

      <footer className='fixed bottom-0 z-40 w-full border-t border-slate-200/90 bg-white/95 p-4 backdrop-blur'>
        <div className='mx-auto flex w-full max-w-5xl items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2'>
          <button
            type='button'
            disabled={!prevRetryId || isPending}
            onClick={() => prevRetryId && router.push(`/review/${prevRetryId}`)}
            className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'>
            上一题
          </button>

          <div className='text-xs text-slate-500'>
            来源：{item.sourceTitle} · 历史错 {item.wrongCount}
          </div>

          {nextRetryId ? (
            <button
              type='button'
              onClick={() => router.push(`/review/${nextRetryId}`)}
              className='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'>
              下一题
            </button>
          ) : (
            <Link
              href='/review'
              className='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'>
              返回队列
            </Link>
          )}
        </div>
      </footer>
    </main>
  )
}
