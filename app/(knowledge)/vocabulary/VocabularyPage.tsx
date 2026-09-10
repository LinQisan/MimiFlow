import { Suspense } from 'react'
import FilterBar from '@/components/vocabulary/FilterBar'
import DisplayPrefs from '@/components/vocabulary/DisplayPrefs'
import WordList from '@/components/vocabulary/WordList'
import Pagination from '@/components/vocabulary/Pagination'
import EmptyState from '@/components/vocabulary/EmptyState'
import { parseFilters, serializeFilters } from '@/components/vocabulary/filters'
import { getVocabularyPageData } from '@/components/vocabulary/data'

const FILTER_FALLBACK = <div className='h-14 border-b border-line bg-bg' aria-hidden />

/**
 * 词汇列表新 UI（?ui=v2 并行验证分支，可独立回滚：删掉 page.tsx 里的分支即可）。
 * 第 1 步只换皮：筛选/分页走 URL，注音/密度走 CSS，单词卡视图暂不接入。
 */
export default async function VocabularyPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const filters = parseFilters(searchParams)
  const data = await getVocabularyPageData(filters)
  const focusQuery = serializeFilters(filters, ['page'], { ui: 'v2' })

  return (
    <div className='theme-vocab min-h-screen bg-bg text-sm leading-normal text-fg-1'>
      <div className='px-4 py-3'>
        <Suspense>
          <DisplayPrefs
            tabs={data.tabs}
            belowToolbar={
              <Suspense fallback={FILTER_FALLBACK}>
                <FilterBar
                  sortOptions={data.sortOptions}
                  posOptions={data.posOptions}
                  tagOptions={data.tagOptions}
                  bookOptions={data.bookOptions}
                  total={data.total}
                  totalPages={data.totalPages}
                />
              </Suspense>
            }
            list={
              data.words.length ? (
                <WordList words={data.words} hideSource={filters.book !== 'all'} query={focusQuery} />
              ) : (
                <EmptyState />
              )
            }
          />
        </Suspense>
        <Suspense>
          <Pagination totalPages={data.totalPages} />
        </Suspense>
      </div>
    </div>
  )
}
