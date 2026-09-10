'use client'

import { useEffect, useState } from 'react'
import { ArrowUpDown, ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import { FOCUS_RING, cn } from '@/lib/cn'
import { useVocabNav } from './useVocabNav'
import type { FilterState, OptionItem } from './types'

const CONTROL = 'h-10 rounded-ctl border border-line bg-surface text-sm text-fg-1 transition-colors duration-150'

function Select_({
  label,
  value,
  onChange,
  options,
  icon,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: OptionItem[]
  icon?: React.ReactNode
}) {
  return (
    <label className='block min-w-0 flex-1'>
      <span className='sr-only'>{label}</span>
      <span className='relative block'>
        {icon && <span className='pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3'>{icon}</span>}
        <select
          aria-label={label}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={cn(CONTROL, 'w-full appearance-none pr-8', icon ? 'pl-9' : 'pl-3', FOCUS_RING)}>
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={15} className='pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-3' />
      </span>
    </label>
  )
}

const CHIP_DEFS: { key: 'q' | 'sort' | 'pos' | 'tag' | 'book'; clear: Partial<FilterState> }[] = [
  { key: 'q', clear: { q: '' } },
  { key: 'sort', clear: { sort: 'recent' } },
  { key: 'pos', clear: { pos: 'all' } },
  { key: 'tag', clear: { tag: 'all' } },
  { key: 'book', clear: { book: 'all' } },
]

export default function FilterBar({
  sortOptions,
  posOptions,
  tagOptions,
  bookOptions,
  total,
  totalPages,
}: {
  sortOptions: OptionItem[]
  posOptions: OptionItem[]
  tagOptions: OptionItem[]
  bookOptions: OptionItem[]
  total: number
  totalPages: number
}) {
  const { filters, update, reset, isPending } = useVocabNav()
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 搜索框本地态 + 300ms 防抖写 URL，避免每击键一次导航
  const [draft, setDraft] = useState(filters.q)
  useEffect(() => setDraft(filters.q), [filters.q])
  useEffect(() => {
    if (draft.trim() === filters.q) return
    const timer = window.setTimeout(() => update({ q: draft.trim() }), 300)
    return () => window.clearTimeout(timer)
  }, [draft, filters.q, update])

  const labelOf = (options: OptionItem[], value: string) =>
    options.find(o => o.value === value)?.label ?? value
  const chips: { key: (typeof CHIP_DEFS)[number]['key']; label: string }[] = []
  if (filters.q) chips.push({ key: 'q', label: `搜索：${filters.q}` })
  if (filters.sort !== 'recent') chips.push({ key: 'sort', label: `排序：${labelOf(sortOptions, filters.sort)}` })
  if (filters.pos !== 'all') chips.push({ key: 'pos', label: `词性：${labelOf(posOptions, filters.pos)}` })
  if (filters.tag !== 'all') chips.push({ key: 'tag', label: `标签：${labelOf(tagOptions, filters.tag)}` })
  if (filters.book !== 'all') chips.push({ key: 'book', label: `单词书：${labelOf(bookOptions, filters.book)}` })

  const fields = (
    <>
      <label className='block min-w-0 flex-[1.4]'>
        <span className='sr-only'>搜索单词</span>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder='搜索单词、释义'
          className={cn(CONTROL, 'w-full px-3 placeholder:text-fg-3', FOCUS_RING)}
        />
      </label>
      <Select_ label='排序' value={filters.sort} onChange={v => update({ sort: v })} options={sortOptions} icon={<ArrowUpDown size={15} />} />
      {/* 只有一个选项的下拉不渲染，避免点开是空的 */}
      {posOptions.length > 1 && (
        <Select_ label='词性' value={filters.pos} onChange={v => update({ pos: v })} options={posOptions} />
      )}
      <Select_ label='标签' value={filters.tag} onChange={v => update({ tag: v })} options={tagOptions} />
      <Select_ label='单词书' value={filters.book} onChange={v => update({ book: v })} options={bookOptions} />
    </>
  )

  return (
    <div className='sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur md:top-18'>
      <div className='flex items-center gap-3 px-4 py-2'>
        <button
          type='button'
          onClick={() => setDrawerOpen(true)}
          className={cn('inline-flex h-10 items-center gap-2 rounded-ctl border border-line bg-surface px-3 text-sm text-fg-1 md:hidden', FOCUS_RING)}>
          <SlidersHorizontal size={15} />
          筛选{chips.length > 0 && <span className='rounded-full bg-primary px-1.5 text-xs text-white'>{chips.length}</span>}
        </button>
        <div className='hidden min-w-0 flex-1 items-center gap-3 md:flex'>{fields}</div>
        <p className='flex shrink-0 items-center gap-1 text-xs tabular-nums text-fg-3'>
          {isPending && <span aria-label='筛选中' className='size-1.5 animate-pulse rounded-full bg-primary' />}
          共 {total.toLocaleString('zh-CN')} 条 · {filters.page}/{totalPages}
          <button type='button' disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 })} aria-label='上一页' className='rounded px-1 hover:text-fg-1 disabled:opacity-30'>‹</button>
          <button type='button' disabled={filters.page >= totalPages} onClick={() => update({ page: filters.page + 1 })} aria-label='下一页' className='rounded px-1 hover:text-fg-1 disabled:opacity-30'>›</button>
        </p>
      </div>
      {chips.length > 0 && (
        <div className='flex flex-wrap items-center gap-2 px-4 pb-2'>
          {chips.map(chip => (
            <span key={chip.key} className='inline-flex h-7 items-center gap-1 rounded-full bg-primary-light px-2.5 text-xs font-medium text-primary-text'>
              {chip.label}
              <button
                type='button'
                aria-label={`移除筛选 ${chip.label}`}
                onClick={() => update(CHIP_DEFS.find(d => d.key === chip.key)?.clear ?? {})}
                className={cn('grid size-4 place-items-center rounded-full hover:bg-primary/10', FOCUS_RING)}>
                <X size={12} />
              </button>
            </span>
          ))}
          <button type='button' onClick={reset} className={cn('text-xs text-primary hover:underline', FOCUS_RING)}>
            清除全部
          </button>
        </div>
      )}
      {drawerOpen && (
        <div role='dialog' aria-modal='true' aria-label='筛选' className='fixed inset-0 z-30 md:hidden'>
          <div className='absolute inset-0 bg-fg-1/30' onClick={() => setDrawerOpen(false)} />
          <div className='absolute inset-y-0 right-0 flex w-72 flex-col gap-3 overflow-y-auto bg-surface p-4'>
            {fields}
            <button type='button' onClick={() => setDrawerOpen(false)} className='h-10 rounded-ctl bg-primary text-sm font-medium text-white hover:bg-primary-hover'>
              查看结果
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
