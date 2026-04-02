'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  getDueRetryQuestions,
  getRetryQueueSummary,
  submitRetryAnswer,
  type RetryQueueItem,
} from '@/app/actions/retry'
import { useDialog } from '@/context/DialogContext'

export default function RetryPage() {
  const dialog = useDialog()
  const [queue, setQueue] = useState<RetryQueueItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [summary, setSummary] = useState<{
    dueCount: number
    totalCount: number
    nextDueAt: Date | null
  }>({
    dueCount: 0,
    totalCount: 0,
    nextDueAt: null,
  })
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [revealedCorrectId, setRevealedCorrectId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchAll = async () => {
    setIsLoading(true)
    const [nextQueue, nextSummary] = await Promise.all([
      getDueRetryQuestions(30),
      getRetryQueueSummary(),
    ])
    setQueue(nextQueue)
    setSummary(nextSummary)
    setCurrentIndex(0)
    setSelectedOptionId(null)
    setRevealedCorrectId(null)
    setIsLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const current = queue[currentIndex]
  const progressText = useMemo(() => {
    if (queue.length === 0) return '0 / 0'
    return `${currentIndex + 1} / ${queue.length}`
  }, [currentIndex, queue.length])

  const onSubmit = async () => {
    if (!current || !selectedOptionId || isSubmitting) return
    setIsSubmitting(true)
    const res = await submitRetryAnswer(current.retryId, selectedOptionId)
    setIsSubmitting(false)
    if (!res.success) {
      dialog.toast(res.message || '提交失败', { tone: 'error' })
      return
    }

    setRevealedCorrectId(res.correctOptionId || null)
    if (res.isCorrect) {
      if (res.done) {
        dialog.toast('本题已完成 24h/72h/7d 回流闭环', { tone: 'success' })
      } else {
        dialog.toast(`答对了，下一轮在 ${res.nextInHours} 小时后`, {
          tone: 'success',
        })
      }
    } else {
      dialog.toast(`答错了，已重置为 24 小时后回流`, { tone: 'info' })
    }

    setTimeout(() => {
      const nextQueue = queue.filter(item => item.retryId !== current.retryId)
      setQueue(nextQueue)
      setSelectedOptionId(null)
      setRevealedCorrectId(null)
      if (currentIndex >= nextQueue.length) {
        setCurrentIndex(Math.max(0, nextQueue.length - 1))
      }
    }, 350)
  }

  if (isLoading) {
    return (
      <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
        <div className='mx-auto max-w-4xl border-b border-gray-200 py-14 text-center text-sm text-gray-500'>
          正在加载错题回流队列...
        </div>
      </main>
    )
  }

  if (!current) {
    return (
      <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
        <div className='mx-auto max-w-4xl border-b border-gray-200 py-12 text-center'>
          <h1 className='text-2xl font-black text-gray-900'>错题回流</h1>
          <p className='mt-2 text-sm text-gray-500'>
            当前没有到期错题。系统会按 24h / 72h / 7d 自动回流。
          </p>
          <div className='mt-4 flex flex-wrap items-center justify-center gap-2'>
            <span className='ui-tag ui-tag-muted'>队列总数 {summary.totalCount}</span>
            <span className='ui-tag ui-tag-info'>已到期 {summary.dueCount}</span>
          </div>
          <div className='mt-6 flex items-center justify-center gap-2'>
            <Link
              href='/today'
              className='ui-btn ui-btn-sm'>
              返回今日任务
            </Link>
            <Link
              href='/quizzes'
              className='ui-btn ui-btn-sm ui-btn-primary'>
              去做题
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
      <div className='mx-auto max-w-4xl'>
        <section className='border-b border-gray-200 pb-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h1 className='text-2xl font-black text-gray-900 md:text-3xl'>
              错题回流复习
            </h1>
            <div className='flex items-center gap-2'>
              <span className='ui-tag ui-tag-info'>进度 {progressText}</span>
              <span className='ui-tag ui-tag-warn'>
                第 {current.stage + 1} 轮
              </span>
            </div>
          </div>
          <p className='mt-2 text-sm text-gray-500'>
            来源：{current.sourceTitle} · 规则：答对进入下一轮（24h→72h→7d），答错回到 24h。
          </p>
        </section>

        <section className='mt-4 border-b border-gray-200 bg-white px-3 py-4 md:px-4'>
          {current.prompt ? (
            <p className='text-lg font-semibold text-gray-900 md:text-xl'>
              {current.prompt}
            </p>
          ) : null}
          <p className='mt-2 text-base text-gray-700 md:text-lg'>{current.contextSentence}</p>

          <div className='mt-4 space-y-2'>
            {current.options.map((option, index) => {
              const selected = selectedOptionId === option.id
              const isCorrect = revealedCorrectId === option.id
              return (
                <button
                  key={option.id}
                  type='button'
                  disabled={isSubmitting}
                  onClick={() => setSelectedOptionId(option.id)}
                  className={`flex w-full items-center gap-3 border-l-2 px-2 py-3 text-left transition ${
                    isCorrect
                      ? 'border-l-emerald-500 bg-emerald-50/50 text-emerald-800'
                      : selected
                        ? 'border-l-indigo-500 bg-indigo-50/50 text-indigo-900'
                        : 'border-l-transparent hover:bg-gray-50'
                  }`}>
                  <span className='text-lg font-black text-gray-400'>
                    {String.fromCharCode(65 + index)}.
                  </span>
                  <span className='text-base font-semibold text-gray-800'>
                    {option.text}
                  </span>
                </button>
              )
            })}
          </div>

          <div className='mt-4 flex flex-wrap items-center justify-between gap-2'>
            <Link
              href={current.sourceUrl}
              className='ui-btn ui-btn-sm'>
              查看来源
            </Link>
            <button
              type='button'
              onClick={onSubmit}
              disabled={!selectedOptionId || isSubmitting}
              className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
              {isSubmitting ? '提交中...' : '提交并进入下一题'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
