import { NextResponse } from 'next/server'
import { registrationMode } from '@/modules/users/domain/registration'
import { validateRegistrationInvite } from '@/modules/users/server/invites'
import { allowAuthRequest } from '@/modules/users/server/rate-limit'

export async function POST(request: Request) {
  if (registrationMode() !== 'invite') return NextResponse.json({ valid: false }, { status: 403 })
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' && body.email.length <= 254 ? body.email : undefined
  if (!(await allowAuthRequest('invite', request, email))) return NextResponse.json({ valid: false, message: '尝试过于频繁。' }, { status: 429 })
  const code = typeof body?.code === 'string' ? body.code : ''
  return NextResponse.json({ valid: await validateRegistrationInvite(code) })
}
