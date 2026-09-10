'use client'

import { SearchX } from 'lucide-react'
import { FOCUS_RING, cn } from '@/lib/cn'
import { useVocabNav } from './useVocabNav'

/** 空状态自闭合：清除操作直写 URL，无需父组件传回调（Server 传函数不合法） */
export default function EmptyState() {
  const { reset } = useVocabNav()
  return (
    <div className='flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-4 py-16 text-center'>
      <SearchX size={28} className='text-fg-3' />
      <p className='text-sm font-medium text-fg-1'>没有符合条件的单词</p>
      <p className='text-xs text-fg-3'>试试放宽筛选条件，或清除全部筛选</p>
      <button
        type='button'
        onClick={reset}
        className={cn('h-10 rounded-ctl bg-primary px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-hover', FOCUS_RING)}>
        清除筛选
      </button>
    </div>
  )
}
