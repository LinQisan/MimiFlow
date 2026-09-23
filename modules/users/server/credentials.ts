import 'server-only'

import { z } from 'zod'
import prisma from '@/lib/prisma'
import { hashPassword, normalizeEmail, verifyPassword } from './auth'
import { hashSecret, newSecret, registrationMode, validSecret } from '../domain/registration'
import { assertMailConfigured, sendAuthMail } from './mail'

const emailSchema = z.email().max(254).transform(normalizeEmail)
const passwordSchema = z.string().min(12).max(128)

export const registrationSchema = z.object({
  name: z.string().trim().min(1).max(24), email: emailSchema, password: passwordSchema,
  inviteCode: z.string().optional(),
})
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) })
export const emailRequestSchema = z.object({ email: emailSchema })
export const tokenSchema = z.object({ token: z.string().refine(validSecret) })
export const resetPasswordSchema = tokenSchema.extend({ password: passwordSchema })

const unknownAccountHash = `scrypt-v1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`
class InvalidInviteError extends Error {}

export async function registerAccount(input: z.infer<typeof registrationSchema>) {
  const mode = registrationMode()
  if (mode === 'disabled') return 'disabled' as const
  if (mode === 'invite' && (!input.inviteCode || !validSecret(input.inviteCode))) return 'invite' as const
  assertMailConfigured()
  const token = newSecret()
  const passwordHash = await hashPassword(input.password)
  try {
    const userId = await prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: { name: input.name, credential: { create: { email: input.email, passwordHash, emailVerificationRequired: true } } },
        select: { id: true },
      })
      if (mode === 'invite') {
        const used = await tx.registrationInvite.updateMany({
          where: { codeHash: hashSecret(input.inviteCode!), usedById: null, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { usedById: created.id, usedAt: new Date() },
        })
        if (used.count !== 1) throw new InvalidInviteError()
      }
      await tx.authToken.create({ data: { tokenHash: hashSecret(token), userId: created.id, purpose: 'verify', expiresAt: new Date(Date.now() + 24 * 60 * 60_000) } })
      return created.id
    })
    try { await sendAuthMail(input.email, 'verify', token) }
    catch (error) {
      await prisma.$transaction(async tx => {
        if (mode === 'invite') await tx.registrationInvite.updateMany({ where: { usedById: userId }, data: { usedById: null, usedAt: null } })
        await tx.user.delete({ where: { id: userId } })
      })
      throw error
    }
    return 'created' as const
  } catch (error) {
    if (error instanceof InvalidInviteError) return 'invite' as const
    if (typeof error === 'object' && error !== null && 'code' in error && (error.code === 'P2002' || error.code === 'P2003')) return 'duplicate' as const
    throw error
  }
}

export async function authenticateAccount(input: z.infer<typeof loginSchema>) {
  const credential = await prisma.userCredential.findUnique({
    where: { email: input.email },
    select: { userId: true, passwordHash: true, loginLockedUntil: true, emailVerifiedAt: true, emailVerificationRequired: true, user: { select: { id: true, name: true } } },
  })
  const valid = await verifyPassword(input.password, credential?.passwordHash || unknownAccountHash)
  if (!credential || (credential.loginLockedUntil && credential.loginLockedUntil > new Date())) return null
  if (!valid) {
    const updated = await prisma.userCredential.update({ where: { userId: credential.userId }, data: { failedLoginAttempts: { increment: 1 } }, select: { failedLoginAttempts: true } })
    if (updated.failedLoginAttempts >= 5) await prisma.userCredential.update({ where: { userId: credential.userId }, data: { loginLockedUntil: new Date(Date.now() + 15 * 60_000) } })
    return null
  }
  if (credential.emailVerificationRequired && !credential.emailVerifiedAt) return null
  await prisma.userCredential.update({ where: { userId: credential.userId }, data: { failedLoginAttempts: 0, loginLockedUntil: null } })
  return credential.user
}

export async function issueAuthToken(email: string, purpose: 'verify' | 'reset') {
  const credential = await prisma.userCredential.findUnique({ where: { email }, select: { userId: true, emailVerifiedAt: true } })
  if (!credential || (purpose === 'verify' && credential.emailVerifiedAt)) return
  const token = newSecret()
  await prisma.authToken.create({ data: { tokenHash: hashSecret(token), userId: credential.userId, purpose, expiresAt: new Date(Date.now() + (purpose === 'verify' ? 24 * 60 : 30) * 60_000) } })
  await sendAuthMail(email, purpose, token)
}

export async function consumeVerificationToken(token: string) {
  if (!validSecret(token)) return false
  return prisma.$transaction(async tx => {
    const row = await tx.authToken.findUnique({ where: { tokenHash: hashSecret(token) } })
    if (!row || row.purpose !== 'verify' || row.usedAt || row.expiresAt <= new Date()) return false
    const used = await tx.authToken.updateMany({ where: { tokenHash: row.tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })
    if (used.count !== 1) return false
    await tx.userCredential.update({ where: { userId: row.userId }, data: { emailVerifiedAt: new Date() } })
    return true
  })
}

export async function consumeResetToken(token: string, password: string) {
  if (!validSecret(token)) return false
  const passwordHash = await hashPassword(password)
  return prisma.$transaction(async tx => {
    const row = await tx.authToken.findUnique({ where: { tokenHash: hashSecret(token) } })
    if (!row || row.purpose !== 'reset' || row.usedAt || row.expiresAt <= new Date()) return false
    const used = await tx.authToken.updateMany({ where: { tokenHash: row.tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })
    if (used.count !== 1) return false
    await tx.userCredential.update({ where: { userId: row.userId }, data: { passwordHash, emailVerifiedAt: new Date(), failedLoginAttempts: 0, loginLockedUntil: null } })
    await tx.userSession.deleteMany({ where: { userId: row.userId } })
    await tx.authToken.deleteMany({ where: { userId: row.userId, purpose: 'reset', usedAt: null } })
    return true
  })
}
