import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { hashPassword } from '../modules/users/domain/password.ts'

dotenv.config({ path: ['.env.local', '.env'], quiet: true })

const [userId] = process.argv.slice(2)
const password = process.env.MIMIFLOW_CLAIM_PASSWORD
if (!userId || !password || password.length < 12 || password.length > 128) {
  throw new Error('用法: MIMIFLOW_CLAIM_PASSWORD=<新密码> npm run user:password -- <准确用户ID>；密码为 12–128 位。')
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
try {
  const result = await prisma.userCredential.updateMany({
    where: { userId },
    data: { passwordHash: await hashPassword(password), failedLoginAttempts: 0, loginLockedUntil: null },
  })
  if (result.count !== 1) throw new Error('未找到该用户的登录凭据，未修改数据。')
  await prisma.userSession.deleteMany({ where: { userId } })
  process.stdout.write('已更新密码并使该用户旧会话失效。\n')
} finally {
  await prisma.$disconnect()
}
