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
import {
  normalizeQuestionTextFields,
  normalizeSortingPrompt,
  parseSortingPrompt,
  supportsSeparateQuestionContext,
  usesExplicitQuestionTargetWord,
} from '@/modules/practice/domain/question-text'
import {
  invalidatePracticeVocabularyAnalytics,
  precomputePracticeVocabularyMaterialAnalyses,
} from '@/modules/practice/server/vocabulary-analytics'

const updatePaperQuestionSchema = z.object({
  questionId: z.string().trim().min(1, '题目 ID 缺失。'),
  prompt: z.string().catch(''),
  contextSentence: z.string().catch(''),
  explanation: z.string().optional(),
  listeningSectionTitle: z.string().optional(),
  listeningSectionNumber: z.string().optional(),
  optionLabelFormat: z.string().optional(),
  customOptionLabels: z.union([z.string(), z.array(z.string())]).optional(),
  shuffleOptions: z.boolean().optional(),
  sortingOrder: z.array(z.number().int().nonnegative()).optional(),
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

const paperQuestionSelectionSchema = z.object({
  paperId: z.string().trim().min(1, '试卷 ID 缺失。'),
  questionIds: z
    .array(z.string().trim().min(1))
    .min(1, '请至少选择一道题。')
    .max(500, '一次最多操作 500 道题。')
    .transform(ids => Array.from(new Set(ids))),
})

const movePaperQuestionsSchema = paperQuestionSelectionSchema.extend({
  targetPaperId: z.string().trim().min(1, '请选择目标试卷。'),
})

const revalidatePaperQuestionRoutes = (paperId: string) => {
  revalidatePath('/manage/practice')
  revalidatePath(`/manage/practice/${paperId}`)
  revalidatePath(`/practice/${paperId}`)
  revalidatePath(`/practice/${paperId}/do`)
}

async function resequenceMaterialQuestions(
  tx: Prisma.TransactionClient,
  materialId: string,
) {
  const questions = await tx.question.findMany({
    where: { materialId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  await Promise.all(
    questions.map((question, index) =>
      tx.question.update({
        where: { id: question.id },
        data: { sortOrder: index + 1 },
      }),
    ),
  )
}

export async function deletePaperQuestions(payload: unknown) {
  try {
    const input = parseInput(paperQuestionSelectionSchema, payload)
    const questions = await prisma.question.findMany({
      where: {
        id: { in: input.questionIds },
        material: {
          collectionMaterials: { some: { collectionId: input.paperId } },
        },
      },
      select: { id: true, materialId: true },
    })
    if (questions.length !== input.questionIds.length) {
      throw new DomainError('NOT_FOUND', '部分题目已不存在或不属于当前试卷。')
    }

    const affectedMaterialIds = Array.from(
      new Set(questions.map(question => question.materialId)),
    )
    await prisma.$transaction(async tx => {
      await tx.question.deleteMany({ where: { id: { in: input.questionIds } } })
      for (const materialId of affectedMaterialIds) {
        await resequenceMaterialQuestions(tx, materialId)
      }
    })
    await precomputePracticeVocabularyMaterialAnalyses(affectedMaterialIds)
    invalidatePracticeVocabularyAnalytics()

    revalidatePaperQuestionRoutes(input.paperId)
    return actionSuccess(
      { deletedCount: questions.length },
      `已删除 ${questions.length} 道题。`,
    )
  } catch (error) {
    return actionFailure(error, '删除题目失败。')
  }
}

export async function movePaperQuestions(payload: unknown) {
  try {
    const input = parseInput(movePaperQuestionsSchema, payload)
    if (input.paperId === input.targetPaperId) {
      throw new DomainError('VALIDATION_ERROR', '目标试卷不能是当前试卷。')
    }

    const [targetPaper, questions] = await Promise.all([
      prisma.collection.findFirst({
        where: {
          id: input.targetPaperId,
          collectionType: 'PAPER',
        },
        select: { id: true },
      }),
      prisma.question.findMany({
        where: {
          id: { in: input.questionIds },
          material: {
            collectionMaterials: { some: { collectionId: input.paperId } },
          },
        },
        select: {
          id: true,
          materialId: true,
          material: {
            select: {
              type: true,
              title: true,
              chapterName: true,
              contentPayload: true,
              metadata: true,
              _count: { select: { questions: true } },
              collectionMaterials: {
                select: { collectionId: true },
              },
            },
          },
        },
      }),
    ])
    if (!targetPaper) throw new DomainError('NOT_FOUND', '目标试卷不存在。')
    if (questions.length !== input.questionIds.length) {
      throw new DomainError('NOT_FOUND', '部分题目已不存在或不属于当前试卷。')
    }

    const grouped = new Map<string, typeof questions>()
    for (const question of questions) {
      const bucket = grouped.get(question.materialId) || []
      bucket.push(question)
      grouped.set(question.materialId, bucket)
    }
    const affectedMaterialIds = new Set(grouped.keys())
    const clonedMaterialIds: string[] = []

    await prisma.$transaction(async tx => {
      const targetLastMaterial = await tx.collectionMaterial.aggregate({
        where: { collectionId: input.targetPaperId },
        _max: { sortOrder: true },
      })
      let nextMaterialOrder = (targetLastMaterial._max.sortOrder || 0) + 1

      for (const [materialId, selectedQuestions] of grouped) {
        const source = selectedQuestions[0].material
        const movesWholeMaterial =
          selectedQuestions.length === source._count.questions
        const targetAlreadyContainsMaterial = source.collectionMaterials.some(
          relation => relation.collectionId === input.targetPaperId,
        )

        if (movesWholeMaterial) {
          if (targetAlreadyContainsMaterial) {
            await tx.collectionMaterial.delete({
              where: {
                collectionId_materialId: {
                  collectionId: input.paperId,
                  materialId,
                },
              },
            })
          } else {
            await tx.collectionMaterial.update({
              where: {
                collectionId_materialId: {
                  collectionId: input.paperId,
                  materialId,
                },
              },
              data: {
                collectionId: input.targetPaperId,
                sortOrder: nextMaterialOrder,
              },
            })
            nextMaterialOrder += 1
          }
          continue
        }

        const clonedMaterial = await tx.material.create({
          data: {
            type: source.type,
            title: source.title,
            chapterName: source.chapterName,
            contentPayload: source.contentPayload as Prisma.InputJsonValue,
            metadata:
              source.metadata === null
                ? undefined
                : (source.metadata as Prisma.InputJsonValue),
            collectionMaterials: {
              create: {
                collectionId: input.targetPaperId,
                sortOrder: nextMaterialOrder,
              },
            },
          },
          select: { id: true },
        })
        clonedMaterialIds.push(clonedMaterial.id)
        nextMaterialOrder += 1
        await tx.question.updateMany({
          where: { id: { in: selectedQuestions.map(question => question.id) } },
          data: { materialId: clonedMaterial.id },
        })
        await resequenceMaterialQuestions(tx, materialId)
        await resequenceMaterialQuestions(tx, clonedMaterial.id)
      }
    })
    await precomputePracticeVocabularyMaterialAnalyses([
      ...affectedMaterialIds,
      ...clonedMaterialIds,
    ])
    invalidatePracticeVocabularyAnalytics()

    revalidatePaperQuestionRoutes(input.paperId)
    revalidatePaperQuestionRoutes(input.targetPaperId)
    return actionSuccess(
      { movedCount: questions.length },
      `已移动 ${questions.length} 道题。`,
    )
  } catch (error) {
    return actionFailure(error, '移动题目失败。')
  }
}

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
      questionType: true,
      content: true,
      options: true,
      answer: true,
      material: {
        select: {
          id: true,
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
  if (!usesExplicitQuestionTargetWord(current.questionType)) {
    delete currentContent.targetWord
  }
  const sortingOrder = input.sortingOrder || []
  if (current.questionType === 'SORTING') {
    const expected = normalizedOptions.map((_, index) => index)
    const normalized = [...new Set(sortingOrder)].sort((a, b) => a - b)
    if (
      normalized.length !== expected.length ||
      !normalized.every((index, position) => index === expected[position])
    ) {
      throw new DomainError(
        'VALIDATION_ERROR',
        '请按正确语序依次点击全部选项。',
      )
    }
    currentContent.sortingOrder = sortingOrder
  } else {
    delete currentContent.sortingOrder
  }
  const persistedPrompt =
    current.questionType === 'SORTING'
      ? normalizeSortingPrompt(promptText)
      : promptText
  const parsedSortingPrompt = parseSortingPrompt(persistedPrompt)
  if (
    current.questionType === 'SORTING' &&
    (parsedSortingPrompt.slotCount !== normalizedOptions.length ||
      parsedSortingPrompt.starCount !== 1)
  ) {
    throw new DomainError(
      'VALIDATION_ERROR',
      `问题6题干需要 ${normalizedOptions.length} 个排序位，并标出一个★位。`,
    )
  }
  const currentListeningSectionTitle = String(
    currentContent.listeningSectionTitle || '听力',
  ).trim()
  const optionLabelFormat = normalizeOptionLabelFormat(
    input.optionLabelFormat,
    'numeric',
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
    prompt: persistedPrompt || null,
    context: supportsSeparateQuestionContext(current.questionType)
      ? questionText.context
      : null,
    analysis: explanationText || null,
    content: encodeQuestionContent(
      {
        ...currentContent,
        optionLabelFormat,
        customOptionLabels,
        shuffleOptions:
          input.shuffleOptions !== false &&
          !(
            current.material.type === 'LISTENING' &&
            listeningSectionNumber === 3
          ),
        ...(current.material.type === 'LISTENING'
          ? {
              listeningSectionNumber: listeningSectionNumber
                ? listeningSectionNumber
                : null,
              listeningSectionTitle: currentListeningSectionTitle,
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
  await precomputePracticeVocabularyMaterialAnalyses([current.material.id])
  invalidatePracticeVocabularyAnalytics()

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
