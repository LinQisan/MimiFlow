// app/actions/fsrs.ts
'use server'

import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { fsrs, Rating, createEmptyCard, Card, State } from 'ts-fsrs'
import { revalidatePath } from 'next/cache'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})
const prisma = new PrismaClient({ adapter })

const f = fsrs()

// 1. 获取今天需要复习的所有句子 (包含上下文语境)
export async function getDueSentences() {
  const now = new Date()

  try {
    const reviews = await prisma.sentenceReview.findMany({
      where: { due: { lte: now } },
      include: {
        dialogue: {
          include: {
            lesson: {
              include: {
                dialogues: {
                  orderBy: { start: 'asc' },
                  // 🌟 核心升级：必须把 start 和 end 也查出来
                  select: { id: true, text: true, start: true, end: true },
                },
              },
            },
          },
        },
      },
      orderBy: { due: 'asc' },
    })

    return reviews.map(review => {
      const allDialogues = review.dialogue.lesson.dialogues
      const currentIndex = allDialogues.findIndex(
        d => d.id === review.dialogueId,
      )

      const prevDialogue =
        currentIndex > 0 ? allDialogues[currentIndex - 1] : null
      const nextDialogue =
        currentIndex < allDialogues.length - 1
          ? allDialogues[currentIndex + 1]
          : null

      return {
        ...review,
        context: {
          prev: prevDialogue?.text || null,
          next: nextDialogue?.text || null,
          // 🌟 核心算法：如果存在上一句，音频就从上一句开始；如果存在下一句，音频就到下一句结束
          playStart: prevDialogue ? prevDialogue.start : review.dialogue.start,
          playEnd: nextDialogue ? nextDialogue.end : review.dialogue.end,
        },
      }
    })
  } catch (error) {
    console.error('获取复习句子失败:', error)
    return []
  }
}

// 2. 核心：提交流利度评分
export async function rateSentenceFluency(reviewId: string, rating: Rating) {
  try {
    const record = await prisma.sentenceReview.findUnique({
      where: { id: reviewId },
    })
    if (!record) throw new Error('找不到复习记录')

    const currentCard: Card = {
      ...createEmptyCard(),
      due: record.due,
      state: record.state as State,
      stability: record.stability,
      difficulty: record.difficulty,
      elapsed_days: record.elapsed_days,
      scheduled_days: record.scheduled_days,
      reps: record.reps,
      lapses: record.lapses,
      learning_steps: record.learning_steps,
      last_review: record.last_review || undefined,
    }

    const schedulingCards = f.repeat(currentCard, new Date())
    const validRating = rating as 1 | 2 | 3 | 4
    const nextCard = schedulingCards[validRating].card

    await prisma.sentenceReview.update({
      where: { id: reviewId },
      data: {
        due: nextCard.due,
        state: nextCard.state,
        stability: nextCard.stability,
        difficulty: nextCard.difficulty,
        elapsed_days: nextCard.elapsed_days,
        scheduled_days: nextCard.scheduled_days,
        reps: nextCard.reps,
        lapses: nextCard.lapses,
        learning_steps: nextCard.learning_steps || 0,
        last_review: nextCard.last_review,
      },
    })

    revalidatePath('/review')
    return { success: true }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// 3. 修复后的加入句库接口 (精准的错误捕获)
export async function addSentenceToReview(dialogueId: number) {
  try {
    const emptyCard = createEmptyCard()

    await prisma.sentenceReview.create({
      data: {
        dialogueId: dialogueId,
        due: emptyCard.due,
        state: emptyCard.state as number, // 强制转换为数据库接受的 number
        stability: emptyCard.stability,
        difficulty: emptyCard.difficulty,
        elapsed_days: emptyCard.elapsed_days,
        scheduled_days: emptyCard.scheduled_days,
        reps: emptyCard.reps,
        lapses: emptyCard.lapses,
        // 🌟 关键：补上新加的短时记忆步数，以防数据库报错
        learning_steps: emptyCard.learning_steps || 0,
      },
    })
    return { success: true, message: '🧠 已成功加入智能句库！' }
  } catch (error: any) {
    // 打印真正的错误到你的终端/控制台，方便排查
    console.error('❌ 添加句子到复习库失败的真正原因:', error)

    // Prisma 的 P2002 错误码代表 Unique constraint failed (违反唯一约束，即真的已经存在了)
    if (error.code === 'P2002') {
      return { success: false, message: '这句已经在你的复习库中啦！' }
    }

    // 如果是其他报错，直接把错误信息弹给前端
    return {
      success: false,
      message: `添加失败: ${error.message || '未知错误'}`,
    }
  }
}

// 4. 🌟 新增：从句库中移除
export async function removeSentenceFromReview(reviewId: string) {
  try {
    await prisma.sentenceReview.delete({ where: { id: reviewId } })
    return { success: true }
  } catch (error: any) {
    return { success: false, message: '移除失败' }
  }
}

export async function getAllReviewSentences() {
  return await prisma.sentenceReview.findMany({
    include: {
      dialogue: {
        include: { lesson: { select: { title: true, audioFile: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
