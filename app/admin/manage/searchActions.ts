// app/admin/manage/searchActions.ts
'use server'

import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { revalidatePath } from 'next/cache'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})
const prisma = new PrismaClient({ adapter })

// 1. 全局搜索字幕语料
export async function searchGlobalDialogues(keyword: string) {
  if (!keyword.trim()) return []
  return await prisma.dialogue.findMany({
    where: { text: { contains: keyword.trim() } },
    include: {
      lesson: { select: { title: true, category: { select: { name: true } } } },
      vocabularies: true,
    },
    take: 30,
    orderBy: { id: 'desc' },
  })
}

// 2. 获取后台所有生词列表
export async function getAllVocabulariesAdmin() {
  return await prisma.vocabulary.findMany({
    include: {
      dialogue: { select: { text: true, lesson: { select: { title: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// 3. 删除生词
export async function deleteVocabularyAdmin(vocabId: string) {
  try {
    await prisma.vocabulary.delete({ where: { id: vocabId } })
    revalidatePath('/admin/manage')
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}
