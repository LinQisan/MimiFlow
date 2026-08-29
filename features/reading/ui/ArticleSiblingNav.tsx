'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

type SiblingArticle = {
  id: string
  title: string
  publishedDate: string
  current: boolean
}

export default function ArticleSiblingNav({
  label,
  articles,
}: {
  label: string
  articles: SiblingArticle[]
}) {
  const router = useRouter()
  if (articles.length <= 1) return null

  const currentIndex = articles.findIndex(article => article.current)
  const previous = currentIndex > 0 ? articles[currentIndex - 1] : null
  const next = currentIndex >= 0 && currentIndex < articles.length - 1
    ? articles[currentIndex + 1]
    : null

  return (
    <nav aria-label={`${label}文章导航`} className='mx-auto mb-7 max-w-[44rem] border-y border-slate-200 py-3'>
      <div className='flex items-center gap-3'>
        <div className='min-w-0 flex-1'>
          <p className='mb-1 text-[10px] font-bold tracking-[0.12em] text-slate-400'>同组文章 · {articles.length}</p>
          <select
            value={articles[currentIndex]?.id || ''}
            onChange={event => router.push(`/reading/articles/${encodeURIComponent(event.currentTarget.value)}`)}
            aria-label={`选择${label}中的文章`}
            className='h-9 w-full truncate border-0 bg-transparent p-0 pr-8 text-sm font-semibold text-slate-800 outline-none'>
            {articles.map(article => (
              <option key={article.id} value={article.id}>
                {article.publishedDate ? `${article.publishedDate} · ` : ''}{article.title}
              </option>
            ))}
          </select>
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          {previous ? (
            <Link href={`/reading/articles/${encodeURIComponent(previous.id)}`} aria-label='上一篇' className='inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-950'>←</Link>
          ) : <span className='h-9 w-9' />}
          {next ? (
            <Link href={`/reading/articles/${encodeURIComponent(next.id)}`} aria-label='下一篇' className='inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-950'>→</Link>
          ) : <span className='h-9 w-9' />}
        </div>
      </div>
    </nav>
  )
}
