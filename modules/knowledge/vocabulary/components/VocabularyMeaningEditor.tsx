'use client'

export default function VocabularyMeaningEditor({
  isOpen,
  sourceLabel,
  value,
  isSaving,
  onToggle,
  onChange,
  onCancel,
  onSave,
}: {
  isOpen: boolean
  sourceLabel?: string
  value: string
  isSaving: boolean
  onToggle: () => void
  onChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className='relative'>
      <button
        type='button'
        onClick={event => {
          event.stopPropagation()
          onToggle()
        }}
        className={`ui-btn ui-btn-sm px-3 text-xs font-bold transition-colors ${
          isOpen
            ? 'bg-slate-100 text-slate-800'
            : 'bg-white text-slate-400 hover:text-slate-700'
        }`}>
        释义
      </button>
      {isOpen ? (
        <div
          onClick={event => event.stopPropagation()}
          className='ui-pop ui-pop-surface absolute right-0 top-full z-50 mt-2 w-72 p-3 text-left'>
          <div className='px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400'>
            编辑释义
          </div>
          {sourceLabel ? (
            <p className='mb-2 px-1 text-[11px] font-medium text-violet-600'>
              保存到 {sourceLabel}
            </p>
          ) : null}
          <textarea
            autoFocus
            rows={5}
            value={value}
            onChange={event => onChange(event.currentTarget.value)}
            placeholder={'每行一个释义\n例如：\n棉花\n棉絮'}
            className='w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-800 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100'
          />
          <p className='mt-1 px-1 text-[10px] text-slate-400'>
            每行填写一个释义，留空保存可清除已有释义。
          </p>
          <div className='mt-2 flex justify-end gap-2'>
            <button
              type='button'
              onClick={onCancel}
              className='ui-btn ui-btn-sm px-3 text-xs font-bold text-slate-500'>
              取消
            </button>
            <button
              type='button'
              disabled={isSaving}
              onClick={onSave}
              className='ui-btn ui-btn-primary ui-btn-sm px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50'>
              {isSaving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
