import { Fragment } from 'react'
import WordRow from './WordRow'
import GroupHeader from './GroupHeader'
import type { VocabWord } from './types'

/** 按「单词书 · Unit」对连续相同来源分组（保持原序，不重排） */
export function groupWordsBySource(words: VocabWord[]): { key: string; title: string; items: VocabWord[] }[] {
  const groups: { key: string; title: string; items: VocabWord[] }[] = []
  for (const word of words) {
    const key = `${word.bookName} · ${word.unit}`
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(word)
    else groups.push({ key, title: key, items: [word] })
  }
  return groups
}

/**
 * 纯 Server 列表：注音/密度经 CSS（data-ruby / data-density）控制，
 * 选中态由未来的批量管理包裹层传入，平时默认 []。
 */
export default function WordList({
  words,
  hideSource = false,
  selectedIds = [],
  query = '',
}: {
  words: VocabWord[]
  hideSource?: boolean
  selectedIds?: string[]
  query?: string
}) {
  const selected = new Set(selectedIds)
  const body = hideSource ? (
    <>
      {words.map(word => (
        <WordRow key={word.id} word={word} hideSource selected={selected.has(word.id)} query={query} />
      ))}
    </>
  ) : (
    <>
      {groupWordsBySource(words).map(group => (
        <Fragment key={group.key}>
          <GroupHeader title={group.title} count={group.items.length} />
          {group.items.map(word => (
            <WordRow key={word.id} word={word} selected={selected.has(word.id)} query={query} />
          ))}
        </Fragment>
      ))}
    </>
  )
  return <div className='divide-y divide-line rounded-card border border-line bg-surface px-4'>{body}</div>
}
