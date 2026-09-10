'use client'

import { FOCUS_RING, cn } from '@/lib/cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: React.ReactNode
}

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role='group' aria-label={label} className='inline-flex rounded-ctl bg-surface-hover p-[3px]'>
      {options.map(opt => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type='button'
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 px-3 text-sm transition-colors duration-150',
              selected ? 'rounded-[5px] bg-surface font-medium text-fg-1 shadow-sm' : 'text-fg-2 hover:text-fg-1',
              FOCUS_RING,
            )}>
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  )
}
