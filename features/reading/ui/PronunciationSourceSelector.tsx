'use client'

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
  const optionClassName = (selected: boolean) =>
    `h-7 border-0 px-2 text-[11px] font-medium transition ${
      selected
        ? 'text-slate-950 underline decoration-slate-400 underline-offset-4'
        : 'text-slate-400 hover:text-slate-700'
    }`

  return (
    <div
      role='radiogroup'
      aria-label='注音来源'
      className='flex items-center divide-x divide-slate-300'>
      <button
        type='button'
        role='radio'
        aria-checked={value === 'sudachi'}
        disabled={!sudachiAvailable}
        title={sudachiAvailable ? '显示默认自动注音' : '默认自动注音当前不可用'}
        onClick={() => onChange('sudachi')}
        className={`${optionClassName(value === 'sudachi')} disabled:cursor-not-allowed disabled:opacity-40`}>
        默认
      </button>
      <button
        type='button'
        role='radio'
        aria-checked={value === 'personal'}
        onClick={() => onChange('personal')}
        className={optionClassName(value === 'personal')}>
        我的
      </button>
    </div>
  )
}
