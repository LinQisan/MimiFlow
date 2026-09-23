'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'resend'

export default function AuthForm({ mode, invite, token }: { mode: Mode; invite?: boolean; token?: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const title = { login: '登录', register: '创建账户', forgot: '找回密码', reset: '重置密码', verify: '验证邮箱', resend: '重发验证邮件' }[mode]
  const endpoint = { login: 'login', register: 'register', forgot: 'request-reset', reset: 'reset-password', verify: 'verify-email', resend: 'resend-verification' }[mode]

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setMessage('')
    const form = new FormData(event.currentTarget)
    const body = Object.fromEntries(form.entries())
    if (token) body.token = token
    try {
      const response = await fetch(`/api/auth/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await response.json() as { message?: string }
      setMessage(result.message || (response.ok ? '操作完成。' : '请稍后再试。'))
      if (response.ok) {
        setSuccess(true)
        if (mode === 'login') { router.replace('/'); router.refresh() }
      }
    } catch { setMessage('网络连接失败，请稍后再试。') }
    finally { setPending(false) }
  }

  return <main className='mx-auto flex min-h-screen max-w-md items-center px-6 py-16'>
    <div className='w-full'>
      <p className='text-xs font-semibold tracking-[0.22em] text-slate-500'>MIMIFLOW</p>
      <h1 className='mt-4 text-3xl font-semibold text-slate-950'>{title}</h1>
      {mode === 'register' && <p className='mt-2 text-sm text-slate-600'>验证邮箱后即可使用自己的账户保存学习记录。</p>}
      {(!success || mode === 'login') && <form onSubmit={submit} className='mt-8 space-y-5'>
        {mode === 'register' && <label className='block text-sm font-medium text-slate-800'>名称<input name='name' required maxLength={24} autoComplete='name' className='mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2' /></label>}
        {['login', 'register', 'forgot', 'resend'].includes(mode) && <label className='block text-sm font-medium text-slate-800'>邮箱<input name='email' type='email' required maxLength={254} autoComplete='email' className='mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2' /></label>}
        {['login', 'register', 'reset'].includes(mode) && <label className='block text-sm font-medium text-slate-800'>{mode === 'reset' ? '新密码' : '密码'}<input name='password' type='password' required minLength={mode === 'login' ? 1 : 12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className='mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2' /></label>}
        {mode === 'register' && invite && <label className='block text-sm font-medium text-slate-800'>邀请码<input name='inviteCode' required autoComplete='off' className='mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2' /></label>}
        {message && <p role='alert' className='text-sm text-slate-700'>{message}</p>}
        <button type='submit' disabled={pending} className='ui-btn ui-btn-primary w-full disabled:opacity-50'>{pending ? '请稍候…' : title}</button>
      </form>}
      {success && mode !== 'login' && <p role='status' className='mt-8 text-sm text-slate-700'>{message}</p>}
      <nav className='mt-6 flex flex-wrap gap-4 text-sm text-slate-600'>
        {mode !== 'login' && <Link href='/login' className='underline'>返回登录</Link>}
        {mode === 'login' && <><Link href='/register' className='underline'>创建账户</Link><Link href='/forgot-password' className='underline'>忘记密码</Link><Link href='/resend-verification' className='underline'>重发验证邮件</Link></>}
      </nav>
    </div>
  </main>
}
