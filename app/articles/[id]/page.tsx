import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getArticleByLegacyId } from '@/lib/repositories/materials'

export const revalidate = 0

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const article = await getArticleByLegacyId(id)

  if (!article) {
    notFound()
  }

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-5xl space-y-4'>
        <header className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>
                Article
              </p>
              <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl'>
                {article.title}
              </h1>
              <p className='mt-2 text-sm text-slate-600'>
                {article.category ? `来源：${article.category.name}` : '阅读材料详情'}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Link
                href='/articles'
                className='rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50'>
                返回列表
              </Link>
              <Link
                href={`/manage/collection/article/${encodeURIComponent(article.id)}`}
                className='rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800'>
                去管理页
              </Link>
            </div>
          </div>
        </header>

        <section className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          <h2 className='text-lg font-black text-slate-900'>正文</h2>
          <p className='mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700'>
            {article.content || '暂无正文内容。'}
          </p>
        </section>

        <section className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          <h2 className='text-lg font-black text-slate-900'>题目</h2>
          {article.questions.length === 0 ? (
            <p className='mt-3 text-sm text-slate-500'>暂无题目。</p>
          ) : (
            <div className='mt-4 space-y-3'>
              {article.questions.map((question, index) => (
                <article
                  key={question.id}
                  className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <h3 className='text-sm font-bold text-slate-900'>
                      第 {index + 1} 题
                    </h3>
                    <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                      {question.questionType}
                    </span>
                  </div>
                  {question.prompt ? (
                    <p className='mt-2 text-sm leading-6 text-slate-700'>
                      {question.prompt}
                    </p>
                  ) : null}
                  {question.contextSentence ? (
                    <p className='mt-2 text-xs text-slate-500'>
                      语境：{question.contextSentence}
                    </p>
                  ) : null}
                  {question.options.length > 0 ? (
                    <div className='mt-3 grid gap-2'>
                      {question.options.map(option => (
                        <div
                          key={option.id}
                          className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700'>
                          {option.text}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
