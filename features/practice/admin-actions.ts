'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { z } from 'zod'
import { actionFailure, actionSuccess } from '@/lib/actions/result'
import { DomainError } from '@/lib/errors/domain-error'
import { parseInput } from '@/lib/validation/schema'
import {
  decodeQuestionContent,
  encodeQuestionContent,
} from '@/lib/codecs/question-content'
import { Prisma } from '@prisma/client'
import {
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
} from '@/utils/questions/optionLabels'
import { MIN_QUESTION_OPTION_COUNT } from '@/utils/questions/editorOptions'
import { normalizeQuestionTextFields } from '@/modules/practice/domain/question-text'

const updatePaperQuestionSchema = z.object({
  questionId: z.string().trim().min(1, '题目 ID 缺失。'),
  prompt: z.string().catch(''),
  contextSentence: z.string().catch(''),
  explanation: z.string().optional(),
  listeningSectionTitle: z.string().optional(),
  listeningSectionNumber: z.string().optional(),
  optionLabelFormat: z.string().optional(),
  customOptionLabels: z.union([z.string(), z.array(z.string())]).optional(),
  options: z
    .array(
      z.object({
        id: z.string().catch(''),
        text: z.string().catch(''),
        isCorrect: z.boolean().catch(false),
      }),
    )
    .min(
      MIN_QUESTION_OPTION_COUNT,
      `每道题至少需要 ${MIN_QUESTION_OPTION_COUNT} 个选项。`,
    )
    .max(100),
})

type UpdatePaperQuestionPayload = z.input<typeof updatePaperQuestionSchema>

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
  try {
  const input = parseInput(updatePaperQuestionSchema, payload)
  const questionId = input.questionId

  const questionText = normalizeQuestionTextFields(
    input.prompt,
    input.contextSentence,
  )
  const promptText = questionText.prompt || ''
  const explanationText = (input.explanation || '').trim()
  const listeningSectionNumberText = (input.listeningSectionNumber || '').trim()
  let listeningSectionNumber: number | null = null
  if (listeningSectionNumberText) {
    const parsedNumber = Number(listeningSectionNumberText)
    if (!Number.isFinite(parsedNumber) || parsedNumber < 1) {
      throw new DomainError(
        'VALIDATION_ERROR',
        '所属大题请填写大于 0 的数字。',
      )
    }
    listeningSectionNumber = Math.floor(parsedNumber)
  }
  const normalizedOptions = input.options.map((item, index) => ({
    id: (item.id || '').trim() || `opt_${index + 1}`,
    text: (item.text || '').trim(),
    isCorrect: Boolean(item.isCorrect),
  }))

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
    throw new DomainError('NOT_FOUND', '题目不存在。')
  }

  const currentContent = decodeQuestionContent(current.content)
  const currentListeningSectionTitle = String(
    currentContent.listeningSectionTitle || currentContent.sectionTitle || '听力',
  ).trim()
  const optionLabelFormat = normalizeOptionLabelFormat(
    input.optionLabelFormat,
    current.material.type === 'LISTENING' ? 'numeric' : 'upper-alpha',
  )
  const customOptionLabels = parseCustomOptionLabels(input.customOptionLabels)
  if (
    optionLabelFormat === 'custom' &&
    customOptionLabels.length < normalizedOptions.length
  ) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `自定义序号至少需要 ${normalizedOptions.length} 个，请用 | 分隔。`,
    )
  }

  const data: Prisma.QuestionUpdateInput = {
    prompt: promptText || null,
    context: questionText.context,
    analysis: explanationText || null,
    content: encodeQuestionContent(
      {
        ...currentContent,
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
    ),
  }

  const correctOption = normalizedOptions.find(item => item.isCorrect)
  if (!correctOption) {
    throw new DomainError('VALIDATION_ERROR', '请至少设置一个正确答案。')
  }
  data.options = toNullableJsonValue(
    normalizedOptions.map(item => ({
      id: item.id,
      text: item.text,
    })),
  )
  data.answer = toJsonValue(correctOption.id, '')

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

  return actionSuccess({}, '题目已保存。')
  } catch (error) {
    return actionFailure(error, '题目保存失败。')
  }
}
