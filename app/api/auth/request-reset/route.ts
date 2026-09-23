import { NextResponse } from 'next/server'
import { emailRequestSchema, issueAuthToken } from '@/modules/users/server/credentials'
import { allowAuthRequest } from '@/modules/users/server/rate-limit'
import { after } from 'next/server'

export async function POST(request: Request) {
  const input = emailRequestSchema.safeParse(await request.json().catch(() => null))
  const allowed = await allowAuthRequest('reset', request, input.success ? input.data.email : undefined)
  if (allowed && input.success) {
    after(async () => {
      try { await issueAuthToken(input.data.email, 'reset') }
      catch { console.error('Password reset mail delivery failed') }
    })
  }
  return NextResponse.json({ message: '如果该邮箱已注册且可用于重置密码，我们会发送邮件。' })
}
