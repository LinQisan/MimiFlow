import Link from 'next/link'
import { notFound } from 'next/navigation'

import ArticleReaderClient from '@/app/(library)/articles/[id]/ArticleReaderClient'
import { getArticleByLegacyId } from '@/lib/repositories/materials'

export const revalidate = 0

export default async function EbookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ebook = await getArticleByLegacyId(id)

  if (!ebook || ebook.sourceKind !== 'EPUB') {
    notFound()
  }

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4'>
        <header className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>
                Ebook
              </p>
              <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl'>
                {ebook.title}
              </h1>
              <p className='mt-2 text-sm text-slate-600'>
                {[ebook.author, ebook.category?.name].filter(Boolean).join(' · ') ||
                  '电子书阅读'}
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Link
                href='/'
                className='rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50'>
                返回主页
              </Link>
              <Link
                href='/ebooks'
                className='rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50'>
                返回电子书
              </Link>
              <Link
                href='/ebooks/import'
                className='rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800'>
                导入 EPUB
              </Link>
            </div>
          </div>
        </header>

        <ArticleReaderClient
          articleId={ebook.id}
          content={ebook.content}
          chapters={ebook.chapters}
          initialVocabularyMetaMap={ebook.vocabularyMetaMap}
        />
      </div>
    </main>
  )
}
