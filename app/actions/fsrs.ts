// app/actions/fsrs.ts
'use server'

import { fsrs, Rating, createEmptyCard, Card, State } from 'ts-fsrs'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'

const f = fsrs()

// ==========================================
// 1. 获取今天需要复习的所有句子
// ==========================================
export async function getDueSentences() {
  const now = new Date()

  try {
    // 1. 获取到期的复习卡片
    const reviews = await prisma.sentenceReview.findMany({
      where: { due: { lte: now } },
      orderBy: { due: 'asc' },
    })

    if (reviews.length === 0) return []

    // 2. 拿到需要复习的听力句子 ID
    const dialogueIds = reviews
      .filter(r => r.sourceType === 'AUDIO_DIALOGUE')
      .map(r => Number(r.sourceId))

    // 3. 查出这些句子，顺藤摸瓜查出整篇文章的所有句子（为了算上一句和下一句）
    const dialoguesWithContext = await prisma.dialogue.findMany({
      where: { id: { in: dialogueIds } },
      include: {
        lesson: {
          include: {
            dialogues: {
              orderBy: { start: 'asc' },
              select: { id: true, text: true, start: true, end: true },
            },
          },
        },
      },
    })

    // 4. 组装数据并计算上下文时间轴
    return reviews.map(review => {
      if (review.sourceType === 'AUDIO_DIALOGUE') {
        const currentDialogue = dialoguesWithContext.find(
          d => d.id === Number(review.sourceId),
        )

        if (!currentDialogue) return review // 兜底防止意外脏数据

        const allDialogues = currentDialogue.lesson.dialogues
        const currentIndex = allDialogues.findIndex(
          d => d.id === currentDialogue.id,
        )

        const prevDialogue =
          currentIndex > 0 ? allDialogues[currentIndex - 1] : null
        const nextDialogue =
          currentIndex < allDialogues.length - 1
            ? allDialogues[currentIndex + 1]
            : null

        return {
          ...review,
          dialogue: currentDialogue, // 继续伪装成旧结构交给前台
          context: {
            prev: prevDialogue?.text || null,
            next: nextDialogue?.text || null,
            // 核心算法：如果存在上一句，音频就从上一句开始；如果存在下一句，音频就到下一句结束
            playStart: prevDialogue
              ? prevDialogue.start
              : currentDialogue.start,
            playEnd: nextDialogue ? nextDialogue.end : currentDialogue.end,
          },
        }
      }

      // 💡 如果以后你加入了“阅读句子”的复习，在这里写 if (review.sourceType === 'ARTICLE_TEXT') 即可扩展
      return review
    })
  } catch (error) {
    console.error('获取复习句子失败:', error)
    return []
  }
}
// ==========================================
// 2. 核心：提交流利度评分
// ==========================================
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
      last_review: record.last_review || undefined, // 兼容 Prisma 的 null
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
        // @ts-ignore (兜底兼容某些包含此字段的老版本)
        learning_steps: (nextCard as any).learning_steps || 0,
        last_review: nextCard.last_review || null,
      },
    })

    // 重新验证复习页面缓存
    revalidatePath('/review')
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ==========================================
// 3. 加入句库接口 (彻底修复报错与不显示问题)
// ==========================================
export async function addSentenceToReview(dialogueId: number) {
  try {
    const dialogue = await prisma.dialogue.findUnique({
      where: { id: dialogueId },
      select: { text: true },
    })

    if (!dialogue) {
      return { success: false, message: '找不到对应的听力句子' }
    }

    const emptyCard = createEmptyCard()

    await prisma.sentenceReview.create({
      data: {
        // 🌟 1. 终极修复：使用 connect 语法，彻底消除 "dialogueId 不在类型中" 的 TS 报错！
        sourceId: String(dialogueId),

        // 🌟 2. 补齐丢失的 text 字段
        text: dialogue.text,
        sourceType: 'AUDIO_DIALOGUE',
        // FSRS 算法数据
        due: emptyCard.due,
        state: emptyCard.state,
        stability: emptyCard.stability,
        difficulty: emptyCard.difficulty,
        elapsed_days: emptyCard.elapsed_days,
        scheduled_days: emptyCard.scheduled_days,
        reps: emptyCard.reps,
        lapses: emptyCard.lapses,
        learning_steps: 0,
      },
    })

    // 🌟 3. 核心大招：强行清空前台页面缓存！
    // 只有加了这几行，你去 "/sentences" 或 首页 才能立刻看到新增加的句子数字！
    revalidatePath('/sentences')
    revalidatePath('/review')
    revalidatePath('/')

    return { success: true, message: '已加入跟读复习库' }
  } catch (error: any) {
    console.error('添加句子到复习库失败:', error)

    if (error.code === 'P2002') {
      return {
        success: false,
        state: 'already_exists',
        message: '已在复习库中',
      }
    }

    return { success: false, message: error.message }
  }
}

// ==========================================
// 4. 从句库中移除
// ==========================================
export async function removeSentenceFromReview(reviewId: string) {
  try {
    await prisma.sentenceReview.delete({ where: { id: reviewId } })

    // 🌟 删除数据后同样需要清空缓存，否则前台依然会显示旧数据
    revalidatePath('/sentences')
    revalidatePath('/review')
    revalidatePath('/')

    return { success: true }
  } catch (error: any) {
    return { success: false, message: '移除失败' }
  }
}

// ==========================================
// 5. 获取所有复习句子
// ==========================================
export async function getAllReviewSentences() {
  // 1. 先查出所有的复习卡片
  const reviews = await prisma.sentenceReview.findMany({
    orderBy: { id: 'desc' },
  })

  // 2. 收集属于“听力跟读”的句子 ID
  const dialogueIds = reviews
    .filter(r => r.sourceType === 'AUDIO_DIALOGUE')
    .map(r => Number(r.sourceId)) // 因为 sourceId 是字符串，强转为数字去匹配 Dialogue 表

  if (dialogueIds.length === 0) return reviews

  // 3. 去 Dialogue 表里批量捞出对应的听力文本和 Lesson 标题
  const dialogues = await prisma.dialogue.findMany({
    where: { id: { in: dialogueIds } },
    include: { lesson: { select: { title: true, audioFile: true } } },
  })

  // 4. 将查出来的对话信息，拼接到 review 数据上返回给前端
  return reviews.map(review => {
    if (review.sourceType === 'AUDIO_DIALOGUE') {
      const matchingDialogue = dialogues.find(
        d => d.id === Number(review.sourceId),
      )
      return {
        ...review,
        dialogue: matchingDialogue, // 伪装成旧结构，前端不用改代码！
      }
    }
    return review
  })
}
