import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// 告诉 TypeScript 我们在全局对象上挂载了一个 prisma 属性
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 如果全局已经有实例了就复用，没有才新建
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  })

// 在开发环境下，把实例挂载到全局，防止热更新导致连接数爆炸
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
