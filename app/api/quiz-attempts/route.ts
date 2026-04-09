import { NextResponse } from 'next/server'

import prisma from '@/lib/prisma'

type AttemptPayload = {
  questionId: string
  isCorrect: boolean
  timeSpentMs: number
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      attempts?: AttemptPayload[]
    }
    const attempts = Array.isArray(body?.attempts) ? body.attempts : []
    const normalized = attempts
      .map(item => ({
        questionId: String(item.questionId || '').trim(),
        isCorrect: Boolean(item.isCorrect),
        timeSpentMs: Math.max(0, Math.floor(Number(item.timeSpentMs || 0))),
      }))
      .filter(item => item.questionId.length > 0)

    if (normalized.length === 0) {
      return NextResponse.json({ success: true, message: '无可保存作答。' })
    }

    await prisma.$transaction(async tx => {
      await tx.questionAttempt.createMany({
        data: normalized,
      })

      const now = new Date()
      const firstRetryDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      const wrongAttempts = normalized.filter(item => !item.isCorrect)

      for (const item of wrongAttempts) {
        await tx.questionRetry.upsert({
          where: { questionId: item.questionId },
          create: {
            questionId: item.questionId,
            stage: 0,
            dueAt: firstRetryDueAt,
            wrongCount: 1,
          },
          update: {
            stage: 0,
            dueAt: firstRetryDueAt,
            wrongCount: { increment: 1 },
          },
        })
      }
    })

    return NextResponse.json({
      success: true,
      message: '做题数据已保存。',
    })
  } catch (error) {
    console.error('保存做题数据失败:', error)
    return NextResponse.json(
      { success: false, message: '数据保存失败' },
      { status: 500 },
    )
  }
}
