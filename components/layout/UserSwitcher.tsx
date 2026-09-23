'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserSummary } from '@/modules/users/server/current-user'

export default function UserSwitcher({ currentUser }: { currentUser: UserSummary }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  const logout = async () => {
    if (pending) return
    setPending(true)
    setMessage('')
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('退出失败')
      router.replace('/login')
      router.refresh()
    } catch {
      setMessage('退出失败，请重试。')
      setPending(false)
    }
  }

  return (
    <details className='group relative'>
      <summary
        aria-label={`当前用户：${currentUser.name}`}
        className='flex h-9 cursor-pointer list-none items-center gap-1.5 border-b border-transparent px-2 text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 group-open:border-slate-900 group-open:text-slate-950 [&::-webkit-details-marker]:hidden'>
        <span aria-hidden='true' className='grid size-5 place-items-center text-[11px] font-semibold text-slate-500'>
          {Array.from(currentUser.name)[0] || '用'}
        </span>
        <span className='hidden max-w-24 truncate sm:inline'>{currentUser.name}</span>
        <span aria-hidden='true' className='text-[9px] text-slate-400 transition-transform group-open:rotate-180'>⌄</span>
      </summary>
      <div className='absolute right-0 top-[calc(100%+0.5rem)] z-50 w-48 rounded-lg border border-slate-300 bg-[#f6f5f1] p-2 shadow-lg'>
        <p className='truncate px-2 py-2 text-sm text-slate-700'>{currentUser.name}</p>
        <button type='button' disabled={pending} onClick={logout}
          className='w-full rounded px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-200 disabled:opacity-50'>
          退出登录
        </button>
        {message && <p role='alert' className='px-2 pb-2 text-xs text-rose-700'>{message}</p>}
      </div>
    </details>
  )
}
