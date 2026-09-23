import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from '../modules/users/domain/password.ts'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const [userId, rawEmail] = process.argv.slice(2)
const password = process.env.MIMIFLOW_CLAIM_PASSWORD
const email = rawEmail?.trim().toLowerCase()
if (!userId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12 || password.length > 128) {
  throw new Error('用法: MIMIFLOW_CLAIM_PASSWORD=<密码> npm run user:claim -- <准确用户ID> <邮箱>；密码为 12–128 位。')
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
try {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, credential: { select: { userId: true } } } })
  if (!user || user.credential) throw new Error('未找到可认领的精确用户 ID，或该用户已有登录凭据。未修改数据。')
  await prisma.userCredential.create({ data: { userId, email, passwordHash: await hashPassword(password) } })
  process.stdout.write('已为指定用户建立登录凭据。\n')
} finally {
  await prisma.$disconnect()
}
