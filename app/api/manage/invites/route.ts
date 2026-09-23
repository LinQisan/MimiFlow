import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/modules/users/server/auth'
import { createRegistrationInvite, revokeRegistrationInvite } from '@/modules/users/server/invites'

async function isAdmin() {
  return (await getSessionUser())?.isAdmin === true
}

const createSchema = z.object({ expiresAt: z.iso.datetime() })
const revokeSchema = z.object({ id: z.string().cuid() })

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ message: '没有管理权限。' }, { status: 403 })
  const input = createSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ message: '有效期无效。' }, { status: 400 })
  try {
    const code = await createRegistrationInvite(new Date(input.data.expiresAt))
    return NextResponse.json({ code })
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : '创建失败。' }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ message: '没有管理权限。' }, { status: 403 })
  const input = revokeSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ message: '邀请码无效。' }, { status: 400 })
  const revoked = await revokeRegistrationInvite(input.data.id)
  return NextResponse.json({ revoked })
}
