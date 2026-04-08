import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDueRetryQuestions, getRetryQueueSummary } from '@/app/actions/retry'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const [summary, firstBatch] = await Promise.all([
    getRetryQueueSummary(),
    getDueRetryQuestions(1),
  ])

  if (firstBatch.length > 0) {
    redirect(`/review/${firstBatch[0].retryId}`)
  }

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-8 md:px-8 md:py-10'>
      <section className='mx-auto max-w-3xl border border-slate-200 bg-white p-6 text-center'>
        <h1 className='text-xl font-black text-slate-900'>错题回看</h1>
        <p className='mt-2 text-sm text-slate-500'>当前没有到期错题。</p>
        <p className='mt-1 text-xs text-slate-400'>
          错题总数 {summary.totalCount}，下一到期：
          {summary.nextDueAt
            ? new Intl.DateTimeFormat('ja-JP', {
                timeZone: 'Asia/Tokyo',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              }).format(new Date(summary.nextDueAt))
            : '无'}
        </p>
        <div className='mt-4'>
          <Link
            href='/exam/papers/custom'
            className='rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50'>
            去做新题
          </Link>
        </div>
      </section>
    </main>
  )
}
