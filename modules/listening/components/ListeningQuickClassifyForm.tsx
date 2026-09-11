'use client'

import { useActionState } from 'react'

import { assignShadowingMaterialToChapter } from '@/modules/listening/actions'
import CustomSelect from '@/components/ui/CustomSelect'

type Props = {
  materialId: string
  currentChapterId: string
  chapterOptions: Array<{ id: string; label: string }>
}

const initialState = { success: false, message: '' }

export default function ListeningQuickClassifyForm({
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
    <form action={action} className='space-y-2'>
      <input type='hidden' name='materialId' value={materialId} />
      <div className='grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]'>
        <CustomSelect
          name='chapterId'
          defaultValue={currentChapterId}
          className='h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)] focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
          <option value=''>移到未归类</option>
          {chapterOptions.map(item => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </CustomSelect>
        <button
          type='submit'
          disabled={pending}
          className='ui-btn ui-btn-sm ui-btn-primary h-9 px-3 disabled:cursor-not-allowed disabled:opacity-60'>
          {pending ? '归类中...' : '保存归类'}
        </button>
        <button
          type='submit'
          name='chapterId'
          value=''
          disabled={pending}
          className='ui-btn ui-btn-sm h-9 px-3 disabled:cursor-not-allowed disabled:opacity-60'>
          设为未归类
        </button>
      </div>
      {state.message ? (
        <p className={`text-xs font-semibold ${state.success ? 'text-slate-700' : 'text-rose-600'}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
