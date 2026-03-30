// app/page.tsx
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
// 🌟 引入我们刚才分离出去的 UI 组件
import HomeUI from '@/components/HomeUI'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

export default async function Home() {
  // 纯服务端数据抓取，没有 React Hook 的干扰！
  const dbLevels = await prisma.level.findMany()
  const vocabCount = await prisma.vocabulary.count()
  const sentencesCount = await prisma.sentenceReview.count()
  const dueSentencesCount = await prisma.sentenceReview.count({
    where: { due: { lte: new Date() } },
  })

  return (
    <main>
      {/* 🌟 将抓取到的数据作为 Props 喂给客户端 UI 组件 */}
      <HomeUI
        dbLevels={dbLevels}
        vocabCount={vocabCount}
        sentencesCount={sentencesCount}
        dueSentencesCount={dueSentencesCount}
      />
    </main>
  )
}
