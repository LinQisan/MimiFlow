import { getFsrsAdminDashboard } from '@/app/actions/fsrs'
import Link from 'next/link'

const ratingLabel = (rating: number) => {
  if (rating === 1) return 'Again'
  if (rating === 2) return 'Hard'
  if (rating === 3) return 'Good'
  if (rating === 4) return 'Easy'
  return String(rating)
}

const dateTimeText = (value: Date | null | undefined) => {
  if (!value) return '未记录'
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value)
}

export const dynamic = 'force-dynamic'

export default async function ManageFsrsPage() {
  const data = await getFsrsAdminDashboard()
  const maxRatingCount = Math.max(1, ...data.ratingDist.map(item => item.count))

  return (
    <main className='min-h-screen bg-gray-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl'>
        <section className='border-b border-gray-200 pb-5'>
          <Link
            href='/manage'
            className='mb-2 inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-700'>
            返回管理中心
          </Link>
          <h1 className='text-3xl font-black text-gray-900'>FSRS 参数面板</h1>
          <p className='mt-2 text-sm text-gray-500'>
            查看当前个性化参数、最近拟合时间与回退状态，判断调度器是否稳定运行。
          </p>
        </section>

        <section className='mt-4 grid grid-cols-2 gap-3 md:grid-cols-5'>
          <StatCard label='引擎模式' value={data.profile.lastEngineMode === 'custom' ? 'custom' : 'fallback'} />
          <StatCard label='最近拟合' value={dateTimeText(data.profile.lastFittedAt)} small />
          <StatCard label='最近回退' value={dateTimeText(data.profile.lastFallbackAt)} small />
          <StatCard label='7天成功率' value={`${data.stats.successRate7d}%`} />
          <StatCard label='7天逾期率' value={`${data.stats.overdueRate7d}%`} />
        </section>

        <section className='mt-4 border-b border-gray-200 bg-white px-4 py-4'>
          <h2 className='text-base font-bold text-gray-900'>当前参数</h2>
          <div className='mt-2 grid grid-cols-1 gap-2 text-sm text-gray-700 md:grid-cols-3'>
            <div className='border-b border-gray-100 pb-2'>
              <p className='text-xs text-gray-500'>requestRetention</p>
              <p className='mt-1 font-bold'>{data.profile.requestRetention.toFixed(4)}</p>
            </div>
            <div className='border-b border-gray-100 pb-2'>
              <p className='text-xs text-gray-500'>maximumInterval</p>
              <p className='mt-1 font-bold'>{data.profile.maximumInterval} 天</p>
            </div>
            <div className='border-b border-gray-100 pb-2'>
              <p className='text-xs text-gray-500'>样本 / 版本</p>
              <p className='mt-1 font-bold'>
                {data.profile.sampleSize} / v{data.profile.fitVersion}
              </p>
            </div>
          </div>
          {data.profile.lastFallbackReason && (
            <p className='mt-2 text-xs text-rose-600'>回退原因: {data.profile.lastFallbackReason}</p>
          )}
        </section>

        <section className='mt-4 grid grid-cols-1 gap-4 md:grid-cols-2'>
          <article className='border-b border-gray-200 bg-white px-4 py-4'>
            <h3 className='text-sm font-bold text-gray-900'>近30天评分分布</h3>
            <div className='mt-3 space-y-2'>
              {data.ratingDist.map(item => (
                <div key={`rating-${item.rating}`}>
                  <div className='flex items-center justify-between text-xs text-gray-600'>
                    <span>{ratingLabel(item.rating)}</span>
                    <span>{item.count}</span>
                  </div>
                  <div className='mt-1 h-2 bg-gray-100'>
                    <div
                      className='h-full bg-indigo-500'
                      style={{ width: `${Math.round((item.count / maxRatingCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className='border-b border-gray-200 bg-white px-4 py-4'>
            <h3 className='text-sm font-bold text-gray-900'>近14天成功率趋势</h3>
            <div className='mt-3 space-y-2'>
              {data.trend.length === 0 && (
                <p className='text-xs text-gray-500'>暂无数据</p>
              )}
              {data.trend.map(item => (
                <div key={`trend-${item.dateKey}`}>
                  <div className='flex items-center justify-between text-xs text-gray-600'>
                    <span>{item.dateKey}</span>
                    <span>
                      {item.successRate}% ({item.success}/{item.total})
                    </span>
                  </div>
                  <div className='mt-1 h-2 bg-gray-100'>
                    <div
                      className='h-full bg-emerald-500'
                      style={{ width: `${item.successRate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className='mt-4 border-b border-gray-200 bg-white px-4 py-4'>
          <h3 className='text-sm font-bold text-gray-900'>权重向量（w）</h3>
          <p className='mt-1 text-xs text-gray-500'>用于快速判断参数是否异常漂移。</p>
          <div className='mt-3 grid grid-cols-2 gap-2 text-xs text-gray-700 md:grid-cols-3 lg:grid-cols-4'>
            {data.profile.weights.map((value, idx) => (
              <div key={`w-${idx}`} className='border-b border-gray-100 py-1'>
                <span className='text-gray-500'>w{idx}</span>
                <span className='ml-2 font-mono font-semibold'>{value.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

function StatCard({
  label,
  value,
  small,
}: {
  label: string
  value: string
  small?: boolean
}) {
  return (
    <article className='border-b border-gray-200 bg-white px-3 py-2'>
      <p className='text-xs text-gray-500'>{label}</p>
      <p className={`mt-1 font-black text-gray-900 ${small ? 'text-xs' : 'text-lg'}`}>{value}</p>
    </article>
  )
}
