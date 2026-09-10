import CustomSelect from '@/components/ui/CustomSelect'

type FilterOption = {
  value: string
  label: string
  selectedLabel?: string
  count?: number
}

export default function VocabularyFilterSelect({
  label,
  ariaLabel,
  value,
  onChange,
  options,
}: {
  label: string
  ariaLabel?: string
  value: string
  onChange: (value: string) => void
  options: FilterOption[]
}) {
  return (
    <div className='min-w-0'>
      <span className='mb-1.5 block text-xs font-medium text-slate-500'>{label}</span>
      <CustomSelect
        aria-label={ariaLabel || label}
        value={value}
        onChange={event => onChange(event.target.value)}
        className='ui-input h-10 !w-full !min-w-0 !text-base md:!text-sm'>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.selectedLabel || option.label}{typeof option.count === 'number' ? ` · ${option.count}` : ''}
          </option>
        ))}
      </CustomSelect>
    </div>
  )
}
