'use server'

import { MaterialType, Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { toLegacyMaterialId } from '@/lib/repositories/materials'

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

async function resolveLessonMaterialId(maybeId: string) {
  const normalizedLegacyId = maybeId.includes(':')
    ? maybeId.slice(maybeId.lastIndexOf(':') + 1)
    : maybeId
  const prefixedId = `lesson:${normalizedLegacyId}`

  const material = await prisma.material.findFirst({
    where: {
      type: { in: [MaterialType.SPEAKING, MaterialType.LISTENING] },
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
    const audioFile = String(formData.get('audioFile') || '').trim()

    if (!maybeId) return { success: false, message: '材料 ID 缺失。' }
    if (!title) return { success: false, message: '标题不能为空。' }
    if (!audioFile) return { success: false, message: '音频路径不能为空。' }

    const materialId = await resolveLessonMaterialId(maybeId)
    if (!materialId) return { success: false, message: '材料不存在。' }

    const material = await prisma.material.findUnique({
      where: { id: materialId },
      select: { contentPayload: true },
    })
    if (!material) return { success: false, message: '材料不存在。' }

    const payload = asRecord(material.contentPayload)
    const nextPayload: Record<string, unknown> = {
      ...payload,
      audioFile,
      audioUrl: audioFile,
    }

    await prisma.material.update({
      where: { id: materialId },
      data: {
        title,
        chapterName: chapterName || null,
        contentPayload: nextPayload as Prisma.InputJsonValue,
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

export async function deleteSpeakingMaterial(formData: FormData) {
  try {
    const maybeId = String(formData.get('id') || '').trim()
    if (!maybeId) return { success: false, message: '材料 ID 缺失。' }

    const materialId = await resolveLessonMaterialId(maybeId)
    if (!materialId) return { success: false, message: '材料不存在。' }

    await prisma.material.delete({
      where: { id: materialId },
    })

    const legacyId = toLegacyMaterialId(materialId)
    revalidatePath('/manage/shadowing')
    revalidatePath(`/manage/shadowing/${legacyId}`)
    revalidatePath(`/shadowing/${legacyId}`)
    revalidatePath('/shadowing')

    return { success: true, message: '材料已删除。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除失败'
    return { success: false, message }
  }
}
