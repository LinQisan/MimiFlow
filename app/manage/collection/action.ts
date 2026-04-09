'use server'

import { CollectionType, MaterialType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { resolveMaterialIdByAny } from '@/lib/repositories/collection-manage.repo'

export async function deleteCollection(collectionId: string) {
  try {
    await prisma.collection.delete({
      where: { id: collectionId },
    })
    revalidatePath('/manage')
    revalidatePath('/manage/collection')
    return { success: true, message: '分组已删除' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除失败'
    return { success: false, message }
  }
}

export async function deleteCollectionMaterial(materialId: string) {
  try {
    const direct = await prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true },
    })
    const finalId = direct?.id || materialId
    await prisma.material.delete({ where: { id: finalId } })
    revalidatePath('/manage')
    revalidatePath('/manage/collection')
    return { success: true, message: '材料已删除' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除失败'
    return { success: false, message }
  }
}

export async function updateCollectionMaterialTitle(
  maybeId: string,
  type: MaterialType,
  title: string,
) {
  const nextTitle = title.trim()
  if (!nextTitle) return { success: false, message: '标题不能为空' }
  try {
    const materialId = await resolveMaterialIdByAny(maybeId, type)
    if (!materialId) return { success: false, message: '材料不存在' }
    await prisma.material.update({
      where: { id: materialId },
      data: { title: nextTitle },
    })
    revalidatePath('/manage/collection')
    revalidatePath(`/manage/collection/lesson/${maybeId}`)
    revalidatePath(`/manage/collection/article/${maybeId}`)
    revalidatePath(`/manage/collection/quiz/${maybeId}`)
    return { success: true, message: '标题已更新' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新失败'
    return { success: false, message }
  }
}

export async function clearEmptyCollections() {
  try {
    const result = await prisma.collection.deleteMany({
      where: {
        collectionType: CollectionType.PAPER,
        materials: {
          none: {},
        },
        children: {
          none: {},
        },
      },
    })
    revalidatePath('/manage')
    revalidatePath('/manage/collection')
    revalidatePath('/exam/papers')
    return { success: true, message: `已清理 ${result.count} 个空集合` }
  } catch (error) {
    const message = error instanceof Error ? error.message : '清理失败'
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
    const sortOrderRaw = String(formData.get('sortOrder') || '').trim()

    if (!collectionId) return { success: false, message: 'collectionId 缺失。' }
    if (!title) return { success: false, message: '名称不能为空。' }

    const parsedSortOrder = Number.parseInt(sortOrderRaw || '0', 10)
    const sortOrder = Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0

    await prisma.collection.update({
      where: { id: collectionId },
      data: {
        title,
        description: description || null,
        language: language || null,
        level: level || null,
        sortOrder,
      },
    })

    revalidatePath('/manage')
    revalidatePath('/manage/collection')
    revalidatePath(`/manage/collection/${collectionId}`)
    revalidatePath('/exam/papers')
    revalidatePath(`/exam/papers/${collectionId}`)

    return { success: true, message: '集合属性已保存' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败'
    return { success: false, message }
  }
}
