'use server'

// Listening material actions.

import { CollectionType, MaterialType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'

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

    revalidatePath('/listening')
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

    revalidatePath('/listening')
    revalidatePath('/manage/shadowing')
    return { success: true, message: '章节节点已创建。' }
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建失败'
    return { success: false, message }
  }
}

export async function assignShadowingMaterialToChapter(formData: FormData) {
  try {
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
      revalidatePath('/listening')
      revalidatePath('/manage/shadowing')
      revalidatePath(`/listening/${materialId}`)
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

    revalidatePath('/listening')
    revalidatePath('/manage/shadowing')
    revalidatePath(`/listening/${materialId}`)
    revalidatePath('/')
    revalidatePath('/manage/shadowing')

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
      revalidatePath('/listening')
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
      })
    })

    revalidatePath('/listening')
    revalidatePath('/manage/shadowing')
    revalidatePath('/')
    revalidatePath('/manage/shadowing')
    return { success: true, message: `已批量归类 ${validIds.length} 条材料。` }
  } catch (error) {
    const message = error instanceof Error ? error.message : '批量归类失败'
    return { success: false, message }
  }
}
