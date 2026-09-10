'use client'

import Link from 'next/link'

import type { VocabularyWordbookMembership } from '../types'

type WordbookMembershipLinksProps = {
  wordbooks: VocabularyWordbookMembership[]
  variant: 'compact' | 'detail'
  className?: string
  pathSeparator?: string
  align?: 'center' | 'start'
}

const formatPath = (pathLabel: string, separator: string) =>
  pathLabel
    .split('/')
    .map(part => part.trim())
    .filter(Boolean)
    .join(separator)

const jlptLevelClass = (jlpt: string) => {
  const match = jlpt.trim().toUpperCase().match(/^N([1-5])$/)
  return match ? `ui-tag-jlpt-n${match[1]}` : ''
}

export default function WordbookMembershipLinks({
  wordbooks,
  variant,
  className = '',
  pathSeparator = ' › ',
  align = 'center',
}: WordbookMembershipLinksProps) {
  if (wordbooks.length === 0) return null
  const visibleWordbooks = variant === 'compact' ? wordbooks.slice(0, 2) : wordbooks
  const hiddenCount = wordbooks.length - visibleWordbooks.length

  return (
    <div
      className={
        variant === 'detail'
          ? `mt-5 flex ${align === 'start' ? 'justify-start' : 'justify-center'} ${className}`
          : `flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 ${className}`
      }
      aria-label='所属词表'>
      <div
        className={
          variant === 'detail'
            ? `flex max-w-2xl ${align === 'start' ? 'w-full flex-col items-start gap-2' : 'flex-wrap items-center justify-center gap-x-2 gap-y-1.5'} text-xs`
            : 'contents'
        }>
        {variant !== 'compact' ? (
          <span className='shrink-0 text-[10px] font-semibold tracking-[0.08em] text-slate-400'>
            词表
          </span>
        ) : null}
        {visibleWordbooks.map((wordbook, index) => (
          <span
            key={`wordbook-membership-${wordbook.id}`}
            className='inline-flex min-w-0 items-center gap-2'>
            {index > 0 && align !== 'start' ? <span className='text-slate-300'>·</span> : null}
            <Link
              href={`/vocabulary/wordbooks/${wordbook.id}`}
              prefetch={false}
              title={wordbook.pathLabel}
              onClick={event => event.stopPropagation()}
              className={`min-w-0 border-b border-transparent font-medium underline-offset-2 transition-colors hover:border-current hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                variant === 'detail'
                  ? `max-w-full whitespace-normal break-words ${index === 0 ? 'text-slate-700' : 'text-slate-500'}`
                  : `max-w-52 truncate text-[10px] ${index === 0 ? 'text-slate-700' : 'text-slate-500'}`
              }`}>
              {formatPath(wordbook.pathLabel, pathSeparator)}
            </Link>
            {wordbook.jlpt ? (
              <span className={`ui-tag ui-tag-jlpt shrink-0 text-[9px] ${jlptLevelClass(wordbook.jlpt)}`}>
                {wordbook.jlpt}
              </span>
            ) : null}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className='text-[10px] font-medium text-slate-400'>另有 {hiddenCount} 个</span>
        ) : null}
      </div>
    </div>
  )
}
