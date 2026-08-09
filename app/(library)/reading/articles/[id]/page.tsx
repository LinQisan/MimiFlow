import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getArticleById } from '@/lib/repositories/materials'
import ArticleReaderClient from '@/features/reading/ui/ArticleReaderClient'
import ArticleQuestionsPanel from './ArticleQuestionsPanel'
import { isEbookSourceKind } from '@/lib/ebooks/source-kind'

export const revalidate = 0

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const article = await getArticleById(id)

  if (!article) {
    notFound()
  }

  if (isEbookSourceKind(article.sourceKind)) {
    redirect(`/reading/ebooks/${encodeURIComponent(article.id)}`)
  }

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-5 md:px-6 md:py-7'>
      <div className='mx-auto max-w-6xl space-y-10 md:space-y-14'>
        <header className='mx-auto max-w-4xl border-b border-slate-200 pb-6 md:pb-8'>
          <div className='flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between'>
            <div className='min-w-0'>
              {article.hasAuthenticTitle ? (
                <h1 className='max-w-3xl text-3xl font-semibold leading-tight text-slate-950 md:text-4xl'>
                  {article.shortTitle}
                </h1>
              ) : null}
              <p className={`${article.hasAuthenticTitle ? 'mt-4' : ''} text-sm tracking-wide text-slate-500`}>
                {article.category ? article.category.name : '阅读材料'}
                {article.questions.length > 0
                  ? ` · ${article.questions.length} 题`
                  : ''}
              </p>
            </div>
            <Link href='/reading?tab=articles' className='ui-btn shrink-0 self-start sm:self-auto'>
              返回阅读中心
            </Link>
          </div>
        </header>

        <ArticleReaderClient
          articleId={article.id}
          content={article.content}
          chapters={article.chapters}
          initialVocabularyMetaMap={article.vocabularyMetaMap}
          initialProgressPercent={article.progress?.percent || 0}
        />

        <div className='mx-auto max-w-[44rem]'>
          <ArticleQuestionsPanel questions={article.questions} />
        </div>
      </div>
    </main>
  )
}
