'use client'

import { Rating } from 'ts-fsrs'

export function MemoryRatingControls({
  pendingRating,
  isSubmitting,
  onRate,
}: {
  pendingRating: Rating | null
  isSubmitting: boolean
  onRate: (rating: Rating) => void
}) {
  const ratings = [
    { rating: Rating.Again, label: '忘了' },
    { rating: Rating.Hard, label: '吃力' },
    { rating: Rating.Good, label: '记住' },
    { rating: Rating.Easy, label: '秒答' },
  ] as const

  return (
    <div
      className={`mt-auto grid grid-cols-2 gap-2 border-t border-gray-100 pt-4 md:grid-cols-4 ${
        isSubmitting ? 'pointer-events-none opacity-55' : ''
      }`}>
      {ratings.map(item => (
        <button
          key={`memory-rate-${item.rating}`}
          type='button'
          onClick={() => onRate(item.rating)}
          className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${
            pendingRating === item.rating
              ? 'border-slate-200 bg-slate-100 text-slate-800'
              : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
          }`}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function FlashCardNavigation({
  currentIndex,
  total,
  transitioning,
  onPrevious,
  onNext,
}: {
  currentIndex: number
  total: number
  transitioning: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className='mt-4 flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white p-2'>
      <button
        onClick={onPrevious}
        disabled={currentIndex === 0 || transitioning}
        className='inline-flex min-w-28 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm disabled:opacity-40 hover:bg-gray-100'>
        上一张
      </button>
      <div className='px-2 text-xs font-bold text-gray-400'>
        可左右拖拽切换
      </div>
      <button
        onClick={onNext}
        disabled={currentIndex === total - 1 || transitioning}
        className='inline-flex min-w-28 items-center justify-center rounded-xl border border-slate-300 bg-slate-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-slate-800'>
        下一张
      </button>
    </div>
  )
}
