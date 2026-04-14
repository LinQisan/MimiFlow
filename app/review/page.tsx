import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDueRetryQuestions, getRetryQueueSummary } from '@/app/actions/retry'

export const dynamic = 'force-dynamic'

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

export default async function ReviewPage() {
  const [summary, firstBatch] = await Promise.all([
    getRetryQueueSummary(),
    getDueRetryQuestions(1),
  ])

  if (firstBatch.length > 0) {
    redirect(`/review/${firstBatch[0].retryId}`)
  }

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <section className='mx-auto max-w-3xl rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)]'>
        <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>
              Review
            </p>
            <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-900'>
              错题回看
            </h1>
            <p className='mt-2 text-sm text-slate-600'>当前没有到期错题。</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <div className='rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 shadow-sm'>
              <p className='text-[11px] font-semibold uppercase tracking-wider'>
                错题总数
              </p>
              <p className='mt-1 text-2xl font-black'>{summary.totalCount}</p>
            </div>
            <div className='rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm'>
              <p className='text-[11px] font-semibold uppercase tracking-wider'>
                下一到期
              </p>
              <p className='mt-1 text-base font-bold'>
                {summary.nextDueAt ? formatDateTime(summary.nextDueAt) : '无'}
              </p>
            </div>
          </div>
        </div>
        <div className='mt-6 flex flex-wrap gap-2'>
          <Link
            href='/exam/papers/custom'
            className='rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800'>
            去做新题
          </Link>
          <Link
            href='/'
            className='rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50'>
            返回首页
          </Link>
        </div>
        <p className='mt-3 text-xs text-slate-400'>
          错题总数 {summary.totalCount}，下一到期：
          {summary.nextDueAt ? formatDateTime(summary.nextDueAt) : '无'}
        </p>
      </section>
    </main>
  )
}
