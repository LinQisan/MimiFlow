'use server'

import { MaterialType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { toLegacyMaterialId } from '@/lib/repositories/materials.repo'

async function resolveSpeakingMaterialId(maybeId: string) {
  const normalizedLegacyId = maybeId.includes(':')
    ? maybeId.slice(maybeId.lastIndexOf(':') + 1)
    : maybeId
  const prefixedId = `lesson:${normalizedLegacyId}`

  const material = await prisma.material.findFirst({
    where: {
      type: MaterialType.SPEAKING,
      OR: [
        { id: maybeId },
        { id: normalizedLegacyId },
        { id: prefixedId },
        { id: { endsWith: `:${normalizedLegacyId}` } },
      ],
    },
    select: { id: true },
  })

  return material?.id || null
}

export async function updateSpeakingMeta(formData: FormData) {
  try {
    const maybeId = String(formData.get('id') || '').trim()
    const title = String(formData.get('title') || '').trim()
    const chapterName = String(formData.get('chapterName') || '').trim()

    if (!maybeId) return { success: false, message: '材料 ID 缺失。' }
    if (!title) return { success: false, message: '标题不能为空。' }

    const materialId = await resolveSpeakingMaterialId(maybeId)
    if (!materialId) return { success: false, message: '跟读材料不存在。' }

    await prisma.material.update({
      where: { id: materialId },
      data: {
        title,
        chapterName: chapterName || null,
      },
    })

    const legacyId = toLegacyMaterialId(materialId)

    revalidatePath('/manage/shadowing')
    revalidatePath(`/manage/shadowing/${legacyId}`)
    revalidatePath(`/shadowing/${legacyId}`)

    return { success: true, message: '标题与章节名已更新。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新失败'
    return { success: false, message }
  }
}

export async function updateSpeakingTitle(formData: FormData) {
  return updateSpeakingMeta(formData)
}
