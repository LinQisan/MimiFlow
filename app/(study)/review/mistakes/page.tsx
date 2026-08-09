import Link from 'next/link'
import { redirect } from 'next/navigation'

import {
  getDueRetryQuestions,
  getRetryQueueSummary,
} from '@/modules/review/actions/mistakes'
import { formatTokyoDateTime } from '@/utils/time/format'
import PageHeader from '@/components/layout/PageHeader'

export const dynamic = 'force-dynamic'

export default async function MistakeReviewPage() {
  const [summary, firstBatch] = await Promise.all([
    getRetryQueueSummary(),
    getDueRetryQuestions(1),
  ])

  if (firstBatch.length > 0) {
    redirect(`/review/${firstBatch[0].retryId}`)
  }

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <section className='mx-auto max-w-3xl'>
        <PageHeader title='错题巩固' description='当前没有到期错题。' />
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
