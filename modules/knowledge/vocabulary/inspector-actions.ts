'use server'

import { normalizeInspectorDefinitions, type InspectorDefinition } from './domain/inspector-definitions'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { invalidateVocabularyGroupsCache } from './server/repository'
import { toJsonStringList } from '@/utils/text/jsonList'
import { sanitizePronunciations } from '@/utils/text/pronunciation'
import { Prisma } from '@prisma/client'
import { computeSingleVocabularyPronunciation } from './server/pronunciation-service'
import { PRONUNCIATION_VERSION } from './domain/pronunciation'
import { hasJapanese } from '@/modules/language/domain/text'
import type { VocabularyInspectorEntryDraft } from './domain/inspector-entry'
import { executeAction } from '@/lib/actions/result'
import {
  findVocabularyInspectorData,
  updateFullVocabularyFromInspector as persistFullVocabularyFromInspector,
} from './server/inspector-entry-service'

export type VocabularyDefinitionDraft = InspectorDefinition

export type VocabularyInspectorData = {
  id: string
  word: string
  etymologies?: string[]
  pronunciations: string[]
  partsOfSpeech: string[]
  tags: string[]
  meanings: string[]
  expressions: Array<{ id: string; type: string; text: string; reading: string | null; meaning: string | null; senseOrder: number }>
  relations: Array<{ id: string; type: string; text: string; reading: string | null; senseOrder: number | null }>
  structured: boolean
  wordAudio: string | null
  sentences: Array<{
    text: string
    translation: string | null
    audioFile: string | null
    source: string
    posTags: string[]
  }>
  memberships: Array<{ id: string; label: string }>
  availableWordbooks: Array<{ id: string; label: string }>
  definitions: Array<VocabularyDefinitionDraft & { id: string }>
  entry: VocabularyInspectorEntryDraft
}

const normalizeList = (values: string[], limit = 20) =>
  Array.from(
    new Set(
      values
        .map(value => value.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)

export async function getVocabularyInspectorData(
  word: string,
  wordbookId?: string,
) {
  const userId = await getCurrentUserId()
  const normalizedWord = word.normalize('NFKC').trim()
  if (!normalizedWord) {
    return { success: false as const, message: '单词为空' }
  }
  const data = await findVocabularyInspectorData(userId, normalizedWord, wordbookId)
  if (!data) {
    return { success: false as const, message: '没有找到这个单词的收藏记录' }
  }
  return { success: true as const, data }
}

export async function updateFullVocabularyFromInspector(input: unknown) {
  return executeAction(
    async () => {
      const userId = await getCurrentUserId()
      return persistFullVocabularyFromInspector(userId, input)
    },
    { successMessage: '词条已保存', fallbackMessage: '词条保存失败，请保留当前内容后重试' },
  )
}

export async function updateVocabularyFromInspector(input: {
  id: string
  etymologies?: string[]
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  wordbookIds: string[]
  definitions: VocabularyDefinitionDraft[]
}) {
  try {
    const userId = await getCurrentUserId()
    const vocabulary = await prisma.vocabulary.findFirst({
      where: { id: input.id.trim(), userId },
      select: { id: true, word: true, wordAudio: true, senses: { orderBy: { order: 'asc' }, select: { id: true } }, definitions: { select: { id: true, senseId: true } } },
    })
    if (!vocabulary) {
      return { success: false as const, message: '单词不存在或无权编辑' }
    }

    const pronunciations = sanitizePronunciations(
      vocabulary.word,
      normalizeList(input.pronunciations),
    )
    const partsOfSpeech = normalizeList(input.partsOfSpeech)
    let meanings = normalizeList(input.meanings, 50)
    const definitions = normalizeInspectorDefinitions(input.definitions)
    const ownedDefinitions = new Map(vocabulary.definitions.map(item => [item.id, item]))
    const ids = definitions.flatMap(item => item.id ? [item.id] : [])
    if (new Set(ids).size !== ids.length || ids.some(id => !ownedDefinitions.has(id))) {
      return { success: false as const, message: '定义已变化，请重新打开后编辑。' }
    }
    if (vocabulary.senses.length) {
      meanings = definitions.filter(item => /^zh(?:-|$)/i.test(item.language)).map(item => item.definition)
    }
    const requestedWordbookIds = Array.from(
      new Set(input.wordbookIds.map(id => id.trim()).filter(Boolean)),
    )
    const ownedWordbooks = requestedWordbookIds.length
      ? await prisma.wordbook.findMany({
          where: { id: { in: requestedWordbookIds }, userId },
          select: { id: true },
        })
      : []
    const wordbookIds = ownedWordbooks.map(wordbook => wordbook.id)

    const primaryPron = pronunciations[0] || null
    const computedPronData = hasJapanese(vocabulary.word)
      ? await computeSingleVocabularyPronunciation(vocabulary.word, primaryPron)
      : null

    const savedDefinitions = await prisma.$transaction(async tx => {
      await tx.vocabulary.update({
        where: { id: vocabulary.id },
        data: {
          pronunciations: toJsonStringList(pronunciations),
          partsOfSpeech: toJsonStringList(partsOfSpeech),
          meanings: toJsonStringList(meanings),
          pronunciationData: computedPronData
            ? (computedPronData as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          pronunciationVersion: computedPronData ? PRONUNCIATION_VERSION : null,
        },
      })
      await tx.wordbookVocabulary.deleteMany({
        where: {
          vocabularyId: vocabulary.id,
          ...(wordbookIds.length > 0
            ? { wordbookId: { notIn: wordbookIds } }
            : {}),
        },
      })
      if (wordbookIds.length > 0) {
        await tx.wordbookVocabulary.createMany({
          data: wordbookIds.map(wordbookId => ({
            vocabularyId: vocabulary.id,
            wordbookId,
          })),
          skipDuplicates: true,
        })
      }
      await tx.vocabularyDefinition.deleteMany({
        where: { vocabularyId: vocabulary.id, id: { notIn: ids } },
      })
      for (const [sortOrder, definition] of definitions.entries()) {
        const { id, ...fields } = definition
        if (id) {
          await tx.vocabularyDefinition.update({
            where: { id, vocabularyId: vocabulary.id },
            data: { ...fields, sortOrder },
          })
        } else {
          await tx.vocabularyDefinition.create({
            data: { ...fields, vocabularyId: vocabulary.id, senseId: vocabulary.senses[0]?.id || null, sortOrder },
          })
        }
      }
      return tx.vocabularyDefinition.findMany({
        where: { vocabularyId: vocabulary.id },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, language: true, dictionaryName: true, definition: true },
      })
    })

    revalidatePath('/vocabulary')
    revalidatePath('/reading')
    invalidateVocabularyGroupsCache()
    return {
      success: true as const,
      message: '单词信息已更新',
      definitions: savedDefinitions,
      meta: {
        pronunciations,
        partsOfSpeech,
        meanings,
        wordAudio: vocabulary.wordAudio || null,
      },
    }
  } catch (error) {
    console.error('更新正文单词信息失败:', error)
    return { success: false as const, message: '保存失败，请重试' }
  }
}
