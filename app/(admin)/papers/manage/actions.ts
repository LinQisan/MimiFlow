'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
} from '@/utils/questions/optionLabels'

type UpdatePaperQuestionPayload = {
  questionId: string
  prompt: string
  contextSentence: string
  explanation?: string
  listeningSectionTitle?: string
  listeningSectionNumber?: string
  optionLabelFormat?: string
  customOptionLabels?: string | string[]
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
  const listeningSectionNumberText = (payload.listeningSectionNumber || '').trim()
  let listeningSectionNumber: number | null = null
  if (listeningSectionNumberText) {
    const parsedNumber = Number(listeningSectionNumberText)
    if (!Number.isFinite(parsedNumber) || parsedNumber < 1) {
      return { success: false, message: '所属大题请填写大于 0 的数字。' }
    }
    listeningSectionNumber = Math.floor(parsedNumber)
  }
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
          type: true,
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
  const nextContext = contextText || promptText || null
  const currentListeningSectionTitle = String(
    currentContent.listeningSectionTitle || currentContent.sectionTitle || '听力',
  ).trim()
  const optionLabelFormat = normalizeOptionLabelFormat(
    payload.optionLabelFormat,
    current.material.type === 'LISTENING' ? 'numeric' : 'upper-alpha',
  )
  const customOptionLabels = parseCustomOptionLabels(payload.customOptionLabels)
  if (
    optionLabelFormat === 'custom' &&
    customOptionLabels.length < normalizedOptions.length
  ) {
    return {
      success: false,
      message: `自定义序号至少需要 ${normalizedOptions.length} 个，请用 | 分隔。`,
    }
  }

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
        optionLabelFormat,
        customOptionLabels,
        ...(current.material.type === 'LISTENING'
          ? {
              listeningSectionNumber: listeningSectionNumber
                ? listeningSectionNumber
                : null,
              sectionNumber: listeningSectionNumber
                ? listeningSectionNumber
                : null,
              listeningSectionTitle: currentListeningSectionTitle,
              sectionTitle: currentListeningSectionTitle,
            }
          : {}),
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
  revalidatePath('/manage/practice')
  if (paperId) {
    revalidatePath(`/manage/practice/${paperId}`)
    revalidatePath(`/practice/${paperId}`)
    revalidatePath(`/practice/${paperId}/do`)
  }

  return { success: true, message: '题目已保存。' }
}
