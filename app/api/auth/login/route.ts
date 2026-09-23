import { NextResponse } from 'next/server'
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/modules/users/server/auth'
import { authenticateAccount, loginSchema } from '@/modules/users/server/credentials'
import { allowAuthRequest } from '@/modules/users/server/rate-limit'

export async function POST(request: Request) {
  const input = loginSchema.safeParse(await request.json().catch(() => null))
  if (!(await allowAuthRequest('login', request, input.success ? input.data.email : undefined))) return NextResponse.json({ message: '尝试过于频繁，请稍后再试。' }, { status: 429 })
  if (!input.success) return NextResponse.json({ message: '邮箱或密码不正确。' }, { status: 401 })
  const user = await authenticateAccount(input.data)
  if (!user) return NextResponse.json({ message: '邮箱或密码不正确。' }, { status: 401 })

  const token = await createSession(user.id)
  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
  return response
}
