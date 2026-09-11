import { NextResponse } from 'next/server'
import { z } from 'zod'

import prisma from '@/lib/prisma'
import { normalizeVocabularyWord } from '@/modules/knowledge/vocabulary/domain/normalized-word'
import { getCurrentUserId } from '@/modules/users/server/current-user'

const preferenceSchema = z.object({
  word: z.string().trim().min(1).max(200),
  mastered: z.boolean(),
})

export async function POST(request: Request) {
  try {
    const input = preferenceSchema.parse(await request.json())
    const userId = await getCurrentUserId()
    const normalizedWord = normalizeVocabularyWord(input.word)

    if (input.mastered) {
      await prisma.practiceVocabularyPreference.upsert({
        where: { userId_normalizedWord: { userId, normalizedWord } },
        create: { userId, normalizedWord, word: input.word, mastered: true },
        update: { word: input.word, mastered: true },
      })
    } else {
      await prisma.practiceVocabularyPreference.deleteMany({
        where: { userId, normalizedWord },
      })
    }

    return NextResponse.json({ success: true, mastered: input.mastered })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: '词汇状态无效。' },
        { status: 400 },
      )
    }
    console.error('更新词汇熟练状态失败:', error)
    return NextResponse.json(
      { success: false, message: '保存失败，请重试。' },
      { status: 500 },
    )
  }
}
