// seed.ts
import 'dotenv/config'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '@prisma/client' // 🌟 1. 修复导入路径为标准路径
import { speakLessons } from './data/lessons/speak'

// 保持使用你跑通的本地路径
const adapter = new PrismaLibSql({
  url: 'file:./prisma/dev.db',
})
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🚀 开始导入数据...')

  // 🌟 2. 预填 Level 数据：确保外键关联不出错
  // SQLite 不支持 createMany 的 skipDuplicates，我们改用 upsert 循环，完美平替！
  const initialLevels = [
    { id: 'n1', title: 'N1 听力', description: '包含 N1 历年真题及模拟题' },
    { id: 'n2', title: 'N2 听力', description: '包含 N2 历年真题及模拟题' },
    { id: 'speak', title: '口语', description: '日常口语材料' },
  ]

  for (const level of initialLevels) {
    await prisma.level.upsert({
      where: { id: level.id },
      update: {}, // 如果已经存在，什么都不做 (跳过)
      create: level, // 如果不存在，则创建
    })
  }
  console.log('✅ 大模块 (Level) 检查完毕。')

  // 先清空数据库中的旧试卷数据（Cascade 级联删除会自动帮你把底下的 Lesson 和 Dialogue 一起清掉）
  await prisma.category.deleteMany()

  for (const [categoryKey, categoryData] of Object.entries(
    speakLessons,
  ) as any) {
    console.log(`正在写入试卷: ${categoryData.categoryId} ...`)

    await prisma.category.create({
      data: {
        id: categoryKey,
        // 🌟 3. 字段变更：原来的 level 变成了 levelId，并转为小写确保和上面 Level 表的 id 对应
        levelId: categoryData.group.toLowerCase(),
        name: categoryData.categoryId,

        // 嵌套创建下面的课程和字幕
        lessons: {
          create: categoryData.lessons.map((lesson: any) => ({
            lessonNum: lesson.id,
            title: lesson.title,
            audioFile: lesson.audioFile,
            dialogues: {
              create: lesson.dialogue.map((d: any) => ({
                sequenceId: d.id,
                text: d.text,
                start: d.start,
                end: d.end,
              })),
            },
          })),
        },
      },
    })
  }

  console.log('✅ 所有数据导入完成！🎉')
}

main()
  .catch(e => {
    console.error('❌ 报错了:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
