import { NextResponse } from 'next/server'
import { consumeResetToken, resetPasswordSchema } from '@/modules/users/server/credentials'
import { allowAuthRequest } from '@/modules/users/server/rate-limit'

export async function POST(request: Request) {
  if (!(await allowAuthRequest('reset', request))) return NextResponse.json({ message: '尝试过于频繁。' }, { status: 429 })
  const input = resetPasswordSchema.safeParse(await request.json().catch(() => null))
  if (!input.success || !(await consumeResetToken(input.data.token, input.data.password))) return NextResponse.json({ message: '链接无效或已过期。' }, { status: 400 })
  return NextResponse.json({ message: '密码已重置，请重新登录。' })
}
