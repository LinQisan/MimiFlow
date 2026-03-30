// app/vocabulary/page.tsx
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import Link from 'next/link'
import VocabularyTabs from './VocabularyTabs'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})
const prisma = new PrismaClient({ adapter })

export default async function VocabularyPage() {
  // 🌟 核心查询：顺藤摸瓜，把生词关联的句子、题目、试卷、大模块全部查出来
  const rawVocabularies = await prisma.vocabulary.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      dialogue: {
        include: {
          lesson: {
            include: {
              category: {
                include: {
                  level: true, // 拿到 levelId，比如 "jp_shadow_basic"
                },
              },
            },
          },
        },
      },
    },
  })

  // 🌟 数据清洗与分组逻辑
  // 我们将数据整理为 { "jp": [...生词], "en": [...生词] } 的格式
  const groupedData: Record<string, any[]> = {}

  rawVocabularies.forEach(vocab => {
    // 获取 levelId，例如 "jp_shadow_basic"
    const levelId = vocab.dialogue.lesson.category.level.id
    // 提取第一段作为语种，例如 "jp" 或 "en"
    const langCode = levelId.split('_')[0].toLowerCase()

    if (!groupedData[langCode]) {
      groupedData[langCode] = []
    }

    // 重新组装一个干净的前端数据对象
    // 🌟 组装数据：新增 audioFile, start, end, dialogueId
    groupedData[langCode].push({
      id: vocab.id,
      word: vocab.word,
      createdAt: vocab.createdAt,
      dialogueId: vocab.dialogue.id, // 用于查重排除
      sentence: vocab.dialogue.text,
      start: vocab.dialogue.start, // 🌟 录音开始时间
      end: vocab.dialogue.end, // 🌟 录音结束时间
      audioFile: vocab.dialogue.lesson.audioFile, // 🌟 音频文件路径
      source: `${vocab.dialogue.lesson.category.level.title} - ${vocab.dialogue.lesson.title}`,
      lessonId: vocab.dialogue.lesson.id,
    })
  })

  return (
    <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
      <div className='max-w-4xl mx-auto mt-6'>
        <Link
          href='/'
          className='inline-flex items-center text-sm text-gray-500 hover:text-indigo-600 transition-colors mb-6 font-medium group'>
          <svg
            className='w-4 h-4 mr-1 transform group-hover:-translate-x-1 transition-transform'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M10 19l-7-7m0 0l7-7m-7 7h18'
            />
          </svg>
          返回
        </Link>
        <div className='mb-8'>
          <h1 className='text-3xl font-bold text-gray-800 tracking-tight'>
            📚 我的生词本
          </h1>
          <p className='text-gray-500 mt-2'>结合原声语境，科学记忆</p>
        </div>

        {/* 将清洗好的分组数据传给客户端组件进行渲染和交互 */}
        <VocabularyTabs groupedData={groupedData} />
      </div>
    </main>
  )
}
