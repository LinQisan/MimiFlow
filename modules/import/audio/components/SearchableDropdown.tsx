'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import type { DropdownOption } from '../types'

export default function SearchableDropdown({
  value,
  onChange,
  options,
  placeholder,
  enableSearch = false,
  groupByLevel = false,
}: {
  value: string
  onChange: (val: string) => void
  options: DropdownOption[]
  placeholder: string
  enableSearch?: boolean
  groupByLevel?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen && enableSearch && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen, enableSearch])

  const selectedLabel =
    options.find(option => option.value === value)?.label || placeholder

  const sortedOptions = useMemo(() => {
    if (options.some(option => typeof option.order === 'number')) {
      return [...options].sort(
        (a, b) =>
          (a.order ?? 0) - (b.order ?? 0) ||
          a.label.localeCompare(b.label, 'zh-CN'),
      )
    }
    return [...options].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
  }, [options])

  // Filter by search query
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return sortedOptions
    const q = search.trim().toLowerCase()
    return sortedOptions.filter(option => {
      const searchText = (option.searchText || option.label).toLowerCase()
      return searchText.includes(q)
    })
  }, [sortedOptions, search])

  // Group by level if enabled
  const groupedOptions = useMemo(() => {
    if (!groupByLevel) return null
    const groups = new Map<string, typeof filteredOptions>()
    for (const option of filteredOptions) {
      const group = option.group || '其他'
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push(option)
    }
    return groups
  }, [filteredOptions, groupByLevel])

  return (
    <div className='relative w-full' ref={ref}>
      <div
        onClick={() => setIsOpen(prev => !prev)}
        className={`flex w-full cursor-pointer items-center justify-between border bg-gray-50 p-4 text-sm font-bold outline-none transition-colors
          ${
            isOpen
              ? 'border-blue-400 bg-white ring-2 ring-blue-400/20'
              : 'border-gray-200 hover:bg-white'
          }`}>
        <span
          className={value ? 'truncate pr-4 text-gray-800' : 'text-gray-400'}>
          {selectedLabel}
        </span>
        <div className='flex items-center gap-2'>
          {value && options.length > 0 && (
            <span className='rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600'>
              {options.length}
            </span>
          )}
          <svg
            className={`h-5 w-5 shrink-0 text-gray-400 transition-transform duration-300 ${
              isOpen ? 'rotate-180 text-blue-500' : ''
            }`}
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2.5}
              d='M19 9l-7 7-7-7'
            />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div className='custom-scrollbar animate-in fade-in slide-in-from-top-2 absolute z-[80] mt-2 max-h-[26rem] w-full overflow-y-auto border border-gray-100 bg-white py-2'>
          {enableSearch && (
            <div className='sticky top-0 z-10 border-b border-gray-100 bg-white px-3 pb-2'>
              <div className='relative'>
                <svg className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
                </svg>
                <input
                  ref={searchInputRef}
                  type='text'
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className='w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm font-medium outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100'
                  placeholder='搜索集合...'
                  onClick={e => e.stopPropagation()}
                />
                {search && (
                  <button
                    onClick={e => { e.stopPropagation(); setSearch('') }}
                    className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600'>
                    <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                    </svg>
                  </button>
                )}
              </div>
              {search && (
                <p className='mt-1.5 text-[11px] font-medium text-gray-400'>
                  找到 {filteredOptions.length} 个结果
                </p>
              )}
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div className='px-4 py-3 text-center text-sm text-gray-400'>
              {search ? '无匹配结果' : '暂无选项'}
            </div>
          ) : groupedOptions ? (
            Array.from(groupedOptions.entries()).map(([group, groupOpts]) => (
              <div key={group}>
                <div className='sticky top-0 z-[5] border-b border-gray-50 bg-gray-50/90 px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 backdrop-blur-sm'>
                  {group}
                </div>
                {groupOpts.map(option => (
                <div
                  key={option.value}
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                    setSearch('')
                  }}
                  className={`truncate px-4 py-3 text-sm font-bold transition-colors
                      ${
                        value === option.value
                          ? 'bg-blue-50 text-blue-700'
                          : 'cursor-pointer text-gray-700 hover:bg-gray-50 hover:text-blue-600'
                      }`}
                  style={{ paddingLeft: `${16 + (option.depth || 0) * 14}px` }}>
                    <div className='truncate'>{option.label}</div>
                    {search && option.searchText && option.searchText !== option.label && (
                      <div className='mt-0.5 truncate text-[11px] font-medium text-gray-400'>
                        {option.searchText}
                      </div>
                    )}
                </div>
              ))}
            </div>
          ))
        ) : (
            filteredOptions.map(option => (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                  setSearch('')
                }}
                className={`truncate px-4 py-3 text-sm font-bold transition-colors
                  ${
                    value === option.value
                      ? 'bg-blue-50 text-blue-700'
                      : 'cursor-pointer text-gray-700 hover:bg-gray-50 hover:text-blue-600'
                  }`}
                style={{ paddingLeft: `${16 + (option.depth || 0) * 14}px` }}>
                <div className='truncate'>{option.label}</div>
                {search && option.searchText && option.searchText !== option.label && (
                  <div className='mt-0.5 truncate text-[11px] font-medium text-gray-400'>
                    {option.searchText}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

