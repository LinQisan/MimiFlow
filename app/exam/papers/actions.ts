'use server'

import { CollectionType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'

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
        : nextType === CollectionType.FAVORITES
          ? CollectionType.FAVORITES
          : CollectionType.PAPER

    const parsedSortOrder = Number.parseInt(sortOrderRaw || '0', 10)
    const sortOrder = Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0

    await prisma.collection.update({
      where: { id: paperId },
      data: {
        title,
        description: descriptionRaw || null,
        language: languageRaw || null,
        level: levelRaw || null,
        parentId: parentIdRaw || null,
        sortOrder,
        collectionType,
      },
    })

    revalidatePath('/exam/papers')
    revalidatePath(`/exam/papers/${paperId}`)
    revalidatePath('/manage/exam/papers')
    revalidatePath('/manage')
    revalidatePath('/manage/collection')

    return { success: true, message: '已保存。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败'
    return { success: false, message }
  }
}

export async function createFavoriteCollection(formData: FormData) {
  try {
    const title = String(formData.get('favoriteName') || '').trim()
    if (!title) return { success: false, message: '收藏夹名称不能为空。' }

    await prisma.collection.create({
      data: {
        title,
        collectionType: CollectionType.FAVORITES,
      },
    })

    revalidatePath('/exam/papers')
    revalidatePath('/manage')
    revalidatePath('/manage/collection')
    revalidatePath('/shadowing')

    return { success: true, message: '收藏夹已创建。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建失败'
    return { success: false, message }
  }
}

export async function updateExamPaperMaterialType(formData: FormData) {
  try {
    const paperId = String(formData.get('paperId') || '').trim()
    const materialTypeInput = String(formData.get('materialType') || '').trim()

    if (!paperId) return { success: false, message: 'paperId 缺失。' }

    const allow = new Set(['SPEAKING', 'LISTENING', 'READING', 'VOCAB_GRAMMAR'])
    if (!allow.has(materialTypeInput)) {
      return { success: false, message: 'MaterialType 非法。' }
    }

    const relations = await prisma.collectionMaterial.findMany({
      where: { collectionId: paperId },
      select: { materialId: true },
    })
    const materialIds = relations.map(item => item.materialId)
    if (materialIds.length === 0) {
      return { success: false, message: '该试卷下没有可更新的语料。' }
    }

    const result = await prisma.material.updateMany({
      where: { id: { in: materialIds } },
      data: { type: materialTypeInput as any },
    })

    revalidatePath('/exam/papers')
    revalidatePath(`/exam/papers/${paperId}`)
    revalidatePath('/shadowing')
    revalidatePath('/manage')
    revalidatePath('/manage/collection')

    return { success: true, message: `已批量更新 ${result.count} 条语料。` }
  } catch (error) {
    const message = error instanceof Error ? error.message : '批量更新失败'
    return { success: false, message }
  }
}
