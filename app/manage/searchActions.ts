// app/admin/manage/searchActions.ts
'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import {
  normalizeStringList,
  parseJsonStringList,
  toJsonStringList,
} from '@/utils/jsonList'
import { buildVocabularyCanonicalKeys } from '@/utils/vocabularyCanonical'
import { dedupeAndRankSentences } from '@/utils/sentenceQuality'

type VocabularyMetaPayload = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

type BatchMetaUpdateMode = 'append' | 'replace'

type MergePreviewItem = {
  id: string
  word: string
  sentenceCount: number
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  createdAt: Date
}

type MergePreviewGroup = {
  groupKey: string
  keepId: string
  keepWord: string
  mergeIds: string[]
  items: MergePreviewItem[]
}

const normalizeSentencePosTags = (list?: string[] | null) =>
  Array.from(new Set((list || []).map(item => item.trim()).filter(Boolean))).slice(
    0,
    1,
  )

const buildMergeGroups = (items: MergePreviewItem[]): MergePreviewGroup[] => {
  if (items.length === 0) return []

  const keyMap = new Map<string, string[]>()
  const keysById = new Map<string, string[]>()

  items.forEach(item => {
    const keys = Array.from(
      new Set(
        buildVocabularyCanonicalKeys(item.word).map(key => key.trim()).filter(Boolean),
      ),
    )
    if (keys.length === 0) keys.push(item.word.trim().toLowerCase())
    keysById.set(item.id, keys)
    keys.forEach(key => {
      const list = keyMap.get(key) || []
      list.push(item.id)
      keyMap.set(key, list)
    })
  })

  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const p = parent.get(id)
    if (!p || p === id) return id
    const root = find(p)
    parent.set(id, root)
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  items.forEach(item => parent.set(item.id, item.id))

  for (const ids of keyMap.values()) {
    if (ids.length < 2) continue
    const [first, ...rest] = ids
    rest.forEach(id => union(first, id))
  }

  const groupsMap = new Map<string, MergePreviewItem[]>()
  items.forEach(item => {
    const root = find(item.id)
    const list = groupsMap.get(root) || []
    list.push(item)
    groupsMap.set(root, list)
  })

  const groups: MergePreviewGroup[] = []
  for (const groupItems of groupsMap.values()) {
    if (groupItems.length < 2) continue
    const sorted = [...groupItems].sort((a, b) => {
      const aScore =
        a.sentenceCount * 100 +
        a.meanings.length * 20 +
        a.partsOfSpeech.length * 10 +
        a.pronunciations.length * 8
      const bScore =
        b.sentenceCount * 100 +
        b.meanings.length * 20 +
        b.partsOfSpeech.length * 10 +
        b.pronunciations.length * 8
      if (aScore !== bScore) return bScore - aScore
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
    const keep = sorted[0]
    const mergeIds = sorted.slice(1).map(item => item.id)

    const keyCounter = new Map<string, number>()
    sorted.forEach(item => {
      const keys = keysById.get(item.id) || []
      keys.forEach(key => {
        keyCounter.set(key, (keyCounter.get(key) || 0) + 1)
      })
    })
    const groupKey =
      [...keyCounter.entries()]
        .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ||
      keep.word.toLowerCase()

    groups.push({
      groupKey,
      keepId: keep.id,
      keepWord: keep.word,
      mergeIds,
      items: sorted,
    })
  }

  return groups.sort((a, b) => b.items.length - a.items.length)
}

// ==========================================
// 1. 全局全量语料搜索 (听力 + 阅读 + 题目)
// ==========================================
export async function searchGlobalCorpus(keyword: string) {
  if (!keyword.trim()) return []
  const k = keyword.trim()

  // 搜听力字幕
  const dialogues = await prisma.dialogue.findMany({
    where: { text: { contains: k } },
    include: {
      lesson: { select: { title: true, category: { select: { name: true } } } },
    },
    take: 15,
    orderBy: { id: 'desc' },
  })

  // 搜阅读文章
  const articles = await prisma.article.findMany({
    where: {
      OR: [
        { title: { contains: k } },
        { description: { contains: k } },
        { content: { contains: k } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      createdAt: true,
      content: true,
      category: {
        select: { name: true },
      },
    },
    take: 15,
    orderBy: {
      createdAt: 'desc',
    },
  })
  // 搜题目题干
  const questions = await prisma.question.findMany({
    where: { contextSentence: { contains: k } },
    include: {
      quiz: { select: { title: true, category: { select: { name: true } } } },
    },
    take: 15,
  })

  // 统一映射为搜索结果结构
  const results = [
    ...dialogues.map(d => ({
      id: d.id,
      type: 'AUDIO_DIALOGUE',
      text: d.text,
      sourceTitle: `🎧 ${d.lesson?.title}`,
      categoryName: d.lesson?.category?.name || '未知分类',
    })),
    ...articles.map(a => ({
      id: a.id,
      type: 'ARTICLE_TEXT',
      text:
        a.description ||
        (a.content ? a.content.substring(0, 100) + '...' : '暂无内容'),
      sourceTitle: `📄 ${a.title}`,
      categoryName: a.category?.name || '未知分类',
    })),
    ...questions.map(q => ({
      id: q.id,
      type: 'QUIZ_QUESTION',
      text: q.contextSentence,
      sourceTitle: `📝 ${q.quiz?.title}`,
      categoryName: q.quiz?.category?.name || '未知分类',
    })),
  ]

  return results
}

// ==========================================
// 2. 获取后台所有生词列表
// ==========================================
export async function getAllVocabulariesAdmin() {
  const rows = await prisma.vocabulary.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      sentenceLinks: {
        include: { sentence: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  return rows.map(item => {
    const { sentenceLinks, ...rest } = item
    return {
      ...rest,
      pronunciations: parseJsonStringList(item.pronunciations),
      partsOfSpeech: parseJsonStringList(item.partsOfSpeech),
      meanings: parseJsonStringList(item.meanings),
      sentences: dedupeAndRankSentences(
        sentenceLinks.map(link => ({
          text: link.sentence.text,
          source: link.sentence.source,
          sourceUrl: link.sentence.sourceUrl,
          sourceType: link.sentence.sourceType,
          meaningIndex: link.meaningIndex,
          posTags: parseJsonStringList(link.posTags).slice(0, 1),
        })),
        16,
      ),
    }
  })
}

// ==========================================
// 3. 删除生词
// ==========================================
export async function deleteVocabularyAdmin(vocabId: string) {
  try {
    await prisma.vocabulary.delete({ where: { id: vocabId } })
    revalidatePath('/manage')
    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除失败'
    return { success: false, message }
  }
}

export async function updateVocabularyMetaAdmin(
  vocabId: string,
  payload: VocabularyMetaPayload,
) {
  try {
    const pronunciations = normalizeStringList(payload.pronunciations)
    const partsOfSpeech = normalizeStringList(payload.partsOfSpeech)
    const meanings = normalizeStringList(payload.meanings)

    await prisma.vocabulary.update({
      where: { id: vocabId },
      data: {
        pronunciations: toJsonStringList(pronunciations),
        partsOfSpeech: toJsonStringList(partsOfSpeech),
        meanings: toJsonStringList(meanings),
      },
    })

    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    revalidatePath('/articles')
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '更新失败'
    return { success: false, message }
  }
}

export async function batchUpdateVocabularyMetaAdmin(
  vocabIds: string[],
  payload: Pick<VocabularyMetaPayload, 'pronunciations' | 'partsOfSpeech'>,
  mode: BatchMetaUpdateMode = 'append',
) {
  try {
    const targetIds = Array.from(new Set(vocabIds.map(id => id.trim()).filter(Boolean)))
    if (targetIds.length === 0) {
      return { success: false, message: '请先选择词条' }
    }

    const nextPronunciations = normalizeStringList(payload.pronunciations || [])
    const nextPartsOfSpeech = normalizeStringList(payload.partsOfSpeech || [])
    const hasPronunciationUpdate = payload.pronunciations.length > 0
    const hasPosUpdate = payload.partsOfSpeech.length > 0
    if (nextPronunciations.length === 0 && nextPartsOfSpeech.length === 0) {
      return { success: false, message: '请至少填写注音或词性' }
    }

    const rows = await prisma.vocabulary.findMany({
      where: { id: { in: targetIds } },
      select: {
        id: true,
        pronunciations: true,
        partsOfSpeech: true,
      },
    })

    if (rows.length === 0) {
      return { success: false, message: '未找到可更新词条' }
    }

    await prisma.$transaction(
      rows.map(row => {
        const mergedPronunciations = !hasPronunciationUpdate
          ? parseJsonStringList(row.pronunciations)
          : mode === 'replace'
            ? nextPronunciations
            : normalizeStringList([
                ...parseJsonStringList(row.pronunciations),
                ...nextPronunciations,
              ])
        const mergedPartsOfSpeech = !hasPosUpdate
          ? parseJsonStringList(row.partsOfSpeech)
          : mode === 'replace'
            ? nextPartsOfSpeech
            : normalizeStringList([
                ...parseJsonStringList(row.partsOfSpeech),
                ...nextPartsOfSpeech,
              ])
        return prisma.vocabulary.update({
          where: { id: row.id },
          data: {
            pronunciations: toJsonStringList(mergedPronunciations),
            partsOfSpeech: toJsonStringList(mergedPartsOfSpeech),
          },
        })
      }),
    )

    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    revalidatePath('/articles')
    revalidatePath('/quizzes')
    return { success: true, updatedCount: rows.length }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '批量更新失败'
    return { success: false, message }
  }
}

export async function getVocabularyMergePreviewAdmin() {
  const rows = await prisma.vocabulary.findMany({
    select: {
      id: true,
      word: true,
      pronunciations: true,
      partsOfSpeech: true,
      meanings: true,
      createdAt: true,
      sentenceLinks: { select: { id: true } },
    },
  })

  const items: MergePreviewItem[] = rows.map(row => ({
    id: row.id,
    word: row.word,
    sentenceCount: row.sentenceLinks.length,
    pronunciations: parseJsonStringList(row.pronunciations),
    partsOfSpeech: parseJsonStringList(row.partsOfSpeech),
    meanings: parseJsonStringList(row.meanings),
    createdAt: row.createdAt,
  }))

  const groups = buildMergeGroups(items)
  const duplicateCount = groups.reduce((sum, group) => sum + group.mergeIds.length, 0)
  return {
    groups,
    totalGroups: groups.length,
    duplicateCount,
  }
}

export async function mergeVocabularyDuplicateGroupAdmin(
  keepId: string,
  mergeIds: string[],
) {
  try {
    const uniqMergeIds = Array.from(new Set(mergeIds.filter(id => id !== keepId)))
    if (uniqMergeIds.length === 0) return { success: true, mergedCount: 0 }

    await prisma.$transaction(async tx => {
      const all = await tx.vocabulary.findMany({
        where: { id: { in: [keepId, ...uniqMergeIds] } },
        include: { sentenceLinks: true },
      })

      const keep = all.find(item => item.id === keepId)
      if (!keep) throw new Error('保留词条不存在')
      const sources = all.filter(item => item.id !== keepId)

      const mergedPronunciations = normalizeStringList([
        ...parseJsonStringList(keep.pronunciations),
        ...sources.flatMap(item => parseJsonStringList(item.pronunciations)),
      ])
      const mergedPartsOfSpeech = normalizeStringList([
        ...parseJsonStringList(keep.partsOfSpeech),
        ...sources.flatMap(item => parseJsonStringList(item.partsOfSpeech)),
      ])
      const mergedMeanings = normalizeStringList([
        ...parseJsonStringList(keep.meanings),
        ...sources.flatMap(item => parseJsonStringList(item.meanings)),
      ])

      const fallbackFolderId =
        keep.folderId ||
        sources.find(item => !!item.folderId)?.folderId ||
        null

      await tx.vocabulary.update({
        where: { id: keepId },
        data: {
          pronunciations: toJsonStringList(mergedPronunciations),
          partsOfSpeech: toJsonStringList(mergedPartsOfSpeech),
          meanings: toJsonStringList(mergedMeanings),
          folderId: fallbackFolderId,
        },
      })

      for (const source of sources) {
        for (const link of source.sentenceLinks) {
          const existed = await tx.vocabularySentenceLink.findUnique({
            where: {
              vocabularyId_sentenceId: {
                vocabularyId: keepId,
                sentenceId: link.sentenceId,
              },
            },
          })
          if (!existed) {
            await tx.vocabularySentenceLink.create({
              data: {
                vocabularyId: keepId,
                sentenceId: link.sentenceId,
                meaningIndex: link.meaningIndex,
                posTags: link.posTags,
              },
            })
            continue
          }

          const mergedTags = normalizeSentencePosTags([
            ...parseJsonStringList(existed.posTags),
            ...parseJsonStringList(link.posTags),
          ])

          await tx.vocabularySentenceLink.update({
            where: { id: existed.id },
            data: {
              meaningIndex:
                existed.meaningIndex == null ? link.meaningIndex : existed.meaningIndex,
              posTags: toJsonStringList(mergedTags),
            },
          })
        }
      }

      await tx.vocabulary.deleteMany({
        where: { id: { in: uniqMergeIds } },
      })
    })

    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    revalidatePath('/articles')
    revalidatePath('/quizzes')
    return { success: true, mergedCount: uniqMergeIds.length }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '归并失败'
    return { success: false, message }
  }
}

export async function mergeAllVocabularyDuplicatesAdmin() {
  try {
    const preview = await getVocabularyMergePreviewAdmin()
    let mergedCount = 0
    for (const group of preview.groups) {
      if (group.mergeIds.length === 0) continue
      const res = await mergeVocabularyDuplicateGroupAdmin(
        group.keepId,
        group.mergeIds,
      )
      if (!res.success) {
        return {
          success: false,
          message: res.message || '批量归并中断',
          mergedCount,
        }
      }
      mergedCount += res.mergedCount || 0
    }
    return { success: true, mergedCount }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '批量归并失败'
    return { success: false, message, mergedCount: 0 }
  }
}
