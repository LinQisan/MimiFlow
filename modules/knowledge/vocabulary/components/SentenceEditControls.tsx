'use client'

import { getPosOptions } from '@/utils/language/posTagger'

export default function SentenceEditControls({
  word,
  sentence,
  activePartsOfSpeech,
  onTogglePartOfSpeech,
  onDelete,
  onClearMeaning,
}: {
  word: string
  sentence: string
  activePartsOfSpeech: string[]
  onTogglePartOfSpeech: (partOfSpeech: string) => void
  onDelete: () => void
  onClearMeaning?: () => void
}) {
  return (
    <div className='mt-2 flex flex-wrap gap-1.5'>
      {getPosOptions(word, sentence).map(option => (
        <button
          key={`sentence-pos-${option}`}
          type='button'
          onClick={event => {
            event.stopPropagation()
            onTogglePartOfSpeech(option)
          }}
          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
            activePartsOfSpeech.includes(option)
              ? 'border-slate-200 bg-slate-100 text-slate-800'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}>
          {option}
        </button>
      ))}
      {onClearMeaning ? (
        <button
          type='button'
          onClick={event => {
            event.stopPropagation()
            onClearMeaning()
          }}
          className='rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100'>
          取消匹配
        </button>
      ) : null}
      <button
        type='button'
        onClick={event => {
          event.stopPropagation()
          onDelete()
        }}
        className='rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 transition-colors hover:bg-rose-100'>
        删除例句
      </button>
    </div>
  )
}
