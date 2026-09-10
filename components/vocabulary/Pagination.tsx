'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { FOCUS_RING, cn } from '@/lib/cn'
import { useVocabNav } from './useVocabNav'

function pageWindow(page: number, total: number): (number | '…')[] {
  const set = new Set([1, total, page - 1, page, page + 1])
  const nums = [...set].filter(n => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  nums.forEach((n, i) => {
    if (i > 0 && n - (nums[i - 1] as number) > 1) out.push('…')
    out.push(n)
  })
  return out
}

/** 底部完整分页：页码直写 URL ?page=，跳转框本地态 */
export default function Pagination({ totalPages }: { totalPages: number }) {
  const { filters, update } = useVocabNav()
  const page = filters.page
  const [jump, setJump] = useState('')
  const btn = (active?: boolean) =>
    cn(
      'grid h-9 min-w-9 place-items-center rounded-ctl px-2 text-sm tabular-nums transition-colors duration-150',
      active ? 'bg-primary font-semibold text-white' : 'text-fg-2 hover:bg-surface-hover hover:text-fg-1',
      FOCUS_RING,
    )
  const goJump = () => {
    const n = Number(jump)
    if (Number.isInteger(n) && n >= 1 && n <= totalPages) update({ page: n })
  }
  return (
    <nav aria-label='分页' className='flex flex-wrap items-center justify-center gap-1 py-4'>
      <button type='button' aria-label='上一页' disabled={page <= 1} onClick={() => update({ page: page - 1 })} className={cn(btn(), 'disabled:opacity-30')}>
        <ChevronLeft size={16} />
      </button>
      {pageWindow(page, totalPages).map((n, i) =>
        n === '…' ? (
          <span key={`gap-${i}`} className='px-1 text-sm text-fg-3'>
            …
          </span>
        ) : (
          <button key={n} type='button' aria-current={n === page ? 'page' : undefined} onClick={() => update({ page: n })} className={btn(n === page)}>
            {n}
          </button>
        ),
      )}
      <button type='button' aria-label='下一页' disabled={page >= totalPages} onClick={() => update({ page: page + 1 })} className={cn(btn(), 'disabled:opacity-30')}>
        <ChevronRight size={16} />
      </button>
      <span className='ml-3 flex items-center gap-2 text-sm text-fg-3'>
        跳至
        <input
          value={jump}
          inputMode='numeric'
          aria-label='跳转到页码'
          onChange={e => setJump(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && goJump()}
          className={cn('h-9 w-14 rounded-ctl border border-line bg-surface px-2 text-center text-sm tabular-nums text-fg-1', FOCUS_RING)}
        />
        页
        <button type='button' onClick={goJump} className={cn('h-9 rounded-ctl bg-surface px-3 text-sm text-fg-1 ring-1 ring-inset ring-line hover:bg-surface-hover', FOCUS_RING)}>
          确定
        </button>
      </span>
    </nav>
  )
}
