'use server'

import { CollectionType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { normalizePaperAttributes } from '@/modules/practice/domain/paper-attributes'
import {
  invalidatePracticeVocabularyAnalytics,
  precomputePracticeVocabularyMaterialAnalyses,
} from '@/modules/practice/server/vocabulary-analytics'

async function isCollectionMoveValid(
  collectionId: string,
  nextParentId: string | null,
) {
  if (!nextParentId) return true
  if (nextParentId === collectionId) return false

  let cursor: string | null = nextParentId
  while (cursor) {
    if (cursor === collectionId) return false
    const parent: { parentId: string | null } | null =
      await prisma.collection.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      })
    cursor = parent?.parentId || null
  }
  return true
}

export async function deleteCollection(collectionId: string) {
  try {
    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: {
        collectionType: true,
        _count: { select: { materials: true, children: true } },
      },
    })
    if (!collection) return { success: false, message: '分类不存在' }
    if (collection.collectionType === CollectionType.LIBRARY_ROOT) {
      return { success: false, message: '系统根分类不能删除' }
    }
    if (collection._count.children > 0) {
      return { success: false, message: '请先移动或删除子分类' }
    }
    if (collection._count.materials > 0) {
      return { success: false, message: '请先移动或删除分类中的材料' }
    }
    await prisma.collection.delete({
      where: { id: collectionId },
    })
    revalidatePath('/')
    revalidatePath('/manage/shadowing')
    revalidatePath('/manage/import')
    return { success: true, message: '集合已删除' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除失败'
    return { success: false, message }
  }
}

export async function updateCollectionAttributes(formData: FormData) {
  try {
    const collectionId = String(formData.get('collectionId') || '').trim()
    const title = String(formData.get('title') || '').trim()
    const description = String(formData.get('description') || '').trim()
    const language = String(formData.get('language') || '').trim()
    const level = String(formData.get('level') || '').trim()
    const parentIdRaw = String(formData.get('parentId') || '').trim()
    const sortOrderRaw = String(formData.get('sortOrder') || '').trim()

    if (!collectionId) return { success: false, message: 'collectionId 缺失。' }
    if (!title) return { success: false, message: '名称不能为空。' }

    const current = await prisma.collection.findUnique({
      where: { id: collectionId },
      select: { collectionType: true },
    })
    if (!current) return { success: false, message: '分类不存在。' }

    const nextParentId = parentIdRaw || null
    const nextParent = nextParentId
      ? await prisma.collection.findUnique({
          where: { id: nextParentId },
          select: { collectionType: true },
        })
      : null
    if (nextParentId && !nextParent) {
      return { success: false, message: '目标父级不存在。' }
    }

    const requiredParentType =
      current.collectionType === CollectionType.BOOK
        ? CollectionType.LIBRARY_ROOT
        : current.collectionType === CollectionType.CHAPTER
          ? CollectionType.BOOK
          : null
    if (requiredParentType && nextParent?.collectionType !== requiredParentType) {
      return {
        success: false,
        message:
          current.collectionType === CollectionType.BOOK
            ? '教材必须归属于系统根分类。'
            : '章节必须归属于教材。',
      }
    }
    if (
      (current.collectionType === CollectionType.LIBRARY_ROOT ||
        current.collectionType === CollectionType.PAPER) &&
      nextParentId
    ) {
      return { success: false, message: '该类型只能位于顶层。' }
    }
    const parsedSortOrder = Number.parseInt(sortOrderRaw || '0', 10)
    const sortOrder = Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0
    const validMove = await isCollectionMoveValid(collectionId, nextParentId)
    if (!validMove) {
      return { success: false, message: '不能移动到自身或子集合下。' }
    }
    const paperAttributes = normalizePaperAttributes({ title, language, level })

    await prisma.collection.update({
      where: { id: collectionId },
      data: {
        title,
        description: description || null,
        language:
          current.collectionType === CollectionType.PAPER
            ? paperAttributes.language
            : language || null,
        level:
          current.collectionType === CollectionType.PAPER
            ? paperAttributes.level
            : level || null,
        acceptedMaterialTypes:
          current.collectionType === CollectionType.PAPER
            ? paperAttributes.acceptedMaterialTypes
            : undefined,
        parentId: nextParentId,
        sortOrder,
      },
    })

    if (current.collectionType === CollectionType.PAPER) {
      const materials = await prisma.collectionMaterial.findMany({
        where: { collectionId },
        select: { materialId: true },
      })
      await precomputePracticeVocabularyMaterialAnalyses(
        materials.map(item => item.materialId),
      )
      invalidatePracticeVocabularyAnalytics()
    }

    revalidatePath('/')
    revalidatePath('/manage/shadowing')
    revalidatePath('/practice')
    revalidatePath(`/practice/${collectionId}`)
    revalidatePath('/manage/import')

    return { success: true, message: '集合属性已保存' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败'
    return { success: false, message }
  }
}
