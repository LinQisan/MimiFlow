import CustomSelect from '@/components/ui/CustomSelect'
import { groupWordbooksForFilter } from '../domain/wordbook-list'
import type { FolderItem } from '../types'

export default function WordbookFilterSelect({
  wordbooks,
  value,
  onChange,
}: {
  wordbooks: FolderItem[]
  value: string
  onChange: (value: string) => void
}) {
  const groups = groupWordbooksForFilter(wordbooks)
  return (
    <div className='min-w-0'>
      <span className='mb-1.5 block text-xs font-medium text-slate-500'>单词书</span>
      <CustomSelect
        aria-label='单词书'
        value={value}
        onChange={event => onChange(event.target.value)}
        className='ui-input h-10 !w-full !min-w-0 !text-base md:!text-sm'>
        <option value='all'>全部单词书</option>
        <option value='none'>未加入单词书</option>
        {groups.map(group => (
          <optgroup key={group.id} label={group.name}>
            <option value={`series:${group.id}`} label={`${group.name} / 全部单词书`}>
              整个系列 · {group.books.length} 本
            </option>
            {group.books.map(book => (
              <option key={book.id} value={book.id} label={`${group.name} / ${book.name}`}>
                {book.name}{typeof book.count === 'number' ? ` · ${book.count} 词` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </CustomSelect>
    </div>
  )
}
