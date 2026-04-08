'use server'

import { MaterialType } from '@prisma/client'
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

