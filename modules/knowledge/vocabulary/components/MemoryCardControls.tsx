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
    <nav
      aria-label='闪卡翻页'
      className='pointer-events-none absolute inset-0 z-20'>
      <div className='pointer-events-auto absolute left-1/2 top-0 flex -translate-x-1/2 items-center gap-1 rounded-full bg-stone-100/70 p-1 sm:hidden'>
        <button
          type='button'
          aria-label='上一张'
          onClick={onPrevious}
          disabled={currentIndex === 0 || transitioning}
          className='inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900 disabled:pointer-events-none disabled:opacity-25'>
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
        <span className='min-w-12 text-center text-[11px] font-medium tabular-nums text-slate-500'>
          {currentIndex + 1} / {total}
        </span>
        <button
          type='button'
          aria-label='下一张'
          onClick={onNext}
          disabled={currentIndex === total - 1 || transitioning}
          className='inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900 disabled:pointer-events-none disabled:opacity-25'>
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
      <span className='absolute left-1/2 top-2 hidden -translate-x-1/2 text-xs font-medium tabular-nums text-slate-400 sm:block'>
        {currentIndex + 1} / {total}
      </span>
      <button
        type='button'
        aria-label='上一张'
        title='上一张'
        onClick={onPrevious}
        disabled={currentIndex === 0 || transitioning}
        className='pointer-events-auto absolute -left-5 top-64 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-transparent text-slate-400/45 transition-[color,background-color,opacity] hover:bg-stone-100/80 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-0 sm:inline-flex md:-left-16'>
        <svg
          aria-hidden='true'
          className='h-[18px] w-[18px]'
          fill='none'
          stroke='currentColor'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          viewBox='0 0 24 24'>
          <path d='m15 18-6-6 6-6' />
        </svg>
      </button>
      <button
        type='button'
        aria-label='下一张'
        title='下一张'
        onClick={onNext}
        disabled={currentIndex === total - 1 || transitioning}
        className='pointer-events-auto absolute -right-5 top-64 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-transparent text-slate-400/45 transition-[color,background-color,opacity] hover:bg-stone-100/80 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-0 sm:inline-flex md:-right-16'>
        <svg
          aria-hidden='true'
          className='h-[18px] w-[18px]'
          fill='none'
          stroke='currentColor'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth={2}
          viewBox='0 0 24 24'>
          <path d='m9 18 6-6-6-6' />
        </svg>
      </button>
    </nav>
  )
}
