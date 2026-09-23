import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from '../modules/users/domain/password.ts'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const [rawName, rawEmail] = process.argv.slice(2)
const name = rawName?.trim()
const email = rawEmail?.trim().toLowerCase()
const password = process.env.MIMIFLOW_CLAIM_PASSWORD
if (!name || name.length > 24 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12 || password.length > 128) {
  throw new Error('用法: MIMIFLOW_CLAIM_PASSWORD=<密码> npm run user:create -- <名称> <邮箱>；密码为 12–128 位。')
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
try {
  await prisma.user.create({ data: { name, credential: { create: { email, passwordHash: await hashPassword(password) } } } })
  process.stdout.write('已创建独立账户。\n')
} finally {
  await prisma.$disconnect()
}
