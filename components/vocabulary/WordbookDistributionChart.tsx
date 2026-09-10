'use client'

import { useState } from 'react'

import type { PaperWordbookDistribution } from '@/features/practice/domain/paper-word-frequency'

type DistributionRow = PaperWordbookDistribution['wordbooks'][number] & {
  kind: 'wordbook' | 'outside'
}

export default function WordbookDistributionChart({
  distribution,
  title = '单词书分布',
  description,
}: {
  distribution: PaperWordbookDistribution
  title?: string
  description?: string
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (distribution.totalWords === 0) return null

  const rows: DistributionRow[] = [
    ...distribution.wordbooks.map(row => ({
      ...row,
      kind: 'wordbook' as const,
    })),
    {
      id: 'outside-wordbooks',
      name: '未加入任何单词书',
      pathLabel: '未加入任何单词书',
      depth: 0,
      matchedCount: distribution.outsideCount,
      coverageRate: distribution.outsideRate,
      matchedWords: distribution.outsideWords || [],
      matchedHeadwords: {},
      matchedJlpt: {},
      kind: 'outside' as const,
    },
  ].filter(row => row.matchedCount > 0)

  return (
    <section aria-label={title} className='border-y border-slate-200 py-5'>
      <div className='flex flex-wrap items-end justify-between gap-x-4 gap-y-1'>
        <div>
          <h3 className='text-sm font-semibold text-slate-950'>{title}</h3>
          <p className='mt-1 text-xs leading-5 text-slate-500'>
            {description ||
              `按 ${distribution.totalWords} 个去重词统计；父级包含子级，同一个词可能命中多个单词书。`}
          </p>
        </div>
        <p className='text-[11px] font-medium text-slate-400'>
          单词书按覆盖词数排序 · 未收录置底 · 点击查看单词
        </p>
      </div>

      <ol className='mt-4 divide-y divide-slate-200 border-y border-slate-200'>
        {rows.map((row, index) => {
          const isExpanded = expandedId === row.id
          const isOutside = row.kind === 'outside'
          return (
            <li
              key={row.id}
              className={isOutside ? 'bg-slate-100/45' : undefined}>
              <button
                type='button'
                aria-expanded={isExpanded}
                aria-controls={`wordbook-distribution-${row.id}`}
                onClick={() =>
                  setExpandedId(current => current === row.id ? null : row.id)
                }
                className='group grid min-h-14 w-full grid-cols-[2rem_minmax(0,1fr)_7rem_1.25rem] items-center gap-x-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 sm:grid-cols-[2rem_minmax(10rem,17rem)_minmax(8rem,1fr)_7.5rem_1.25rem]'>
                <span className='col-start-1 row-start-1 text-center text-[11px] font-semibold tabular-nums text-slate-400'>
                  {isOutside ? '—' : String(index + 1).padStart(2, '0')}
                </span>
                <span className='col-start-2 row-start-1 min-w-0'>
                  <span className='block truncate text-sm font-semibold text-slate-800'>
                    {row.name}
                  </span>
                  {row.pathLabel !== row.name ? (
                    <span
                      className='mt-0.5 block truncate text-[11px] text-slate-400'
                      title={row.pathLabel}>
                      {row.pathLabel}
                    </span>
                  ) : null}
                </span>
                <span className='col-span-2 col-start-2 row-start-2 mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:mt-0'>
                  <span
                    className={`block h-full rounded-full ${
                      isOutside ? 'bg-slate-400' : 'bg-violet-500'
                    }`}
                    style={{ width: `${Math.min(100, row.coverageRate)}%` }}
                  />
                </span>
                <span className='col-start-3 row-start-1 shrink-0 text-right text-xs tabular-nums text-slate-500 sm:col-start-4'>
                  <strong className='text-sm text-slate-900'>
                    {row.matchedCount}
                  </strong>{' '}
                  个 · {row.coverageRate}%
                </span>
                <svg
                  aria-hidden='true'
                  viewBox='0 0 20 20'
                  className={`col-start-4 row-start-1 h-4 w-4 text-slate-400 transition-transform group-hover:text-slate-700 sm:col-start-5 ${
                    isExpanded ? 'rotate-180' : ''
                  }`}>
                  <path
                    d='m5 7.5 5 5 5-5'
                    fill='none'
                    stroke='currentColor'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth='1.7'
                  />
                </svg>
              </button>

              {isExpanded ? (
                <div
                  id={`wordbook-distribution-${row.id}`}
                  className='border-t border-slate-200 px-4 py-3 sm:pl-[3.25rem]'>
                  <p className='mb-2 text-[11px] font-medium text-slate-400'>
                    {isOutside
                      ? '尚未收录的单词'
                      : `命中“${row.pathLabel}”的单词`}
                  </p>
                  <ul className='flex max-h-44 flex-wrap gap-x-2 gap-y-1.5 overflow-y-auto pr-2'>
                    {(row.matchedWords || []).map(word => (
                      <li
                        key={word}
                        lang='ja'
                        className='rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm font-medium text-slate-700'>
                        {word}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
