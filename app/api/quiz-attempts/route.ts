import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import {
  recordQuizAttempts,
  type QuizAttemptInput,
} from '@/modules/practice/server/attempt-service'

type AttemptPayload = Partial<QuizAttemptInput>

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      attempts?: AttemptPayload[]
    }
    const attempts = Array.isArray(body?.attempts) ? body.attempts : []
    const normalized = attempts.map(item => ({
      questionId: String(item.questionId || '').trim(),
      selectedOptionId: String(item.selectedOptionId || '').trim(),
      timeSpentMs: Number(item.timeSpentMs || 0),
    }))

    if (
      normalized.length === 0 ||
      normalized.some(item => !item.questionId || !item.selectedOptionId)
    ) {
      if (normalized.length > 0) {
        return NextResponse.json(
          { success: false, message: '作答数据不完整' },
          { status: 400 },
        )
      }
      return NextResponse.json({ success: true, message: '无可保存作答。' })
    }

    const results = await recordQuizAttempts(normalized)
    revalidatePath('/')
    revalidatePath('/review')
    revalidatePath('/review/mistakes')

    return NextResponse.json({
      success: true,
      message: '做题数据已保存。',
      results,
    })
  } catch (error) {
    console.error('保存做题数据失败:', error)
    if (
      error instanceof Error &&
      ['题目不存在', '所选答案无效', '同一道题不能在一次提交中重复作答'].includes(
        error.message,
      )
    ) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 },
      )
    }
    return NextResponse.json(
      { success: false, message: '数据保存失败' },
      { status: 500 },
    )
  }
}
