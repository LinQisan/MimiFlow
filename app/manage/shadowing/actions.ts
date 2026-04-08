'use server'

import { MaterialType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { toLegacyMaterialId } from '@/lib/repositories/materials.repo'

export async function updateSpeakingTitle(formData: FormData) {
  try {
    const maybeId = String(formData.get('id') || '').trim()
    const title = String(formData.get('title') || '').trim()

    if (!maybeId) return { success: false, message: '材料 ID 缺失。' }
    if (!title) return { success: false, message: '标题不能为空。' }

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

    if (!material) return { success: false, message: '跟读材料不存在。' }

    await prisma.material.update({
      where: { id: material.id },
      data: { title },
    })

    const legacyId = toLegacyMaterialId(material.id)

    revalidatePath('/manage/shadowing')
    revalidatePath(`/manage/shadowing/${legacyId}`)
    revalidatePath(`/shadowing/${legacyId}`)

    return { success: true, message: '标题已更新。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新失败'
    return { success: false, message }
  }
}
