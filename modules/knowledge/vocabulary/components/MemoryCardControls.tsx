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
  currentPosition = currentIndex + 1,
  overallTotal = total,
  canPrevious = currentIndex > 0,
  canNext = currentIndex < total - 1,
  transitioning,
  onPrevious,
  onNext,
}: {
  currentIndex: number
  total: number
  currentPosition?: number
  overallTotal?: number
  canPrevious?: boolean
  canNext?: boolean
  transitioning: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <nav
      aria-label='单词卡翻页'
      className='vocab-card-navigation pointer-events-none relative z-20 h-8 md:absolute md:inset-x-0 md:top-0'>
      <div className='pointer-events-auto mx-auto flex h-8 w-full max-w-[17rem] items-center justify-between px-2 sm:max-w-[20rem]'>
        <button
          type='button'
          aria-label='上一张'
          title='上一张'
          onClick={onPrevious}
          disabled={!canPrevious || transitioning}
          className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-stone-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-40'>
          <svg
            aria-hidden='true'
            className='h-4 w-4'
            fill='none'
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            viewBox='0 0 24 24'>
            <path d='m15 18-6-6 6-6' />
          </svg>
        </button>
        <span className='px-3 text-[11px] font-medium tabular-nums text-slate-400'>
          {currentPosition} / {overallTotal}
        </span>
        <button
          type='button'
          aria-label='下一张'
          title='下一张'
          onClick={onNext}
          disabled={!canNext || transitioning}
          className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-stone-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-40'>
          <svg
            aria-hidden='true'
            className='h-4 w-4'
            fill='none'
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            viewBox='0 0 24 24'>
            <path d='m9 18 6-6-6-6' />
          </svg>
        </button>
      </div>
    </nav>
  )
}
