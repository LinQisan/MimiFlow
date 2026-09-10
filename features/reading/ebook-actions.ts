'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { MaterialType } from '@prisma/client'
import prisma from '@/lib/prisma'
import { parseEpub } from '@/lib/ebooks/epub'
import { parsePastedBookText } from '@/lib/ebooks/pasted-book'
import { isEbookSourceKind } from '@/lib/ebooks/source-kind'
import {
  decodeMaterialPayload,
  encodeMaterialPayload,
} from '@/lib/codecs/material-payload'
import {
  invalidatePracticeVocabularyAnalytics,
  precomputePracticeVocabularyMaterialAnalyses,
} from '@/features/practice/server/vocabulary-analytics'

type ImportEpubState = {
  success: boolean
  message: string
}

const MAX_EPUB_SIZE = 80 * 1024 * 1024
const MAX_PASTED_BOOK_LENGTH = 2_000_000

async function validateReadingCollection(collectionId: string) {
  if (!collectionId) return true
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { acceptedMaterialTypes: true },
  })
  return Boolean(collection?.acceptedMaterialTypes.includes(MaterialType.READING))
}

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
  if (!(await validateReadingCollection(collectionId))) {
    return { success: false, message: '请选择可承载阅读内容的集合。' }
  }

  let materialId = ''
  try {
    const parsed = await parseEpub(await file.arrayBuffer())
    const title = titleOverride || parsed.title || file.name.replace(/\.epub$/i, '')
    const material = await prisma.material.create({
      data: {
        type: MaterialType.READING,
        title,
        contentPayload: encodeMaterialPayload(MaterialType.READING, {
          sourceKind: 'EPUB',
          fileName: file.name,
          title,
          author: parsed.author || null,
          language: parsed.language || null,
          description: parsed.description || null,
          text: parsed.text,
          chapters: parsed.chapters,
        }),
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
    await precomputePracticeVocabularyMaterialAnalyses([materialId])
    invalidatePracticeVocabularyAnalytics()
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败。'
    return { success: false, message }
  }

  revalidatePath('/reading')
  revalidatePath('/manage/import?type=ebook')
  redirect(`/reading/ebooks/${encodeURIComponent(materialId)}`)
}

export async function importPastedBookAction(
  _prevState: ImportEpubState,
  formData: FormData,
): Promise<ImportEpubState> {
  const title = String(formData.get('title') || '').trim()
  const author = String(formData.get('author') || '').trim()
  const language = String(formData.get('language') || '').trim()
  const collectionId = String(formData.get('collectionId') || '').trim()
  const rawContent = String(formData.get('bookContent') || '').trim()

  if (!title) return { success: false, message: '请填写书名。' }
  if (!rawContent) return { success: false, message: '请粘贴书籍正文。' }
  if (rawContent.length > MAX_PASTED_BOOK_LENGTH) {
    return { success: false, message: '单次粘贴内容不能超过 200 万字符，请拆分后导入。' }
  }
  if (!(await validateReadingCollection(collectionId))) {
    return { success: false, message: '请选择可承载阅读内容的集合。' }
  }

  const parsed = parsePastedBookText(rawContent, title)
  if (parsed.chapters.length === 0 || !parsed.text) {
    return { success: false, message: '没有识别到可导入的正文。' }
  }

  let materialId = ''
  try {
    const material = await prisma.material.create({
      data: {
        type: MaterialType.READING,
        title,
        contentPayload: encodeMaterialPayload(MaterialType.READING, {
          sourceKind: 'PASTED_BOOK',
          title,
          author,
          language: language || 'ja',
          text: parsed.text,
          chapters: parsed.chapters,
        }),
        collectionMaterials: collectionId
          ? { create: { collectionId, sortOrder: 0 } }
          : undefined,
      },
      select: { id: true },
    })
    materialId = material.id
    await precomputePracticeVocabularyMaterialAnalyses([materialId])
    invalidatePracticeVocabularyAnalytics()
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败。'
    return { success: false, message }
  }

  revalidatePath('/reading')
  revalidatePath('/manage/import?type=ebook')
  redirect(`/reading/ebooks/${encodeURIComponent(materialId)}`)
}

export async function deleteEpubAction(id: string) {
  const material = await prisma.material.findFirst({
    where: { type: MaterialType.READING, id: id.trim() },
    select: {
      id: true,
      contentPayload: true,
    },
  })

  if (!material) {
    return { success: false, message: '电子书不存在。' }
  }

  const payload = decodeMaterialPayload(MaterialType.READING, material.contentPayload)
  if (!isEbookSourceKind(payload.sourceKind)) {
    return { success: false, message: '只能删除电子书。' }
  }

  await prisma.material.delete({ where: { id: material.id } })
  invalidatePracticeVocabularyAnalytics()
  revalidatePath('/reading')
  return { success: true, message: '电子书已删除。' }
}
