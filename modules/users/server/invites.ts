import 'server-only'

import prisma from '@/lib/prisma'
import { requireAdmin } from './current-user'
import { hashSecret, inviteStatus, newSecret, validSecret } from '../domain/registration'

export async function createRegistrationInvite(expiresAt: Date) {
  const admin = await requireAdmin()
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 90 * 24 * 60 * 60_000) {
    throw new Error('有效期必须在未来 90 天内。')
  }
  const code = newSecret()
  await prisma.registrationInvite.create({ data: { codeHash: hashSecret(code), createdById: admin.id, expiresAt } })
  return code
}

export async function revokeRegistrationInvite(id: string) {
  await requireAdmin()
  const result = await prisma.registrationInvite.updateMany({ where: { id, usedById: null, revokedAt: null }, data: { revokedAt: new Date() } })
  return result.count === 1
}

export async function listRegistrationInvites() {
  await requireAdmin()
  const rows = await prisma.registrationInvite.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, expiresAt: true, usedAt: true, revokedAt: true,
      createdBy: { select: { name: true } }, usedBy: { select: { name: true } },
    },
  })
  return rows.map(row => ({ ...row, status: inviteStatus(row) }))
}

export async function validateRegistrationInvite(code: string) {
  if (!validSecret(code)) return false
  const row = await prisma.registrationInvite.findUnique({ where: { codeHash: hashSecret(code) }, select: { usedById: true, revokedAt: true, expiresAt: true } })
  return !!row && !row.usedById && !row.revokedAt && row.expiresAt > new Date()
}
