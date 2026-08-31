import Link from 'next/link'
import { LearningRecordKind } from '@prisma/client'

import PageHeader from '@/components/layout/PageHeader'
import {
  normalizeLearningFragments,
} from '@/modules/knowledge/learning-records/domain'
import LearningRecordItem from '@/modules/knowledge/learning-records/components/LearningRecordItem'
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
    <main className='min-h-screen bg-slate-50 px-4 py-6 dark:bg-slate-950 md:px-8 md:py-8'>
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
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500'
              }`}>
              {item.label}
            </Link>
          ))}
        </nav>

        {records.length === 0 ? (
          <p className='rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'>
            暂无记录。在正文、字幕或题目中选中文字，再点“划词”即可记录。
          </p>
        ) : (
          <section className='divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800'>
            {records.map(record => {
              const fragments = normalizeLearningFragments(record.fragments)
              return (
                <LearningRecordItem
                  key={record.id}
                  record={{
                    id: record.id,
                    kind: record.kind,
                    category: record.category,
                    title: record.title,
                    fragments,
                    sentenceText: record.sentenceText,
                    note: record.note,
                    sourceType: record.sourceType,
                    sourceHref: record.sourceHref,
                    updatedAtLabel: new Intl.DateTimeFormat('zh-CN', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    }).format(record.updatedAt),
                  }}
                />
              )
            })}
          </section>
        )}
      </div>
    </main>
  )
}
