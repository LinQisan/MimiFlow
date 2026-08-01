import prisma from '@/lib/prisma'
import { normalizeQuestionOptions } from '@/lib/repositories/materials'
import { evaluateSelectedOption } from '@/modules/practice/domain/evaluate-attempt'

export type QuizAttemptInput = {
  questionId: string
  selectedOptionId: string
  timeSpentMs: number
}

export type QuizAttemptResult = {
  questionId: string
  selectedOptionId: string
  correctOptionId: string | null
  isCorrect: boolean
}

const DAY_IN_MS = 24 * 60 * 60 * 1000

const normalizeAttempt = (input: QuizAttemptInput): QuizAttemptInput => ({
  questionId: String(input.questionId || '').trim(),
  selectedOptionId: String(input.selectedOptionId || '').trim(),
  timeSpentMs: Math.min(
    24 * 60 * 60 * 1000,
    Math.max(0, Math.floor(Number(input.timeSpentMs) || 0)),
  ),
})

export async function recordQuizAttempts(
  inputs: QuizAttemptInput[],
): Promise<QuizAttemptResult[]> {
  const normalized = inputs
    .map(normalizeAttempt)
    .filter(item => item.questionId && item.selectedOptionId)

  if (normalized.length === 0) return []

  const uniqueQuestionIds = Array.from(
    new Set(normalized.map(item => item.questionId)),
  )
  if (uniqueQuestionIds.length !== normalized.length) {
    throw new Error('同一道题不能在一次提交中重复作答')
  }

  const questions = await prisma.question.findMany({
    where: { id: { in: uniqueQuestionIds } },
    select: {
      id: true,
      options: true,
      answer: true,
    },
  })
  const questionById = new Map(questions.map(question => [question.id, question]))

  const results = normalized.map(input => {
    const question = questionById.get(input.questionId)
    if (!question) throw new Error('题目不存在')

    const options = normalizeQuestionOptions(question.options, question.answer)
    const evaluation = evaluateSelectedOption(options, input.selectedOptionId)

    return {
      questionId: input.questionId,
      ...evaluation,
      timeSpentMs: input.timeSpentMs,
    }
  })

  await prisma.$transaction(async tx => {
    await tx.questionAttempt.createMany({
      data: results.map(result => ({
        questionId: result.questionId,
        isCorrect: result.isCorrect,
        timeSpentMs: result.timeSpentMs,
      })),
    })

    const firstRetryDueAt = new Date(Date.now() + DAY_IN_MS)
    for (const result of results) {
      if (result.isCorrect) continue
      await tx.questionRetry.upsert({
        where: { questionId: result.questionId },
        create: {
          questionId: result.questionId,
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

  return results.map(
    (result): QuizAttemptResult => ({
      questionId: result.questionId,
      selectedOptionId: result.selectedOptionId,
      correctOptionId: result.correctOptionId,
      isCorrect: result.isCorrect,
    }),
  )
}
