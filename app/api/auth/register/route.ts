import { NextResponse } from 'next/server'
import { registerAccount, registrationSchema } from '@/modules/users/server/credentials'
import { registrationMode } from '@/modules/users/domain/registration'
import { allowAuthRequest } from '@/modules/users/server/rate-limit'

export async function POST(request: Request) {
  if (registrationMode() === 'disabled') {
    return NextResponse.json({ message: '当前不开放自行注册。' }, { status: 403 })
  }
  const input = registrationSchema.safeParse(await request.json().catch(() => null))
  if (!(await allowAuthRequest('register', request, input.success ? input.data.email : undefined))) return NextResponse.json({ message: '尝试过于频繁，请稍后再试。' }, { status: 429 })
  if (!input.success) {
    return NextResponse.json({ message: '请填写有效的名称、邮箱和至少 12 位的密码。' }, { status: 400 })
  }
  let result: Awaited<ReturnType<typeof registerAccount>>
  try { result = await registerAccount(input.data) }
  catch { return NextResponse.json({ message: '注册暂时不可用，请稍后再试。' }, { status: 503 }) }
  if (result === 'duplicate') return NextResponse.json({ message: '名称或邮箱已被使用。' }, { status: 409 })
  if (result === 'invite') return NextResponse.json({ message: '邀请码无效或已失效。' }, { status: 400 })
  if (result === 'disabled') return NextResponse.json({ message: '当前不开放自行注册。' }, { status: 403 })
  return NextResponse.json({ message: '验证邮件已发送，请查收邮箱。' })
}
