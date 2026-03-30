// app/actions/vocabulary.ts
'use server'

import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { revalidatePath } from 'next/cache'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})
const prisma = new PrismaClient({ adapter })

export async function saveVocabulary(word: string, dialogueId: number) {
  if (!word || !dialogueId) {
    return { success: false, message: '参数缺失' }
  }

  try {
    const cleanWord = word.trim()

    // 🌟 智能查重机制：先去数据库里找找有没有存过这个词
    const existingWord = await prisma.vocabulary.findFirst({
      where: {
        word: cleanWord,
      },
    })

    if (existingWord) {
      // 如果已经存过了，为了保持生词本清爽，我们不再重复创建，直接返回成功提示
      return { success: true, message: `"${cleanWord}" 已经在你的生词本里啦！` }
    }

    // 🌟 核心：存入数据库，并与当前的句子 (dialogueId) 产生羁绊
    await prisma.vocabulary.create({
      data: {
        word: cleanWord,
        dialogueId: dialogueId,
      },
    })

    // 如果未来你做了一个 /vocabulary 页面，可以在这里触发它的缓存刷新
    // revalidatePath('/vocabulary')

    return { success: true, message: `成功将 "${cleanWord}" 收入囊中！` }
  } catch (error: any) {
    console.error('保存生词失败:', error)
    return { success: false, message: `收藏失败: ${error.message}` }
  }
}
