'use client'

import { useState } from 'react'

import { parseListeningOptionText } from '@/modules/import/domain/listening-option-parser'

export default function ListeningOptionQuickInput({
  onRecognize,
}: {
  onRecognize: (options: string[]) => void
}) {
  const [text, setText] = useState('')
  const [recognizedCount, setRecognizedCount] = useState(0)

  const recognize = (value: string) => {
    const options = parseListeningOptionText(value)
    setRecognizedCount(options.length)
    if (options.length >= 2) onRecognize(options)
  }

  return (
    <details className='border-b border-slate-200 px-1 py-3'>
      <summary className='cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-950'>
        快速识别选项
      </summary>
      <div className='mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end'>
        <label className='block'>
          <span className='sr-only'>粘贴选项，每行一个，序号可省略</span>
          <textarea
            value={text}
            onChange={event => {
              setText(event.target.value)
              setRecognizedCount(0)
            }}
            onPaste={event => {
              const pastedText = event.clipboardData.getData('text/plain')
              if (parseListeningOptionText(pastedText).length < 2) return
              event.preventDefault()
              setText(pastedText)
              recognize(pastedText)
            }}
            rows={4}
            placeholder={'1\t日本の現状を分析する\n2\t日本人にインタビューする'}
            className='w-full !rounded-none resize-y border-0 border-b border-slate-300 bg-transparent px-0 py-2 text-sm leading-6 outline-none focus:border-slate-900 focus:ring-0'
          />
        </label>
        <button
          type='button'
          disabled={parseListeningOptionText(text).length < 2}
          onClick={() => recognize(text)}
          className='ui-btn ui-btn-sm disabled:cursor-not-allowed disabled:opacity-40'>
          识别选项
        </button>
      </div>
      <p className='mt-2 text-[11px] text-slate-400'>
        每行一个选项，无需序号；也支持数字、字母或带圈序号，序号后可使用 Tab 或空格。
        {recognizedCount >= 2 ? ` 已识别 ${recognizedCount} 个选项。` : ''}
      </p>
    </details>
  )
}
