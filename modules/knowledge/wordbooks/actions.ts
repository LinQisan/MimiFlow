'use server'

import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'

const isWordbookMoveValid = async (
  wordbookId: string,
  nextParentId: string | null,
  userId: string,
) => {
  if (!nextParentId) return true
  if (nextParentId === wordbookId) return false

  let cursor: string | null = nextParentId
  while (cursor) {
    if (cursor === wordbookId) return false
    const parent: { parentId: string | null } | null = await prisma.wordbook.findFirst({
        where: { id: cursor, userId },
        select: { parentId: true },
      })
    cursor = parent?.parentId || null
  }
  return true
}

export async function createWordbook(
  title: string,
  parentId?: string | null,
) {
  try {
    const userId = await getCurrentUserId()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      return { success: false, message: '单词书名称不能为空' }
    }
    const nextParentId = parentId?.trim() || null
    if (nextParentId) {
      const parent = await prisma.wordbook.findFirst({
        where: { id: nextParentId, userId },
        select: { id: true },
      })
      if (!parent) {
        return { success: false, message: '上级单词书不存在' }
      }
    }
    const wordbook = await prisma.wordbook.create({
      data: {
        userId,
        title: trimmedTitle,
        parentId: nextParentId,
      },
      select: { id: true, title: true, parentId: true, createdAt: true },
    })
    revalidatePath('/vocabulary')
    revalidatePath('/vocabulary')
    return {
      success: true,
      wordbook: {
        id: wordbook.id,
        title: wordbook.title,
        parentId: wordbook.parentId,
        createdAt: wordbook.createdAt,
      },
    }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '同级单词书名称已存在' }
    }
    console.error(error)
    return { success: false, message: '创建单词书失败' }
  }
}

export async function renameWordbook(wordbookId: string, title: string) {
  try {
    const userId = await getCurrentUserId()
    const trimmedWordbookId = wordbookId.trim()
    const trimmedTitle = title.trim()
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    if (!trimmedTitle) return { success: false, message: '名称不能为空' }
    const existing = await prisma.wordbook.findFirst({
      where: { id: trimmedWordbookId, userId },
      select: { id: true },
    })
    if (!existing) return { success: false, message: '单词书不存在' }
    const updated = await prisma.wordbook.update({
      where: { id: existing.id },
      data: { title: trimmedTitle },
      select: { id: true, title: true, parentId: true },
    })
    revalidatePath('/vocabulary')
    revalidatePath('/vocabulary')
    return { success: true, wordbook: updated }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '同级单词书名称已存在' }
    }
    console.error(error)
    return { success: false, message: '重命名失败' }
  }
}

export async function moveWordbook(
  wordbookId: string,
  parentId: string | null,
) {
  try {
    const userId = await getCurrentUserId()
    const trimmedWordbookId = wordbookId.trim()
    const nextParentId = parentId?.trim() || null
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    const wordbook = await prisma.wordbook.findFirst({
      where: { id: trimmedWordbookId, userId },
      select: { id: true },
    })
    if (!wordbook) return { success: false, message: '单词书不存在' }
    if (nextParentId) {
      const target = await prisma.wordbook.findFirst({
        where: { id: nextParentId, userId },
        select: { id: true },
      })
      if (!target) return { success: false, message: '目标单词书不存在' }
    }
    const valid = await isWordbookMoveValid(trimmedWordbookId, nextParentId, userId)
    if (!valid) return { success: false, message: '不能移动到自身或子单词书下' }
    const updated = await prisma.wordbook.update({
      where: { id: trimmedWordbookId },
      data: { parentId: nextParentId },
      select: { id: true, title: true, parentId: true },
    })
    revalidatePath('/vocabulary')
    revalidatePath('/vocabulary')
    return { success: true, wordbook: updated }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '目标位置已有同名单词书' }
    }
    console.error(error)
    return { success: false, message: '移动单词书失败' }
  }
}

export async function deleteWordbook(wordbookId: string) {
  try {
    const userId = await getCurrentUserId()
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    const existing = await prisma.wordbook.findFirst({
      where: { id: trimmedWordbookId, userId },
      select: { id: true },
    })
    if (!existing) return { success: false, message: '单词书不存在' }

    await prisma.wordbook.delete({
      where: { id: trimmedWordbookId },
    })
    revalidatePath('/vocabulary')
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '删除单词书失败' }
  }
}

export async function removeVocabularyFromWordbook(
  vocabularyId: string,
  wordbookId: string,
) {
  try {
    const userId = await getCurrentUserId()
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId) {
      return { success: false, message: '单词书无效' }
    }
    await prisma.wordbookVocabulary.deleteMany({
      where: {
        vocabularyId,
        wordbookId: trimmedWordbookId,
        wordbook: { userId },
        vocabulary: { userId },
      },
    })
    revalidatePath('/vocabulary')
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '移出单词书失败' }
  }
}

export async function listWordbooksTree() {
  const userId = await getCurrentUserId()
  const rows = await prisma.wordbook.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      parentId: true,
      _count: {
        select: { entries: true },
      },
    },
  })
  return rows.map(item => ({
    id: item.id,
    title: item.title,
    parentId: item.parentId,
    vocabularyCount: item._count.entries,
  }))
}

export async function syncAnkiSentenceSourcesForWordbook(wordbookId: string) {
  const userId = await getCurrentUserId()
  const trimmedWordbookId = (wordbookId || '').trim()
  if (!trimmedWordbookId) return { success: false, updatedCount: 0 }

  const wordbook = await prisma.wordbook.findFirst({
    where: { id: trimmedWordbookId, userId },
    select: { id: true, title: true },
  })
  if (!wordbook) return { success: false, updatedCount: 0 }

  const wordbookLinks = await prisma.wordbookVocabulary.findMany({
    where: { wordbookId: trimmedWordbookId },
    select: { vocabularyId: true },
  })
  const vocabularyIds = Array.from(
    new Set(wordbookLinks.map(item => item.vocabularyId).filter(Boolean)),
  )
  if (vocabularyIds.length === 0) {
    return { success: true, updatedCount: 0 }
  }

  const sentenceLinks = await prisma.vocabularySentenceLink.findMany({
    where: {
      vocabularyId: { in: vocabularyIds },
      sentence: {
        OR: [
          { sourceId: 'anki-import' },
          { sourceUrl: '/manage/import?type=anki' },
        ],
      },
    },
    select: { sentenceId: true },
  })
  const sentenceIds = Array.from(
    new Set(sentenceLinks.map(item => item.sentenceId).filter(Boolean)),
  )
  if (sentenceIds.length === 0) {
    return { success: true, updatedCount: 0 }
  }

  const updated = await prisma.vocabularySentence.updateMany({
    where: {
      id: { in: sentenceIds },
      AND: [
        {
          OR: [
            { sourceId: 'anki-import' },
            { sourceUrl: '/manage/import?type=anki' },
          ],
        },
        {
          OR: [
            { source: { not: wordbook.title } },
            { sourceUrl: { not: '/manage/import?type=anki' } },
          ],
        },
      ],
    },
    data: {
      source: wordbook.title,
      sourceUrl: '/manage/import?type=anki',
    },
  })

  return { success: true, updatedCount: updated.count }
}

export async function addVocabulariesToWordbook(
  vocabularyIds: string[],
  wordbookId: string,
) {
  try {
    const userId = await getCurrentUserId()
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    const uniqueIds = Array.from(
      new Set(vocabularyIds.map(item => item.trim()).filter(Boolean)),
    )
    if (uniqueIds.length === 0) {
      return { success: false, message: '请先选择词条' }
    }

    const existingWordbook = await prisma.wordbook.findFirst({
      where: { id: trimmedWordbookId, userId },
      select: { id: true },
    })
    if (!existingWordbook) return { success: false, message: '单词书不存在' }

    const existingEntries = await prisma.wordbookVocabulary.findMany({
      where: {
        wordbookId: trimmedWordbookId,
        vocabularyId: { in: uniqueIds },
      },
      select: { vocabularyId: true },
    })
    const existingIds = new Set(existingEntries.map(row => row.vocabularyId))
    const ownedVocabularies = await prisma.vocabulary.findMany({
      where: { userId, id: { in: uniqueIds } },
      select: { id: true },
    })
    const ownedIds = new Set(ownedVocabularies.map(row => row.id))
    const missingIds = uniqueIds.filter(
      id => ownedIds.has(id) && !existingIds.has(id),
    )
    const result = await prisma.wordbookVocabulary.createMany({
      data: missingIds.map(vocabularyId => ({
        wordbookId: trimmedWordbookId,
        vocabularyId,
      })),
    })
    revalidatePath('/vocabulary')
    revalidatePath('/vocabulary')
    return {
      success: true,
      added: result.count,
      total: uniqueIds.length,
      skipped: Math.max(0, uniqueIds.length - result.count),
    }
  } catch (error) {
    console.error(error)
    return { success: false, message: '批量加入单词书失败' }
  }
}
