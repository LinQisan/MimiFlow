'use server'

import { MaterialType } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import prisma from '@/lib/prisma'
import { executeAction } from '@/lib/actions/result'
import { parseInput } from '@/lib/validation/schema'
import {
  recordQuizAttempts,
  type QuizAttemptInput,
} from '@/modules/practice/server/attempt-service'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error'

const resolveMaterialId = async (
  type: MaterialType,
  id: string,
) => {
  const direct = await prisma.material.findUnique({
    where: { id },
    select: { id: true, type: true },
  })
  if (direct && direct.type === type) return direct.id
  return null
}

export async function deleteArticle(passageId: string) {
  try {
    const materialId = await resolveMaterialId(
      MaterialType.READING,
      passageId.trim(),
    )
    if (!materialId) {
      return { success: true, message: '文章已移除' }
    }

    const result = await prisma.material.deleteMany({
      where: { id: materialId, type: MaterialType.READING },
    })

    if (result.count === 0) {
      console.warn(`尝试删除不存在的文章 ID: ${passageId}`)
      return { success: true, message: '文章已移除' }
    }

    return { success: true, message: '删除成功' }
  } catch (error: unknown) {
    console.error('删除文章时发生未知错误:', getErrorMessage(error), error)
    return { success: false, message: '服务器内部错误，删除失败' }
  }
}

export async function submitQuizAttempts(
  attempts: QuizAttemptInput[],
) {
  try {
    const results = await recordQuizAttempts(attempts)

    revalidatePath('/review')
    revalidatePath('/review/mistakes')
    revalidatePath('/')

    return { success: true, message: '做题数据已保存', results }
  } catch (error: unknown) {
    console.error('保存做题数据失败:', getErrorMessage(error), error)
    return { success: false, message: '数据保存失败' }
  }
}

export async function updateQuestionExplanation(
  questionId: string,
  explanation: string,
) {
  try {
    await prisma.question.update({
      where: { id: questionId },
      data: { analysis: explanation },
    })
    return { success: true, message: '笔记已保存' }
  } catch (error: unknown) {
    console.error('保存笔记失败:', getErrorMessage(error), error)
    return { success: false, message: '保存失败' }
  }
}

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

export async function deleteQuiz(quizId: string) {
  try {
    const materialId = await resolveMaterialId(
      MaterialType.VOCAB_GRAMMAR,
      quizId.trim(),
    )
    if (!materialId) {
      return { success: true, message: '题库已不存在' }
    }

    const result = await prisma.material.deleteMany({
      where: { id: materialId, type: MaterialType.VOCAB_GRAMMAR },
    })

    if (result.count === 0) {
      return { success: true, message: '题库已不存在' }
    }

    return { success: true, message: '题库删除成功' }
  } catch (error) {
    console.error('删除题库失败:', error)
    return { success: false, message: '服务器错误，删除失败' }
  }
}

export type SortableModel =
  | 'Papers'
  | 'Lesson'
  | 'Passage'
  | 'Quiz'
  | 'Question'
  | 'Level'

const sortOrderInputSchema = z.object({
  model: z.enum(['Papers', 'Lesson', 'Passage', 'Quiz', 'Question', 'Level']),
  orderedIds: z.array(z.string().trim().min(1)).max(1000),
})

export async function updateSortOrder(
  model: SortableModel,
  orderedIds: string[],
) {
  return executeAction(
    async () => {
      const input = parseInput(sortOrderInputSchema, { model, orderedIds })
      const updatePromises = input.orderedIds.map((id, index) => {
        if (input.model === 'Question') {
        return prisma.question.update({
          where: { id },
          data: { sortOrder: index },
        })
      }
        if (
          input.model === 'Lesson' ||
          input.model === 'Passage' ||
          input.model === 'Quiz'
        ) {
        return prisma.collectionMaterial.updateMany({
          where: {
            OR: [
              { materialId: id },
              {
                materialId: `${input.model === 'Lesson' ? 'lesson' : input.model === 'Passage' ? 'passage' : 'quiz'}:${id}`,
              },
            ],
          },
          data: { sortOrder: index },
        })
      }
      return prisma.collectionMaterial.updateMany({
        where: { materialId: id },
        data: { sortOrder: index },
      })
      })

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
