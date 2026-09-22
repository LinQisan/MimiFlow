// Review scheduling maintenance route.
import Link from 'next/link'

import { getFsrsAdminDashboard } from '@/modules/review/actions/memory'

export const dynamic = 'force-dynamic'

const ratingLabel = (rating: number) => {
  if (rating === 1) return '忘记'
  if (rating === 2) return '困难'
  if (rating === 3) return '记住'
  if (rating === 4) return '简单'
  return String(rating)
}

const dateTimeText = (value: Date | null | undefined) => {
  if (!value) return '未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value)
}

function getScheduleStatus(data: Awaited<ReturnType<typeof getFsrsAdminDashboard>>) {
  if (data.stats.eventCount30d === 0) {
    return {
      label: '等待复习数据',
      description: '调度器已经就绪。最近 30 天没有复习记录，完成几次记忆复习后会自动生成趋势。',
      tone: 'border-slate-300 bg-slate-50 text-slate-700',
    }
  }
  if (data.stats.usingFallback) {
    return {
      label: '正在使用安全参数',
      description: '自定义参数暂时不可用，系统已自动使用默认参数，复习功能仍可正常使用。',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    }
  }
  if (data.stats.overdueRate7d >= 40) {
    return {
      label: '建议优先处理到期内容',
      description: '最近 7 天的逾期比例偏高。先完成到期复习，系统会逐步恢复合适的节奏。',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    }
  }
  if (data.stats.eventCount7d >= 10 && data.stats.successRate7d < 70) {
    return {
      label: '近期记忆压力较高',
      description: '最近的记住比例较低。继续按计划复习即可，系统会自动缩短需要巩固内容的间隔。',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    }
  }
  return {
    label: '调度运行正常',
    description: '近期复习节奏稳定，继续完成每天的到期内容即可。',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }
}

export default async function ManageFsrsPage() {
  const data = await getFsrsAdminDashboard()
  const status = getScheduleStatus(data)
  const hasRecentData = data.stats.eventCount30d > 0
  const maxRatingCount = Math.max(1, ...data.ratingDist.map(item => item.count))

  return (
    <main className='min-h-screen bg-slate-50 px-4 pb-12 text-slate-900 md:px-8'>
      <div className='mx-auto max-w-5xl'>
        <header className='flex flex-wrap items-center justify-between gap-3 py-4'>
          <p className='ui-meta'>复习调度</p>
          <div className='flex gap-2'>
            <Link href='/manage/system' className='ui-btn ui-btn-sm'>返回系统</Link>
            <Link href='/review/memory' className='ui-btn ui-btn-primary ui-btn-sm'>开始记忆复习</Link>
          </div>
        </header>

        <section className='py-7'>
          <div className={`rounded-xl border px-5 py-5 ${status.tone}`}>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
              <div className='max-w-2xl'>
                <h1 className='text-xl font-semibold tracking-tight'>{status.label}</h1>
                <p className='mt-2 text-sm leading-6 opacity-80'>{status.description}</p>
              </div>
              <span className='shrink-0 text-xs font-semibold'>最近检查：刚刚</span>
            </div>
          </div>
        </section>

        <section aria-label='近期复习概览' className='grid grid-cols-3 py-5'>
          <div className='pr-4'>
            <p className='text-[11px] font-semibold tracking-wide text-slate-500'>30 天复习</p>
            <p className='mt-1 text-2xl font-semibold tabular-nums'>{data.stats.eventCount30d}</p>
          </div>
          <div className='px-4'>
            <p className='text-[11px] font-semibold tracking-wide text-slate-500'>7 天记住</p>
            <p className='mt-1 text-2xl font-semibold tabular-nums'>
              {data.stats.eventCount7d ? `${data.stats.successRate7d}%` : '—'}
            </p>
          </div>
          <div className='pl-4'>
            <p className='text-[11px] font-semibold tracking-wide text-slate-500'>7 天逾期</p>
            <p className='mt-1 text-2xl font-semibold tabular-nums'>
              {data.stats.eventCount7d ? `${data.stats.overdueRate7d}%` : '—'}
            </p>
          </div>
        </section>

        {hasRecentData ? (
          <section className='grid gap-8 py-8 md:grid-cols-2'>
            <div>
              <div className='mb-5 flex items-end justify-between gap-3'>
                <div>
                  <h2 className='text-base font-semibold'>最近 30 天的评分</h2>
                  <p className='mt-1 text-xs text-slate-500'>了解哪些内容需要更多巩固。</p>
                </div>
                <span className='text-xs text-slate-400'>{data.stats.eventCount30d} 次</span>
              </div>
              <div className='space-y-4'>
                {data.ratingDist.map(item => (
                  <div key={item.rating}>
                    <div className='flex items-center justify-between text-xs text-slate-600'>
                      <span>{ratingLabel(item.rating)}</span>
                      <span className='tabular-nums'>{item.count}</span>
                    </div>
                    <div className='mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200'>
                      <div className='h-full rounded-full bg-slate-900' style={{ width: `${Math.round((item.count / maxRatingCount) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className='text-base font-semibold'>每日记住比例</h2>
              <p className='mt-1 text-xs text-slate-500'>仅显示最近有复习记录的 14 天。</p>
              <div className='mt-5 space-y-3'>
                {data.trend.map(item => (
                  <div key={item.dateKey} className='grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs'>
                    <span className='text-slate-500'>{item.dateKey}</span>
                    <div className='h-1.5 overflow-hidden rounded-full bg-slate-200'>
                      <div className='h-full rounded-full bg-slate-700' style={{ width: `${item.successRate}%` }} />
                    </div>
                    <span className='w-16 text-right tabular-nums text-slate-600'>{item.successRate}% · {item.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section className='py-8'>
            <h2 className='text-base font-semibold'>目前不需要处理</h2>
            <p className='mt-2 max-w-2xl text-sm leading-6 text-slate-500'>
              系统会在每次记忆复习后记录结果。积累数据后，这里才会显示评分分布和变化趋势，避免用没有意义的 0% 造成误解。
            </p>
          </section>
        )}

        <details className='group py-5'>
          <summary className='flex cursor-pointer list-none items-center justify-between gap-4 marker:content-none'>
            <div>
              <h2 className='text-sm font-semibold'>高级调度信息</h2>
              <p className='mt-1 text-xs text-slate-500'>仅用于排查问题，日常无需查看或调整。</p>
            </div>
            <span aria-hidden className='text-sm text-slate-400 transition-transform group-open:rotate-180'>⌄</span>
          </summary>
          <div className='mt-5 grid gap-5 pt-5 sm:grid-cols-2'>
            <dl className='grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm'>
              <dt className='text-slate-500'>当前模式</dt>
              <dd className='font-semibold'>{data.stats.usingFallback ? '默认安全参数' : '自定义参数'}</dd>
              <dt className='text-slate-500'>目标记住率</dt>
              <dd>{Math.round(data.profile.requestRetention * 100)}%</dd>
              <dt className='text-slate-500'>最长间隔</dt>
              <dd>{data.profile.maximumInterval.toLocaleString('zh-CN')} 天</dd>
              <dt className='text-slate-500'>拟合样本</dt>
              <dd>{data.profile.sampleSize} 条</dd>
              <dt className='text-slate-500'>最近拟合</dt>
              <dd>{dateTimeText(data.profile.lastFittedAt)}</dd>
              <dt className='text-slate-500'>最近回退</dt>
              <dd>{dateTimeText(data.profile.lastFallbackAt)}</dd>
            </dl>
            <div>
              <p className='text-xs font-semibold text-slate-500'>参数版本 v{data.profile.fitVersion}</p>
              <p className='mt-2 text-xs leading-5 text-slate-500'>{data.profile.lastFallbackReason || '未记录异常原因。'}</p>
              <p className='mt-4 break-words font-mono text-[11px] leading-5 text-slate-400'>
                {data.profile.weights.map((value, index) => `w${index} ${value.toFixed(4)}`).join(' · ')}
              </p>
            </div>
          </div>
        </details>
      </div>
    </main>
  )
}
