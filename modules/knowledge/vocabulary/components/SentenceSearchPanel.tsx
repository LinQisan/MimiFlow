'use client'

import Link from 'next/link'
import { useState } from 'react'
import CustomSelect from '@/components/ui/CustomSelect'
import { formatVocabularySentenceSource } from '@/utils/vocabulary/sourceDisplay'
import type { SentenceItem, VocabItem } from '../types'

export default function SentenceSearchPanel({
  vocabulary,
  searching,
  loading,
  results,
  onToggleSearch,
  onAdd,
}: {
  vocabulary: VocabItem
  searching: boolean
  loading: boolean
  results: SentenceItem[]
  onToggleSearch: () => void
  onAdd: (sentence: SentenceItem, senseId: string) => void
}) {
  const [senseByResult, setSenseByResult] = useState<Record<number, string>>({})
  return (
    <section className='vocab-flat-section mt-3 pt-0' aria-label='扩展例句'>
      <button
        type='button'
        onClick={onToggleSearch}
        aria-expanded={searching}
        className='inline-flex min-h-8 w-fit items-center gap-2 py-1 text-left text-sm font-semibold text-slate-600 transition-colors hover:text-slate-950'>
        <span>{searching ? '收起扩展例句' : '查找更多例句'}</span>
        <span aria-hidden='true' className='text-base font-normal leading-none text-slate-400'>
          {searching ? '−' : '+'}
        </span>
      </button>

      {searching ? (
        <div className='mt-2 max-h-80 divide-y divide-slate-200 overflow-y-auto border-y border-slate-200'>
          {loading ? (
            <div className='py-5 text-sm text-slate-400'>正在搜索例句...</div>
          ) : null}
          {!loading && results.length === 0 ? (
            <div className='py-5 text-sm text-slate-400'>未找到可追加例句</div>
          ) : null}
          {results.map((sentence, index) => {
            const isAdded = vocabulary.sentences.some(
              item => item.text === sentence.text,
            )
            const sourceLabel = formatVocabularySentenceSource(sentence)
            return (
              <div
                key={`${vocabulary.id}-search-sent-${sentence.sourceUrl || 'unknown'}-${sentence.text}-${index}`}
                className={`grid gap-2 py-5 transition-[background-color,color,opacity] sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-5 ${
                  isAdded
                    ? 'opacity-50'
                    : 'hover:bg-slate-50'
                }`}>
                <div className='min-w-0'>
                  <div className='font-reading-body-ja text-base leading-7 text-slate-800'>
                    {sentence.text}
                  </div>
                  {sentence.translation ? (
                    <p className='mt-1 text-sm leading-6 text-slate-500'>
                      {sentence.translation}
                    </p>
                  ) : null}
                  {sentence.sourceUrl && sentence.sourceUrl !== '#' ? (
                    <Link
                      href={sentence.sourceUrl}
                      className='mt-2 inline-block w-fit text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-600 hover:underline'>
                      {sourceLabel}
                    </Link>
                  ) : (
                    <div className='mt-2 text-[11px] font-medium text-slate-400'>
                      {sourceLabel}
                    </div>
                  )}
                </div>
                {!isAdded ? (
                  <div className='flex items-center gap-2 self-start'>
                    {(vocabulary.senses?.length || 0) > 1 ? (
                      <CustomSelect
                        value={senseByResult[index] ?? vocabulary.senses?.[0]?.id ?? ''}
                        onChange={event => setSenseByResult(previous => ({ ...previous, [index]: event.target.value }))}
                        aria-label='添加到义项'>
                        {vocabulary.senses?.map((sense, senseIndex) => (
                          <option key={sense.id} value={sense.id}>
                            义项 {String(senseIndex + 1).padStart(2, '0')}
                          </option>
                        ))}
                      </CustomSelect>
                    ) : null}
                    <button
                      type='button'
                      onClick={() => {
                        const senseId =
                          senseByResult[index] ?? vocabulary.senses?.[0]?.id
                        if (senseId) onAdd(sentence, senseId)
                      }}
                      className='ui-btn ui-btn-sm px-3 text-xs'>
                      添加
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
