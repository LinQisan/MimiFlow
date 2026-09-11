import Link from 'next/link'
import { notFound } from 'next/navigation'

import ArticleReaderClient from '@/modules/reading/components/ArticleReaderClient'
import { getArticleById } from '@/lib/repositories/materials'
import { prepareEbookChapters } from '@/lib/ebooks/chapter-display'
import { isEbookSourceKind } from '@/lib/ebooks/source-kind'

export const revalidate = 0

export default async function EbookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ebook = await getArticleById(id)

  if (!ebook || !isEbookSourceKind(ebook.sourceKind)) {
    notFound()
  }
  const chapters = prepareEbookChapters(ebook.chapters, ebook.title)

  return (
    <main className='min-h-screen bg-[#f6f5f1] px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4'>
        <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 pb-3'>
          <h1 className='text-lg font-bold tracking-tight text-slate-950'>{ebook.title}</h1>
          <p className='ui-meta'>
            {[ebook.author, `${chapters.length} 个章节`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className='flex justify-end'>
          <Link
            href='/reading?tab=ebooks'
            className='ui-btn'>
            返回阅读中心
          </Link>
        </div>

        <ArticleReaderClient
          articleId={ebook.id}
          content={ebook.content}
          chapters={chapters}
          initialVocabularyMetaMap={ebook.vocabularyMetaMap}
          initialProgressPercent={ebook.progress?.percent || 0}
          mode='ebook'
          documentTitle={ebook.title}
        />
      </div>
    </main>
  )
}
