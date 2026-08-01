import Link from 'next/link'

import { getReviewOverview } from '@/modules/review/server/queries'
import PageHeader from '@/components/layout/PageHeader'

export const dynamic = 'force-dynamic'

export default async function ReviewPage() {
  const overview = await getReviewOverview()

  const sections = [
    {
      title: '记忆复习',
      description: '使用 FSRS 复习到期的单词和句子。',
      count: overview.dueMemory,
      detail: `单词 ${overview.dueVocabularies} · 句子 ${overview.dueSentences}`,
      href: '/review/memory',
      action: '开始复习',
    },
    {
      title: '错题巩固',
      description: '按照 24h / 72h / 7d 节奏重新作答。',
      count: overview.dueMistakes,
      detail: `错题本共 ${overview.allMistakes} 题`,
      href: '/review/mistakes',
      action: '开始巩固',
    },
  ]

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-4xl space-y-5'>
        <PageHeader title='复习中心' description='处理到期记忆和需要巩固的错题。' />

        <section className='grid gap-4 md:grid-cols-2'>
          {sections.map(section => (
            <article
              key={section.title}
              className='border-t border-slate-200 py-5'>
              <div className='flex items-start justify-between gap-4'>
                <div>
                  <h2 className='text-xl font-black text-slate-900'>
                    {section.title}
                  </h2>
                  <p className='mt-2 text-sm leading-6 text-slate-600'>{section.description}</p>
                </div>
                <span className='min-w-12 rounded-full bg-slate-900 px-3 py-1 text-center text-sm font-bold text-white'>
                  {section.count}
                </span>
              </div>
              <p className='mt-5 text-xs text-slate-500'>{section.detail}</p>
              <Link
                href={section.href}
                className='mt-4 inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800'>
                {section.count > 0 ? section.action : '查看'}
              </Link>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
