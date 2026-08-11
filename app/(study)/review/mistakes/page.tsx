import Link from 'next/link'

import {
  getDueRetryQuestionTypeSummaries,
  getRetryQueueSummary,
} from '@/modules/review/actions/mistakes'
import { formatTokyoDateTime } from '@/utils/time/format'
import { getQuestionTypeDisplay } from '@/utils/questions/typeLabels'
import PageHeader from '@/components/layout/PageHeader'

export const dynamic = 'force-dynamic'

export default async function MistakeReviewPage() {
  const [summary, questionTypes] = await Promise.all([
    getRetryQueueSummary(),
    getDueRetryQuestionTypeSummaries(),
  ])

  const firstRetryId = questionTypes[0]?.firstRetryId

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <section className='mx-auto max-w-3xl'>
        <PageHeader
          title='错题巩固'
          description={firstRetryId ? '选择本次要复习的题型。' : '当前没有到期错题。'}
        />

        {firstRetryId ? (
          <div className='mt-5 grid gap-3 sm:grid-cols-2'>
            <Link
              href={`/review/${firstRetryId}`}
              className='rounded-2xl border border-slate-900 bg-slate-900 p-4 text-white transition hover:bg-slate-800'>
              <p className='text-sm font-black'>全部题型</p>
              <p className='mt-1 text-xs text-slate-300'>{summary.dueCount} 题</p>
            </Link>
            {questionTypes.map(type => {
              const display = getQuestionTypeDisplay(type.questionType)
              return (
                <Link
                  key={type.questionType}
                  href={`/review/${type.firstRetryId}?type=${encodeURIComponent(type.questionType)}`}
                  className='rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-400'>
                  <p className='text-sm font-black text-slate-900'>{display.label}</p>
                  <p className='mt-1 text-xs text-slate-500'>{type.count} 题 · {display.description}</p>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className='mt-5 grid gap-3 sm:grid-cols-2'>
            <div className='rounded-2xl border border-slate-200 bg-white p-4'>
              <p className='text-xs text-slate-500'>错题总数</p>
              <p className='mt-1 text-2xl font-black'>{summary.totalCount}</p>
            </div>
            <div className='rounded-2xl border border-slate-200 bg-white p-4'>
              <p className='text-xs text-slate-500'>下一到期</p>
              <p className='mt-1 font-bold'>{formatTokyoDateTime(summary.nextDueAt)}</p>
            </div>
          </div>
        )}
        <div className='mt-6 flex flex-wrap gap-2'>
          <Link href='/practice/custom' className='ui-btn ui-btn-primary'>
            去做新题
          </Link>
          <Link href='/review' className='ui-btn'>
            返回复习中心
          </Link>
        </div>
      </section>
    </main>
  )
}
