'use client'

import { getSentenceSourceDisplay } from '../domain/workbench'
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
  onAdd: (sentence: SentenceItem) => void
}) {
  return (
    <>
      <button
        onClick={onToggleSearch}
        className='w-full py-3 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-700'>
        {searching ? '收起' : '更多例句'}
      </button>

      {searching ? (
        <div className='mt-4 max-h-60 space-y-3 overflow-y-auto pr-2'>
          {loading ? (
            <div className='py-3 text-sm text-slate-400'>正在搜索例句...</div>
          ) : null}
          {!loading && results.length === 0 ? (
            <div className='py-3 text-sm text-slate-400'>未找到可追加例句</div>
          ) : null}
          {results.map((sentence, index) => {
            const isAdded = vocabulary.sentences.some(
              item => item.text === sentence.text,
            )
            return (
              <div
                key={`${vocabulary.id}-search-sent-${sentence.sourceUrl || 'unknown'}-${sentence.text}-${index}`}
                className={`flex flex-col gap-3 rounded-2xl border p-4 transition-[background-color,border-color,color,opacity] ${
                  isAdded
                    ? 'border-gray-100 bg-gray-50 opacity-50'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}>
                <div className='text-[11px] font-medium text-slate-400'>
                  {getSentenceSourceDisplay(sentence)}
                </div>
                <div className='text-sm font-medium text-slate-700'>
                  {sentence.text}
                </div>
                {!isAdded ? (
                  <button
                    onClick={() => onAdd(sentence)}
                    className='self-end rounded-xl border border-slate-300 bg-slate-700 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800'>
                    追加例句
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </>
  )
}
