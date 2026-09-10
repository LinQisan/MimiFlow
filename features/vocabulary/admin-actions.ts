// app/vocabulary/manage/searchActions.ts
'use server'

import { splitJapaneseEtymologies } from '@/modules/language/domain/etymology'

import type { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { invalidateVocabularyGroupsCache } from '@/modules/knowledge/vocabulary/server/repository'
import {
  normalizeStringList,
  parseJsonStringList,
  toJsonStringList,
} from '@/utils/text/jsonList'
import { buildVocabularyCanonicalKeys } from '@/utils/vocabulary/vocabularyCanonical'
import {
  getVocabularyPartOfSpeechParent,
  getVocabularyTagFromPartOfSpeech,
  normalizeVocabularyPartOfSpeechFilter,
} from '@/utils/vocabulary/partOfSpeech'
import {
  dedupeAndRankSentences,
  normalizeVocabularySentenceTextKey,
} from '@/utils/vocabulary/sentenceQuality'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { parseWordbookFilter } from '@/modules/knowledge/vocabulary/domain/wordbook-list'
import { resolveVocabularyLanguageCode } from '@/modules/knowledge/vocabulary/domain/language'
import {
  parseVocabularyCsvDocument,
  parseVocabularyCsvSentences,
  normalizeVocabularyCsvSentenceText,
  serializeVocabularyCsv,
  serializeVocabularyCsvSentences,
  splitVocabularyCsvList,
  splitVocabularyCsvPartsOfSpeech,
} from '@/modules/knowledge/vocabulary/domain/csv'
import {
  filterVocabularyTags,
  normalizeVocabularyJlpt,
} from '@/modules/knowledge/vocabulary/domain/jlpt'
import { normalizeVocabularyWord } from '@/modules/knowledge/vocabulary/domain/normalized-word'

type VocabularyMetaPayload = {
  word: string
  etymologies?: string[]
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

type VocabularySentenceEditPayload = {
  linkId: string
  text: string
  posTags: string[]
}

type BatchMetaUpdateMode = 'append' | 'replace'

export async function listVocabularyPartOfSpeechHierarchyAdmin() {
  const userId = await getCurrentUserId()
  const [saved, vocabularies] = await Promise.all([
    prisma.vocabularyPartOfSpeech.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        languageCode: true,
        parentId: true,
        parent: { select: { name: true, languageCode: true } },
      },
    }),
    prisma.vocabulary.findMany({
      where: { userId, partsOfSpeech: { not: null } },
      select: {
        word: true,
        etymologies: true,
        pronunciations: true,
        sourceType: true,
        partsOfSpeech: true,
      },
    }),
  ])
  const keyFor = (languageCode: string, name: string) =>
    `${languageCode}:${name}`
  const savedByKey = new Map(
    saved.map(item => [keyFor(item.languageCode, item.name), item]),
  )
  const namesByLanguage = new Map<string, Set<string>>()
  const addName = (languageCode: string, name: string) => {
    const names = namesByLanguage.get(languageCode) || new Set<string>()
    names.add(name)
    namesByLanguage.set(languageCode, names)
  }
  vocabularies.forEach(item => {
    const languageCode = resolveVocabularyLanguageCode({
      word: item.word,
      pronunciations: parseJsonStringList(item.pronunciations),
      sourceType: item.sourceType,
    })
    parseJsonStringList(item.partsOfSpeech)
      .map(normalizeVocabularyPartOfSpeechFilter)
      .filter(name => !getVocabularyTagFromPartOfSpeech(name))
      .forEach(name => addName(languageCode, name))
  })
  saved.forEach(item => addName(item.languageCode, item.name))
  namesByLanguage.forEach((names, languageCode) => {
    Array.from(names).forEach(name => {
      const savedRow = savedByKey.get(keyFor(languageCode, name))
      const parentName =
        savedRow?.parent?.name ||
        (languageCode === 'ja' ? getVocabularyPartOfSpeechParent(name) : null)
      if (parentName) names.add(parentName)
    })
  })

  const parentNames = new Map<string, string | null>()
  namesByLanguage.forEach((names, languageCode) => {
    names.forEach(name => {
      const savedRow = savedByKey.get(keyFor(languageCode, name))
      parentNames.set(
        keyFor(languageCode, name),
        savedRow?.parent?.name ||
          (languageCode === 'ja'
            ? getVocabularyPartOfSpeechParent(name)
            : null),
      )
    })
  })
  const childCounts = new Map<string, number>()
  parentNames.forEach((parentName, key) => {
    if (!parentName) return
    const languageCode = key.slice(0, key.indexOf(':'))
    const parentKey = keyFor(languageCode, parentName)
    childCounts.set(parentKey, (childCounts.get(parentKey) || 0) + 1)
  })
  return [...namesByLanguage].flatMap(([languageCode, names]) =>
    [...names].map(name => {
      const key = keyFor(languageCode, name)
      const row = savedByKey.get(key)
      const parentName = parentNames.get(key) || null
      return {
        id:
          row?.id ||
          `existing:${languageCode}:${encodeURIComponent(name)}`,
        name,
        languageCode,
        parentId: row?.parentId || null,
        parent: parentName ? { name: parentName } : null,
        managed: Boolean(row),
        _count: { children: childCounts.get(key) || 0 },
      }
    }),
  )
    .sort((left, right) => {
      if (left.languageCode !== right.languageCode) {
        return left.languageCode.localeCompare(right.languageCode)
      }
      const leftPath = left.parent ? `${left.parent.name}/${left.name}` : left.name
      const rightPath = right.parent ? `${right.parent.name}/${right.name}` : right.name
      return leftPath.localeCompare(rightPath, 'ja')
    })
}

export async function createVocabularyPartOfSpeechAdmin(
  name: string,
  languageCode: string,
  parentName?: string,
) {
  try {
    const userId = await getCurrentUserId()
    const normalizedName = name.trim()
    const normalizedLanguageCode = languageCode.trim().toLowerCase()
    const normalizedParentName = parentName?.trim() || null
    if (!normalizedName) return { success: false, message: '词性名称不能为空' }
    if (!/^[a-z]{2,8}$/.test(normalizedLanguageCode)) {
      return { success: false, message: '语言代码无效' }
    }
    const parent = normalizedParentName
      ? await prisma.vocabularyPartOfSpeech.upsert({
          where: {
            userId_languageCode_name: {
              userId,
              languageCode: normalizedLanguageCode,
              name: normalizedParentName,
            },
          },
          update: {},
          create: {
            userId,
            languageCode: normalizedLanguageCode,
            name: normalizedParentName,
          },
          select: { id: true },
        })
      : null
    await prisma.vocabularyPartOfSpeech.upsert({
      where: {
        userId_languageCode_name: {
          userId,
          languageCode: normalizedLanguageCode,
          name: normalizedName,
        },
      },
      update: { parentId: parent?.id || null },
      create: {
        userId,
        languageCode: normalizedLanguageCode,
        name: normalizedName,
        parentId: parent?.id || null,
      },
    })
    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error: unknown) {
    const prismaError = error as { code?: string }
    if (prismaError.code === 'P2002') {
      return { success: false, message: '该词性已存在' }
    }
    console.error(error)
    return { success: false, message: '添加词性失败' }
  }
}

export async function deleteVocabularyPartOfSpeechAdmin(id: string) {
  try {
    const userId = await getCurrentUserId()
    const deleted = await prisma.vocabularyPartOfSpeech.deleteMany({
      where: { id: id.trim(), userId },
    })
    if (deleted.count === 0) return { success: false, message: '词性不存在' }
    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '删除词性失败' }
  }
}

type MergePreviewItem = {
  id: string
  word: string
  sentenceCount: number
  etymologies?: string[]
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

type VocabularyRecordForAdmin = {
  id: string
  word: string
  languageCode: string
  sourceType:
    | 'AUDIO_DIALOGUE'
    | 'MEDIA_SUBTITLE_LINE'
    | 'ARTICLE_TEXT'
    | 'QUIZ_QUESTION'
  sentences: {
    linkId: string
    text: string
    source: string
    sourceUrl: string
    sourceType?: string | null
    meaningIndex?: number | null
    posTags?: string[]
  }[]
  etymologies?: string[]
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  tags: string[]
  wordbookPaths: string[]
}

const vocabularyAdminListSelect = {
  id: true,
  word: true,
  sourceType: true,
  etymologies: true,
  pronunciations: true,
  partsOfSpeech: true,
  meanings: true,
  wordbooks: {
    select: {
      wordbook: {
        select: {
          title: true,
          series: { select: { title: true } },
        },
      },
    },
  },
  sentenceLinks: {
    orderBy: { createdAt: 'asc' as const },
    take: 1,
    select: {
      id: true,
      meaningIndex: true,
      posTags: true,
      sentence: {
        select: {
          text: true,
          source: true,
          sourceUrl: true,
          sourceType: true,
        },
      },
    },
  },
  tags: {
    select: { tag: { select: { name: true } } },
  },
} satisfies Prisma.VocabularySelect

const normalizeSentencePosTags = (list?: string[] | null) =>
  Array.from(
    new Set((list || []).map(item => item.trim()).filter(Boolean)),
  ).slice(0, 20)

const buildMergeGroups = (items: MergePreviewItem[]): MergePreviewGroup[] => {
  if (items.length === 0) return []

  const keyMap = new Map<string, string[]>()
  const keysById = new Map<string, string[]>()

  items.forEach(item => {
    const keys = Array.from(
      new Set(
        buildVocabularyCanonicalKeys(item.word)
          .map(key => key.trim())
          .filter(Boolean),
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
      [...keyCounter.entries()].sort(
        (a, b) => b[1] - a[1] || b[0].length - a[0].length,
      )[0]?.[0] || keep.word.toLowerCase()

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
export async function getVocabulariesPagedAdmin(
  keyword = '',
  page = 1,
  pageSize = 40,
  wordbookFilter = 'all',
): Promise<{
  items: VocabularyRecordForAdmin[]
  total: number
  page: number
  pageSize: number
}> {
  const userId = await getCurrentUserId()
  const safePageSize = Math.min(120, Math.max(10, Math.floor(pageSize)))
  const safePage = Math.max(1, Math.floor(page))
  const search = keyword.trim()
  const parsedWordbookFilter = parseWordbookFilter(wordbookFilter)

  const primarySearchWhere: Prisma.VocabularyWhereInput = search
    ? {
        OR: [
          { word: { contains: search } },
          { pronunciations: { contains: search } },
          { etymologies: { contains: search } },
          { partsOfSpeech: { contains: search } },
          { meanings: { contains: search } },
        ],
      }
    : {}
  const sentenceSearchWhere: Prisma.VocabularyWhereInput = search
    ? {
        sentenceLinks: {
          some: {
            OR: [
              { sentence: { text: { contains: search } } },
              { sentence: { source: { contains: search } } },
            ],
          },
        },
      }
    : {}

  const wordbookFilters: Prisma.VocabularyWhereInput[] = []
  if (parsedWordbookFilter.kind === 'none') {
    wordbookFilters.push({ wordbooks: { none: {} } })
  } else if (parsedWordbookFilter.kind === 'series') {
    wordbookFilters.push({
      wordbooks: {
        some: {
          wordbook: {
            userId,
            seriesId: parsedWordbookFilter.id,
          },
        },
      },
    })
  } else if (parsedWordbookFilter.kind === 'wordbook') {
    wordbookFilters.push({
      wordbooks: {
        some: {
          wordbookId: parsedWordbookFilter.id,
          wordbook: { userId },
        },
      },
    })
  }
  const buildOwnedWhere = (
    matchWhere: Prisma.VocabularyWhereInput,
  ): Prisma.VocabularyWhereInput => ({
    AND: [{ userId }, matchWhere, ...wordbookFilters],
  })
  let ownedWhere = buildOwnedWhere(primarySearchWhere)
  const requestedSkip = (safePage - 1) * safePageSize
  const fetchRows = (where: Prisma.VocabularyWhereInput, skip: number, take: number) =>
    prisma.vocabulary.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: vocabularyAdminListSelect,
    })

  let total: number
  let requestedRows: Awaited<ReturnType<typeof fetchRows>>
  if (search && safePage === 1) {
    const exactWhere = buildOwnedWhere({ word: search })
    let rowsWithLookahead = await fetchRows(exactWhere, 0, safePageSize + 1)
    if (rowsWithLookahead.length > 0) ownedWhere = exactWhere
    else {
      rowsWithLookahead = await fetchRows(
        ownedWhere,
        0,
        safePageSize + 1,
      )
    }
    if (rowsWithLookahead.length === 0) {
      ownedWhere = buildOwnedWhere(sentenceSearchWhere)
      rowsWithLookahead = await fetchRows(
        ownedWhere,
        0,
        safePageSize + 1,
      )
    }
    requestedRows = rowsWithLookahead.slice(0, safePageSize)
    total = rowsWithLookahead.length <= safePageSize
      ? rowsWithLookahead.length
      : await prisma.vocabulary.count({ where: ownedWhere })
  } else {
    ;[total, requestedRows] = await Promise.all([
      prisma.vocabulary.count({ where: ownedWhere }),
      fetchRows(ownedWhere, requestedSkip, safePageSize),
    ])
  }
  const totalPages = Math.max(1, Math.ceil(total / safePageSize))
  const normalizedPage = Math.min(safePage, totalPages)
  const rows = normalizedPage === safePage
    ? requestedRows
    : await fetchRows(
        ownedWhere,
        (normalizedPage - 1) * safePageSize,
        safePageSize,
      )

  const items: VocabularyRecordForAdmin[] = rows.map(item => {
    const { sentenceLinks, tags, wordbooks } = item
    return {
      id: item.id,
      word: item.word,
      languageCode: resolveVocabularyLanguageCode({
        word: item.word,
        pronunciations: parseJsonStringList(item.pronunciations),
        sourceType: item.sourceType,
      }),
      sourceType: item.sourceType,
      ...splitJapaneseEtymologies(item.word, parseJsonStringList(item.pronunciations), parseJsonStringList(item.etymologies)),
      partsOfSpeech: parseJsonStringList(item.partsOfSpeech),
      meanings: parseJsonStringList(item.meanings),
      tags: filterVocabularyTags((tags || []).map(t => t.tag?.name || '')),
      wordbookPaths: Array.from(new Set(
        wordbooks.map(link =>
          `${link.wordbook.series.title} / ${link.wordbook.title}`,
        ),
      )).sort((left, right) => left.localeCompare(right, 'ja')),
      sentences: dedupeAndRankSentences(
        sentenceLinks.map(link => ({
          linkId: link.id,
          text: link.sentence.text,
          source: link.sentence.source,
          sourceUrl: link.sentence.sourceUrl,
          sourceType: link.sentence.sourceType,
          meaningIndex: link.meaningIndex,
          posTags: normalizeSentencePosTags(parseJsonStringList(link.posTags)),
        })),
        1,
      ),
    }
  })

  return {
    items,
    total,
    page: normalizedPage,
    pageSize: safePageSize,
  }
}

// ==========================================
// 3. 删除生词
// ==========================================
export async function deleteVocabularyAdmin(vocabId: string) {
  try {
    const userId = await getCurrentUserId()
    const deleted = await prisma.vocabulary.deleteMany({
      where: { id: vocabId, userId },
    })
    if (deleted.count === 0) return { success: false, message: '词条不存在' }
    revalidatePath('/')
    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    invalidateVocabularyGroupsCache()
    return { success: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '删除失败'
    return { success: false, message }
  }
}

export async function getVocabularySentencesAdmin(vocabId: string) {
  try {
    const userId = await getCurrentUserId()
    const links = await prisma.vocabularySentenceLink.findMany({
      where: { vocabularyId: vocabId, vocabulary: { userId } },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: {
        id: true,
        meaningIndex: true,
        posTags: true,
        sentence: {
          select: {
            text: true,
            source: true,
            sourceUrl: true,
            sourceType: true,
          },
        },
      },
    })
    return {
      success: true,
      sentences: dedupeAndRankSentences(
        links.map(link => ({
          linkId: link.id,
          text: link.sentence.text,
          source: link.sentence.source,
          sourceUrl: link.sentence.sourceUrl,
          sourceType: link.sentence.sourceType,
          meaningIndex: link.meaningIndex,
          posTags: normalizeSentencePosTags(parseJsonStringList(link.posTags)),
        })),
        20,
      ),
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '例句加载失败'
    return { success: false, message, sentences: [] }
  }
}

export async function updateVocabularyAdmin(
  vocabId: string,
  payload: VocabularyMetaPayload & {
    tags: string[]
    sentences?: VocabularySentenceEditPayload[]
    updateMeta?: boolean
    updateTags?: boolean
  },
) {
  try {
    const userId = await getCurrentUserId()
    const word = payload.word.trim()
    if (!word) return { success: false, message: '词条不能为空' }

    const pronunciations = normalizeStringList(payload.pronunciations)
    const partsOfSpeech = normalizeStringList(payload.partsOfSpeech)
    const meanings = normalizeStringList(payload.meanings)
    const normalizedTags = filterVocabularyTags(payload.tags)
    const shouldUpdateMeta = payload.updateMeta !== false
    const shouldUpdateTags = payload.updateTags !== false
    const sentenceEdits = (payload.sentences || [])
      .slice(0, 20)
      .map(sentence => ({
        linkId: sentence.linkId.trim(),
        text: sentence.text.trim(),
        normalizedText: normalizeVocabularySentenceTextKey(sentence.text),
        posTags: normalizeSentencePosTags(sentence.posTags),
      }))
    if (sentenceEdits.some(sentence => !sentence.linkId || !sentence.normalizedText)) {
      return { success: false, message: '例句不能为空' }
    }
    if (!shouldUpdateMeta && !shouldUpdateTags && sentenceEdits.length === 0) {
      return { success: true, word }
    }
    const updated = await prisma.$transaction(async tx => {
      const ownsVocabulary = shouldUpdateMeta
        ? (await tx.vocabulary.updateMany({
            where: { id: vocabId, userId },
          data: {
            word,
            normalizedWord: normalizeVocabularyWord(word),
            pronunciations: toJsonStringList(pronunciations),
              partsOfSpeech: toJsonStringList(partsOfSpeech),
              meanings: toJsonStringList(meanings),
            },
          })).count > 0
        : Boolean(
            await tx.vocabulary.findFirst({
              where: { id: vocabId, userId },
              select: { id: true },
            }),
          )
      if (!ownsVocabulary) return false

      if (shouldUpdateTags) {
        await tx.vocabularyTagOnVocabulary.deleteMany({
          where: { vocabularyId: vocabId },
        })
      }
      if (shouldUpdateTags && normalizedTags.length > 0) {
        const tags = await Promise.all(
          normalizedTags.map(name =>
            tx.vocabularyTag.upsert({
              where: { userId_name: { userId, name } },
              update: {},
              create: { userId, name },
              select: { id: true },
            }),
          ),
        )
        await tx.vocabularyTagOnVocabulary.createMany({
          data: tags.map(tag => ({ vocabularyId: vocabId, tagId: tag.id })),
          skipDuplicates: true,
        })
      }

      if (sentenceEdits.length > 0) {
        const links = await tx.vocabularySentenceLink.findMany({
          where: {
            id: { in: sentenceEdits.map(sentence => sentence.linkId) },
            vocabularyId: vocabId,
          },
          include: { sentence: true },
        })
        if (links.length !== sentenceEdits.length) {
          throw new Error('部分例句不存在或已被修改')
        }
        const linksById = new Map(links.map(link => [link.id, link]))

        for (const edit of sentenceEdits) {
          const link = linksById.get(edit.linkId)
          if (!link) throw new Error('例句不存在')
          const posTags = toJsonStringList(edit.posTags)
          const textChanged = edit.text !== link.sentence.text.trim()
          if (!textChanged) {
            await tx.vocabularySentenceLink.update({
              where: { id: link.id },
              data: { posTags },
            })
            continue
          }

          const targetSentence = await tx.vocabularySentence.upsert({
            where: {
              normalizedText_sourceUrl: {
                normalizedText: edit.normalizedText,
                sourceUrl: link.sentence.sourceUrl,
              },
            },
            update: { text: edit.text },
            create: {
              text: edit.text,
              normalizedText: edit.normalizedText,
              translation: link.sentence.translation,
              audioFile: link.sentence.audioFile,
              source: link.sentence.source,
              sourceUrl: link.sentence.sourceUrl,
              sourceType: link.sentence.sourceType,
              sourceId: link.sentence.sourceId,
            },
          })

          if (targetSentence.id === link.sentenceId) {
            await tx.vocabularySentenceLink.update({
              where: { id: link.id },
              data: { posTags },
            })
            continue
          }

          const duplicateLink = await tx.vocabularySentenceLink.findUnique({
            where: {
              vocabularyId_sentenceId: {
                vocabularyId: vocabId,
                sentenceId: targetSentence.id,
              },
            },
          })
          if (duplicateLink) {
            await tx.vocabularySentenceLink.update({
              where: { id: duplicateLink.id },
              data: { posTags },
            })
            await tx.vocabularySentenceLink.delete({ where: { id: link.id } })
          } else {
            await tx.vocabularySentenceLink.update({
              where: { id: link.id },
              data: { sentenceId: targetSentence.id, posTags },
            })
          }

          const remainingLinks = await tx.vocabularySentenceLink.count({
            where: { sentenceId: link.sentenceId },
          })
          const grammarReferences = await tx.grammarExample.count({
            where: { sentenceId: link.sentenceId },
          })
          if (remainingLinks === 0 && grammarReferences === 0) {
            await tx.vocabularySentence.delete({
              where: { id: link.sentenceId },
            })
          }
        }
      }
      return true
    })
    if (!updated) return { success: false, message: '词条不存在' }

    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    revalidatePath('/reading')
    revalidatePath('/practice')
    invalidateVocabularyGroupsCache()
    return { success: true, word }
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
    const userId = await getCurrentUserId()
    const targetIds = Array.from(
      new Set(vocabIds.map(id => id.trim()).filter(Boolean)),
    )
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
      where: { userId, id: { in: targetIds } },
      select: {
        id: true,
        etymologies: true,
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
    revalidatePath('/reading')
    revalidatePath('/practice')
    invalidateVocabularyGroupsCache()
    return { success: true, updatedCount: rows.length }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '批量更新失败'
    return { success: false, message }
  }
}

export async function exportVocabularyCsvAdmin(wordbookId: string) {
  try {
    const userId = await getCurrentUserId()
    const wordbook = await prisma.wordbook.findFirst({
      where: { id: wordbookId.trim(), userId },
      select: {
        title: true,
        series: { select: { title: true } },
        entries: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            jlpt: true,
            vocabulary: {
              select: {
                id: true,
                word: true,
                sourceType: true,
                etymologies: true,
                pronunciations: true,
                partsOfSpeech: true,
                meanings: true,
                tags: { select: { tag: { select: { name: true } } } },
                sentenceLinks: {
                  orderBy: { createdAt: 'asc' },
                  select: {
                    posTags: true,
                    sentence: { select: { text: true } },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!wordbook) return { success: false as const, message: '词表不存在' }

    const csv = serializeVocabularyCsv(wordbook.entries.map(({ vocabulary, jlpt }) => {
      const pronunciations = parseJsonStringList(vocabulary.pronunciations)
      const sentenceColumns = serializeVocabularyCsvSentences(
        vocabulary.sentenceLinks.map(link => ({
          text: link.sentence.text,
          posTags: normalizeSentencePosTags(parseJsonStringList(link.posTags)),
        })),
      )
      return {
        词条ID: vocabulary.id,
        单词: vocabulary.word,
        语言: resolveVocabularyLanguageCode({
          word: vocabulary.word,
          pronunciations,
          sourceType: vocabulary.sourceType,
        }),
        注音: pronunciations.join(' | '),
        词源: parseJsonStringList(vocabulary.etymologies).join(' | '),
        词性: parseJsonStringList(vocabulary.partsOfSpeech).join(' | '),
        JLPT: jlpt || '',
        标签: filterVocabularyTags(vocabulary.tags.map(item => item.tag.name)).join(' | '),
        释义: parseJsonStringList(vocabulary.meanings).join(' | '),
        ...sentenceColumns,
      }
    }))
    return {
      success: true as const,
      csv,
      count: wordbook.entries.length,
      fileName: `${wordbook.series.title}-${wordbook.title}.csv`,
    }
  } catch (error) {
    console.error(error)
    return { success: false as const, message: '导出失败' }
  }
}

export async function importVocabularyCsvAdmin(wordbookId: string, csv: string) {
  try {
    const userId = await getCurrentUserId()
    if (csv.length > 8_000_000) {
      return { success: false as const, message: 'CSV 不能超过 8 MB' }
    }
    const wordbook = await prisma.wordbook.findFirst({
      where: { id: wordbookId.trim(), userId },
      select: { id: true },
    })
    if (!wordbook) return { success: false as const, message: '词表不存在' }

    const document = parseVocabularyCsvDocument(csv)
    const rows = document.rows
    const importsSentencePartsOfSpeech = document.headers.includes('例句词性')
    if (rows.length === 0) return { success: false as const, message: 'CSV 没有词条' }
    if (rows.length > 20_000) {
      return { success: false as const, message: '单次最多更新 20,000 条' }
    }
    const ids = rows.map(row => row.词条ID)
    if (new Set(ids).size !== ids.length) {
      return { success: false as const, message: 'CSV 中存在重复的词条ID' }
    }
    const owned = await prisma.wordbookVocabulary.findMany({
      where: {
        wordbookId: wordbook.id,
        vocabularyId: { in: ids },
        wordbook: { userId },
        vocabulary: { userId },
      },
      select: { vocabularyId: true },
    })
    const ownedIds = new Set(owned.map(item => item.vocabularyId))
    const unavailableCount = ids.filter(id => !ownedIds.has(id)).length
    if (unavailableCount > 0) {
      return {
        success: false as const,
        message: `${unavailableCount} 条不属于当前词表，未执行更新`,
      }
    }

    const sentenceLinks = importsSentencePartsOfSpeech
      ? await prisma.vocabularySentenceLink.findMany({
          where: {
            vocabularyId: { in: ids },
            vocabulary: { userId },
          },
          select: {
            id: true,
            vocabularyId: true,
            sentence: { select: { text: true } },
          },
        })
      : []
    const sentenceLinksByVocabularyId = new Map<
      string,
      typeof sentenceLinks
    >()
    sentenceLinks.forEach(link => {
      const links = sentenceLinksByVocabularyId.get(link.vocabularyId) || []
      links.push(link)
      sentenceLinksByVocabularyId.set(link.vocabularyId, links)
    })
    let unmatchedSentenceCount = 0
    const updates = rows.map(row => {
      const rawTags = splitVocabularyCsvList(row.标签)
        .slice(0, 50)
        .map(tag => tag.slice(0, 120))
      const sentenceUpdates = importsSentencePartsOfSpeech
        ? parseVocabularyCsvSentences(row.例句, row.例句词性).map(sentence => {
            const linkIds = (sentenceLinksByVocabularyId.get(row.词条ID) || [])
              .filter(link =>
                normalizeVocabularyCsvSentenceText(link.sentence.text) ===
                  sentence.text,
              )
              .map(link => link.id)
            if (linkIds.length === 0) unmatchedSentenceCount += 1
            return {
              linkIds,
              posTags: normalizeSentencePosTags(sentence.posTags),
            }
          })
        : []
      return {
        id: row.词条ID,
        word: row.单词.slice(0, 500),
        pronunciations: splitVocabularyCsvList(row.注音).slice(0, 50),
        etymologies: document.headers.includes('词源') ? splitVocabularyCsvList(row.词源).slice(0, 50) : undefined,
        partsOfSpeech: splitVocabularyCsvPartsOfSpeech(row.词性).slice(0, 50),
        // Older exports stored N1–N5 in 标签. Accept them once as a
        // compatibility input, then persist the value on this wordbook entry.
        jlpt:
          normalizeVocabularyJlpt(row.JLPT) ||
          rawTags.map(normalizeVocabularyJlpt).find(Boolean) ||
          null,
        tags: filterVocabularyTags(rawTags),
        meanings: splitVocabularyCsvList(row.释义).slice(0, 50).map(item => item.slice(0, 5_000)),
        sentenceUpdates,
      }
    })
    if (unmatchedSentenceCount > 0) {
      return {
        success: false as const,
        message: `${unmatchedSentenceCount} 条例句不属于对应词条，未执行更新`,
      }
    }
    const tagNames = normalizeStringList(updates.flatMap(row => row.tags))
    if (tagNames.length > 0) {
      await prisma.vocabularyTag.createMany({
        data: tagNames.map(name => ({ userId, name })),
        skipDuplicates: true,
      })
    }
    const tags = tagNames.length > 0
      ? await prisma.vocabularyTag.findMany({
          where: { userId, name: { in: tagNames } },
          select: { id: true, name: true },
        })
      : []
    const tagIds = new Map(tags.map(tag => [tag.name, tag.id]))

    for (let offset = 0; offset < updates.length; offset += 200) {
      const chunk = updates.slice(offset, offset + 200)
      const operations: Prisma.PrismaPromise<unknown>[] = chunk.map(row =>
        prisma.vocabulary.updateMany({
          where: {
            id: row.id,
            userId,
            wordbooks: { some: { wordbookId: wordbook.id } },
          },
          data: {
            word: row.word,
            normalizedWord: normalizeVocabularyWord(row.word),
            pronunciations: toJsonStringList(row.pronunciations),
            ...(row.etymologies !== undefined ? { etymologies: toJsonStringList(row.etymologies) } : {}),
            partsOfSpeech: toJsonStringList(row.partsOfSpeech),
            meanings: toJsonStringList(row.meanings),
          },
        }),
      )
      operations.push(...chunk.map(row =>
        prisma.wordbookVocabulary.updateMany({
          where: {
            wordbookId: wordbook.id,
            vocabularyId: row.id,
            wordbook: { userId },
            vocabulary: { userId },
          },
          data: { jlpt: row.jlpt },
        }),
      ))
      operations.push(...chunk.flatMap(row =>
        row.sentenceUpdates
          .filter(sentence => sentence.linkIds.length > 0)
          .map(sentence =>
            prisma.vocabularySentenceLink.updateMany({
              where: {
                id: { in: sentence.linkIds },
                vocabularyId: row.id,
                vocabulary: { userId },
              },
              data: { posTags: toJsonStringList(sentence.posTags) },
            }),
          ),
      ))
      operations.push(prisma.vocabularyTagOnVocabulary.deleteMany({
        where: { vocabularyId: { in: chunk.map(row => row.id) } },
      }))
      const links = chunk.flatMap(row => row.tags.flatMap(name => {
        const tagId = tagIds.get(name)
        return tagId ? [{ vocabularyId: row.id, tagId }] : []
      }))
      if (links.length > 0) {
        operations.push(prisma.vocabularyTagOnVocabulary.createMany({
          data: links,
          skipDuplicates: true,
        }))
      }
      await prisma.$transaction(operations)
    }

    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    revalidatePath(`/vocabulary/wordbooks/${wordbook.id}`)
    revalidatePath('/reading')
    revalidatePath('/practice')
    invalidateVocabularyGroupsCache()
    return { success: true as const, updatedCount: updates.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : '上传更新失败'
    return { success: false as const, message }
  }
}

export async function getVocabularyMergePreviewAdmin() {
  const userId = await getCurrentUserId()
  const rows = await prisma.vocabulary.findMany({
    where: { userId },
    select: {
      id: true,
      word: true,
      etymologies: true,
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
  const duplicateCount = groups.reduce(
    (sum, group) => sum + group.mergeIds.length,
    0,
  )
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
    const userId = await getCurrentUserId()
    const uniqMergeIds = Array.from(
      new Set(mergeIds.filter(id => id !== keepId)),
    )
    if (uniqMergeIds.length === 0) return { success: true, mergedCount: 0 }

    await prisma.$transaction(async tx => {
      const all = await tx.vocabulary.findMany({
        where: { userId, id: { in: [keepId, ...uniqMergeIds] } },
        include: { sentenceLinks: true, wordbooks: true },
      })

      const keep = all.find(item => item.id === keepId)
      if (!keep) throw new Error('保留词条不存在')
      const sources = all.filter(item => item.id !== keepId)

      const mergedPronunciations = normalizeStringList([
        ...parseJsonStringList(keep.pronunciations),
        ...sources.flatMap(item => parseJsonStringList(item.pronunciations)),
      ])
      const mergedEtymologies = splitJapaneseEtymologies(keep.word, [], all.flatMap(row => parseJsonStringList(row.etymologies))).etymologies
      const mergedPartsOfSpeech = normalizeStringList([
        ...parseJsonStringList(keep.partsOfSpeech),
        ...sources.flatMap(item => parseJsonStringList(item.partsOfSpeech)),
      ])
      const mergedMeanings = normalizeStringList([
        ...parseJsonStringList(keep.meanings),
        ...sources.flatMap(item => parseJsonStringList(item.meanings)),
      ])

      await tx.vocabulary.update({
        where: { id: keepId },
        data: {
          pronunciations: toJsonStringList(mergedPronunciations),
          etymologies: toJsonStringList(mergedEtymologies),
          partsOfSpeech: toJsonStringList(mergedPartsOfSpeech),
          meanings: toJsonStringList(mergedMeanings),
        },
      })

      for (const source of sources) {
        for (const entry of source.wordbooks) {
          await tx.wordbookVocabulary.upsert({
            where: {
              wordbookId_vocabularyId: {
                wordbookId: entry.wordbookId,
                vocabularyId: keepId,
              },
            },
            update: {},
            create: {
              wordbookId: entry.wordbookId,
              vocabularyId: keepId,
              jlpt: entry.jlpt,
              sortOrder: entry.sortOrder,
            },
          })
        }
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
                existed.meaningIndex == null
                  ? link.meaningIndex
                  : existed.meaningIndex,
              posTags: toJsonStringList(mergedTags),
            },
          })
        }
      }

      await tx.vocabulary.deleteMany({
        where: { userId, id: { in: uniqMergeIds } },
      })
    })

    revalidatePath('/manage/vocabulary')
    revalidatePath('/vocabulary')
    revalidatePath('/reading')
    revalidatePath('/practice')
    invalidateVocabularyGroupsCache()
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
