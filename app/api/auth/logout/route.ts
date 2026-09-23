import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { hashSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/modules/users/server/auth'

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.userSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } })
  }
  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 })
  return response
}
