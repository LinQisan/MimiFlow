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
      className='mt-3 grid grid-cols-1 gap-2 border border-blue-100 bg-blue-50/50 p-3 md:grid-cols-[1fr_auto]'>
      <input
        name='favoriteName'
        placeholder='新建收藏夹（例如：精听收藏）'
        className='h-9 border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
      />
      <button
        type='submit'
        disabled={pending}
        className='h-9 border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60'>
        {pending ? '创建中...' : '新建收藏夹'}
      </button>
      {state.message ? (
        <p
          className={`text-xs font-semibold ${
            state.success ? 'text-blue-700' : 'text-rose-600'
          }`}>
          {state.message}
        </p>
      ) : null}
    </form>
  )
}
