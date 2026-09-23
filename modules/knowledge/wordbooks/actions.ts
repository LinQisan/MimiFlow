'use server'

import { requireAdmin } from '@/modules/users/server/current-user'

import { MaterialType } from '@prisma/client'
import { rmdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { invalidateVocabularyGroupsCache } from '@/modules/knowledge/vocabulary/server/repository'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { PUBLIC_AUDIO_ROOT } from '@/lib/server/public-paths'
import { readString } from '@/lib/validation/schema'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { resolvePathInsideRoot } from '@/utils/files/path'
import {
  normalizeStringList,
  parseJsonStringList,
  toJsonStringList,
} from '@/utils/text/jsonList'
import { collectExclusiveWordbookAudioPaths } from '@/utils/vocabulary/audioFolder'
import {
  filterVocabularyTags,
  normalizeVocabularyJlpt,
} from '@/modules/knowledge/vocabulary/domain/jlpt'
import {
  isWordbookEntryMoveDirection,
  moveWordbookEntry,
  WORDBOOK_ENTRY_ORDER,
} from './entry-order'
import { persistWordbookEntryOrder } from './entry-order-writer'

const revalidateWordbooks = (wordbookId?: string) => {
  revalidatePath('/vocabulary')
  revalidatePath('/manage/import')
  invalidateVocabularyGroupsCache()
  if (wordbookId) revalidatePath(`/vocabulary/wordbooks/${wordbookId}`)
}

const AUDIO_MATERIAL_TYPES = [
  MaterialType.LISTENING,
  MaterialType.READING,
  MaterialType.SPEAKING,
  MaterialType.MEDIA_SUBTITLE,
]

const pruneEmptyAudioDirectories = async (filePath: string) => {
  const audioRoot = path.resolve(PUBLIC_AUDIO_ROOT)
  let current = path.dirname(filePath)
  while (current !== audioRoot) {
    const relative = path.relative(audioRoot, current)
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) {
      return
    }
    try {
      await rmdir(current)
      current = path.dirname(current)
    } catch {
      return
    }
  }
}

const deleteUnreferencedAudioFiles = async (audioPaths: string[]) => {
  const candidates = Array.from(
    new Set(audioPaths.filter(audioPath => audioPath.startsWith('/audios/'))),
  )
  if (candidates.length === 0) {
    return { deletedAudioFiles: 0, retainedAudioFiles: 0 }
  }

  const [wordRefs, sentenceRefs, readingRefs, materials] = await Promise.all([
    prisma.vocabulary.findMany({
      where: { wordAudio: { in: candidates } },
      select: { wordAudio: true },
    }),
    prisma.vocabularySentence.findMany({
      where: { audioFile: { in: candidates } },
      select: { audioFile: true },
    }),
    prisma.vocabularyReadingAudio.findMany({
      where: { audioFile: { in: candidates } },
      select: { audioFile: true },
    }),
    prisma.material.findMany({
      where: { type: { in: AUDIO_MATERIAL_TYPES } },
      select: { type: true, contentPayload: true },
    }),
  ])
  const referencedPaths = new Set([
    ...wordRefs.flatMap(item => (item.wordAudio ? [item.wordAudio] : [])),
    ...sentenceRefs.flatMap(item => (item.audioFile ? [item.audioFile] : [])),
    ...readingRefs.map(item => item.audioFile),
  ])
  materials.forEach(material => {
    const payload = decodeMaterialPayloadRecord(material.type, material.contentPayload)
    const audioPath = readString(payload.audioFile)
    if (audioPath && candidates.includes(audioPath)) referencedPaths.add(audioPath)
  })

  let deletedAudioFiles = 0
  for (const audioPath of candidates) {
    if (referencedPaths.has(audioPath)) continue
    const absolutePath = resolvePathInsideRoot(
      PUBLIC_AUDIO_ROOT,
      audioPath.replace(/^\/audios\//, ''),
    )
    if (!absolutePath || absolutePath === path.resolve(PUBLIC_AUDIO_ROOT)) continue
    try {
      await unlink(absolutePath)
      deletedAudioFiles += 1
      await pruneEmptyAudioDirectories(absolutePath)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') console.error('删除词表音频失败:', error)
    }
  }

  return {
    deletedAudioFiles,
    retainedAudioFiles: referencedPaths.size,
  }
}

export async function createWordbookSeries(title: string) {
  await requireAdmin()
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
  await requireAdmin()
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
  await requireAdmin()
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
  await requireAdmin()
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
  await requireAdmin()
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
  await requireAdmin()
  try {
    const userId = await getCurrentUserId()
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    const existing = await prisma.wordbook.findFirst({
      where: { id: trimmedWordbookId, userId },
      select: {
        id: true,
        entries: {
          select: {
            vocabulary: {
              select: {
                id: true,
                wordAudio: true,
                wordbooks: { select: { wordbookId: true } },
              },
            },
          },
        },
      },
    })
    if (!existing) return { success: false, message: '单词书不存在' }

    if (existing.entries.length === 0) {
      const removed = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM wordbooks WHERE id = ${existing.id} AND user_id = ${userId} FOR UPDATE`
        return tx.wordbook.deleteMany({
          where: { id: existing.id, userId, entries: { none: {} } },
        })
      })
      if (removed.count === 0) {
        return { success: false, message: '单词书内容已变化，请刷新后重试' }
      }
      revalidateWordbooks()
      return { success: true, removedEntries: 0, deletedAudioFiles: 0, retainedAudioFiles: 0 }
    }

    const sentenceSourceUrl = `/vocabulary/wordbooks/${existing.id}`
    const wordbookSentences = await prisma.vocabularySentence.findMany({
      where: { sourceUrl: sentenceSourceUrl },
      select: { id: true, audioFile: true },
    })
    const wordbookSentenceIds = wordbookSentences.map(sentence => sentence.id)
    const exclusiveVocabularyIds = existing.entries
      .filter(entry =>
        entry.vocabulary.wordbooks.every(membership => membership.wordbookId === existing.id),
      )
      .map(entry => entry.vocabulary.id)
    const audioPaths = collectExclusiveWordbookAudioPaths(
      existing.id,
      existing.entries.map(entry => ({
        wordAudio: entry.vocabulary.wordAudio,
        wordbookIds: entry.vocabulary.wordbooks.map(membership => membership.wordbookId),
      })),
      wordbookSentences.map(sentence => sentence.audioFile),
    )

    const removedEntries = await prisma.$transaction(async tx => {
      if (exclusiveVocabularyIds.length > 0) {
        await tx.vocabulary.updateMany({
          where: { id: { in: exclusiveVocabularyIds }, userId },
          data: { wordAudio: null },
        })
      }
      if (wordbookSentenceIds.length > 0) {
        await tx.vocabularySentence.updateMany({
          where: { id: { in: wordbookSentenceIds } },
          data: { audioFile: null },
        })
      }
      const removed = await tx.wordbookVocabulary.deleteMany({
        where: { wordbookId: existing.id },
      })
      await tx.wordbook.delete({
        where: { id: existing.id },
      })
      return removed.count
    })
    const audioCleanup = await deleteUnreferencedAudioFiles(audioPaths)
    revalidateWordbooks()
    return { success: true, removedEntries, ...audioCleanup }
  } catch (error) {
    console.error(error)
    return { success: false, message: '删除单词书失败' }
  }
}

export async function removeVocabularyFromWordbook(
  vocabularyId: string,
  wordbookId: string,
) {
  await requireAdmin()
  try {
    const userId = await getCurrentUserId()
    const trimmedVocabularyId = vocabularyId.trim()
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedVocabularyId || !trimmedWordbookId) {
      return { success: false, message: '单词书无效' }
    }
    const removed = await prisma.wordbookVocabulary.deleteMany({
      where: {
        vocabularyId: trimmedVocabularyId,
        wordbookId: trimmedWordbookId,
        wordbook: { userId },
        vocabulary: { userId },
      },
    })
    if (removed.count === 0) {
      return { success: false, message: '该单词已不在当前词表中' }
    }
    revalidateWordbooks(trimmedWordbookId)
    return { success: true, removed: removed.count }
  } catch (error) {
    console.error(error)
    return { success: false, message: '移出单词书失败' }
  }
}

export async function moveVocabularyWithinWordbook(
  vocabularyId: string,
  wordbookId: string,
  direction: string,
) {
  await requireAdmin()
  try {
    const userId = await getCurrentUserId()
    const trimmedVocabularyId = vocabularyId.trim()
    const trimmedWordbookId = wordbookId.trim()
    if (
      !trimmedVocabularyId ||
      !trimmedWordbookId ||
      !isWordbookEntryMoveDirection(direction)
    ) {
      return { success: false, message: '排序请求无效' }
    }
    const moved = await prisma.$transaction(async tx => {
      const wordbook = await tx.wordbook.findFirst({
        where: { id: trimmedWordbookId, userId },
        select: { id: true },
      })
      if (!wordbook) return false
      const entries = await tx.wordbookVocabulary.findMany({
        where: {
          wordbookId: trimmedWordbookId,
          vocabulary: { userId },
        },
        orderBy: WORDBOOK_ENTRY_ORDER,
        select: { vocabularyId: true },
      })
      const next = moveWordbookEntry(
        entries.map(entry => entry.vocabularyId),
        trimmedVocabularyId,
        direction,
      )
      if (!next) return false
      await persistWordbookEntryOrder(tx, userId, trimmedWordbookId, next)
      return true
    })
    if (!moved) return { success: false, message: '该词条已在当前方向的边界' }
    revalidateWordbooks(trimmedWordbookId)
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '调整排序失败' }
  }
}

export async function addPartsOfSpeechToWordbookVocabularies(
  vocabularyIds: string[],
  wordbookId: string,
  partsOfSpeech: string[],
) {
  await requireAdmin()
  try {
    const userId = await getCurrentUserId()
    const targetIds = normalizeStringList(vocabularyIds)
    const nextPartsOfSpeech = normalizeStringList(partsOfSpeech)
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId || targetIds.length === 0) {
      return { success: false, message: '请先选择词条' }
    }
    if (nextPartsOfSpeech.length === 0) {
      return { success: false, message: '请先选择或填写词性' }
    }

    const rows = await prisma.vocabulary.findMany({
      where: {
        id: { in: targetIds },
        userId,
        wordbooks: {
          some: { wordbookId: trimmedWordbookId, wordbook: { userId } },
        },
      },
      select: { id: true, partsOfSpeech: true },
    })
    if (rows.length === 0) {
      return { success: false, message: '未找到当前词表中的可更新词条' }
    }

    await prisma.$transaction(
      rows.map(row =>
        prisma.vocabulary.update({
          where: { id: row.id },
          data: {
            partsOfSpeech: toJsonStringList(
              normalizeStringList([
                ...parseJsonStringList(row.partsOfSpeech),
                ...nextPartsOfSpeech,
              ]),
            ),
          },
        }),
      ),
    )
    revalidateWordbooks(trimmedWordbookId)
    return { success: true, updatedCount: rows.length }
  } catch (error) {
    console.error(error)
    return { success: false, message: '批量添加词性失败' }
  }
}

export async function addTagsToWordbookVocabularies(
  vocabularyIds: string[],
  wordbookId: string,
  tagNames: string[],
) {
  await requireAdmin()
  try {
    const userId = await getCurrentUserId()
    const targetIds = normalizeStringList(vocabularyIds)
    const tags = filterVocabularyTags(normalizeStringList(tagNames))
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId || targetIds.length === 0) {
      return { success: false, message: '请先选择词条' }
    }
    if (tags.length === 0) return { success: false, message: '请先填写标签' }

    const rows = await prisma.vocabulary.findMany({
      where: {
        id: { in: targetIds },
        userId,
        wordbooks: {
          some: { wordbookId: trimmedWordbookId, wordbook: { userId } },
        },
      },
      select: { id: true },
    })
    if (rows.length === 0) {
      return { success: false, message: '未找到当前词表中的可更新词条' }
    }

    await prisma.$transaction(async tx => {
      const savedTags = await Promise.all(
        tags.map(name =>
          tx.vocabularyTag.upsert({
            where: { userId_name: { userId, name } },
            update: {},
            create: { userId, name },
            select: { id: true },
          }),
        ),
      )
      await tx.vocabularyTagOnVocabulary.createMany({
        data: rows.flatMap(row =>
          savedTags.map(tag => ({ vocabularyId: row.id, tagId: tag.id })),
        ),
        skipDuplicates: true,
      })
    })
    revalidateWordbooks(trimmedWordbookId)
    return { success: true, updatedCount: rows.length }
  } catch (error) {
    console.error(error)
    return { success: false, message: '批量添加标签失败' }
  }
}

export async function setJlptForWordbookVocabularies(
  vocabularyIds: string[],
  wordbookId: string,
  jlpt: string,
) {
  await requireAdmin()
  try {
    const userId = await getCurrentUserId()
    const targetIds = normalizeStringList(vocabularyIds)
    const trimmedWordbookId = wordbookId.trim()
    const normalizedJlpt = jlpt.trim() ? normalizeVocabularyJlpt(jlpt) : null
    if (!trimmedWordbookId || targetIds.length === 0) {
      return { success: false, message: '请先选择词条' }
    }
    if (jlpt.trim() && !normalizedJlpt) {
      return { success: false, message: 'JLPT 只能是 N1–N5' }
    }

    const result = await prisma.wordbookVocabulary.updateMany({
      where: {
        wordbookId: trimmedWordbookId,
        vocabularyId: { in: targetIds },
        wordbook: { userId },
        vocabulary: { userId },
      },
      data: { jlpt: normalizedJlpt },
    })
    if (result.count === 0) {
      return { success: false, message: '未找到当前词表中的可更新词条' }
    }
    revalidateWordbooks(trimmedWordbookId)
    return { success: true, updatedCount: result.count, jlpt: normalizedJlpt }
  } catch (error) {
    console.error(error)
    return { success: false, message: '批量更新 JLPT 失败' }
  }
}

export async function listSelectableWordbooks() {
  const userId = await getCurrentUserId()
  const rows = await prisma.wordbook.findMany({
    where: { userId },
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

export async function listSelectableWordbookSeries() {
  const userId = await getCurrentUserId()
  return prisma.wordbookSeries.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true },
  })
}

export async function addVocabulariesToWordbook(vocabularyIds: string[], wordbookId: string) {
  await requireAdmin()
  try {
    const userId = await getCurrentUserId()
    const trimmedWordbookId = wordbookId.trim()
    if (!trimmedWordbookId) return { success: false, message: '单词书无效' }
    const uniqueIds = Array.from(new Set(vocabularyIds.map(item => item.trim()).filter(Boolean)))
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
    const missingIds = uniqueIds.filter(id => ownedIds.has(id) && !existingIds.has(id))
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
