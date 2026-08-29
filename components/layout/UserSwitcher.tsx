'use client'

import { FormEvent, useState, useTransition } from 'react'

import { createUser, switchUser } from '@/modules/users/actions'
import type { UserSummary } from '@/modules/users/server/current-user'

export default function UserSwitcher({
  currentUser,
  users,
}: {
  currentUser: UserSummary
  users: UserSummary[]
}) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  const chooseUser = (userId: string) => {
    if (pending || userId === currentUser.id) return
    setMessage('')
    startTransition(async () => {
      const result = await switchUser(userId)
      if (!result.success) {
        setMessage(result.message)
        return
      }
      window.location.reload()
    })
  }

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    setMessage('')
    startTransition(async () => {
      const result = await createUser(name)
      if (!result.success) {
        setMessage(result.message)
        return
      }
      setName('')
      window.location.reload()
    })
  }

  return (
    <details className='group relative'>
      <summary
        aria-label={`当前用户：${currentUser.name}`}
        className='flex h-9 cursor-pointer list-none items-center gap-1.5 border-b border-transparent px-2 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 group-open:border-slate-900 group-open:text-slate-950 [&::-webkit-details-marker]:hidden'>
        <span
          aria-hidden='true'
          className='grid size-5 place-items-center text-[11px] font-semibold text-slate-500 group-open:text-slate-900'>
          {Array.from(currentUser.name)[0] || '用'}
        </span>
        <span className='hidden max-w-24 truncate sm:inline'>{currentUser.name}</span>
        <span
          aria-hidden='true'
          className='text-[9px] text-slate-400 transition-transform group-open:rotate-180'>
          ⌄
        </span>
      </summary>

      <div className='absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-300 bg-[#f6f5f1] shadow-[0_14px_32px_-24px_rgba(15,23,42,0.55)]'>
        <div className='border-b border-slate-200 px-4 py-3'>
          <p className='text-xs font-semibold text-slate-900'>选择用户</p>
          <p className='mt-1 text-[11px] leading-4 text-slate-500'>学习记录按用户分别保存</p>
        </div>
        <div className='max-h-56 divide-y divide-slate-200 overflow-y-auto px-2'>
          {users.map(user => {
            const active = user.id === currentUser.id
            return (
              <button
                key={user.id}
                type='button'
                disabled={pending}
                onClick={() => chooseUser(user.id)}
                className={`flex w-full items-center gap-2 px-2 py-2.5 text-left text-sm transition disabled:opacity-60 ${
                  active
                    ? 'font-semibold text-slate-950'
                    : 'text-slate-600 hover:text-slate-950'
                }`}>
                <span
                  aria-hidden='true'
                  className='grid size-6 shrink-0 place-items-center text-[11px] font-semibold text-slate-500'>
                  {Array.from(user.name)[0] || '用'}
                </span>
                <span className='min-w-0 flex-1 truncate'>{user.name}</span>
                {active ? (
                  <span className='text-xs text-slate-900' aria-label='当前用户'>✓</span>
                ) : null}
              </button>
            )
          })}
        </div>

        <form onSubmit={handleCreate} className='border-t border-slate-300 px-4 py-3'>
          <label htmlFor='new-user-name' className='mb-2 block text-xs font-semibold text-slate-700'>
            新建用户
          </label>
          <div className='flex gap-2'>
            <input
              id='new-user-name'
              value={name}
              maxLength={24}
              disabled={pending}
              onChange={event => setName(event.target.value)}
              placeholder='输入名称'
              className='h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-transparent px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-300/35'
            />
            <button
              type='submit'
              disabled={pending || !name.trim()}
              className='h-9 shrink-0 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'>
              创建
            </button>
          </div>
          {message ? <p className='mt-2 text-xs text-rose-600'>{message}</p> : null}
        </form>
      </div>
    </details>
  )
}
