'use server'

import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { parseJsonStringList, toJsonStringList } from '@/utils/text/jsonList'
import { sanitizePronunciations } from '@/utils/text/pronunciation'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'
import { normalizeSentencePosTags } from './server/repository'

export type VocabularyDefinitionDraft = {
  language: 'ZH' | 'JA'
  dictionaryName: string
  definition: string
}

export type VocabularyInspectorData = {
  id: string
  word: string
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  wordAudio: string | null
  sentences: Array<{
    text: string
    translation: string | null
    source: string
    posTags: string[]
  }>
  memberships: Array<{ id: string; label: string }>
  availableWordbooks: Array<{ id: string; label: string }>
  definitions: Array<VocabularyDefinitionDraft & { id: string }>
}

const normalizeList = (values: string[], limit = 20) =>
  Array.from(
    new Set(
      values
        .map(value => value.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ),
  ).slice(0, limit)

const wordbookLabel = (wordbook: { title: string; series: { title: string } }) =>
  [wordbook.series.title, wordbook.title].filter(Boolean).join(' / ')

export async function getVocabularyInspectorData(word: string) {
  const userId = await getCurrentUserId()
  const normalizedWord = word.normalize('NFKC').trim()
  if (!normalizedWord) {
    return { success: false as const, message: '单词为空' }
  }

  const [vocabulary, wordbooks] = await Promise.all([
    prisma.vocabulary.findFirst({
      where: { userId, word: { equals: normalizedWord, mode: 'insensitive' } },
      select: {
        id: true,
        word: true,
        pronunciations: true,
        partsOfSpeech: true,
        meanings: true,
        wordAudio: true,
        definitions: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            language: true,
            dictionaryName: true,
            definition: true,
          },
        },
        sentenceLinks: {
          orderBy: { createdAt: 'desc' },
          select: {
            posTags: true,
            meaningIndex: true,
            sentence: {
              select: {
                text: true,
                translation: true,
                source: true,
                sourceUrl: true,
                sourceType: true,
              },
            },
          },
        },
        wordbooks: {
          select: {
            wordbook: {
              select: {
                id: true,
                title: true,
                series: { select: { title: true } },
              },
            },
          },
        },
      },
    }),
    prisma.wordbook.findMany({
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
        series: { select: { title: true } },
      },
    }),
  ])

  if (!vocabulary) {
    return { success: false as const, message: '没有找到这个单词的收藏记录' }
  }
  return {
    success: true as const,
    data: {
      id: vocabulary.id,
      word: vocabulary.word,
      pronunciations: parseJsonStringList(vocabulary.pronunciations),
      partsOfSpeech: parseJsonStringList(vocabulary.partsOfSpeech),
      meanings: parseJsonStringList(vocabulary.meanings),
      wordAudio: vocabulary.wordAudio || null,
      sentences: dedupeAndRankSentences(
        vocabulary.sentenceLinks.map(link => ({
          text: link.sentence.text.trim(),
          translation: link.sentence.translation?.trim() || null,
          source: link.sentence.source.trim(),
          sourceUrl: link.sentence.sourceUrl,
          sourceType: link.sentence.sourceType,
          meaningIndex: link.meaningIndex,
          posTags: normalizeSentencePosTags(parseJsonStringList(link.posTags)),
        })),
        12,
      ).map(({ text, translation, source, posTags }) => ({
        text,
        translation,
        source,
        posTags,
      })),
      memberships: vocabulary.wordbooks.map(({ wordbook }) => ({
        id: wordbook.id,
        label: wordbookLabel(wordbook),
      })),
      availableWordbooks: wordbooks.map(wordbook => ({
        id: wordbook.id,
        label: wordbookLabel(wordbook),
      })),
      definitions: vocabulary.definitions.flatMap(definition =>
        definition.language === 'ZH' || definition.language === 'JA'
          ? [{ ...definition, language: definition.language }]
          : [],
      ),
    } satisfies VocabularyInspectorData,
  }
}

export async function updateVocabularyFromInspector(input: {
  id: string
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
      select: { id: true, word: true, wordAudio: true },
    })
    if (!vocabulary) {
      return { success: false as const, message: '单词不存在或无权编辑' }
    }

    const pronunciations = sanitizePronunciations(
      vocabulary.word,
      normalizeList(input.pronunciations),
    )
    const partsOfSpeech = normalizeList(input.partsOfSpeech)
    const meanings = normalizeList(input.meanings, 50)
    const definitions = input.definitions
      .flatMap(definition => {
        const language = definition.language === 'JA' ? 'JA' : 'ZH'
        const dictionaryName = definition.dictionaryName
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120)
        const text = definition.definition.trim().slice(0, 5_000)
        return text ? [{ language, dictionaryName, definition: text }] : []
      })
      .slice(0, 50)
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

    await prisma.$transaction(async tx => {
      await tx.vocabulary.update({
        where: { id: vocabulary.id },
        data: {
          pronunciations: toJsonStringList(pronunciations),
          partsOfSpeech: toJsonStringList(partsOfSpeech),
          meanings: toJsonStringList(meanings),
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
        where: { vocabularyId: vocabulary.id },
      })
      if (definitions.length > 0) {
        await tx.vocabularyDefinition.createMany({
          data: definitions.map((definition, sortOrder) => ({
            vocabularyId: vocabulary.id,
            language: definition.language,
            dictionaryName: definition.dictionaryName,
            definition: definition.definition,
            sortOrder,
          })),
        })
      }
    })

    revalidatePath('/vocabulary')
    revalidatePath('/reading')
    return {
      success: true as const,
      message: '单词信息已更新',
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
