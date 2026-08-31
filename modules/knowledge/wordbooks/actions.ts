'use server'

import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'

const revalidateWordbooks = () => {
  revalidatePath('/vocabulary')
  revalidatePath('/manage/import')
}

export async function createWordbookSeries(title: string) {
  try {
    const userId = await getCurrentUserId()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return { success: false, message: '词书系列名称不能为空' }
    const series = await prisma.wordbookSeries.create({
      data: { userId, title: trimmedTitle },
      select: { id: true, title: true },
    })
    revalidateWordbooks()
    return { success: true, series }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '同名词书系列已存在' }
    }
    console.error(error)
    return { success: false, message: '创建词书系列失败' }
  }
}

export async function renameWordbookSeries(seriesId: string, title: string) {
  try {
    const userId = await getCurrentUserId()
    const trimmedSeriesId = seriesId.trim()
    const trimmedTitle = title.trim()
    if (!trimmedSeriesId || !trimmedTitle) {
      return { success: false, message: '词书系列名称不能为空' }
    }
    const series = await prisma.wordbookSeries.findFirst({
      where: { id: trimmedSeriesId, userId },
      select: { id: true },
    })
    if (!series) return { success: false, message: '词书系列不存在' }
    const updated = await prisma.wordbookSeries.update({
      where: { id: series.id },
      data: { title: trimmedTitle },
      select: { id: true, title: true },
    })
    revalidateWordbooks()
    return { success: true, series: updated }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '同名词书系列已存在' }
    }
    console.error(error)
    return { success: false, message: '重命名词书系列失败' }
  }
}

export async function createWordbook(
  title: string,
  seriesId: string,
) {
  try {
    const userId = await getCurrentUserId()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      return { success: false, message: '单词书名称不能为空' }
    }
    const trimmedSeriesId = seriesId.trim()
    if (!trimmedSeriesId) return { success: false, message: '请选择词书系列' }
    const series = await prisma.wordbookSeries.findFirst({
      where: { id: trimmedSeriesId, userId },
      select: { id: true },
    })
    if (!series) return { success: false, message: '词书系列不存在' }
    const wordbook = await prisma.wordbook.create({
      data: {
        userId,
        title: trimmedTitle,
        seriesId: series.id,
      },
      select: { id: true, title: true, seriesId: true, createdAt: true },
    })
    revalidateWordbooks()
    return {
      success: true,
      wordbook: {
        id: wordbook.id,
        title: wordbook.title,
        seriesId: wordbook.seriesId,
        createdAt: wordbook.createdAt,
      },
    }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '该系列中已存在同名单词书' }
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
      select: { id: true, title: true, seriesId: true },
    })
    revalidateWordbooks()
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
  seriesId: string,
) {
  try {
    const userId = await getCurrentUserId()
    const trimmedWordbookId = wordbookId.trim()
    const trimmedSeriesId = seriesId.trim()
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    if (!trimmedSeriesId) return { success: false, message: '请选择词书系列' }
    const wordbook = await prisma.wordbook.findFirst({
      where: { id: trimmedWordbookId, userId },
      select: { id: true },
    })
    if (!wordbook) return { success: false, message: '单词书不存在' }
    const targetSeries = await prisma.wordbookSeries.findFirst({
      where: { id: trimmedSeriesId, userId },
      select: { id: true },
    })
    if (!targetSeries) return { success: false, message: '目标词书系列不存在' }
    const updated = await prisma.wordbook.update({
      where: { id: trimmedWordbookId },
      data: { seriesId: targetSeries.id },
      select: { id: true, title: true, seriesId: true },
    })
    revalidateWordbooks()
    return { success: true, wordbook: updated }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '目标系列已有同名单词书' }
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
    revalidateWordbooks()
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
    revalidateWordbooks()
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '移出单词书失败' }
  }
}

export async function listSelectableWordbooks() {
  const userId = await getCurrentUserId()
  const rows = await prisma.wordbook.findMany({
    where: { userId, NOT: { id: { startsWith: 'legacy-' } } },
    orderBy: [
      { series: { sortOrder: 'asc' } },
      { series: { createdAt: 'asc' } },
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
    select: {
      id: true,
      title: true,
      seriesId: true,
      series: { select: { title: true } },
      _count: {
        select: { entries: true },
      },
    },
  })
  return rows.map(item => ({
    id: item.id,
    title: item.title,
    seriesId: item.seriesId,
    seriesTitle: item.series.title,
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
      skipDuplicates: true,
    })
    revalidateWordbooks()
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
