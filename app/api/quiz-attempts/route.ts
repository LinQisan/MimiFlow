import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import {
  recordQuizAttempts,
  resetQuizAttemptHistory,
  type QuizAttemptResetScope,
  type QuizAttemptInput,
} from '@/modules/practice/server/attempt-service'

type AttemptPayload = Partial<QuizAttemptInput>

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      attempts?: AttemptPayload[]
      completedPaperId?: string
      customSessionId?: string
    }
    const attempts = Array.isArray(body?.attempts) ? body.attempts : []
    const normalized = attempts.map(item => ({
      questionId: String(item.questionId || '').trim(),
      selectedOptionId: String(item.selectedOptionId || '').trim(),
      selectedOrder: Array.isArray(item.selectedOrder)
        ? item.selectedOrder.map(value => String(value || '').trim())
        : undefined,
      timeSpentMs: Number(item.timeSpentMs || 0),
    }))

    if (
      normalized.length === 0 ||
      normalized.some(
        item =>
          !item.questionId ||
          (!item.selectedOptionId && !item.selectedOrder?.length),
      )
    ) {
      if (normalized.length > 0) {
        return NextResponse.json(
          { success: false, message: '作答数据不完整' },
          { status: 400 },
        )
      }
      if (!body.customSessionId) return NextResponse.json({ success: true, message: '无可保存作答。' })
    }

    const completedPaperId = String(body.completedPaperId || '').trim()
    const record = await recordQuizAttempts(normalized, {
      completedPaperId: completedPaperId || undefined,
      customSessionId: String(body.customSessionId || '').trim() || undefined,
    })
    revalidatePath('/')
    revalidatePath('/practice')
    revalidatePath('/review')
    revalidatePath('/review/mistakes')

    return NextResponse.json({
      success: true,
      message: '做题数据已保存。',
      alreadyCompleted: record.alreadyCompleted,
      results: record.results,
      submission: record.submission,
    })
  } catch (error) {
    console.error('保存做题数据失败:', error)
    if (
      error instanceof Error &&
      [
        '自定义练习不存在',
        '提交类型不一致',
        '作答题目不属于当前练习',
        '题目不存在',
        '所选答案无效',
        '排序题作答数据无效',
        '同一道题不能在一次提交中重复作答',
        '整套练习记录与试卷题目不一致',
      ].includes(error.message)
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

export async function DELETE(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      scope?: string
      language?: string
      paperId?: string
    }
    let scope: QuizAttemptResetScope
    if (body.scope === 'language') {
      const language = String(body.language || '').trim()
      if (!language) {
        return NextResponse.json(
          { success: false, message: '请选择要重置的语言' },
          { status: 400 },
        )
      }
      scope = { type: 'language', language }
    } else if (body.scope === 'paper') {
      const paperId = String(body.paperId || '').trim()
      if (!paperId) {
        return NextResponse.json(
          { success: false, message: '请选择要重置的试卷' },
          { status: 400 },
        )
      }
      scope = { type: 'paper', paperId }
    } else if (!body.scope || body.scope === 'all') {
      scope = { type: 'all' }
    } else {
      return NextResponse.json(
        { success: false, message: '不支持的重置范围' },
        { status: 400 },
      )
    }
    const result = await resetQuizAttemptHistory(scope)
    revalidatePath('/')
    revalidatePath('/practice')
    revalidatePath('/review')
    revalidatePath('/review/mistakes')
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('重置做题统计失败:', error)
    return NextResponse.json(
      { success: false, message: '重置失败' },
      { status: 500 },
    )
  }
}
