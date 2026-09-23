import Link from 'next/link'
import InviteManager from '@/modules/users/components/InviteManager'
import { listRegistrationInvites } from '@/modules/users/server/invites'

export const dynamic = 'force-dynamic'
export default async function InvitePage() {
  const invites = await listRegistrationInvites()
  return <main className='mx-auto max-w-5xl px-4 py-8'><Link href='/manage/system' className='text-sm underline'>返回系统</Link><h1 className='my-6 text-2xl font-semibold'>注册邀请码</h1><InviteManager invites={invites.map(row => ({ id: row.id, status: row.status, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), usedAt: row.usedAt?.toISOString() || null, createdBy: row.createdBy.name, usedBy: row.usedBy?.name || null }))} /></main>
}
