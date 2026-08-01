import Link from 'next/link'

import { listReadingMaterials } from '@/lib/repositories/materials'
import PageHeader from '@/components/layout/PageHeader'
import DeleteEbookButton from './DeleteEbookButton'

export const revalidate = 0

const summarize = (value: string | null, fallback: string) => {
  const normalized = (value || fallback).replace(/\s+/g, ' ').trim()
  return normalized.length > 96 ? `${normalized.slice(0, 92)}…` : normalized
}

export default async function ReadingCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const materials = await listReadingMaterials()
  const articles = materials.filter(item => item.sourceKind !== 'EPUB')
  const ebooks = materials.filter(item => item.sourceKind === 'EPUB')
  const activeTab = tab === 'ebooks' ? 'ebooks' : 'articles'
  const visibleMaterials = activeTab === 'ebooks' ? ebooks : articles

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-5'>
        <PageHeader title='阅读中心' description='阅读文章和电子书，继续上次进度。' />

        <section>
          <nav
            aria-label='阅读材料分类'
            className='flex gap-2 border-b border-slate-200 pb-4'>
            <Link
              href='/reading?tab=articles'
              aria-current={activeTab === 'articles' ? 'page' : undefined}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === 'articles'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              文章 {articles.length}
            </Link>
            <Link
              href='/reading?tab=ebooks'
              aria-current={activeTab === 'ebooks' ? 'page' : undefined}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                activeTab === 'ebooks'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              电子书 {ebooks.length}
            </Link>
          </nav>

          {visibleMaterials.length === 0 ? (
            <div className='py-12 text-center'>
              <p className='text-sm text-slate-500'>
                {activeTab === 'ebooks'
                  ? '暂无电子书，可以先导入 EPUB。'
                  : '暂无文章，可以从导入中心添加阅读材料。'}
              </p>
              <Link
                href={
                  activeTab === 'ebooks'
                    ? '/manage/import?type=ebook'
                    : '/manage/import?type=reading'
                }
                className='ui-btn ui-btn-primary mt-4'>
                {activeTab === 'ebooks' ? '导入 EPUB' : '导入文章'}
              </Link>
            </div>
          ) : (
            <div className='mt-5 divide-y divide-slate-200 border-y border-slate-200'>
              {visibleMaterials.map(item => {
                const progress = Math.round(item.progress?.percent || 0)
                const href =
                  item.sourceKind === 'EPUB'
                    ? `/reading/ebooks/${encodeURIComponent(item.id)}`
                    : `/reading/articles/${encodeURIComponent(item.id)}`
                return (
                  <article
                    key={item.id}
                    className='flex flex-col py-5 md:px-1'>
                    <Link href={href} className='group flex-1'>
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <p className='text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400'>
                            {item.sourceKind === 'EPUB'
                              ? 'EPUB'
                              : item.paper?.name || '文章'}
                          </p>
                          <h2 className='mt-2 line-clamp-2 text-base font-black leading-6 text-slate-900 group-hover:text-slate-600'>
                            {item.shortTitle}
                          </h2>
                        </div>
                        <span className='shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                          {item.sourceKind === 'EPUB'
                            ? `${Math.max(1, item.chapterCount)} 页`
                            : `${item.questionCount} 题`}
                        </span>
                      </div>

                      <p className='mt-3 line-clamp-2 text-sm leading-6 text-slate-600'>
                        {summarize(
                          item.description,
                          item.author || item.content || '暂无摘要',
                        )}
                      </p>

                      <div className='mt-4'>
                        <div className='flex items-center justify-between text-xs font-semibold text-slate-500'>
                          <span>{progress > 0 ? '继续阅读' : '尚未开始'}</span>
                          <span>{progress}%</span>
                        </div>
                        <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100'>
                          <div
                            className='h-full rounded-full bg-slate-900'
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </Link>

                    {item.sourceKind === 'EPUB' ? (
                      <div className='mt-4 flex justify-end border-t border-slate-100 pt-3'>
                        <DeleteEbookButton id={item.id} title={item.title} />
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
