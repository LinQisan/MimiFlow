import Link from 'next/link'
import { notFound } from 'next/navigation'

import ArticleReaderClient from '@/app/(library)/reading/articles/[id]/ArticleReaderClient'
import { getArticleByLegacyId } from '@/lib/repositories/materials'
import PageHeader from '@/components/layout/PageHeader'
import { prepareEbookChapters } from '@/lib/ebooks/chapter-display'

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
  const chapters = prepareEbookChapters(ebook.chapters, ebook.title)

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4'>
        <PageHeader
          title={ebook.title}
          description={
            [ebook.author, `${chapters.length} 个章节`]
              .filter(Boolean)
              .join(' · ') || undefined
          }
          actions={
              <Link
                href='/reading?tab=ebooks'
                className='ui-btn'>
                返回阅读中心
              </Link>
          }
        />

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
