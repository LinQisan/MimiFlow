'use client'

import { useActionState } from 'react'

import { assignShadowingMaterialToChapter } from './actions'

type Props = {
  legacyId: string
  materialId: string
  currentChapterId: string
  chapterOptions: Array<{ id: string; label: string }>
}

const initialState = { success: false, message: '' }

export default function ShadowingQuickClassifyForm({
  legacyId,
  materialId,
  currentChapterId,
  chapterOptions,
}: Props) {
  const [state, action, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) =>
      assignShadowingMaterialToChapter(formData),
    initialState,
  )

  return (
    <form action={action} className='space-y-2 rounded border border-blue-100 bg-blue-50/40 p-3'>
      <input type='hidden' name='legacyId' value={legacyId} />
      <input type='hidden' name='materialId' value={materialId} />
      <div className='grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]'>
        <select
          name='chapterId'
          defaultValue={currentChapterId}
          className='h-9 border border-blue-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'>
          <option value=''>移到未归类</option>
          {chapterOptions.map(item => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          type='submit'
          disabled={pending}
          className='h-9 border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60'>
          {pending ? '归类中...' : '保存归类'}
        </button>
        <button
          type='submit'
          name='chapterId'
          value=''
          disabled={pending}
          className='h-9 border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60'>
          设为未归类
        </button>
      </div>
      {state.message ? (
        <p className={`text-xs font-semibold ${state.success ? 'text-blue-700' : 'text-rose-600'}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
