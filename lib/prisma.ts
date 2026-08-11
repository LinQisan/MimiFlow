import { PrismaClient } from '#prisma-client'
import { PrismaD1 } from '@prisma/adapter-d1'
import { env } from 'cloudflare:workers'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}
const workerEnv = env as unknown as CloudflareEnv

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaD1(workerEnv.DB),
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
