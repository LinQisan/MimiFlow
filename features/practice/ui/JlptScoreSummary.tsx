import type { JlptScoreSummary as JlptScoreSummaryData } from '@/modules/practice/domain/jlpt-scoring'

const scoreItems = [
  { key: 'language', label: '文字・词汇・语法' },
  { key: 'reading', label: '阅读' },
  { key: 'listening', label: '听力' },
] as const

export default function JlptScoreSummary({
  summary,
  title = '本次得分',
}: {
  summary: JlptScoreSummaryData
  title?: string
}) {
  return (
    <section className='border-y border-slate-200 bg-white/50 px-4 py-4 md:px-5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h2 className='text-sm font-bold text-slate-950'>{title}</h2>
        {summary.passed !== null ? (
          <span
            className={`text-xs font-bold ${
              summary.passed ? 'text-emerald-700' : 'text-rose-700'
            }`}>
            {summary.passed ? '合格' : '未合格'}
          </span>
        ) : null}
      </div>
      <div className='mt-3 grid grid-cols-2 divide-x divide-y divide-slate-200 border border-slate-200 sm:grid-cols-4 sm:divide-y-0'>
        {scoreItems.map(item => {
          const section = summary[item.key]
          return (
            <div key={item.key} className='px-3 py-3 text-center'>
              <p className='text-[11px] font-medium text-slate-500'>
                {item.label}
              </p>
              <p className='mt-1 text-2xl font-bold tabular-nums text-slate-950'>
                {section.score}
                <span className='ml-0.5 text-xs font-medium text-slate-400'>
                  /60
                </span>
              </p>
            </div>
          )
        })}
        <div className='px-3 py-3 text-center'>
          <p className='text-[11px] font-bold text-slate-700'>总分</p>
          <p className='mt-1 text-2xl font-bold tabular-nums text-slate-950'>
            {summary.totalScore}
            <span className='ml-0.5 text-xs font-medium text-slate-400'>
              /180
            </span>
          </p>
        </div>
      </div>
      {summary.passLine !== null ? (
        <p className='mt-3 text-[11px] leading-5 text-slate-500'>
          N1 合格条件：总分至少 {summary.passLine} 分，且三个部分均至少 19 分。
        </p>
      ) : null}
    </section>
  )
}
