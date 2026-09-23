import 'server-only'

import { isIP } from 'node:net'
import { randomInt } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { hashSecret } from '../domain/registration'

type Scope = 'login' | 'register' | 'invite' | 'reset' | 'verify'

const limits: Record<Scope, { ip: number; email: number }> = {
  login: { ip: 60, email: 10 },
  register: { ip: 20, email: 5 },
  invite: { ip: 60, email: 15 },
  reset: { ip: 30, email: 4 },
  verify: { ip: 60, email: 12 },
}

function requestIp(request: Request) {
  if (process.env.AUTH_TRUST_PROXY !== '1') return 'direct'
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded && isIP(forwarded) ? forwarded : 'direct'
}

async function increment(key: string) {
  const rows = await prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
    INSERT INTO "AuthRateLimit" ("key", "count", "windowStart")
    VALUES (${key}, 1, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "AuthRateLimit"."windowStart" < NOW() - INTERVAL '1 hour' THEN 1 ELSE "AuthRateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "AuthRateLimit"."windowStart" < NOW() - INTERVAL '1 hour' THEN NOW() ELSE "AuthRateLimit"."windowStart" END
    RETURNING "count"
  `)
  return rows[0]?.count ?? 1
}

export async function allowAuthRequest(scope: Scope, request: Request, email?: string) {
  const ip = requestIp(request)
  if (randomInt(1000) === 0) {
    const cutoff = new Date(Date.now() - 7 * 86400_000)
    await Promise.all([
      prisma.authRateLimit.deleteMany({ where: { windowStart: { lt: cutoff } } }),
      prisma.authToken.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    ])
  }
  const keys = [`${scope}:ip:${hashSecret(ip)}`]
  if (email) keys.push(`${scope}:email:${hashSecret(email.trim().toLowerCase())}`)
  const counts = await Promise.all(keys.map(increment))
  return counts[0] <= limits[scope].ip * (ip === 'direct' ? 10 : 1) && (counts[1] === undefined || counts[1] <= limits[scope].email)
}
