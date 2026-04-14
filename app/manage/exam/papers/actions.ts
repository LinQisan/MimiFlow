'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

type UpdatePaperQuestionPayload = {
  questionId: string
  prompt: string
  contextSentence: string
  explanation?: string
  options: Array<{
    id: string
    text: string
    isCorrect: boolean
  }>
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const toJsonValue = (
  value: unknown,
  fallback: Prisma.InputJsonValue,
): Prisma.InputJsonValue =>
  value === undefined ? fallback : (value as Prisma.InputJsonValue)

const toNullableJsonValue = (
  value: unknown,
):
  | Prisma.InputJsonValue
  | Prisma.NullableJsonNullValueInput
  | undefined => {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

export async function updatePaperQuestion(payload: UpdatePaperQuestionPayload) {
  const questionId = (payload.questionId || '').trim()
  if (!questionId) {
    return { success: false, message: '题目 ID 缺失。' }
  }

  const promptText = (payload.prompt || '').trim()
  const contextText = (payload.contextSentence || '').trim()
  const explanationText = (payload.explanation || '').trim()
  const normalizedOptions = (payload.options || [])
    .map((item, index) => ({
      id: (item.id || '').trim() || `opt_${index + 1}`,
      text: (item.text || '').trim(),
      isCorrect: Boolean(item.isCorrect),
    }))
    .filter(item => item.text.length > 0)

  const current = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      content: true,
      options: true,
      answer: true,
      material: {
        select: {
          collectionMaterials: {
            take: 1,
            select: { collectionId: true },
          },
        },
      },
    },
  })
  if (!current) {
    return { success: false, message: '题目不存在。' }
  }

  const currentContent = asRecord(current.content)
  const nextContext = contextText || promptText || '（未填写语境句）'

  const data: Prisma.QuestionUpdateInput = {
    prompt: promptText || null,
    context: nextContext,
    analysis: explanationText || null,
    content: toJsonValue(
      {
      ...currentContent,
      prompt: promptText || null,
      contextSentence: nextContext,
      explanation: explanationText || null,
      },
      {},
    ),
  }

  if (normalizedOptions.length > 0) {
    const correctOption = normalizedOptions.find(item => item.isCorrect)
    if (!correctOption) {
      return { success: false, message: '请至少设置一个正确答案。' }
    }
    data.options = toNullableJsonValue(
      normalizedOptions.map(item => ({
        id: item.id,
        text: item.text,
      })),
    )
    data.answer = toJsonValue(correctOption.id, '')
  }

  await prisma.question.update({
    where: { id: questionId },
    data,
  })

  const paperId = current.material.collectionMaterials[0]?.collectionId
  revalidatePath('/manage/exam/papers')
  if (paperId) {
    revalidatePath(`/manage/exam/papers/${paperId}`)
    revalidatePath(`/exam/papers/${paperId}`)
    revalidatePath(`/exam/papers/${paperId}/do`)
  }

  return { success: true, message: '题目已保存。' }
}
