'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { MaterialType } from '@prisma/client'
import prisma from '@/lib/prisma'
import { parseEpub } from '@/lib/ebooks/epub'

type ImportEpubState = {
  success: boolean
  message: string
}

const MAX_EPUB_SIZE = 80 * 1024 * 1024

const toLegacyMaterialId = (materialId: string) => {
  const index = materialId.indexOf(':')
  return index >= 0 ? materialId.slice(index + 1) : materialId
}

const buildReadingLookupIds = (id: string) => {
  const trimmedId = id.trim()
  const legacyId = toLegacyMaterialId(trimmedId)
  return Array.from(
    new Set(
      [trimmedId, legacyId, `passage:${legacyId}`]
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export async function importEpubAction(
  _prevState: ImportEpubState,
  formData: FormData,
): Promise<ImportEpubState> {
  const file = formData.get('epubFile')
  const collectionId = String(formData.get('collectionId') || '').trim()
  const titleOverride = String(formData.get('title') || '').trim()

  if (!(file instanceof File) || file.size === 0) {
    return { success: false, message: '请选择一个 EPUB 文件。' }
  }
  if (!file.name.toLowerCase().endsWith('.epub')) {
    return { success: false, message: '文件格式必须是 .epub。' }
  }
  if (file.size > MAX_EPUB_SIZE) {
    return { success: false, message: 'EPUB 文件不能超过 80MB。' }
  }

  let materialId = ''
  try {
    const parsed = await parseEpub(await file.arrayBuffer())
    const title = titleOverride || parsed.title || file.name.replace(/\.epub$/i, '')
    const material = await prisma.material.create({
      data: {
        type: MaterialType.READING,
        title,
        contentPayload: {
          sourceKind: 'EPUB',
          fileName: file.name,
          title,
          author: parsed.author || null,
          language: parsed.language || null,
          description: parsed.description || null,
          text: parsed.text,
          chapters: parsed.chapters,
        },
        collectionMaterials: collectionId
          ? {
              create: {
                collectionId,
                sortOrder: 0,
              },
            }
          : undefined,
      },
      select: { id: true },
    })
    materialId = material.id
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败。'
    return { success: false, message }
  }

  revalidatePath('/articles')
  revalidatePath('/ebooks')
  revalidatePath('/ebooks/import')
  redirect(`/ebooks/${encodeURIComponent(materialId)}`)
}

export async function deleteEpubAction(id: string) {
  const lookupIds = buildReadingLookupIds(id)
  const material = await prisma.material.findFirst({
    where: {
      type: MaterialType.READING,
      id: { in: lookupIds },
    },
    select: {
      id: true,
      contentPayload: true,
    },
  })

  if (!material) {
    return { success: false, message: '电子书不存在。' }
  }

  const payload = isRecord(material.contentPayload) ? material.contentPayload : {}
  if (payload.sourceKind !== 'EPUB') {
    return { success: false, message: '只能删除 EPUB 电子书。' }
  }

  await prisma.material.delete({ where: { id: material.id } })
  revalidatePath('/ebooks')
  revalidatePath('/articles')
  return { success: true, message: '电子书已删除。' }
}
