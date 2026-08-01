import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getArticleByLegacyId } from '@/lib/repositories/materials'
import ArticleReaderClient from './ArticleReaderClient'
import ArticleQuestionsPanel from './ArticleQuestionsPanel'
import PageHeader from '@/components/layout/PageHeader'

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

  if (article.sourceKind === 'EPUB') {
    redirect(`/reading/ebooks/${encodeURIComponent(article.id)}`)
  }

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-5 md:px-6 md:py-7'>
      <div className='mx-auto max-w-5xl space-y-6'>
        <PageHeader
          title={article.shortTitle}
          description={article.category ? `来源：${article.category.name}` : undefined}
          actions={
              <Link
                href='/reading?tab=articles'
                className='ui-btn'>
                返回阅读中心
              </Link>
          }
        />

        <ArticleReaderClient
          articleId={article.id}
          content={article.content}
          chapters={article.chapters}
          initialVocabularyMetaMap={article.vocabularyMetaMap}
          initialProgressPercent={article.progress?.percent || 0}
        />

        <ArticleQuestionsPanel questions={article.questions} />
      </div>
    </main>
  )
}
