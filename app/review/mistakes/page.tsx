import Link from 'next/link'

import {
  getDueRetryQuestionTypeSummaries,
  getRetryQueueSummary,
} from '@/modules/review/actions/mistakes'
import { formatTokyoDateTime } from '@/utils/time/format'
import { getQuestionTypeDisplay } from '@/utils/questions/typeLabels'

export const dynamic = 'force-dynamic'

export default async function MistakeReviewPage() {
  const [summary, questionTypes] = await Promise.all([
    getRetryQueueSummary(),
    getDueRetryQuestionTypeSummaries(),
  ])

  const firstRetryId = questionTypes[0]?.firstRetryId

  return (
    <main className='min-h-screen bg-[#f6f5f1] px-4 py-6 md:px-6 md:py-8'>
      <section className='mx-auto max-w-3xl'>
        {firstRetryId ? (
          <div className='mt-5 grid gap-3 sm:grid-cols-2'>
            <Link
              href={`/review/${firstRetryId}`}
              className='border border-slate-900 bg-slate-900 p-4 text-white transition hover:bg-slate-800'>
              <p className='text-sm font-bold'>全部题型</p>
              <p className='mt-1 text-xs tabular-nums text-slate-300'>{summary.dueCount} 题</p>
            </Link>
            {questionTypes.map(type => {
              const display = getQuestionTypeDisplay(type.questionType)
              return (
                <Link
                  key={type.questionType}
                  href={`/review/${type.firstRetryId}?type=${encodeURIComponent(type.questionType)}`}
                  prefetch={false}
                  className='border-b border-slate-200 p-4 transition hover:bg-white'>
                  <p className='text-sm font-bold text-slate-900'>{display.label}</p>
                  <p className='mt-1 text-xs tabular-nums text-slate-500'>{type.count} 题 · {display.description}</p>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className='mt-5 grid gap-3 sm:grid-cols-2'>
            <div className='border-b border-slate-200 p-4'>
              <p className='text-xs text-slate-500'>错题总数</p>
              <p className='mt-1 text-2xl font-semibold tabular-nums'>{summary.totalCount}</p>
            </div>
            <div className='border-b border-slate-200 p-4'>
              <p className='text-xs text-slate-500'>下一到期</p>
              <p className='mt-1 text-sm font-semibold'>{formatTokyoDateTime(summary.nextDueAt)}</p>
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
