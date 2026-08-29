import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import {
  getArticleById,
  listRelatedReadingArticles,
} from '@/lib/repositories/materials'
import ArticleReaderClient from '@/features/reading/ui/ArticleReaderClient'
import ArticleQuestionsPanel from './ArticleQuestionsPanel'
import { isEbookSourceKind } from '@/lib/ebooks/source-kind'
import { getSudachiPronunciationMap } from '@/features/reading/server/sudachi-pronunciation'
import { buildVocabularyCandidates } from '@/features/reading/domain/sudachi'
import ManageAudioPlayer from '@/features/listening/ui/ManageAudioPlayer'
import {
  formatNewsDate,
  getNewsEditionLabel,
  getNewsTypeLabel,
  normalizeNewsMetadata,
} from '@/features/reading/domain/news-metadata'
import ArticleSiblingNav from '@/features/reading/ui/ArticleSiblingNav'

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

  const articleTexts =
    article.chapters.length > 0
      ? article.chapters.map(chapter => chapter.text)
      : [article.content]
  const news = normalizeNewsMetadata({
    ...article,
    collectionName: article.category?.name,
  })
  const newsEditionLabel = getNewsEditionLabel(article.edition)
  const isPaperArticle = article.category?.collectionType === 'PAPER'
  const siblingLabel = isPaperArticle
    ? article.category?.name || '同一试卷'
    : [
        news.source,
        news.column || news.section || getNewsTypeLabel(news.type),
      ].filter(Boolean).join(' · ')
  const [sudachiPronunciation, relatedArticles] = await Promise.all([
    getSudachiPronunciationMap(articleTexts),
    isPaperArticle || article.sourceKind === 'NEWS'
      ? listRelatedReadingArticles({
          articleId: article.id,
          collectionId: article.category?.id,
          collectionType: article.category?.collectionType,
          newsSource: news.source,
          newsColumn: news.column,
          newsSection: news.column ? '' : news.section,
          newsType: news.column || news.section ? '' : news.type,
        })
      : Promise.resolve([]),
  ])
  const vocabularyCandidates = buildVocabularyCandidates(
    sudachiPronunciation.tokens,
    Object.keys(article.vocabularyMetaMap),
  )

  return (
    <main className="min-h-screen bg-[#f8f7f3] px-4 py-6 md:px-6 md:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mx-auto mb-7 max-w-[44rem] pb-2 md:mb-8">
          <div className="flex flex-col gap-6">
            <Link
              href='/reading'
              className="w-fit text-xs font-semibold text-slate-500 transition hover:text-slate-950"
            >
              ← 返回阅读中心
            </Link>
            <div className="min-w-0">
              {article.hasAuthenticTitle ? (
                <h1 className="text-[1.1rem] font-semibold leading-[2] text-slate-950 md:text-[1.2rem]">
                  {article.title}
                </h1>
              ) : null}
              {article.sourceKind === 'NEWS' ? (
                <div
                  className={`${article.hasAuthenticTitle ? 'mt-4' : ''} flex flex-wrap gap-2`}
                >
                  {[
                    news.source || article.category?.name || '新闻',
                    formatNewsDate(article.publishedDate),
                    news.type === 'column' ? news.column : getNewsTypeLabel(news.type),
                    newsEditionLabel,
                    news.section === newsEditionLabel ? '' : news.section,
                    news.topic,
                  ]
                    .filter(Boolean)
                    .map((label) => (
                      <span
                        key={label}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500"
                      >
                        {label}
                      </span>
                    ))}
                </div>
              ) : (
                <p
                  className={`${article.hasAuthenticTitle ? 'mt-4' : ''} text-sm tracking-wide text-slate-500`}
                >
                  {article.category ? article.category.name : '阅读材料'}
                  {article.questions.length > 0
                    ? ` · ${article.questions.length} 题`
                    : ''}
                </p>
              )}
            </div>
          </div>
        </header>

        <ArticleSiblingNav
          label={siblingLabel || '同组'}
          articles={relatedArticles}
        />

        {article.audioFile ? (
          <section
            aria-label='文章音频'
            className='mx-auto mb-7 max-w-[44rem] md:mb-8'>
            <ManageAudioPlayer src={article.audioFile} />
          </section>
        ) : null}

        <ArticleReaderClient
          articleId={article.id}
          content={article.content}
          chapters={article.chapters}
          initialVocabularyMetaMap={article.vocabularyMetaMap}
          initialSudachiPronunciationMap={sudachiPronunciation.pronunciationMap}
          initialSudachiLexicon={sudachiPronunciation.lexicon}
          initialVocabularyCandidates={vocabularyCandidates}
          sudachiAvailable={sudachiPronunciation.available}
        />

        {article.category?.collectionType === 'PAPER' ? (
          <div className="mx-auto max-w-[44rem]">
            <ArticleQuestionsPanel questions={article.questions} />
          </div>
        ) : null}
      </div>
    </main>
  )
}
