'use server'

// Subtitle library actions.

import { MaterialType } from '#prisma-client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { replaceMediaSubtitleSearchIndex } from '@/lib/media-subtitles/search-index'
import { readFiniteNumber } from '@/lib/validation/schema'
import {
  decodeMaterialPayload,
  encodeMaterialPayload,
} from '@/lib/codecs/material-payload'

type DialogueInputRow = {
  start?: number
  end?: number
  text?: string
  note?: string
  favorite?: boolean
  stableId?: string
}

function normalizeDialogueRows(input: unknown) {
  if (!Array.isArray(input)) return [] as Array<{
    id: number
    sequenceId: number
    stableId: string
    start: number
    end: number
    text: string
    note: string
    favorite: boolean
  }>

  const cleaned = (input as DialogueInputRow[])
    .map((item, index) => {
      const text = String(item?.text || '').trim()
      if (!text) return null

      const start = Math.max(0, readFiniteNumber(item?.start, 0))
      const endRaw = readFiniteNumber(item?.end, start + 0.5)
      const end = endRaw > start ? endRaw : start + 0.5

      return {
        id: index + 1,
        sequenceId: index + 1,
        stableId:
          typeof item?.stableId === 'string' && item.stableId.trim()
            ? item.stableId.trim()
            : crypto.randomUUID(),
        start: Number(start.toFixed(2)),
        end: Number(end.toFixed(2)),
        text,
        note: String(item?.note || '').trim(),
        favorite: item?.favorite === true,
      }
    })
    .filter(Boolean) as Array<{
    id: number
    sequenceId: number
    stableId: string
    start: number
    end: number
    text: string
    note: string
    favorite: boolean
  }>

  return cleaned
}

function remapDialogueIds(
  rows: Array<{
    id: number
    sequenceId: number
    start: number
    end: number
    text: string
    note: string
    favorite: boolean
  }>,
) {
  return new Map(
    rows.map((row, index) => [row.id, index + 1] as const),
  )
}

async function resolveMediaMaterialById(id: string) {
  return prisma.material.findFirst({
    where: { type: MaterialType.MEDIA_SUBTITLE, id },
    select: {
      id: true,
      title: true,
      contentPayload: true,
    },
  })
}

export async function updateMediaSubtitleLineMeta(
  materialId: string,
  lineId: number,
  patch: {
    start?: number
    end?: number
    text?: string
    note?: string
    favorite?: boolean
  },
) {
  try {
    if (!materialId) return { success: false, message: '字幕 ID 缺失。' }
    if (!Number.isFinite(lineId) || lineId <= 0) {
      return { success: false, message: '字幕行 ID 无效。' }
    }

    const material = await resolveMediaMaterialById(materialId)
    if (!material) return { success: false, message: '字幕材料不存在。' }

    const payload = decodeMaterialPayload(
      MaterialType.MEDIA_SUBTITLE,
      material.contentPayload,
    )
    const dialogues = Array.isArray(payload.dialogues)
      ? (payload.dialogues as Array<Record<string, unknown>>)
      : []
    if (dialogues.length === 0) {
      return { success: false, message: '没有可更新的字幕行。' }
    }

    const normalizedRows = normalizeDialogueRows(dialogues)
    let changed = false
    const nextDialogues = normalizedRows.map(item => {
      const currentId = item.id
      if (currentId !== lineId) return item
      changed = true
      const next: Record<string, unknown> = { ...item }
      const currentStart = item.start
      const currentEnd = item.end
      const hasStart = Number.isFinite(patch.start as number)
      const hasEnd = Number.isFinite(patch.end as number)

      const nextStart = hasStart ? Math.max(0, Number(patch.start)) : currentStart
      const rawEnd = hasEnd ? Number(patch.end) : currentEnd
      const nextEnd = rawEnd > nextStart ? rawEnd : nextStart + 0.5

      if (hasStart) next.start = Number(nextStart.toFixed(2))
      if (hasEnd) next.end = Number(nextEnd.toFixed(2))
      if (typeof patch.text === 'string') {
        const trimmed = patch.text.trim()
        if (trimmed) next.text = trimmed
      }
      if (typeof patch.favorite === 'boolean') next.favorite = patch.favorite
      if (typeof patch.note === 'string') next.note = patch.note.trim()
      return next
    })

    if (!changed) return { success: false, message: '未找到对应字幕行。' }

    const nextPayload = {
      ...payload,
      dialogues: nextDialogues,
    }

    await prisma.$transaction(async tx => {
      await tx.material.update({
        where: { id: material.id },
        data: {
          contentPayload: encodeMaterialPayload(
            MaterialType.MEDIA_SUBTITLE,
            nextPayload,
          ),
        },
      })

      const fullMaterial = await tx.material.findUnique({
        where: { id: material.id },
        select: { title: true },
      })

      await replaceMediaSubtitleSearchIndex(tx, {
        id: material.id,
        title: fullMaterial?.title || material.title,
        contentPayload: nextPayload,
      })
    })

    revalidatePath('/subtitles')
    revalidatePath(`/subtitles/${materialId}`)

    return { success: true, message: '已保存。' }
  } catch (error) {
    console.error('updateMediaSubtitleLineMeta failed:', error)
    return { success: false, message: '保存失败，请稍后重试。' }
  }
}

export async function deleteMediaSubtitleLine(materialId: string, lineId: number) {
  try {
    if (!materialId) return { success: false, message: '字幕 ID 缺失。' }
    if (!Number.isFinite(lineId) || lineId <= 0) {
      return { success: false, message: '字幕行 ID 无效。' }
    }

    const material = await resolveMediaMaterialById(materialId)
    if (!material) return { success: false, message: '字幕材料不存在。' }

    const payload = decodeMaterialPayload(
      MaterialType.MEDIA_SUBTITLE,
      material.contentPayload,
    )
    const dialogues = Array.isArray(payload.dialogues)
      ? (payload.dialogues as Array<Record<string, unknown>>)
      : []
    if (dialogues.length <= 1) {
      return { success: false, message: '至少保留一行字幕。' }
    }

    const normalizedRows = normalizeDialogueRows(dialogues)
    const keptRows = normalizedRows.filter(row => row.id !== lineId)
    if (keptRows.length === normalizedRows.length) {
      return { success: false, message: '未找到对应字幕行。' }
    }

    const idMap = remapDialogueIds(keptRows)
    const nextRows = keptRows.map((row, index) => ({
      ...row,
      id: index + 1,
      sequenceId: index + 1,
    }))

    const nextPayload = {
      ...payload,
      dialogues: nextRows,
    }

    await prisma.$transaction(async tx => {
      await tx.material.update({
        where: { id: material.id },
        data: {
          contentPayload: encodeMaterialPayload(
            MaterialType.MEDIA_SUBTITLE,
            nextPayload,
          ),
        },
      })

      const fullMaterial = await tx.material.findUnique({
        where: { id: material.id },
        select: { title: true },
      })

      await replaceMediaSubtitleSearchIndex(tx, {
        id: material.id,
        title: fullMaterial?.title || material.title,
        contentPayload: nextPayload,
      })
    })

    revalidatePath('/subtitles')
    revalidatePath(`/subtitles/${materialId}`)

    return {
      success: true,
      message: `已删除第 ${lineId} 行字幕，后续编号已顺延。`,
      idMap: Array.from(idMap.entries()).map(([from, to]) => ({ from, to })),
    }
  } catch (error) {
    console.error('deleteMediaSubtitleLine failed:', error)
    return { success: false, message: '删除失败，请稍后重试。' }
  }
}
