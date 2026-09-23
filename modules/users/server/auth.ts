import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
export { hashPassword, verifyPassword } from '../domain/password'

const SESSION_DAYS = 30
export const SESSION_COOKIE = 'mimiflow_session'

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60,
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url')
  await prisma.userSession.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  await prisma.userSession.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      expiresAt: new Date(Date.now() + sessionCookieOptions.maxAge * 1000),
    },
  })
  return token
}

export async function readSessionUser(token: string | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { expiresAt: true, user: { select: { id: true, name: true, isAdmin: true } } },
  })
  return session && session.expiresAt > new Date() ? session.user : null
}

export async function getSessionUser() {
  const cookieStore = await cookies()
  return readSessionUser(cookieStore.get(SESSION_COOKIE)?.value)
}
