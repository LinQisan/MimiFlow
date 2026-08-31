'use client'

import type { LearningPointCategory } from '@prisma/client'

import { LEARNING_POINT_CATEGORY_LABELS } from '@/modules/knowledge/learning-records/domain'
import type { LearningPointHighlight } from '@/hooks/useStudyTextHighlights'

const CATEGORY_BORDER_CLASS: Record<LearningPointCategory, string> = {
  GRAMMAR: 'border-blue-400',
  PATTERN: 'border-violet-400',
  IDIOM: 'border-amber-400',
  PARAPHRASE: 'border-teal-400',
  DISTRACTOR: 'border-rose-400',
  OTHER: 'border-slate-400',
}

export default function LearningPointHighlightPanel({
  points,
  isLoading = false,
}: {
  points: LearningPointHighlight[]
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <p className='border-y border-slate-200 bg-white px-4 py-3 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-950'>
        正在加载当前内容的学习点…
      </p>
    )
  }

  if (points.length === 0) {
    return (
      <p className='border-y border-slate-200 bg-white px-4 py-3 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-950'>
        当前内容暂无学习点。
      </p>
    )
  }

  return (
    <section
      aria-label='当前内容的学习点'
      className='border-y border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950'>
      <div className='mb-2 flex items-center justify-between gap-3'>
        <h3 className='text-xs font-bold text-slate-700 dark:text-slate-200'>当前学习点</h3>
        <span className='text-[11px] text-slate-400'>{points.length} 条</span>
      </div>
      <div className='grid gap-2 lg:grid-cols-2'>
        {points.map(point => {
          const category = point.category || 'OTHER'
          return (
            <article
              key={point.id}
              className={`border-l-2 pl-3 ${CATEGORY_BORDER_CLASS[category]}`}>
              <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
                <strong className='text-sm text-slate-900 dark:text-slate-100'>{point.title}</strong>
                <span className='text-[11px] font-semibold text-slate-400'>
                  {LEARNING_POINT_CATEGORY_LABELS[category]}
                </span>
              </div>
              {point.note ? (
                <p className='mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-slate-300'>
                  {point.note}
                </p>
              ) : (
                <p className='mt-1 text-xs text-slate-400'>
                  {point.fragments.join(' / ')}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
