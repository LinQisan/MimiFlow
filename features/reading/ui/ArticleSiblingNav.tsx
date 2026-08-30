'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import CustomSelect from '@/components/ui/CustomSelect'

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
    <nav
      aria-label={`${label}文章导航`}
      className='mx-auto mb-7 max-w-[44rem] border-y border-slate-200 py-3'>
      <div className='flex items-end gap-2.5'>
        <div className='min-w-0 flex-1'>
          <p className='mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-slate-400'>
            同组文章 · {articles.length}
          </p>
          <CustomSelect
            value={articles[currentIndex]?.id || ''}
            onChange={event =>
              router.push(
                `/reading/articles/${encodeURIComponent(event.currentTarget.value)}`,
              )
            }
            aria-label={`选择${label}中的文章`}
            className='h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300/70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'>
            {articles.map(article => (
              <option key={article.id} value={article.id}>
                <span className='flex min-w-0 items-baseline gap-2'>
                  {article.publishedDate ? (
                    <span className='shrink-0 text-xs font-medium tabular-nums text-slate-400'>
                      {article.publishedDate}
                    </span>
                  ) : null}
                  <span className='font-reading-ja min-w-0 truncate'>
                    {article.title}
                  </span>
                </span>
              </option>
            ))}
          </CustomSelect>
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          {previous ? (
            <Link
              href={`/reading/articles/${encodeURIComponent(previous.id)}`}
              aria-label='上一篇'
              className='ui-btn inline-flex h-10 w-10 items-center justify-center p-0 text-slate-500 hover:text-slate-950'>
              ←
            </Link>
          ) : (
            <span className='h-10 w-10' />
          )}
          {next ? (
            <Link
              href={`/reading/articles/${encodeURIComponent(next.id)}`}
              aria-label='下一篇'
              className='ui-btn inline-flex h-10 w-10 items-center justify-center p-0 text-slate-500 hover:text-slate-950'>
              →
            </Link>
          ) : (
            <span className='h-10 w-10' />
          )}
        </div>
      </div>
    </nav>
  )
}
