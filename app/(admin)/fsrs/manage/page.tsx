import Link from 'next/link'
import type { ReactNode } from 'react'

import { getFsrsAdminDashboard } from '@/app/actions/fsrs'

export const dynamic = 'force-dynamic'

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

function SectionTitle({
  title,
  desc,
}: {
  title: string
  desc?: string
}) {
  return (
    <div className='mb-5 flex flex-wrap items-end justify-between gap-3'>
      <div>
        <div className='flex items-center gap-2'>
          <div className='h-5 w-1.5 rounded-full bg-slate-900' />
          <h2 className='text-lg font-semibold tracking-tight text-slate-900 md:text-xl'>
            {title}
          </h2>
        </div>
        {desc ? (
          <p className='mt-1 max-w-2xl text-sm text-slate-500 md:text-[15px]'>
            {desc}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function SurfaceCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-[18px] border border-slate-200 bg-white shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.06),0_4px_10px_rgba(15,23,42,0.04)] ${className}`}>
      {children}
    </div>
  )
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <SurfaceCard className='p-4 md:p-5'>
      <p className='text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase'>
        {label}
      </p>
      <p className='mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl'>
        {value}
      </p>
      {note ? <p className='mt-2 text-xs text-slate-500'>{note}</p> : null}
    </SurfaceCard>
  )
}

export default async function ManageFsrsPage() {
  const data = await getFsrsAdminDashboard()
  const maxRatingCount = Math.max(1, ...data.ratingDist.map(item => item.count))

  return (
    <main className='min-h-screen bg-white text-slate-900'>
      <div className='mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-8'>
        <header className='mb-6 flex flex-col gap-4 rounded-[20px] bg-white px-5 py-5 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:px-6 md:py-6'>
          <div className='flex flex-wrap items-center gap-3'>
            <Link
              href='/'
              className='inline-flex items-center gap-1.5 text-sm font-semibold tracking-[0.24em] text-slate-500 uppercase transition hover:text-slate-900'
              aria-label='返回首页'
              title='返回首页'>
              <span>MimiFlow</span>
              <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M15 19l-7-7 7-7'
                />
              </svg>
            </Link>
            <div className='ml-auto flex flex-wrap items-center gap-2'>
              <Link
                href='/review'
                className='ui-btn ui-btn-sm h-10 px-4 text-sm'>
                错题回顾
              </Link>
              <Link
                href='/'
                className='ui-btn ui-btn-sm h-10 px-4 text-sm'>
                返回首页
              </Link>
            </div>
          </div>

          <div className='grid gap-5 md:grid-cols-[1.3fr_0.7fr] md:items-end'>
            <div>
              <p className='text-xs font-semibold tracking-[0.28em] text-slate-500 uppercase'>
                FSRS
              </p>
              <h1 className='mt-3 text-4xl font-semibold tracking-tight text-slate-900 md:text-6xl'>
                调度诊断面板
              </h1>
              <p className='mt-4 max-w-2xl text-sm leading-7 text-slate-500 md:text-base'>
                用来查看当前调度参数、最近拟合状态和复习分布。它更像一个后台体检页，
                不是一个操作台，所以重点放在稳定性和异常信号上。
              </p>
            </div>
            <div className='rounded-[18px] bg-slate-50 p-4 shadow-[inset_0_1px_1px_rgba(15,23,42,0.08)]'>
              <p className='text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase'>
                当前状态
              </p>
              <p className='mt-2 text-sm leading-6 text-slate-600'>
                {data.stats.usingFallback
                  ? '当前引擎处于 fallback 模式，说明参数未成功拟合或被临时关闭。'
                  : '当前引擎使用自定义参数，FSRS 正常接管调度。'}
              </p>
              <p className='mt-3 text-xs text-slate-500'>
                事件数 7 天 / 30 天：{data.stats.eventCount7d} /{' '}
                {data.stats.eventCount30d}
              </p>
            </div>
          </div>
        </header>

        <section className='mb-6'>
          <SectionTitle title='运行概览' desc='先判断调度器是否稳定，再看具体参数。' />
          <div className='grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4'>
            <MetricCard
              label='引擎模式'
              value={data.profile.lastEngineMode === 'custom' ? 'custom' : 'fallback'}
              note='当前是否使用自定义参数'
            />
            <MetricCard
              label='最近拟合'
              value={dateTimeText(data.profile.lastFittedAt)}
              note='最后一次成功拟合时间'
            />
            <MetricCard
              label='最近回退'
              value={dateTimeText(data.profile.lastFallbackAt)}
              note='参数异常时的最近回退'
            />
            <MetricCard
              label='7天成功率'
              value={`${data.stats.successRate7d}%`}
              note='最近 7 天内复习成功占比'
            />
            <MetricCard
              label='7天逾期率'
              value={`${data.stats.overdueRate7d}%`}
              note='最近 7 天内逾期复习占比'
            />
          </div>
        </section>

        <section className='mb-6'>
          <SectionTitle title='当前参数' desc='参数变化太快通常意味着拟合不稳定。' />
          <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
            <SurfaceCard className='p-4 md:p-5'>
              <p className='text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase'>
                requestRetention
              </p>
              <p className='mt-3 text-3xl font-semibold tracking-tight text-slate-900'>
                {data.profile.requestRetention.toFixed(4)}
              </p>
              <p className='mt-2 text-xs text-slate-500'>目标保留率</p>
            </SurfaceCard>
            <SurfaceCard className='p-4 md:p-5'>
              <p className='text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase'>
                maximumInterval
              </p>
              <p className='mt-3 text-3xl font-semibold tracking-tight text-slate-900'>
                {data.profile.maximumInterval}
              </p>
              <p className='mt-2 text-xs text-slate-500'>天</p>
            </SurfaceCard>
            <SurfaceCard className='p-4 md:p-5'>
              <p className='text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase'>
                样本 / 版本
              </p>
              <p className='mt-3 text-3xl font-semibold tracking-tight text-slate-900'>
                {data.profile.sampleSize} / v{data.profile.fitVersion}
              </p>
              <p className='mt-2 text-xs text-slate-500'>
                {data.profile.lastFallbackReason || '最近未记录回退原因'}
              </p>
            </SurfaceCard>
          </div>
        </section>

        <section className='mb-6 grid grid-cols-1 gap-4 md:grid-cols-2'>
          <SurfaceCard className='p-4 md:p-5'>
            <SectionTitle
              title='近30天评分分布'
              desc='观察 Again / Hard / Good / Easy 的比例是否偏离正常区间。'
            />
            <div className='space-y-3'>
              {data.ratingDist.map(item => (
                <div key={`rating-${item.rating}`}>
                  <div className='flex items-center justify-between text-xs text-slate-600'>
                    <span>{ratingLabel(item.rating)}</span>
                    <span>{item.count}</span>
                  </div>
                  <div className='mt-1 h-2 rounded-full bg-slate-100'>
                    <div
                      className='h-full rounded-full bg-slate-900'
                      style={{ width: `${Math.round((item.count / maxRatingCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className='p-4 md:p-5'>
            <SectionTitle
              title='近14天成功率趋势'
              desc='如果这条线连续下滑，通常值得先看参数再看题目。'
            />
            <div className='space-y-3'>
              {data.trend.length === 0 ? (
                <p className='text-sm text-slate-500'>暂无数据</p>
              ) : (
                data.trend.map(item => (
                  <div key={`trend-${item.dateKey}`}>
                    <div className='flex items-center justify-between text-xs text-slate-600'>
                      <span>{item.dateKey}</span>
                      <span>
                        {item.successRate}% ({item.success}/{item.total})
                      </span>
                    </div>
                    <div className='mt-1 h-2 rounded-full bg-slate-100'>
                      <div
                        className='h-full rounded-full bg-slate-700'
                        style={{ width: `${item.successRate}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </SurfaceCard>
        </section>

        <section>
          <SectionTitle title='权重向量' desc='用来快速判断参数是否异常漂移。' />
          <SurfaceCard className='p-4 md:p-5'>
            <div className='grid grid-cols-2 gap-2 text-xs text-slate-700 md:grid-cols-3 lg:grid-cols-4'>
              {data.profile.weights.map((value, idx) => (
                <div key={`w-${idx}`} className='rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
                  <span className='text-slate-500'>w{idx}</span>
                  <span className='ml-2 font-mono font-semibold'>{value.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </section>
      </div>
    </main>
  )
}
