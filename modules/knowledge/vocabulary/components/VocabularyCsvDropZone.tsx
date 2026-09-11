'use client'

import { useEffect, useRef, useState } from 'react'

type VocabularyCsvDropZoneProps = {
  file: File | null
  onChange: (file: File) => void
  onError: (message: string) => void
}

const MAX_CSV_BYTES = 8_000_000

export default function VocabularyCsvDropZone({
  file,
  onChange,
  onError,
}: VocabularyCsvDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = ''
  }, [file])

  const acceptFile = (nextFile?: File) => {
    if (!nextFile) return
    if (!nextFile.name.toLowerCase().endsWith('.csv')) {
      onError('请选择 CSV 文件')
      return
    }
    if (nextFile.size > MAX_CSV_BYTES) {
      onError('CSV 不能超过 8 MB')
      return
    }
    onChange(nextFile)
  }

  const openFilePicker = () => inputRef.current?.click()

  return (
    <div className='mt-3'>
      <input
        ref={inputRef}
        type='file'
        accept='.csv,text/csv'
        aria-label='选择词汇 CSV 文件'
        onChange={event => acceptFile(event.currentTarget.files?.[0])}
        className='hidden'
      />
      <div
        role='button'
        tabIndex={0}
        onClick={openFilePicker}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openFilePicker()
          }
        }}
        onDragOver={event => {
          event.preventDefault()
          event.stopPropagation()
          setIsDragging(true)
        }}
        onDragLeave={event => {
          event.preventDefault()
          event.stopPropagation()
          setIsDragging(false)
        }}
        onDrop={event => {
          event.preventDefault()
          event.stopPropagation()
          setIsDragging(false)
          acceptFile(event.dataTransfer.files?.[0])
        }}
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center border border-dashed px-4 py-4 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
          isDragging
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100'
        }`}>
        <p className='max-w-full truncate text-sm font-semibold text-slate-800'>
          {file?.name || (isDragging ? '松开即可选择 CSV' : '拖入 CSV，或点击选择')}
        </p>
        <p className='mt-1 text-xs text-slate-500'>CSV · 最大 8 MB</p>
      </div>
    </div>
  )
}
