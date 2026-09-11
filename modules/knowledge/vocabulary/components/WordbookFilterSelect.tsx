import ControlDropdown from './ControlDropdown'
import { listWordbookFilterOptions } from '../domain/wordbook-list'
import type { FolderItem } from '../types'

export default function WordbookFilterSelect({ wordbooks, value, onChange }: {
  wordbooks: FolderItem[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className='min-w-0'>
      <span className='mb-1.5 block text-xs font-medium text-slate-500'>单词书</span>
      <ControlDropdown
        ariaLabel='单词书'
        value={value}
        onChange={onChange}
        className='w-full !min-w-0'
        options={[
          { value: 'all', label: '全部单词书' },
          { value: 'none', label: '未加入单词书' },
          ...listWordbookFilterOptions(wordbooks),
        ]}
      />
    </div>
  )
}
