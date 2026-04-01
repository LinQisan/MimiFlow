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

interface HomeUIProps {
  dbLevels: LevelInfo[]
  vocabCount: number
  sentencesCount: number
  dueSentencesCount: number
  articlesCount: number
  quizzesCount: number
  sourceDistribution: DistributionItem[]
  recentTrend: TrendItem[]
}

export default function HomeUI({
  dbLevels,
  vocabCount,
  sentencesCount,
  dueSentencesCount,
  articlesCount,
  quizzesCount,
  sourceDistribution,
  recentTrend,
}: HomeUIProps) {
  const { t } = useI18n()
  const maxSource = Math.max(1, ...sourceDistribution.map(item => item.count))
  const maxTrend = Math.max(1, ...recentTrend.map(item => item.count))

  return (
    <div className='px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-7xl space-y-6'>
        <section className='rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6'>
          <div className='mb-5 flex items-center justify-between'>
            <h2 className='text-xl font-black text-gray-900'>
              {t('home.dashboard') || '学习总览'}
            </h2>
            <Link
              href='/admin'
              className='rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50'>
              后台
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
        </section>

        <section className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
          <div className='rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6'>
            <h3 className='mb-4 text-base font-bold text-gray-800'>词条来源分布</h3>
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

          <div className='rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6'>
            <h3 className='mb-4 text-base font-bold text-gray-800'>近 7 天新增单词</h3>
            <div className='grid h-36 grid-cols-7 items-end gap-2'>
              {recentTrend.map(item => {
                const height = Math.max(8, (item.count / maxTrend) * 100)
                return (
                  <div key={item.label} className='flex flex-col items-center gap-2'>
                    <div
                      style={{ height: `${height}%` }}
                      className='w-full rounded-md bg-emerald-400/85'
                      title={`${item.label}: ${item.count}`}
                    />
                    <span className='text-[10px] text-gray-500'>{item.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className='rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:p-6'>
          <h3 className='mb-4 text-base font-bold text-gray-800'>听力分类</h3>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {dbLevels.map(level => (
              <Link
                key={level.id}
                href={`/level/${level.id}`}
                className='rounded-xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50'>
                <p className='font-bold text-gray-900'>{level.title}</p>
                <p className='mt-1 line-clamp-2 text-xs text-gray-500'>
                  {level.description || '听力语料分类'}
                </p>
              </Link>
            ))}
            {dbLevels.length === 0 && (
              <div className='rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400'>
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
    <div className='rounded-xl border border-gray-200 bg-gray-50 px-3 py-3'>
      <p className='text-xs font-medium text-gray-500'>{label}</p>
      <p className='mt-1 text-xl font-black text-gray-900'>{value}</p>
    </div>
  )
}
