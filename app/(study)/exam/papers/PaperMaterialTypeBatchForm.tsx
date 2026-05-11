'use client'

import { useActionState } from 'react'

import { updateExamPaperMaterialType } from './actions'

type Props = {
  paperId: string
}

const initialState = { success: false, message: '' }

export default function PaperMaterialTypeBatchForm({ paperId }: Props) {
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) =>
      updateExamPaperMaterialType(formData),
    initialState,
  )

  return (
    <form
      action={formAction}
      className='mt-2 rounded-[18px] bg-white p-4 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
      <input type='hidden' name='paperId' value={paperId} />
      <div className='flex flex-col gap-2 md:flex-row md:items-center'>
        <label
          htmlFor={`paper-material-type-${paperId}`}
          className='text-xs font-bold tracking-wide text-slate-600'>
          试卷下全部语料统一改为
        </label>
        <select
          id={`paper-material-type-${paperId}`}
          name='materialType'
          defaultValue='LISTENING'
          className='h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)] focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
          <option value='LISTENING'>LISTENING（听力）</option>
          <option value='READING'>READING（阅读）</option>
          <option value='VOCAB_GRAMMAR'>VOCAB_GRAMMAR（语法）</option>
          <option value='SPEAKING'>SPEAKING（跟读）</option>
        </select>
        <button
          type='submit'
          disabled={pending}
          className='ui-btn ui-btn-sm ui-btn-primary h-9 px-3 disabled:opacity-60'>
          {pending ? '更新中...' : '批量更新类型'}
        </button>
      </div>
      <p className='mt-2 text-xs text-slate-600'>
        该操作会一次性修改当前试卷内所有语料的 MaterialType。
      </p>
      {state.message ? (
        <p
          className={`mt-1 text-xs font-semibold ${
            state.success ? 'text-slate-700' : 'text-rose-600'
          }`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
