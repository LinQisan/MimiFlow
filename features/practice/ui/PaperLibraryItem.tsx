'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ExamHubPaperSummary } from '@/lib/repositories/exam'
import { getPaperQuestionBreakdown } from '../domain/paper-library'
import { readUserStorageValue, useCurrentUser } from '@/context/UserContext'

export default function PaperLibraryItem({ paper }: { paper: ExamHubPaperSummary }) {
  const currentUser = useCurrentUser()
  const breakdown = getPaperQuestionBreakdown(paper)
  const [hasDraftProgress, setHasDraftProgress] = useState(false)

  useEffect(() => {
    try {
      const rawDraft = readUserStorageValue(
        currentUser.id,
        `practice:draft:paper:${paper.id}`,
      )
      if (!rawDraft) return
      const draft = JSON.parse(rawDraft) as {
        hasProgress?: boolean
        answers?: Record<string, string>
      }
      setHasDraftProgress(
        draft.hasProgress === true || Object.keys(draft.answers || {}).length > 0,
      )
    } catch {
      setHasDraftProgress(false)
    }
  }, [currentUser.id, paper.id])

  return (
    <article className='group rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-[0_10px_35px_-30px_rgba(15,23,42,0.55)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_45px_-28px_rgba(15,23,42,0.35)] md:px-6 md:py-6'>
      <div className='grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)_auto] md:items-center'>
        <div className='min-w-0'>
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
                {paper.completedPracticeCount > 0
                  ? `${paper.completedPracticeCount} 次完成`
                  : '尚无完整练习'}
              </p>
            </div>
            <div className='text-right'>
              <p className='text-2xl font-semibold tabular-nums text-slate-950'>
                {paper.latestPracticeScore !== null
                  ? paper.latestPracticeScore
                  : paper.attemptAccuracyPct !== null
                    ? `${paper.attemptAccuracyPct}%`
                    : '—'}
              </p>
              {paper.latestPracticeScore !== null ? (
                <p
                  className={`text-[10px] font-bold ${
                    paper.latestPracticePassed === true
                      ? 'text-emerald-700'
                      : paper.latestPracticePassed === false
                        ? 'text-rose-700'
                        : 'text-slate-400'
                  }`}>
                  {paper.latestPracticePassed === null
                    ? '最近得分'
                    : paper.latestPracticePassed
                      ? '最近合格'
                      : '最近未合格'}{' '}
                  · /180
                </p>
              ) : null}
            </div>
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
            {hasDraftProgress ? '继续练习' : '开始练习'}
          </Link>
          <a
            href={`/practice/${encodeURIComponent(paper.id)}`}
            className='inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 md:flex-none'>
            查看详情
          </a>
        </div>
      </div>
    </article>
  )
}
