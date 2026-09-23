'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function defaultExpiry() {
  const date = new Date(Date.now() + 7 * 86400_000)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export default function InviteManager({ invites }: { invites: { id: string; createdAt: string; expiresAt: string; usedAt: string | null; status: string; createdBy: string; usedBy: string | null }[] }) {
  const router = useRouter()
  const [expiry, setExpiry] = useState(defaultExpiry)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  async function create() {
    setPending(true); setMessage(''); setCode('')
    try {
      const response = await fetch('/api/manage/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresAt: new Date(expiry).toISOString() }) })
      const result = await response.json() as { code?: string; message?: string }
      if (response.ok && result.code) { setCode(result.code); router.refresh() }
      else setMessage(result.message || '创建失败。')
    } catch { setMessage('网络连接失败。') }
    finally { setPending(false) }
  }
  async function revoke(id: string) {
    setPending(true); setMessage('')
    try {
      const response = await fetch('/api/manage/invites', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const result = await response.json() as { revoked?: boolean }
      if (!response.ok) setMessage('撤销失败。')
      else if (!result.revoked) setMessage('邀请码已使用或已撤销。')
      router.refresh()
    } catch { setMessage('网络连接失败。') }
    finally { setPending(false) }
  }
  return <div className='space-y-8'>
    <section className='space-y-4'>
      <label className='block text-sm'>过期时间<input type='datetime-local' value={expiry} onChange={event => setExpiry(event.target.value)} className='ml-3 rounded-md border border-slate-300 bg-white px-2 py-1' /></label>
      <button className='ui-btn ui-btn-primary' disabled={pending || !expiry || !Number.isFinite(new Date(expiry).getTime())} onClick={create}>生成一次性邀请码</button>
      {code && <div className='space-y-2'><p className='text-sm'>请现在复制邀请码；数据库只保存其摘要，刷新后不能再查看。</p><code className='block break-all rounded bg-white p-3 text-sm'>{code}</code><button className='ui-btn' onClick={() => navigator.clipboard.writeText(code)}>复制</button></div>}
      {message && <p role='alert' className='text-sm text-rose-700'>{message}</p>}
    </section>
    <section className='space-y-3'><h2 className='text-lg font-semibold'>邀请码</h2>
      {invites.length === 0 ? <p className='ui-empty'>尚无邀请码。</p> : <div className='divide-y divide-slate-200'>{invites.map(item => <div key={item.id} className='flex flex-wrap items-center justify-between gap-3 py-3 text-sm'>
        <div><span className='font-semibold'>{item.status}</span><span className='ml-3 text-slate-600'>创建：{item.createdBy} · {new Date(item.createdAt).toLocaleString('zh-CN')}</span><p className='mt-1 text-slate-500'>到期：{new Date(item.expiresAt).toLocaleString('zh-CN')}{item.usedBy ? ` · 使用：${item.usedBy} · ${new Date(item.usedAt!).toLocaleString('zh-CN')}` : ''}</p></div>
        {(item.status === '未使用' || item.status === '已过期') && <button className='ui-btn' disabled={pending} onClick={() => revoke(item.id)}>撤销</button>}
      </div>)}</div>}
    </section>
  </div>
}
