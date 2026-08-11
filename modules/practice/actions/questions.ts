'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import prisma from '@/lib/prisma'
import { executeAction } from '@/lib/actions/result'
import { parseInput } from '@/lib/validation/schema'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error'

export async function updateQuestionNote(questionId: string, note: string) {
  try {
    const normalizedQuestionId = (questionId || '').trim()
    if (!normalizedQuestionId) {
      return { success: false, message: '题目不存在' }
    }
    const normalizedNote = (note || '').trim()
    await prisma.question.update({
      where: { id: normalizedQuestionId },
      data: { note: normalizedNote || null },
    })
    return { success: true, message: '笔记已保存' }
  } catch (error: unknown) {
    console.error('保存题目笔记失败:', getErrorMessage(error), error)
    return { success: false, message: '保存失败' }
  }
}

export type SortableModel = 'Lesson' | 'Question'

const sortOrderInputSchema = z.object({
  model: z.enum(['Lesson', 'Question']),
  orderedIds: z.array(z.string().trim().min(1)).max(1000),
})

export async function updateSortOrder(
  model: SortableModel,
  orderedIds: string[],
) {
  return executeAction(
    async () => {
      const input = parseInput(sortOrderInputSchema, { model, orderedIds })
      const updatePromises = input.orderedIds.map((id, index) =>
        input.model === 'Question'
          ? prisma.question.update({
              where: { id },
              data: { sortOrder: index },
            })
          : prisma.collectionMaterial.updateMany({
              where: { materialId: id },
              data: { sortOrder: index },
            }),
      )

      await prisma.$transaction(updatePromises)

      // Keep manage/public pages in sync after drag-sort persistence.
      revalidatePath('/')
      revalidatePath('/manage/import')
      revalidatePath('/listening/[id]', 'page')
      revalidatePath('/reading')
      revalidatePath('/practice')

      return {}
    },
    { fallbackMessage: `更新 ${model} 排序失败。` },
  )
}
