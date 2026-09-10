import Link from 'next/link'
import StatusDot from './StatusDot'
import LevelBadge from './LevelBadge'
import { AudioButton, FavoriteButton } from './IconButton'
import type { VocabWord } from './types'
import { cn } from '@/lib/cn'

/**
 * 三段式列模板（与 loading 骨架严格同步）：
 * <sm 4 列可见（状态/单词块/喇叭/收藏），sm~lg 6 列（+释义/等级），lg 8 列全显。
 * display:none 的元素不占格子，轨道数必须等于每段可见子元素数。
 */
export const ROW_GRID =
  'grid items-center gap-x-3 ' +
  'grid-cols-[20px_minmax(0,1fr)_32px_32px] ' +
  'sm:grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)_auto_32px_32px] ' +
  'lg:grid-cols-[24px_200px_140px_minmax(0,1fr)_auto_auto_36px_36px]'
export const ROW_GRID_NO_SOURCE =
  'grid items-center gap-x-3 ' +
  'grid-cols-[20px_minmax(0,1fr)_32px_32px] ' +
  'sm:grid-cols-[20px_minmax(0,1fr)_minmax(0,1fr)_auto_32px_32px] ' +
  'lg:grid-cols-[24px_200px_140px_minmax(0,1fr)_auto_36px_36px]'

export default function WordRow({
  word,
  selected,
  hideSource,
  query = '',
}: {
  word: VocabWord
  selected?: boolean
  hideSource?: boolean
  /** 当前筛选 query（如 "?q=x&pos=y"），focus 跳转时保留，不过滤时传 '' */
  query?: string
}) {
  const focusHref = `${query ? `${query}&` : '?'}focus=${word.id}`
  return (
    <article
      data-word-id={word.id}
      className={cn(
        'vocab-row',
        hideSource ? ROW_GRID_NO_SOURCE : ROW_GRID,
        // 三元写法：tailwind-merge 不在依赖里，同属性 hover 类不可并列
        selected ? 'bg-primary-light' : 'hover:bg-surface-hover',
      )}>
      <StatusDot status={word.status} />
      <div className='min-w-0'>
        <Link href={focusHref} lang='ja' className='block truncate text-[17px] font-semibold leading-snug text-fg-1 hover:text-primary'>
          <ruby className='rt-sm'>
            {word.word}
            <rp>(</rp>
            <rt>{word.reading}</rt>
            <rp>)</rp>
          </ruby>
        </Link>
      <p lang='ja' className='hidden truncate text-[13px] text-fg-3 sm:block lg:hidden'>
        {word.reading}
      </p>
        {word.etymologies?.length ? <p className='truncate text-xs text-fg-3'>词源：{word.etymologies.join(' · ')}</p> : null}
        {/* 移动端第二行放释义（扫读价值高于读音），读音由单词行 ruby 承担 */}
        <p className='truncate text-[13px] text-fg-2 sm:hidden'>{word.meaning}</p>
      </div>
      <p lang='ja' className='hidden truncate text-[13px] text-fg-3 lg:block'>
        {word.reading}
      </p>
      <p className='hidden truncate text-sm text-fg-2 sm:block lg:px-2'>{word.meaning}</p>
      {!hideSource && (
        <p className='hidden max-w-[220px] truncate text-xs text-fg-3 lg:block'>
          {word.bookName} · {word.unit}
        </p>
      )}
      <span className='hidden sm:inline-flex'>
        <LevelBadge level={word.level} />
      </span>
      <AudioButton word={word.word} audioUrl={word.audioUrl} />
      <FavoriteButton word={word.word} initialActive={word.isFavorite} />
    </article>
  )
}
