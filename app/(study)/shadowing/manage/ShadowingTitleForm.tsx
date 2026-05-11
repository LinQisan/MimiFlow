'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { updateSpeakingTitle } from './actions'

type Props = {
  id: string
  title: string
}

const initialState = { success: false, message: '' }

export default function ShadowingTitleForm({ id, title }: Props) {
  const router = useRouter()
  const refreshedRef = useRef(false)
  const [state, formAction, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) =>
      updateSpeakingTitle(formData),
    initialState,
  )

  useEffect(() => {
    if (state.success && !pending && !refreshedRef.current) {
      refreshedRef.current = true
      router.refresh()
    }
    if (!state.success) {
      refreshedRef.current = false
    }
  }, [state.success, pending, router])

  return (
    <form action={formAction} className='mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]'>
      <input type='hidden' name='id' value={id} />
      <input
        name='title'
        defaultValue={title}
        placeholder='输入听力标题'
        className='h-10 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
      />
      <button
        type='submit'
        disabled={pending}
        className='h-10 border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60'>
        {pending ? '保存中...' : '保存标题'}
      </button>
      {state.message ? (
        <p
          className={`text-xs font-semibold md:col-span-2 ${
            state.success ? 'text-blue-700' : 'text-rose-600'
          }`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
