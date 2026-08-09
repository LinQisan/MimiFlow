import Link from 'next/link'
import type { ExamHubPaperSummary } from '@/lib/repositories/exam'
import {
  formatPaperDate,
  getPaperQuestionBreakdown,
  paperLanguageLabel,
  paperLevelLabel,
} from '../domain/paper-library'

export default function PaperLibraryItem({ paper }: { paper: ExamHubPaperSummary }) {
  const breakdown = getPaperQuestionBreakdown(paper)
  const hasHistory = paper.attemptCount > 0

  return (
    <article className='group rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-[0_10px_35px_-30px_rgba(15,23,42,0.55)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)] md:px-6 md:py-6'>
      <div className='grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)_auto] md:items-center'>
        <div className='min-w-0'>
          <div className='mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-slate-500'>
            <span>{paperLanguageLabel(paper.language)}</span>
            <span className='h-1 w-1 rounded-full bg-slate-300' />
            <span>{paperLevelLabel(paper.level)}</span>
            <span className='h-1 w-1 rounded-full bg-slate-300' />
            <span>更新于 {formatPaperDate(paper.updatedAt)}</span>
          </div>
          <h3 className='text-xl font-semibold tracking-tight text-slate-950 md:text-2xl'>
            {paper.name}
          </h3>
          {paper.description ? (
            <p className='mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-slate-500'>
              {paper.description}
            </p>
          ) : null}
          <div className='mt-4 flex flex-wrap gap-x-5 gap-y-2'>
            {breakdown.map(item => (
              <span key={item.label} className='text-xs text-slate-500'>
                {item.label} <strong className='ml-1 font-semibold text-slate-800'>{item.value}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className='border-t border-slate-100 pt-4 md:border-l md:border-t-0 md:py-1 md:pl-6'>
          <div className='flex items-end justify-between gap-4'>
            <div>
              <p className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>练习记录</p>
              <p className='mt-1 text-sm font-semibold text-slate-700'>
                {hasHistory ? `${paper.attemptCount} 次作答` : '尚未开始'}
              </p>
            </div>
            <p className='text-2xl font-semibold tabular-nums text-slate-950'>
              {paper.attemptAccuracyPct !== null ? `${paper.attemptAccuracyPct}%` : '—'}
            </p>
          </div>
          <div className='mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100'>
            <div
              className='h-full rounded-full bg-slate-900 transition-[width]'
              style={{ width: `${paper.attemptAccuracyPct || 0}%` }}
            />
          </div>
          <p className='mt-2 text-[11px] text-slate-400'>
            {paper.questionCount} 题 · {paper.moduleCount} 个部分
          </p>
        </div>

        <div className='flex gap-2 md:flex-col'>
          <Link
            href={`/practice/${encodeURIComponent(paper.id)}/do`}
            className='inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 md:flex-none'>
            {hasHistory ? '继续练习' : '开始答题'}
          </Link>
          <Link
            href={`/practice/${encodeURIComponent(paper.id)}`}
            className='inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 md:flex-none'>
            查看详情
          </Link>
        </div>
      </div>
    </article>
  )
}
