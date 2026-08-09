import type { ReactNode } from 'react'

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function highlightSubtitleKeyword(
  text: string,
  keyword: string,
): ReactNode {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword || !text) return text
  return text
    .split(new RegExp(`(${escapeRegExp(normalizedKeyword)})`, 'gi'))
    .map((part, index) =>
      part.toLowerCase() === normalizedKeyword.toLowerCase() ? (
        <mark
          key={`${part}-${index}`}
          className='rounded-sm bg-yellow-200/90 px-0.5 font-bold text-slate-900'>
          {part}
        </mark>
      ) : (
        part
      ),
    )
}
