'use client'

import CustomSelect from './CustomSelect'

export type PronunciationSource = 'sudachi' | 'personal'
export const PRONUNCIATION_SOURCE_STORAGE_KEY =
  'mimiflow_article_pronunciation_source'

export default function PronunciationSourceSelector({
  value,
  onChange,
  sudachiAvailable,
}: {
  value: PronunciationSource
  onChange: (source: PronunciationSource) => void
  sudachiAvailable: boolean
}) {
  return (
    <CustomSelect
      aria-label='注音来源'
      value={value}
      onChange={event => onChange(event.target.value as PronunciationSource)}
      className='h-8 w-20 rounded-md border border-slate-300 bg-transparent px-2 text-xs font-medium text-slate-600'>
      <option value='sudachi' disabled={!sudachiAvailable}>默认</option>
      <option value='personal'>我的</option>
    </CustomSelect>
  )
}
