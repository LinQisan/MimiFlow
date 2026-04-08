'use server'

import { CollectionType, MaterialType, Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const materialTypeAllowList = new Set([
  'SPEAKING',
  'LISTENING',
  'READING',
  'VOCAB_GRAMMAR',
])

export async function updateShadowingMaterial(formData: FormData) {
  try {
    const legacyId = String(formData.get('legacyId') || '').trim()
    const materialIdInput = String(formData.get('materialId') || '').trim()
    const title = String(formData.get('title') || '').trim()
    const audioFile = String(formData.get('audioFile') || '').trim()
    const description = String(formData.get('description') || '').trim()
    const transcript = String(formData.get('transcript') || '').trim()
    const source = String(formData.get('source') || '').trim()
    const language = String(formData.get('language') || '').trim()
    const difficulty = String(formData.get('difficulty') || '').trim()
    const tagsText = String(formData.get('tags') || '').trim()
    const materialTypeInput = String(formData.get('materialType') || '').trim()
    const collectionIdInput = String(formData.get('collectionId') || '').trim()
    const newFavoriteName = String(formData.get('newFavoriteName') || '').trim()

    if (!legacyId) return { success: false, message: 'id 缺失。' }
    if (!title) return { success: false, message: '标题不能为空。' }
    if (!audioFile) return { success: false, message: '音频路径不能为空。' }

    const materialType = materialTypeAllowList.has(materialTypeInput)
      ? (materialTypeInput as MaterialType)
      : ('SPEAKING' as MaterialType)
    let materialId = materialIdInput
    if (!materialId) {
      const found = await prisma.material.findFirst({
        where: { id: { endsWith: `:${legacyId}` } },
        select: { id: true },
      })
      materialId = found?.id || ''
    }
    if (!materialId) return { success: false, message: '听力材料不存在。' }

    const material = await prisma.material.findUnique({
      where: { id: materialId },
      select: {
        id: true,
        contentPayload: true,
        metadata: true,
      },
    })
    if (!material) return { success: false, message: '听力材料不存在。' }

    const tags = Array.from(
      new Set(
        tagsText
          .split(/[，,]/)
          .map(item => item.trim())
          .filter(Boolean),
      ),
    )

    const payload = asRecord(material.contentPayload)
    const nextPayload: Record<string, unknown> = {
      ...payload,
      audioFile,
      audioUrl: audioFile,
      description,
      transcript,
      source,
      language,
      difficulty,
      tags,
    }
    delete nextPayload.speaker

    const metadata = asRecord(material.metadata)
    const legacy = asRecord(metadata.legacy)
    const upload = asRecord(metadata.upload)
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      legacy,
      upload: {
        ...upload,
        source: source || null,
        language: language || null,
        difficulty: difficulty || null,
        tags,
      },
    }
    if (nextMetadata.upload && typeof nextMetadata.upload === 'object') {
      delete (nextMetadata.upload as Record<string, unknown>).speaker
    }

    let targetCollectionId = collectionIdInput
    if (newFavoriteName) {
      const favorite = await prisma.collection.create({
        data: {
          title: newFavoriteName,
          collectionType: CollectionType.FAVORITES,
        },
        select: { id: true },
      })
      targetCollectionId = favorite.id
    }

    let nextSortOrder = 0
    if (targetCollectionId) {
      const maxRow = await prisma.collectionMaterial.aggregate({
        where: { collectionId: targetCollectionId },
        _max: { sortOrder: true },
      })
      nextSortOrder = (maxRow._max.sortOrder ?? -1) + 1
    }

    await prisma.$transaction(async tx => {
      await tx.material.update({
        where: { id: materialId },
        data: {
          title,
          type: materialType,
          contentPayload: nextPayload as Prisma.InputJsonValue,
          metadata: nextMetadata as Prisma.InputJsonValue,
        },
      })
      if (targetCollectionId) {
        await tx.collectionMaterial.deleteMany({
          where: { materialId },
        })
        await tx.collectionMaterial.create({
          data: {
            collectionId: targetCollectionId,
            materialId,
            sortOrder: nextSortOrder,
          },
        })
      }
    })

    revalidatePath('/shadowing')
    revalidatePath('/manage/shadowing')
    revalidatePath(`/shadowing/${legacyId}`)
    revalidatePath(`/lessons/${legacyId}`)
    revalidatePath('/manage')
    revalidatePath('/manage/collection')

    return { success: true, message: '听力属性已保存。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败'
    return { success: false, message }
  }
}

export async function createShadowingFavoriteCollection(formData: FormData) {
  try {
    const title = String(formData.get('favoriteName') || '').trim()
    if (!title) return { success: false, message: '收藏夹名称不能为空。' }

    await prisma.collection.create({
      data: {
        title,
        collectionType: CollectionType.FAVORITES,
      },
    })

    revalidatePath('/shadowing')
    revalidatePath('/manage/shadowing')
    revalidatePath('/manage')
    revalidatePath('/manage/collection')

    return { success: true, message: '收藏夹已创建。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建失败'
    return { success: false, message }
  }
}

export async function assignShadowingMaterialToFavorite(formData: FormData) {
  try {
    const legacyId = String(formData.get('legacyId') || '').trim()
    const materialId = String(formData.get('materialId') || '').trim()
    const collectionIdInput = String(formData.get('collectionId') || '').trim()
    const newFavoriteName = String(formData.get('newFavoriteName') || '').trim()

    if (!materialId) return { success: false, message: 'materialId 缺失。' }
    if (!collectionIdInput && !newFavoriteName) {
      return { success: false, message: '请选择收藏夹或输入新收藏夹名称。' }
    }

    const material = await prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, type: true },
    })
    if (!material || material.type !== MaterialType.SPEAKING) {
      return { success: false, message: '仅支持跟读材料归类。' }
    }

    let targetCollectionId = collectionIdInput
    if (newFavoriteName) {
      const created = await prisma.collection.create({
        data: {
          title: newFavoriteName,
          collectionType: CollectionType.FAVORITES,
        },
        select: { id: true },
      })
      targetCollectionId = created.id
    }

    if (!targetCollectionId) {
      return { success: false, message: '未找到目标收藏夹。' }
    }

    const favorite = await prisma.collection.findUnique({
      where: { id: targetCollectionId },
      select: { id: true, collectionType: true },
    })
    if (!favorite || favorite.collectionType !== CollectionType.FAVORITES) {
      return { success: false, message: '目标集合不是收藏夹。' }
    }

    const maxRow = await prisma.collectionMaterial.aggregate({
      where: { collectionId: targetCollectionId },
      _max: { sortOrder: true },
    })
    const nextSortOrder = (maxRow._max.sortOrder ?? -1) + 1

    await prisma.$transaction(async tx => {
      await tx.collectionMaterial.deleteMany({
        where: { materialId },
      })
      await tx.collectionMaterial.create({
        data: {
          collectionId: targetCollectionId,
          materialId,
          sortOrder: nextSortOrder,
        },
      })
    })

    revalidatePath('/shadowing')
    revalidatePath('/manage/shadowing')
    if (legacyId) revalidatePath(`/shadowing/${legacyId}`)
    revalidatePath('/manage')
    revalidatePath('/manage/collection')

    return { success: true, message: '已归类到收藏夹。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '归类失败'
    return { success: false, message }
  }
}

export async function createShadowingBook(formData: FormData) {
  try {
    const rootIdInput = String(formData.get('rootId') || '').trim()
    const title = String(formData.get('bookTitle') || '').trim()

    if (!title) return { success: false, message: '书名不能为空。' }

    let rootId = rootIdInput
    if (!rootId) {
      const existingRoot = await prisma.collection.findFirst({
        where: { collectionType: CollectionType.LIBRARY_ROOT },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      })
      if (existingRoot) {
        rootId = existingRoot.id
      } else {
        const rootMax = await prisma.collection.aggregate({
          where: { parentId: null },
          _max: { sortOrder: true },
        })
        const createdRoot = await prisma.collection.create({
          data: {
            title: '口语',
            collectionType: CollectionType.LIBRARY_ROOT,
            parentId: null,
            sortOrder: (rootMax._max.sortOrder ?? -1) + 1,
          },
          select: { id: true },
        })
        rootId = createdRoot.id
      }
    } else {
      const root = await prisma.collection.findUnique({
        where: { id: rootId },
        select: { id: true, collectionType: true },
      })
      if (!root || root.collectionType !== CollectionType.LIBRARY_ROOT) {
        return { success: false, message: '上级分类无效。' }
      }
    }

    const maxRow = await prisma.collection.aggregate({
      where: { parentId: rootId },
      _max: { sortOrder: true },
    })

    await prisma.collection.create({
      data: {
        title,
        collectionType: CollectionType.BOOK,
        parentId: rootId,
        sortOrder: (maxRow._max.sortOrder ?? -1) + 1,
      },
    })

    revalidatePath('/shadowing')
    revalidatePath('/manage/shadowing')
    return { success: true, message: '书籍节点已创建。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建失败'
    return { success: false, message }
  }
}

export async function createShadowingChapter(formData: FormData) {
  try {
    const bookId = String(formData.get('bookId') || '').trim()
    const title = String(formData.get('chapterTitle') || '').trim()

    if (!bookId) return { success: false, message: '请选择所属书籍。' }
    if (!title) return { success: false, message: '章节名不能为空。' }

    const book = await prisma.collection.findUnique({
      where: { id: bookId },
      select: { id: true, collectionType: true },
    })
    if (!book || book.collectionType !== CollectionType.BOOK) {
      return { success: false, message: '所属书籍无效。' }
    }

    const maxRow = await prisma.collection.aggregate({
      where: { parentId: bookId },
      _max: { sortOrder: true },
    })

    await prisma.collection.create({
      data: {
        title,
        collectionType: CollectionType.CHAPTER,
        parentId: bookId,
        sortOrder: (maxRow._max.sortOrder ?? -1) + 1,
      },
    })

    revalidatePath('/shadowing')
    revalidatePath('/manage/shadowing')
    return { success: true, message: '章节节点已创建。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建失败'
    return { success: false, message }
  }
}

export async function assignShadowingMaterialToChapter(formData: FormData) {
  try {
    const legacyId = String(formData.get('legacyId') || '').trim()
    const materialId = String(formData.get('materialId') || '').trim()
    const chapterId = String(formData.get('chapterId') || '').trim()

    if (!materialId) return { success: false, message: 'materialId 缺失。' }

    const material = await prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true, type: true },
    })
    if (!material || material.type !== MaterialType.SPEAKING) {
      return { success: false, message: '仅支持跟读材料归类。' }
    }

    if (!chapterId) {
      await prisma.collectionMaterial.deleteMany({ where: { materialId } })
      revalidatePath('/shadowing')
      revalidatePath('/manage/shadowing')
      if (legacyId) revalidatePath(`/shadowing/${legacyId}`)
      return { success: true, message: '已移到未归类。' }
    }

    const chapter = await prisma.collection.findUnique({
      where: { id: chapterId },
      select: { id: true, collectionType: true },
    })
    if (!chapter || chapter.collectionType !== CollectionType.CHAPTER) {
      return { success: false, message: '目标章节无效。' }
    }

    const maxRow = await prisma.collectionMaterial.aggregate({
      where: { collectionId: chapterId },
      _max: { sortOrder: true },
    })
    const nextSortOrder = (maxRow._max.sortOrder ?? -1) + 1

    await prisma.$transaction(async tx => {
      await tx.collectionMaterial.deleteMany({
        where: { materialId },
      })
      await tx.collectionMaterial.create({
        data: {
          collectionId: chapterId,
          materialId,
          sortOrder: nextSortOrder,
        },
      })
    })

    revalidatePath('/shadowing')
    revalidatePath('/manage/shadowing')
    if (legacyId) revalidatePath(`/shadowing/${legacyId}`)
    revalidatePath('/manage')
    revalidatePath('/manage/collection')

    return { success: true, message: '已归类到目标章节。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '归类失败'
    return { success: false, message }
  }
}

export async function batchAssignShadowingMaterials(formData: FormData) {
  try {
    const materialIdsRaw = String(formData.get('materialIds') || '').trim()
    const chapterId = String(formData.get('chapterId') || '').trim()
    const mode = String(formData.get('mode') || '').trim()

    const materialIds = Array.from(
      new Set(
        materialIdsRaw
          .split(',')
          .map(item => item.trim())
          .filter(Boolean),
      ),
    )
    if (materialIds.length === 0) {
      return { success: false, message: '请先选择材料。' }
    }

    const validMaterials = await prisma.material.findMany({
      where: { id: { in: materialIds }, type: MaterialType.SPEAKING },
      select: { id: true },
    })
    const validIds = validMaterials.map(item => item.id)
    if (validIds.length === 0) {
      return { success: false, message: '未找到可归类的跟读材料。' }
    }

    if (mode === 'clear' || !chapterId) {
      const result = await prisma.collectionMaterial.deleteMany({
        where: { materialId: { in: validIds } },
      })
      revalidatePath('/shadowing')
      revalidatePath('/manage/shadowing')
      return { success: true, message: `已移出 ${result.count} 条材料（未归类）。` }
    }

    const chapter = await prisma.collection.findUnique({
      where: { id: chapterId },
      select: { id: true, collectionType: true },
    })
    if (!chapter || chapter.collectionType !== CollectionType.CHAPTER) {
      return { success: false, message: '目标章节无效。' }
    }

    await prisma.$transaction(async tx => {
      await tx.collectionMaterial.deleteMany({
        where: { materialId: { in: validIds } },
      })

      const maxRow = await tx.collectionMaterial.aggregate({
        where: { collectionId: chapterId },
        _max: { sortOrder: true },
      })
      let nextSort = (maxRow._max.sortOrder ?? -1) + 1

      await tx.collectionMaterial.createMany({
        data: validIds.map(materialId => ({
          collectionId: chapterId,
          materialId,
          sortOrder: nextSort++,
        })),
        skipDuplicates: true,
      })
    })

    revalidatePath('/shadowing')
    revalidatePath('/manage/shadowing')
    revalidatePath('/manage')
    revalidatePath('/manage/collection')
    return { success: true, message: `已批量归类 ${validIds.length} 条材料。` }
  } catch (error) {
    const message = error instanceof Error ? error.message : '批量归类失败'
    return { success: false, message }
  }
}
