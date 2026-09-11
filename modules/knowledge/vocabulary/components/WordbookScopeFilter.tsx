'use client'

import { useMemo } from 'react'

import ControlDropdown from '@/modules/knowledge/vocabulary/components/ControlDropdown'
import {
  getWordbookSeriesName,
  listWordbookFilterOptions,
} from '@/modules/knowledge/vocabulary/domain/wordbook-list'

export type WordbookScopeOption = {
  id: string
  name: string
  pathLabel: string
  depth: number
  totalCount: number
}

export default function WordbookScopeFilter({
  wordbooks,
  value,
  visibleCount,
  isLoading = false,
  error = '',
  onChange,
}: {
  wordbooks: WordbookScopeOption[]
  value: string
  visibleCount: number
  isLoading?: boolean
  error?: string
  onChange: (value: string) => void
}) {
  const options = useMemo(
    () => [
      { value: 'all', label: '全部单词书' },
      { value: 'none', label: '未加入单词书' },
      ...listWordbookFilterOptions(
        wordbooks.map(wordbook => {
          const seriesName = getWordbookSeriesName(wordbook.pathLabel)
          return {
            id: wordbook.id,
            name: wordbook.name,
            seriesId: seriesName,
            seriesName,
            count: wordbook.totalCount,
          }
        }),
      ),
    ],
    [wordbooks],
  )

  return (
    <div className='border-b border-slate-200 bg-white/70 px-4 py-3 sm:px-5 md:px-7'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-xs font-semibold text-slate-500'>分析范围</span>
          <ControlDropdown
            ariaLabel='单词书筛选'
            value={value}
            onChange={onChange}
            options={options}
            className='w-[min(22rem,calc(100vw-8rem))]'
          />
        </div>
        <p className={`text-xs tabular-nums ${error ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
          {error || (isLoading ? '正在读取单词书…' : `${visibleCount} 个词`)}
        </p>
      </div>
    </div>
  )
}
