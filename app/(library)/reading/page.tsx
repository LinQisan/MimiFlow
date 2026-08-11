import Link from 'next/link'

import { listReadingMaterials } from '@/lib/repositories/materials'
import PageHeader from '@/components/layout/PageHeader'
import DeleteEbookButton from './DeleteEbookButton'
import {
  getEbookSourceLabel,
  isEbookSourceKind,
} from '@/lib/ebooks/source-kind'

export const revalidate = 0

const summarize = (value: string | null, fallback: string) => {
  const normalized = (value || fallback).replace(/\s+/g, ' ').trim()
  return normalized.length > 96 ? `${normalized.slice(0, 92)}…` : normalized
}

type ReadingCenterPageProps = {
  searchParams: Promise<{ tab?: string }>
}

export default async function ReadingCenterPage(props: ReadingCenterPageProps) {
  try {
    return await renderReadingCenterPage(props)
  } catch (error) {
    console.error('Failed to render reading data', error)
    throw error
  }
}

async function renderReadingCenterPage({
  searchParams,
}: ReadingCenterPageProps) {
  const { tab } = await searchParams
  const materials = await listReadingMaterials()
  const articles = materials.filter(item => !isEbookSourceKind(item.sourceKind))
  const ebooks = materials.filter(item => isEbookSourceKind(item.sourceKind))
  const activeTab = tab === 'ebooks' ? 'ebooks' : 'articles'
  const visibleMaterials = activeTab === 'ebooks' ? ebooks : articles

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8 md:py-8'>
      <div className='mx-auto max-w-7xl space-y-5'>
        <PageHeader title='阅读中心' description='阅读文章和电子书，继续上次进度。' />

        <section>
          <nav
            aria-label='阅读材料分类'
            className='flex gap-2 border-b border-slate-200 pb-4'>
            <Link
              href='/reading?tab=articles'
              aria-current={activeTab === 'articles' ? 'page' : undefined}
              className={`border-b-2 px-4 py-2 text-sm font-bold transition ${
                activeTab === 'articles'
                  ? 'border-slate-900 text-slate-950'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'
              }`}>
              文章 {articles.length}
            </Link>
            <Link
              href='/reading?tab=ebooks'
              aria-current={activeTab === 'ebooks' ? 'page' : undefined}
              className={`border-b-2 px-4 py-2 text-sm font-bold transition ${
                activeTab === 'ebooks'
                  ? 'border-slate-900 text-slate-950'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'
              }`}>
              电子书 {ebooks.length}
            </Link>
          </nav>

          {visibleMaterials.length === 0 ? (
            <div className='py-12 text-center'>
              <p className='text-sm text-slate-500'>
                {activeTab === 'ebooks'
                  ? '暂无电子书，可以粘贴专业书籍正文或导入 EPUB。'
                  : '暂无文章，可以从导入中心添加阅读材料。'}
              </p>
              <Link
                href={
                  activeTab === 'ebooks'
                    ? '/manage/import?type=ebook'
                    : '/manage/import?type=reading'
                }
                className='ui-btn ui-btn-primary mt-4'>
                {activeTab === 'ebooks' ? '导入电子书' : '导入文章'}
              </Link>
            </div>
          ) : (
            <div className='mt-5 space-y-3'>
              {visibleMaterials.map(item => {
                const progress = Math.round(item.progress?.percent || 0)
                const href =
                  isEbookSourceKind(item.sourceKind)
                    ? `/reading/ebooks/${encodeURIComponent(item.id)}`
                    : `/reading/articles/${encodeURIComponent(item.id)}`
                return (
                  <article
                    key={item.id}
                    className='flex flex-col rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-[0_12px_36px_-32px_rgba(15,23,42,0.5)] md:px-6'>
                    <Link href={href} className='group flex-1'>
                      <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                          <p className='text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400'>
                            {isEbookSourceKind(item.sourceKind)
                              ? getEbookSourceLabel(item.sourceKind)
                              : item.paper?.name || '文章'}
                          </p>
                          {item.hasAuthenticTitle ? (
                            <h2 className='mt-2 line-clamp-2 text-base font-semibold leading-6 text-slate-900 group-hover:text-slate-600'>
                              {item.shortTitle}
                            </h2>
                          ) : null}
                        </div>
                        <span className='shrink-0 border-l border-slate-300 pl-3 text-[11px] font-medium tracking-wide text-slate-600'>
                          {isEbookSourceKind(item.sourceKind)
                            ? `${Math.max(1, item.chapterCount)} 个章节`
                            : `${item.questionCount} 题`}
                        </span>
                      </div>

                      <p className={`${item.hasAuthenticTitle ? 'mt-3' : 'mt-4'} line-clamp-2 text-sm leading-7 text-slate-600`}>
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

                    {isEbookSourceKind(item.sourceKind) ? (
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
