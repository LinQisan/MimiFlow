'use client'

import { useActionState } from 'react'

import { createFavoriteCollection } from './actions'

const initialState = { success: false, message: '' }

export default function FavoriteCollectionCreateForm() {
  const [state, action, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) =>
      createFavoriteCollection(formData),
    initialState,
  )

  return (
    <form
      action={action}
      className='mt-3 grid grid-cols-1 gap-2 rounded-[18px] bg-white p-4 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:grid-cols-[1fr_auto]'>
      <input
        name='favoriteName'
        placeholder='新建收藏夹（例如：精听收藏）'
        className='h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)] focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
      />
      <button
        type='submit'
        disabled={pending}
        className='ui-btn ui-btn-sm ui-btn-primary h-9 px-3 disabled:cursor-not-allowed disabled:opacity-60'>
        {pending ? '创建中...' : '新建收藏夹'}
      </button>
      {state.message ? (
        <p
          className={`text-xs font-semibold ${
            state.success ? 'text-slate-700' : 'text-rose-600'
          }`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
