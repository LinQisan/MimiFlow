import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

// 告诉 TypeScript 我们在全局对象上挂载了一个 prisma 属性
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 🌟 核心修改：直接使用你原本跑通的 Config 对象写法！不需要 import @libsql/client 了
const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! })

// 如果全局已经有实例了就复用，没有才新建
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

// 在开发环境下，把实例挂载到全局，防止热更新导致连接数爆炸
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
