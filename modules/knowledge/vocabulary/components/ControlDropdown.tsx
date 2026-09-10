'use client'

import { useEffect, useRef, useState } from 'react'

type DropdownOption = {
  value: string
  label: string
  selectedLabel?: string
  depth?: number
  count?: number
  meta?: string
}

export default function ControlDropdown({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  ariaLabel: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find(option => option.value === value) || options[0]

  useEffect(() => {
    if (!open) return
    const handleOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return
      if (rootRef.current?.contains(event.target)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', handleOutside)
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [open])

  return (
    <div ref={rootRef} className={`relative min-w-[9.5rem] ${className}`}>
      <button
        type='button'
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(previous => !previous)}
        className='flex h-10 w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm outline-none transition-[background-color,border-color,color,box-shadow] hover:border-gray-300 hover:shadow focus-visible:border-slate-300 focus-visible:ring-2 focus-visible:ring-slate-100'>
        <span className='truncate'>
          {selected?.selectedLabel || selected?.label || ''}
        </span>
        <span
          className={`ml-2 text-[11px] font-bold text-gray-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}>
          ▾
        </span>
      </button>
      {open ? (
        <div className='absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl'>
          <div className='max-h-56 overflow-auto p-1'>
            {options.map(option => (
              <button
                key={`${ariaLabel}-${option.value}`}
                type='button'
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                  option.value === value
                    ? 'bg-slate-100 text-slate-800'
                    : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                <span
                  className='flex min-w-0 items-center gap-2'
                  style={{ paddingLeft: `${(option.depth || 0) * 14}px` }}>
                  {option.depth ? (
                    <span aria-hidden='true' className='shrink-0 text-slate-300'>
                      ↳
                    </span>
                  ) : null}
                  <span className='truncate'>{option.label}</span>
                </span>
                {option.meta ? (
                  <span className='shrink-0 text-[10px] font-semibold text-slate-400'>
                    {option.meta}
                  </span>
                ) : typeof option.count === 'number' ? (
                  <span className='shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-500'>
                    {option.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
