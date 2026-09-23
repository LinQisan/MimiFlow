import { NextResponse } from 'next/server'
import { consumeVerificationToken, tokenSchema } from '@/modules/users/server/credentials'
import { allowAuthRequest } from '@/modules/users/server/rate-limit'

export async function POST(request: Request) {
  if (!(await allowAuthRequest('verify', request))) return NextResponse.json({ message: '尝试过于频繁。' }, { status: 429 })
  const input = tokenSchema.safeParse(await request.json().catch(() => null))
  if (!input.success || !(await consumeVerificationToken(input.data.token))) return NextResponse.json({ message: '链接无效或已过期。' }, { status: 400 })
  return NextResponse.json({ message: '邮箱已验证，现在可以登录。' })
}
