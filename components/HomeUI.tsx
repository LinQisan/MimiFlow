'use client'

import Link from 'next/link'
import { useI18n } from '@/context/I18nContext'

type LevelInfo = {
  id: string
  title: string
  description?: string | null
}

type DistributionItem = {
  key: string
  label: string
  count: number
}

type TrendItem = {
  label: string
  count: number
}

type CompareStat = {
  count: number
  accuracy: number
  avgSec: number
  accuracyDelta: number
  avgSecDelta: number
}

type BreakdownItem = {
  label: string
  count: number
  accuracy: number
  avgSec: number
}

type ForgettingCurveItem = {
  label: string
  retention: number
  count: number
}

interface HomeUIProps {
  dbLevels: LevelInfo[]
  vocabCount: number
  sentencesCount: number
  dueSentencesCount: number
  dueRetryCount: number
  articlesCount: number
  quizzesCount: number
  sourceDistribution: DistributionItem[]
  recentTrend: TrendItem[]
  weekCompare: CompareStat
  monthCompare: CompareStat
  languageBreakdown: BreakdownItem[]
  categoryBreakdown: BreakdownItem[]
  questionTypeBreakdown: BreakdownItem[]
  forgettingCurve: ForgettingCurveItem[]
  gameLevel: number
  gameStreak: number
  gameDoneCount: number
  gameTotalCount: number
}

export default function HomeUI({
  dbLevels,
  vocabCount,
  sentencesCount,
  dueSentencesCount,
  dueRetryCount,
  articlesCount,
  quizzesCount,
  sourceDistribution,
  recentTrend,
  weekCompare,
  monthCompare,
  languageBreakdown,
  categoryBreakdown,
  questionTypeBreakdown,
  forgettingCurve,
  gameLevel,
  gameStreak,
  gameDoneCount,
  gameTotalCount,
}: HomeUIProps) {
  const { t } = useI18n()
  const maxSource = Math.max(1, ...sourceDistribution.map(item => item.count))
  const maxTrend = Math.max(1, ...recentTrend.map(item => item.count))

  return (
    <div className='px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <section className='border-b border-gray-200 pb-5 md:pb-6'>
          <div className='mb-5 flex items-center justify-between'>
            <h2 className='text-2xl font-bold text-gray-900 md:text-3xl'>
              {t('home.dashboard') || '学习总览'}
            </h2>
            <Link
              href='/manage'
              className='ui-btn ui-btn-sm'>
              管理
            </Link>
          </div>
          <div className='grid grid-cols-2 gap-3 md:grid-cols-6'>
            <SummaryCard label='待复习' value={dueSentencesCount} />
            <SummaryCard label='句子' value={sentencesCount} />
            <SummaryCard label='单词' value={vocabCount} />
            <SummaryCard label='阅读' value={articlesCount} />
            <SummaryCard label='题库' value={quizzesCount} />
            <SummaryCard label='听力分类' value={dbLevels.length} />
          </div>
          <div className='mt-4 grid grid-cols-1 gap-2 md:grid-cols-4'>
            <Link
              href='/today'
              className='ui-btn ui-btn-primary w-full justify-center'>
              今日任务（自动编排）
            </Link>
            <Link
              href='/game'
              className='ui-btn w-full justify-center border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'>
              学习游戏 Lv.{gameLevel}
            </Link>
            <Link
              href='/retry'
              className='ui-btn w-full justify-center border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'>
              错题回流 {dueRetryCount}
            </Link>
            <Link
              href='/search'
              className='ui-btn w-full justify-center'>
              全局搜索
            </Link>
          </div>
          <div className='mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500'>
            <span className='ui-tag ui-tag-info'>
              游戏进度 {gameDoneCount}/{gameTotalCount}
            </span>
            <span className='ui-tag ui-tag-muted'>连胜 {gameStreak} 天</span>
          </div>
        </section>

        <section className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          <ComparePanel
            title='近 7 天表现'
            stat={weekCompare}
            subtitle='与上一个 7 天周期对比'
          />
          <ComparePanel
            title='近 30 天表现'
            stat={monthCompare}
            subtitle='与上一个 30 天周期对比'
          />
        </section>

        <section className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          <div className='border-b border-gray-200 pb-5 md:pb-6'>
            <h3 className='mb-4 text-lg font-semibold text-gray-800'>词条来源分布</h3>
            <div className='space-y-3'>
              {sourceDistribution.map(item => {
                const width = (item.count / maxSource) * 100
                return (
                  <div key={item.key}>
                    <div className='mb-1 flex items-center justify-between text-xs font-semibold text-gray-600'>
                      <span>{item.label}</span>
                      <span>{item.count}</span>
                    </div>
                    <div className='h-2 rounded-full bg-gray-100'>
                      <div
                        style={{ width: `${width}%` }}
                        className='h-full rounded-full bg-indigo-500'
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className='border-b border-gray-200 pb-5 md:pb-6'>
            <h3 className='mb-4 text-lg font-semibold text-gray-800'>近 7 天新增单词</h3>
            <div className='grid h-36 grid-cols-7 items-end gap-2'>
              {recentTrend.map(item => {
                const height = Math.max(8, (item.count / maxTrend) * 100)
                return (
                  <div key={item.label} className='flex flex-col items-center gap-2'>
                    <div
                      style={{ height: `${height}%` }}
                      className='w-full rounded-t-md bg-emerald-400/85'
                      title={`${item.label}: ${item.count}`}
                    />
                    <span className='text-[10px] text-gray-500'>{item.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className='grid grid-cols-1 gap-6 xl:grid-cols-3'>
          <BreakdownPanel
            title='按语言表现（30 天）'
            items={languageBreakdown}
          />
          <BreakdownPanel
            title='按分类表现（30 天）'
            items={categoryBreakdown}
          />
          <BreakdownPanel
            title='按题型表现（30 天）'
            items={questionTypeBreakdown}
          />
        </section>

        <section className='border-b border-gray-200 pb-5 md:pb-6'>
          <h3 className='mb-4 text-lg font-semibold text-gray-800'>遗忘曲线（估算留存）</h3>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-5'>
            {forgettingCurve.map(item => (
              <div
                key={item.label}
                className='border border-gray-200 px-3 py-3'>
                <p className='text-xs font-semibold text-gray-500'>{item.label}</p>
                <p className='mt-1 text-2xl font-black text-gray-900'>{item.retention}%</p>
                <p className='mt-1 text-xs text-gray-400'>{item.count} 条记忆轨迹</p>
              </div>
            ))}
          </div>
        </section>

        <section className='border-b border-gray-200 pb-5 md:pb-6'>
          <h3 className='mb-4 text-lg font-semibold text-gray-800'>听力分类</h3>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {dbLevels.map(level => (
              <Link
                key={level.id}
                href={`/level/${level.id}`}
                className='border-b border-gray-200 px-2 ui-mobile-py-sm hover:bg-gray-50'>
                <p className='font-bold text-gray-900'>{level.title}</p>
                <p className='mt-1 line-clamp-2 text-xs text-gray-500'>
                  {level.description || '听力语料分类'}
                </p>
              </Link>
            ))}
            {dbLevels.length === 0 && (
              <div className='border-b border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400'>
                暂无分类
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className='border-b border-gray-200 px-2 py-3'>
      <p className='text-xs font-medium text-gray-500'>{label}</p>
      <p className='mt-1 text-xl font-black text-gray-900'>{value}</p>
    </div>
  )
}

function ComparePanel({
  title,
  subtitle,
  stat,
}: {
  title: string
  subtitle: string
  stat: CompareStat
}) {
  const accuracyTrend =
    stat.accuracyDelta > 0 ? `+${stat.accuracyDelta}` : `${stat.accuracyDelta}`
  const timeTrend = stat.avgSecDelta > 0 ? `+${stat.avgSecDelta}` : `${stat.avgSecDelta}`

  return (
    <div className='border-b border-gray-200 pb-5 md:pb-6'>
      <h3 className='text-lg font-semibold text-gray-800'>{title}</h3>
      <p className='mt-1 text-xs text-gray-500'>{subtitle}</p>
      <div className='mt-3 grid grid-cols-3 gap-2'>
        <div className='border border-gray-200 px-3 py-2'>
          <p className='text-xs text-gray-500'>作答量</p>
          <p className='mt-1 text-xl font-black text-gray-900'>{stat.count}</p>
        </div>
        <div className='border border-gray-200 px-3 py-2'>
          <p className='text-xs text-gray-500'>正确率</p>
          <p className='mt-1 text-xl font-black text-gray-900'>{stat.accuracy}%</p>
          <p className='text-[10px] text-gray-400'>{accuracyTrend}pct</p>
        </div>
        <div className='border border-gray-200 px-3 py-2'>
          <p className='text-xs text-gray-500'>平均耗时</p>
          <p className='mt-1 text-xl font-black text-gray-900'>{stat.avgSec}s</p>
          <p className='text-[10px] text-gray-400'>{timeTrend}s</p>
        </div>
      </div>
    </div>
  )
}

function BreakdownPanel({ title, items }: { title: string; items: BreakdownItem[] }) {
  const maxCount = Math.max(1, ...items.map(item => item.count))
  return (
    <div className='border-b border-gray-200 pb-5 md:pb-6'>
      <h3 className='mb-4 text-lg font-semibold text-gray-800'>{title}</h3>
      <div className='space-y-2'>
        {items.map(item => (
          <div
            key={`${title}-${item.label}`}
            className='border border-gray-200 px-3 py-2'>
            <div className='flex items-center justify-between gap-2 text-xs font-semibold text-gray-600'>
              <span className='truncate'>{item.label}</span>
              <span>{item.count} 题</span>
            </div>
            <div className='mt-1 h-1.5 rounded-full bg-gray-100'>
              <div
                style={{ width: `${(item.count / maxCount) * 100}%` }}
                className='h-full rounded-full bg-indigo-500/85'
              />
            </div>
            <p className='mt-1 text-[11px] text-gray-500'>
              正确率 {item.accuracy}% · 平均耗时 {item.avgSec}s
            </p>
          </div>
        ))}
        {items.length === 0 && <p className='text-sm text-gray-400'>暂无作答数据</p>}
      </div>
    </div>
  )
}
