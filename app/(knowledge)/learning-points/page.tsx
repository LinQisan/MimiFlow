import Link from 'next/link'
import { LearningRecordKind } from '@prisma/client'

import PageHeader from '@/components/layout/PageHeader'
import {
  LEARNING_POINT_CATEGORY_LABELS,
  LEARNING_RECORD_KIND_LABELS,
  SOURCE_TYPE_LABELS,
  normalizeLearningFragments,
} from '@/modules/knowledge/learning-records/domain'
import { listLearningRecords } from '@/modules/knowledge/learning-records/server/repository'

export const revalidate = 0

export default async function LearningPointsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawKind = Array.isArray(params.kind) ? params.kind[0] : params.kind
  const kind =
    rawKind === 'sentence'
      ? LearningRecordKind.SENTENCE
      : rawKind === 'point'
        ? LearningRecordKind.LEARNING_POINT
        : undefined
  const records = await listLearningRecords(kind)

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-8 md:py-8'>
      <div className='mx-auto max-w-5xl space-y-6'>
        <PageHeader
          showTitle
          title='学习点'
          description='保存句内语法、句型、言い換え与辨析；记录锚定原文文本和上下文，不依赖页面 DOM。'
          meta={<span>共 {records.length} 条记录</span>}
        />

        <nav className='flex gap-2' aria-label='学习记录筛选'>
          {[
            { href: '/learning-points', label: '全部', active: !kind },
            {
              href: '/learning-points?kind=point',
              label: '学习点',
              active: kind === LearningRecordKind.LEARNING_POINT,
            },
            {
              href: '/learning-points?kind=sentence',
              label: '句子',
              active: kind === LearningRecordKind.SENTENCE,
            },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                item.active
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
              }`}>
              {item.label}
            </Link>
          ))}
        </nav>

        {records.length === 0 ? (
          <p className='rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500'>
            暂无记录。在正文、字幕或题目中选中文字，再点“划词”即可记录。
          </p>
        ) : (
          <section className='grid gap-4 md:grid-cols-2'>
            {records.map(record => {
              const fragments = normalizeLearningFragments(record.fragments)
              return (
                <article
                  key={record.id}
                  className='rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_36px_-32px_rgba(15,23,42,0.5)]'>
                  <div className='flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500'>
                    <span className='rounded-full bg-slate-900 px-2 py-0.5 text-white'>
                      {LEARNING_RECORD_KIND_LABELS[record.kind]}
                    </span>
                    {record.category ? (
                      <span>{LEARNING_POINT_CATEGORY_LABELS[record.category]}</span>
                    ) : null}
                    <span>·</span>
                    <span>{SOURCE_TYPE_LABELS[record.sourceType]}</span>
                  </div>
                  <h2 className='mt-3 text-lg font-bold text-slate-950'>{record.title}</h2>
                  {fragments.length > 0 ? (
                    <div className='mt-3 flex flex-wrap gap-1.5'>
                      {fragments.map(fragment => (
                        <span key={fragment} className='rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950'>
                          {fragment}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <blockquote className='mt-4 border-l-2 border-slate-200 pl-3 text-sm leading-7 text-slate-700'>
                    {record.sentenceText}
                  </blockquote>
                  {record.note ? (
                    <p className='mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600'>{record.note}</p>
                  ) : null}
                  <time className='mt-4 block text-[11px] text-slate-400'>
                    {new Intl.DateTimeFormat('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    }).format(record.updatedAt)}
                  </time>
                </article>
              )
            })}
          </section>
        )}
      </div>
    </main>
  )
}
