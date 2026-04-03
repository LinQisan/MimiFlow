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

type RetryViewItem = RetryQueueItem & {
  questionType?: string | null
  sourceKind?: string | null
}

function getQuestionTypeMeta(item: RetryViewItem) {
  const type = item.questionType || ''

  switch (type) {
    case 'READING_COMPREHENSION':
      return {
        label: '阅读题',
        style:
          'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300',
      }
    case 'FILL_BLANK':
      return {
        label: '填空题',
        style:
          'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300',
      }
    case 'GRAMMAR':
      return {
        label: '语法题',
        style:
          'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
      }
    case 'WORD_DISTINCTION':
      return {
        label: '单词辨析题',
        style:
          'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/30 dark:text-teal-300',
      }
    case 'PRONUNCIATION':
      return {
        label: '读音题',
        style:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
      }
    case 'SORTING':
      return {
        label: '排序题',
        style:
          'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300',
      }
    default:
      return {
        label: '选择题',
        style:
          'border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
      }
  }
}

function isReadingLikeQuestion(item: RetryViewItem) {
  return (
    item.questionType === 'READING_COMPREHENSION' ||
    item.questionType === 'FILL_BLANK' ||
    item.sourceUrl?.includes('/articles/')
  )
}

function RetrySourcePreview({
  item,
  open,
  onToggle,
}: {
  item: RetryViewItem
  open: boolean
  onToggle: () => void
}) {
  const readingLike = isReadingLikeQuestion(item)

  return (
    <section className='overflow-hidden rounded-3xl border border-gray-200/80 bg-white/92 shadow-sm dark:border-slate-800 dark:bg-slate-900/85'>
      <div className='border-b border-gray-100/90 px-4 py-4 dark:border-slate-800 md:px-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='text-sm font-semibold text-gray-900 dark:text-slate-100'>
              错题回看
            </div>
            <p className='mt-1 truncate text-sm text-gray-500 dark:text-slate-400'>
              {item.sourceTitle}
            </p>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <button
              type='button'
              onClick={onToggle}
              className='ui-btn ui-btn-sm'>
              {open ? '收起来源' : '展开来源'}
            </button>
            <Link
              href={item.sourceUrl}
              target='_blank'
              className='ui-btn ui-btn-sm ui-btn-primary'>
              新开页面查看
            </Link>
          </div>
        </div>

        <div className='mt-3 flex flex-wrap items-center gap-2'>
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
              readingLike
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-300'
                : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}>
            {readingLike ? '阅读来源' : '题目来源'}
          </span>
          <span className='inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'>
            回看模式
          </span>
        </div>
      </div>

      {open ? (
        <div className='h-[58vh] min-h-[360px] bg-gray-50 dark:bg-slate-950'>
          <iframe
            src={item.sourceUrl}
            title={item.sourceTitle || 'source-preview'}
            className='h-full w-full'
          />
        </div>
      ) : (
        <div className='px-4 py-5 text-sm text-gray-500 dark:text-slate-400 md:px-5'>
          {readingLike
            ? '这道题适合先回看原文，再做回流。展开后可直接在本页查看来源内容。'
            : '这道题可以直接作答；若想确认原题上下文，也可以展开来源。'}
        </div>
      )}
    </section>
  )
}

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
  const [revealedCorrectId, setRevealedCorrectId] = useState<string | null>(
    null,
  )
  const [lastWrongSelectedId, setLastWrongSelectedId] = useState<string | null>(
    null,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [sourcePreviewOpen, setSourcePreviewOpen] = useState(true)

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
    setLastWrongSelectedId(null)
    setIsLoading(false)

    const first = nextQueue[0] as RetryViewItem | undefined
    setSourcePreviewOpen(first ? isReadingLikeQuestion(first) : true)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const current = queue[currentIndex] as RetryViewItem | undefined

  useEffect(() => {
    if (!current) return
    setSourcePreviewOpen(isReadingLikeQuestion(current))
  }, [current?.retryId])

  const progressText = useMemo(() => {
    if (queue.length === 0) return '0 / 0'
    return `${currentIndex + 1} / ${queue.length}`
  }, [currentIndex, queue.length])

  const typeMeta = current
    ? getQuestionTypeMeta(current)
    : {
        label: '选择题',
        style:
          'border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
      }

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
    setLastWrongSelectedId(res.isCorrect ? null : selectedOptionId)

    if (res.isCorrect) {
      if (res.done) {
        dialog.toast('本题已完成 24h / 72h / 7d 回流闭环', {
          tone: 'success',
        })
      } else {
        dialog.toast(`答对了，下一轮在 ${res.nextInHours} 小时后`, {
          tone: 'success',
        })
      }
    } else {
      dialog.toast('答错了，已重置为 24 小时后回流', { tone: 'info' })
    }

    setTimeout(() => {
      const nextQueue = queue.filter(item => item.retryId !== current.retryId)
      setQueue(nextQueue)
      setSelectedOptionId(null)
      setRevealedCorrectId(null)
      setLastWrongSelectedId(null)

      if (currentIndex >= nextQueue.length) {
        setCurrentIndex(Math.max(0, nextQueue.length - 1))
      }
    }, 650)
  }

  if (isLoading) {
    return (
      <main className='min-h-screen bg-gray-50 p-4 dark:bg-slate-950 md:p-8'>
        <div className='mx-auto max-w-6xl rounded-3xl border border-gray-200 bg-white py-16 text-center text-sm text-gray-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'>
          正在加载错题回流队列...
        </div>
      </main>
    )
  }

  if (!current) {
    return (
      <main className='min-h-screen bg-gray-50 p-4 dark:bg-slate-950 md:p-8'>
        <div className='mx-auto max-w-5xl rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900'>
          <h1 className='text-2xl font-black text-gray-900 dark:text-slate-100'>
            错题回流
          </h1>
          <p className='mt-2 text-sm text-gray-500 dark:text-slate-400'>
            当前没有到期错题。系统会按 24h / 72h / 7d 自动回流。
          </p>

          <div className='mt-4 flex flex-wrap items-center justify-center gap-2'>
            <span className='ui-tag ui-tag-muted'>
              队列总数 {summary.totalCount}
            </span>
            <span className='ui-tag ui-tag-info'>
              已到期 {summary.dueCount}
            </span>
          </div>

          <div className='mt-6 flex items-center justify-center gap-2'>
            <Link href='/today' className='ui-btn ui-btn-sm'>
              返回今日任务
            </Link>
            <Link href='/quizzes' className='ui-btn ui-btn-sm ui-btn-primary'>
              去做题
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className='min-h-screen bg-gray-50 p-4 dark:bg-slate-950 md:p-8'>
      <div className='mx-auto max-w-6xl'>
        <section className='mb-5 rounded-3xl border border-gray-200/80 bg-white/92 px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/85 md:px-6 md:py-5'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div>
              <h1 className='text-2xl font-black text-gray-900 dark:text-slate-100 md:text-3xl'>
                错题回流复习
              </h1>
              <p className='mt-2 text-sm text-gray-500 dark:text-slate-400'>
                来源：{current.sourceTitle} ·
                规则：答对进入下一轮（24h→72h→7d），答错回到 24h。
              </p>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              <span className='ui-tag ui-tag-info'>进度 {progressText}</span>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${typeMeta.style}`}>
                {typeMeta.label}
              </span>
              <span className='ui-tag ui-tag-warn'>
                第 {current.stage + 1} 轮
              </span>
            </div>
          </div>
        </section>

        <div className='grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]'>
          <RetrySourcePreview
            item={current}
            open={sourcePreviewOpen}
            onToggle={() => setSourcePreviewOpen(prev => !prev)}
          />

          <section className='rounded-3xl border border-gray-200/80 bg-white/92 px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/85 md:px-5 md:py-5'>
            <div className='mb-4 flex flex-wrap items-center gap-2'>
              <span className='inline-flex rounded-full border border-gray-900 bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'>
                回流题目
              </span>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${typeMeta.style}`}>
                {typeMeta.label}
              </span>
            </div>

            {current.prompt ? (
              <div className='rounded-2xl bg-gray-50/90 px-4 py-4 dark:bg-slate-800/70'>
                <p className='text-lg font-semibold leading-8 text-gray-900 dark:text-slate-100 md:text-xl'>
                  {current.prompt}
                </p>

                {current.contextSentence &&
                  current.contextSentence !== current.prompt && (
                    <p className='mt-3 text-base leading-7 text-gray-600 dark:text-slate-300 md:text-lg'>
                      {current.contextSentence}
                    </p>
                  )}
              </div>
            ) : (
              <div className='rounded-2xl bg-gray-50/90 px-4 py-4 dark:bg-slate-800/70'>
                <p className='text-base leading-7 text-gray-700 dark:text-slate-200 md:text-lg'>
                  {current.contextSentence}
                </p>
              </div>
            )}

            <div className='mt-5 space-y-3'>
              {current.options.map((option, index) => {
                const isSelected = selectedOptionId === option.id
                const isCorrect = revealedCorrectId === option.id
                const isWrongSelected = lastWrongSelectedId === option.id

                let optionStyle =
                  'border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800/70'

                if (revealedCorrectId) {
                  if (isCorrect) {
                    optionStyle =
                      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                  } else if (isWrongSelected) {
                    optionStyle =
                      'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200'
                  } else {
                    optionStyle =
                      'border-gray-200 bg-white opacity-60 dark:border-slate-800 dark:bg-slate-900'
                  }
                } else if (isSelected) {
                  optionStyle =
                    'border-indigo-200 bg-indigo-50 text-indigo-900 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200'
                }

                return (
                  <button
                    key={option.id}
                    type='button'
                    disabled={isSubmitting || Boolean(revealedCorrectId)}
                    onClick={() => setSelectedOptionId(option.id)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition-all duration-200 ${optionStyle}`}>
                    <div className='flex items-start gap-4'>
                      <span
                        className={`mt-0.5 shrink-0 text-lg font-black ${
                          isCorrect
                            ? 'text-emerald-600'
                            : isWrongSelected
                              ? 'text-rose-600'
                              : isSelected
                                ? 'text-indigo-600'
                                : 'text-gray-400'
                        }`}>
                        {String.fromCharCode(65 + index)}.
                      </span>

                      <div className='min-w-0 flex-1'>
                        <div className='text-base font-semibold leading-7 md:text-lg'>
                          {option.text}
                        </div>

                        {revealedCorrectId && isCorrect && (
                          <div className='mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-300'>
                            正确答案
                          </div>
                        )}

                        {revealedCorrectId && isWrongSelected && (
                          <div className='mt-2 text-xs font-bold text-rose-600 dark:text-rose-300'>
                            你的答案
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className='mt-5 flex flex-wrap items-center justify-between gap-3'>
              <Link href={current.sourceUrl} className='ui-btn ui-btn-sm'>
                查看来源
              </Link>

              <button
                type='button'
                onClick={onSubmit}
                disabled={
                  !selectedOptionId ||
                  isSubmitting ||
                  Boolean(revealedCorrectId)
                }
                className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
                {isSubmitting ? '提交中...' : '提交并进入下一题'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
