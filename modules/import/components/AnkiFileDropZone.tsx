'use client'

import { useRef, useState } from 'react'
import { useDialog } from '@/context/DialogContext'

type AnkiFileDropZoneProps = {
  file: File | null
  onChange: (file: File) => void
}

const isSupportedAnkiFile = (file: File) => /\.(apkg|txt|tsv)$/i.test(file.name)

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function AnkiFileDropZone({ file, onChange }: AnkiFileDropZoneProps) {
  const dialog = useDialog()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const acceptFile = (nextFile?: File) => {
    if (!nextFile) return
    if (!isSupportedAnkiFile(nextFile)) {
      dialog.toast('仅支持 APKG、TXT 或 TSV 文件。', { tone: 'error' })
      return
    }
    onChange(nextFile)
  }

  return (
    <div>
      <input
        ref={inputRef}
        type='file'
        accept='.apkg,.txt,.tsv,application/zip,text/plain,text/tab-separated-values'
        aria-label='选择 Anki APKG、TXT 或 TSV 文件'
        onChange={event => acceptFile(event.currentTarget.files?.[0])}
        className='hidden'
      />
      <div
        role='button'
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
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
        className={`flex min-h-36 cursor-pointer flex-col items-center justify-center border px-5 py-6 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
          isDragging
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
        }`}>
        <svg
          aria-hidden='true'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='1.6'
          className={`h-7 w-7 ${isDragging ? 'text-indigo-600' : 'text-slate-500'}`}>
          <path strokeLinecap='round' strokeLinejoin='round' d='M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V14' />
        </svg>
        <p className='mt-3 max-w-full truncate text-sm font-semibold text-slate-900'>
          {file?.name || (isDragging ? '松开文件即可上传' : '拖入 Anki 文件')}
        </p>
        <p className='mt-1 text-xs text-slate-500'>
          {file ? `${formatFileSize(file.size)} · 点击或拖入文件替换` : 'APKG · TXT · TSV'}
        </p>
      </div>
    </div>
  )
}
