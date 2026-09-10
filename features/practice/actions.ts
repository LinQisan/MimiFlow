'use server'

// Practice actions.

import { CollectionType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { normalizePaperAttributes } from '@/features/practice/domain/paper-attributes'
import {
  invalidatePracticeVocabularyAnalytics,
  precomputePracticeVocabularyMaterialAnalyses,
} from '@/features/practice/server/vocabulary-analytics'

export async function updatePaperAttributes(formData: FormData) {
  try {
    const paperId = String(formData.get('paperId') || '').trim()
    const title = String(formData.get('title') || '').trim()
    const nextType = String(formData.get('collectionType') || '').trim()
    const descriptionRaw = String(formData.get('description') || '').trim()
    const languageRaw = String(formData.get('language') || '').trim()
    const levelRaw = String(formData.get('level') || '').trim()
    const parentIdRaw = String(formData.get('parentId') || '').trim()
    const sortOrderRaw = String(formData.get('sortOrder') || '').trim()

    if (!paperId) return { success: false, message: 'paperId 缺失。' }
    if (!title) return { success: false, message: '名称不能为空。' }

    const collectionType =
      nextType === CollectionType.CUSTOM_GROUP
        ? CollectionType.CUSTOM_GROUP
        : CollectionType.PAPER

    const parsedSortOrder = Number.parseInt(sortOrderRaw || '0', 10)
    const sortOrder = Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0
    const paperAttributes = normalizePaperAttributes({
      title,
      language: languageRaw,
      level: levelRaw,
    })

    await prisma.collection.update({
      where: { id: paperId },
      data: {
        title,
        description: descriptionRaw || null,
        language:
          collectionType === CollectionType.PAPER
            ? paperAttributes.language
            : languageRaw || null,
        level:
          collectionType === CollectionType.PAPER
            ? paperAttributes.level
            : levelRaw || null,
        acceptedMaterialTypes:
          collectionType === CollectionType.PAPER
            ? paperAttributes.acceptedMaterialTypes
            : undefined,
        parentId: parentIdRaw || null,
        sortOrder,
        collectionType,
      },
    })
    const affectedMaterials = await prisma.collectionMaterial.findMany({
      where: { collectionId: paperId },
      select: { materialId: true },
    })
    await precomputePracticeVocabularyMaterialAnalyses(
      affectedMaterials.map(item => item.materialId),
    )
    invalidatePracticeVocabularyAnalytics()

    revalidatePath('/practice')
    revalidatePath(`/practice/${paperId}`)
    revalidatePath('/manage/practice')
    revalidatePath('/')

    return { success: true, message: '已保存。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败'
    return { success: false, message }
  }
}
