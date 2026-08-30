import type { PaperWordbookDistribution } from '@/features/practice/domain/paper-word-frequency'

export default function WordbookDistributionChart({
  distribution,
  title = '单词书分布',
  description,
}: {
  distribution: PaperWordbookDistribution
  title?: string
  description?: string
}) {
  if (distribution.totalWords === 0) return null

  const rows = [
    ...distribution.wordbooks,
    {
      id: 'outside-wordbooks',
      name: '未加入任何单词书',
      pathLabel: '未加入任何单词书',
      depth: 0,
      matchedCount: distribution.outsideCount,
      coverageRate: distribution.outsideRate,
    },
  ]

  return (
    <section aria-label={title} className='border-y border-slate-200 py-5'>
      <div>
        <h3 className='text-sm font-semibold text-slate-950'>{title}</h3>
        <p className='mt-1 text-xs leading-5 text-slate-500'>
          {description ||
            `按 ${distribution.totalWords} 个去重词统计；父级包含子级，同一个词可能命中多个单词书。`}
        </p>
      </div>
      <div className='mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2'>
        {rows.map(row => (
          <div key={row.id} title={row.pathLabel}>
            <div
              className='flex items-center justify-between gap-3 text-xs'
              style={{ paddingLeft: `${row.depth * 0.9}rem` }}>
              <span className='min-w-0 truncate font-semibold text-slate-700'>
                {row.name}
              </span>
              <span className='shrink-0 tabular-nums text-slate-500'>
                <strong className='text-slate-900'>{row.matchedCount}</strong>{' '}
                个 · {row.coverageRate}%
              </span>
            </div>
            <div
              className='mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200'
              style={{ marginLeft: `${row.depth * 0.9}rem` }}>
              <div
                className={`h-full rounded-full ${
                  row.id === 'outside-wordbooks'
                    ? 'bg-slate-400'
                    : 'bg-violet-500'
                }`}
                style={{ width: `${Math.min(100, row.coverageRate)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
