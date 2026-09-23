import { createHash, randomBytes } from 'node:crypto'

export type RegistrationMode = 'disabled' | 'invite' | 'open'

export function registrationMode(value = process.env.REGISTRATION_MODE): RegistrationMode {
  return value === 'invite' || value === 'open' ? value : 'disabled'
}

export function newSecret() {
  return randomBytes(32).toString('base64url')
}

export function hashSecret(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function validSecret(value: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(value)
}

export function inviteStatus(invite: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()) {
  if (invite.usedAt) return '已使用'
  if (invite.revokedAt) return '已撤销'
  if (invite.expiresAt <= now) return '已过期'
  return '未使用'
}
