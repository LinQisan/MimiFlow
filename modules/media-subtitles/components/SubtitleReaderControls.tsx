'use client'

import ToggleSwitch from '@/components/ToggleSwitch'
import CustomSelect from '@/components/ui/CustomSelect'

const PAGE_SIZE_OPTIONS = [20, 40, 80]

export default function SubtitleReaderControls({
  searchKeyword,
  setSearchKeyword,
  searchHitCount,
  currentSearchHitIndex,
  moveSearchHit,
  visibleStart,
  visibleEnd,
  filteredCount,
  showPronunciation,
  setShowPronunciation,
  showMeaning,
  setShowMeaning,
  showTimeline,
  setShowTimeline,
  showFavoriteOnly,
  setShowFavoriteOnly,
  pageSize,
  setPageSize,
}: {
  searchKeyword: string
  setSearchKeyword: (value: string) => void
  searchHitCount: number
  currentSearchHitIndex: number
  moveSearchHit: (direction: -1 | 1) => void
  visibleStart: number
  visibleEnd: number
  filteredCount: number
  showPronunciation: boolean
  setShowPronunciation: (value: boolean) => void
  showMeaning: boolean
  setShowMeaning: (value: boolean) => void
  showTimeline: boolean
  setShowTimeline: (value: boolean) => void
  showFavoriteOnly: boolean
  setShowFavoriteOnly: (value: boolean) => void
  pageSize: number
  setPageSize: (value: number) => void
}) {
  const hasKeyword = Boolean(searchKeyword.trim())
  return (
    <div className='grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_21rem]'>
      <div className='min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3'>
        <div className='flex flex-col gap-2 md:flex-row md:items-center'>
          <input
            type='search'
            value={searchKeyword}
            onChange={event => setSearchKeyword(event.currentTarget.value)}
            aria-label='搜索字幕句子和笔记'
            placeholder='搜索句子、句号或笔记'
            className='h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-teal-300 focus:ring-2 focus:ring-teal-100'
          />
          <div className='grid grid-cols-2 gap-2 md:flex md:items-center'>
            <button
              type='button'
              onClick={() => moveSearchHit(-1)}
              disabled={searchHitCount === 0}
              className='h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'>
              上一条
            </button>
            <button
              type='button'
              onClick={() => moveSearchHit(1)}
              disabled={searchHitCount === 0}
              className='h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'>
              下一条
            </button>
          </div>
        </div>

        <div className='mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-500'>
          <span className='rounded border border-slate-200 bg-white px-2.5 py-1'>
            显示 {visibleStart}-{visibleEnd} / {filteredCount}
          </span>
          {showFavoriteOnly ? (
            <span className='rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700'>
              仅看收藏
            </span>
          ) : null}
          {hasKeyword ? (
            <span className='rounded border border-teal-200 bg-teal-50 px-2.5 py-1 text-teal-700'>
              命中 {searchHitCount} 条
              {searchHitCount > 0
                ? ` · 当前 ${currentSearchHitIndex + 1}/${searchHitCount}`
                : ''}
            </span>
          ) : null}
        </div>
      </div>

      <div className='rounded-lg border border-slate-200 bg-white p-3'>
        <p className='mb-2 text-xs font-black text-slate-700'>显示选项</p>
        <div className='grid grid-cols-2 gap-2'>
          <ToggleSwitch
            checked={showPronunciation}
            onChange={setShowPronunciation}
            label='注音'
          />
          <ToggleSwitch checked={showMeaning} onChange={setShowMeaning} label='注释' />
          <ToggleSwitch
            checked={showTimeline}
            onChange={setShowTimeline}
            label='时间轴'
          />
          <ToggleSwitch
            checked={showFavoriteOnly}
            onChange={setShowFavoriteOnly}
            label='收藏'
          />
        </div>
        <div className='mt-3 flex items-center gap-2'>
          <label htmlFor='subtitle-page-size' className='text-xs font-bold text-slate-500'>
            每页
          </label>
          <CustomSelect
            id='subtitle-page-size'
            value={pageSize}
            onChange={event => setPageSize(Number(event.currentTarget.value))}
            className='h-9 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100'>
            {PAGE_SIZE_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option} 句
              </option>
            ))}
          </CustomSelect>
        </div>
      </div>
    </div>
  )
}
