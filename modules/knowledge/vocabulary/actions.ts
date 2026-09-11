// Vocabulary and wordbook server actions.
'use server'

import {
  CollectionType,
  MaterialType,
  Prisma,
  QuestionType,
  SourceType,
} from '@prisma/client'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { invalidateVocabularyGroupsCache } from './server/repository'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { parseJsonStringList, toJsonStringList } from '@/utils/text/jsonList'
import {
  normalizeVocabularyHeadword,
} from '@/utils/vocabulary/vocabularyCanonical'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'
import {
  sanitizePronunciation,
  sanitizePronunciations,
} from '@/utils/text/pronunciation'
import {
  findExistingVocabularyCandidate,
  findSentenceLinkByText,
  listVocabularySentenceRecords,
  resolveAudioDialogueSentenceText,
  resolveVocabularySourceMeta,
  upsertVocabularySentenceLink,
} from './server/repository'
import type { VocabularySentenceRecord } from './server/repository'
import { extractSentenceContainingSelection } from '@/utils/text/sentenceContext'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import {
  buildCompletedQuestionText,
  buildCompletedSortingText,
} from '@/modules/practice/domain/question-text'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { filterVocabularyTags } from './domain/jlpt'
import {
  buildJapaneseVocabularySearchTerms,
  containsJapaneseVocabularyMatch,
} from '@/utils/vocabulary/japaneseInflection'
import { computeSingleVocabularyPronunciation } from './server/pronunciation-service'
import { PRONUNCIATION_VERSION } from './domain/pronunciation'
import { hasJapanese } from '@/modules/language/domain/text'
import { normalizeVocabularyWord } from './domain/normalized-word'
import { normalizeVocabularySentencePosTags } from './domain/sentence-pos-tags'
import { listVocabularyMeanings } from './domain/meanings'



export async function saveVocabulary(
  word: string,
  originalSelectedText: string,
  contextSentence: string,
  sourceType: SourceType,
  sourceId: string,
  pronunciations: string[],
  meanings?: string[],
  partsOfSpeech: string[] = [],
) {
  try {
    const userId = await getCurrentUserId()
    const trimmedWord = word.trim()
    if (!trimmedWord) return { success: false, message: '单词为空' }
    const canonicalAudioSentence =
      sourceType === SourceType.AUDIO_DIALOGUE
        ? await resolveAudioDialogueSentenceText(sourceId)
        : ''
    const normalizedContextSentence =
      canonicalAudioSentence ||
      extractSentenceContainingSelection(contextSentence, trimmedWord) ||
      extractSentenceContainingSelection(contextSentence, originalSelectedText)
    const sourceMeta = await resolveVocabularySourceMeta(sourceType, sourceId)

    const normalizedPronunciations = sanitizePronunciations(
      trimmedWord,
      pronunciations,
    )
    const normalizedPrimaryPronunciation = sanitizePronunciation(
      trimmedWord,
      normalizedPronunciations[0] || '',
    )
    const normalizedPartsOfSpeech = Array.from(
      new Set(
        partsOfSpeech
          .map(item => item.trim())
          .filter(Boolean),
      ),
    )
    const normalizedWord = normalizeVocabularyHeadword(
      trimmedWord,
      normalizedPartsOfSpeech,
    )
    const normalizedMeanings = Array.from(
      new Set((meanings || []).map(item => item.trim()).filter(Boolean)),
    )

    let candidate = await prisma.vocabulary.findFirst({
      where: { userId, word: normalizedWord },
      select: { id: true },
    })

    if (!candidate) {
      candidate = await findExistingVocabularyCandidate(normalizedWord)
    }

    if (candidate) {
      const exists = await prisma.vocabulary.findFirst({
        where: { id: candidate.id, userId },
        include: {
          senses: {
            orderBy: { order: 'asc' },
            include: { definitions: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      })
      if (!exists) return { success: false, message: '单词不存在' }
      const mergedPronunciations = toJsonStringList([
        normalizedPrimaryPronunciation,
        ...normalizedPronunciations,
        ...sanitizePronunciations(
          trimmedWord,
          parseJsonStringList(exists.pronunciations),
        ),
      ])
      const existingMeanings = listVocabularyMeanings(exists.senses)
      const meaningsToCreate = normalizedMeanings.filter(
        meaning => !existingMeanings.includes(meaning),
      )
      const mergedPartsOfSpeech = toJsonStringList([
        ...normalizedPartsOfSpeech,
        ...parseJsonStringList(exists.partsOfSpeech),
      ])
      const newSentence: Omit<VocabularySentenceRecord, 'senseId'> | null =
        normalizedContextSentence
          ? {
              text: normalizedContextSentence,
              source: sourceMeta.source,
              sourceUrl: sourceMeta.sourceUrl,
              posTags: normalizeVocabularySentencePosTags(normalizedPartsOfSpeech),
            }
          : null
      const existedLink = newSentence
        ? await findSentenceLinkByText(exists.id, newSentence.text)
        : null

      let firstSenseId = exists.senses[0]?.id
      await prisma.$transaction(async tx => {
        await tx.vocabulary.update({
          where: { id: exists.id },
          data: {
            pronunciations: mergedPronunciations,
            partsOfSpeech: mergedPartsOfSpeech,
          },
        })
        let nextOrder = exists.senses.length
        if (!firstSenseId && meaningsToCreate.length === 0) {
          const sense = await tx.vocabularySense.create({
            data: { vocabularyId: exists.id, order: nextOrder },
          })
          firstSenseId = sense.id
          nextOrder += 1
        }
        for (const meaning of meaningsToCreate) {
          const sense = await tx.vocabularySense.create({
            data: { vocabularyId: exists.id, order: nextOrder },
          })
          firstSenseId ||= sense.id
          await tx.vocabularyDefinition.create({
            data: {
              vocabularyId: exists.id,
              senseId: sense.id,
              language: 'zh',
              dictionaryName: '用户录入',
              definition: meaning,
              sortOrder: 0,
            },
          })
          nextOrder += 1
        }
      })
      const mergedMeta: VocabularyMeta = {
        pronunciations: parseJsonStringList(mergedPronunciations),
        partsOfSpeech: parseJsonStringList(mergedPartsOfSpeech),
        meanings: [...existingMeanings, ...meaningsToCreate],
        wordAudio: exists.wordAudio || null,
      }
      if (newSentence && !existedLink && firstSenseId) {
        await upsertVocabularySentenceLink(exists.id, {
          text: newSentence.text,
          source: newSentence.source,
          sourceUrl: newSentence.sourceUrl,
          sourceType,
          sourceId,
          senseId: firstSenseId,
          posTags: newSentence.posTags || [],
        })
      }

      if (newSentence && !existedLink) {
        return {
          success: true,
          state: 'already_exists',
          message: '已在生词本中，已追加例句',
          word: exists.word,
          meta: mergedMeta,
        }
      }
      return {
        success: true,
        state: 'already_exists',
        message: '已在生词本中',
        word: exists.word,
        meta: mergedMeta,
      }
    }

    let pronunciationData: Prisma.InputJsonValue | undefined = undefined
    if (hasJapanese(normalizedWord)) {
      const computed = await computeSingleVocabularyPronunciation(
        normalizedWord,
        normalizedPrimaryPronunciation,
      )
      if (computed) {
        pronunciationData = computed as unknown as Prisma.InputJsonValue
      }
    }

    const created = await prisma.$transaction(async tx => {
      const vocabulary = await tx.vocabulary.create({
        data: {
          userId,
          word: normalizedWord,
          normalizedWord: normalizeVocabularyWord(normalizedWord),
          sourceType,
          sourceId,
          pronunciations: toJsonStringList([
            ...normalizedPronunciations,
          ]),
          partsOfSpeech: toJsonStringList(normalizedPartsOfSpeech),
          pronunciationData,
          pronunciationVersion: pronunciationData ? PRONUNCIATION_VERSION : null,
        },
      })
      const meaningsForSenses = normalizedMeanings.length
        ? normalizedMeanings
        : [null]
      let firstSenseId = ''
      for (const [order, meaning] of meaningsForSenses.entries()) {
        const sense = await tx.vocabularySense.create({
          data: { vocabularyId: vocabulary.id, order },
        })
        firstSenseId ||= sense.id
        if (meaning) {
          await tx.vocabularyDefinition.create({
            data: {
              vocabularyId: vocabulary.id,
              senseId: sense.id,
              language: 'zh',
              dictionaryName: '用户录入',
              definition: meaning,
              sortOrder: 0,
            },
          })
        }
      }
      return { ...vocabulary, firstSenseId }
    })
    if (normalizedContextSentence) {
      await upsertVocabularySentenceLink(created.id, {
        text: normalizedContextSentence,
        source: sourceMeta.source,
        sourceUrl: sourceMeta.sourceUrl,
        sourceType,
        sourceId,
        senseId: created.firstSenseId,
        posTags: normalizeVocabularySentencePosTags(normalizedPartsOfSpeech),
      })
    }

    invalidateVocabularyGroupsCache()
    return {
      success: true,
      state: 'success',
      message: '已收藏至生词本',
      word: created.word,
      meta: {
        pronunciations: parseJsonStringList(created.pronunciations),
        partsOfSpeech: parseJsonStringList(created.partsOfSpeech),
        meanings: normalizedMeanings,
        wordAudio: created.wordAudio || null,
      } satisfies VocabularyMeta,
    }
  } catch (error) {
    console.error(error)
    return { success: false, state: 'error', message: '保存失败' }
  }
}

export async function deleteVocabulary(id: string) {
  try {
    const userId = await getCurrentUserId()
    const deleted = await prisma.vocabulary.deleteMany({ where: { id, userId } })
    if (deleted.count === 0) return { success: false, message: '单词不存在' }
    revalidatePath('/vocabulary')
    revalidatePath('/reading')
    invalidateVocabularyGroupsCache()
    return { success: true, message: '删除成功' }
  } catch (error) {
    console.error(error)
    return { success: false, message: '删除失败' }
  }
}

export async function searchSentencesForWord(
  word: string,
  partsOfSpeech: string[] = [],
  matchVariants: string[] = [],
) {
  try {
    const searchTerms = buildJapaneseVocabularySearchTerms(
      word,
      partsOfSpeech,
      matchVariants,
    )
    if (searchTerms.length === 0) return { success: true, data: [] }
    const articleTextFilters: Prisma.MaterialWhereInput[] = searchTerms.flatMap(
      term => [
        {
          contentPayload: {
            path: ['text'],
            string_contains: term,
          },
        },
        {
          contentPayload: {
            path: ['transcript'],
            string_contains: term,
          },
        },
      ],
    )
    const questionTextConditions = searchTerms.map(term => Prisma.sql`
      STRPOS(LOWER(COALESCE(q."prompt", '')), LOWER(${term})) > 0
      OR STRPOS(LOWER(COALESCE(q."context", '')), LOWER(${term})) > 0
    `)
    const questionAnswerConditions = searchTerms.map(term => Prisma.sql`
      STRPOS(LOWER(COALESCE(q."options"::text, '')), LOWER(${term})) > 0
      OR STRPOS(LOWER(COALESCE(q."answer"::text, '')), LOWER(${term})) > 0
    `)
    const additionalVariantSet = new Set(matchVariants.slice(1))
    const includesSearchTerm = (text: string) =>
      searchTerms.some(term =>
        containsJapaneseVocabularyMatch(
          text,
          term,
          additionalVariantSet.has(term),
        ),
      )
    const [articles, questionCandidates] = await Promise.all([
      prisma.material.findMany({
        where: {
          type: MaterialType.READING,
          OR: articleTextFilters,
        },
        select: {
          id: true,
          title: true,
          contentPayload: true,
          collectionMaterials: {
            where: {
              collection: { collectionType: CollectionType.PAPER },
            },
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: {
              collection: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 32,
      }),
      prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT q."id"
        FROM "questions" AS q
        WHERE
          (${Prisma.join(questionTextConditions, ' OR ')})
          OR (
            q."question_type"::text IN (
              'GRAMMAR',
              'GRAMMAR_SELECTION',
              'SORTING'
            )
            AND (
              ${Prisma.join(questionAnswerConditions, ' OR ')}
            )
          )
        ORDER BY q."updated_at" DESC
        LIMIT 48
      `),
    ])

    const questionIds = questionCandidates.map(item => item.id)
    const questions = questionIds.length
      ? await prisma.question.findMany({
          where: { id: { in: questionIds } },
          select: {
            id: true,
            questionType: true,
            prompt: true,
            context: true,
            options: true,
            answer: true,
            content: true,
            material: {
              select: {
                id: true,
                title: true,
                type: true,
                collectionMaterials: {
                  where: {
                    collection: { collectionType: CollectionType.PAPER },
                  },
                  orderBy: { sortOrder: 'asc' },
                  take: 1,
                  select: {
                    collection: { select: { id: true, title: true } },
                  },
                },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : []

    const results: {
      text: string
      source: string
      sourceUrl: string
      sourceType?: SourceType
    }[] = []
    articles.forEach(article => {
      const payload = decodeMaterialPayloadRecord(
        MaterialType.READING,
        article.contentPayload,
      )
      const articleText = String(payload.text || '')
      const parts = articleText.match(/[^。！？.!\?\n]+[。！？.!\?\n]*/g) || [
        articleText,
      ]
      parts.forEach(p => {
        const t = p.trim()
        if (includesSearchTerm(t) && t.length > 5) {
          const paper = article.collectionMaterials[0]?.collection
          results.push({
            text: t,
            source: paper ? `试卷：${paper.title}` : `阅读：${article.title}`,
            sourceUrl: paper
              ? `/practice/${paper.id}`
              : `/reading/articles/${article.id}`,
            sourceType: 'ARTICLE_TEXT',
          })
        }
      })
    })

    questions.forEach(q => {
      const content = decodeQuestionContent(q.content)
      const t =
        q.questionType === QuestionType.GRAMMAR ||
        q.questionType === QuestionType.GRAMMAR_SELECTION
          ? buildCompletedQuestionText(q.prompt, q.options, q.answer)
          : q.questionType === QuestionType.SORTING
            ? buildCompletedSortingText(
                q.prompt,
                q.options,
                content.sortingOrder,
              )
            : (q.context || q.prompt || '').trim()
      if (includesSearchTerm(t) && t.length > 5) {
        const paper = q.material?.collectionMaterials[0]?.collection
        results.push({
          text: t,
          source: paper
            ? `试卷：${paper.title}`
            : `题目：${q.material?.title || '练习题'}`,
          sourceUrl: paper ? `/practice/${paper.id}` : '/practice/custom',
          sourceType: 'QUIZ_QUESTION',
        })
      }
    })

    return { success: true, data: dedupeAndRankSentences(results, 12) }
  } catch {
    return { success: false, data: [] }
  }
}

export async function addVocabularySentence(
  id: string,
  newSentenceObj: { text: string; source: string; sourceUrl: string },
  senseId: string,
) {
  try {
    const userId = await getCurrentUserId()
    const vocab = await prisma.vocabulary.findFirst({
      where: { id, userId },
      select: {
        id: true,
        senses: { where: { id: senseId }, select: { id: true } },
      },
    })
    if (!vocab) return { success: false, message: '单词不存在' }
    if (vocab.senses.length === 0) {
      return { success: false, message: '义项不存在' }
    }

    const normalizedSentence: VocabularySentenceRecord = {
      text: newSentenceObj.text.trim(),
      source: newSentenceObj.source.trim() || '未知来源',
      sourceUrl: newSentenceObj.sourceUrl.trim() || '#',
      senseId,
      posTags: [],
    }
    if (!normalizedSentence.text) {
      return { success: false, message: '例句为空' }
    }
    const existed = await findSentenceLinkByText(id, normalizedSentence.text)
    if (existed) {
      return {
        success: true,
        message: '例句已存在',
        sentences: await listVocabularySentenceRecords(id),
      }
    }
    await upsertVocabularySentenceLink(id, {
      text: normalizedSentence.text,
      source: normalizedSentence.source,
      sourceUrl: normalizedSentence.sourceUrl,
      senseId,
      posTags: [],
    })
    return {
      success: true,
      message: '例句已添加',
      sentences: await listVocabularySentenceRecords(id),
    }
  } catch {
    return { success: false, message: '添加失败' }
  }
}

export async function updateVocabularyTags(
  vocabId: string,
  tagNames: string[],
) {
  try {
    const userId = await getCurrentUserId()
    if (!vocabId) {
      return { success: false, message: '缺少词汇 ID' }
    }

    const normalizedTags = filterVocabularyTags(Array.from(
      new Set(tagNames.map(tag => tag.trim()).filter(Boolean)),
    ))

    const ownedVocabulary = await prisma.vocabulary.findFirst({
      where: { id: vocabId, userId },
      select: { id: true },
    })
    if (!ownedVocabulary) return { success: false, message: '单词不存在' }

    await prisma.$transaction(async tx => {
      await tx.vocabularyTagOnVocabulary.deleteMany({
        where: { vocabularyId: vocabId },
      })

      if (normalizedTags.length === 0) return

      await Promise.all(
        normalizedTags.map(name =>
          tx.vocabularyTag.upsert({
            where: { userId_name: { userId, name } },
            update: {},
            create: { userId, name },
          }),
        ),
      )

      const tags = await tx.vocabularyTag.findMany({
        where: {
          userId,
          name: { in: normalizedTags },
        },
        select: { id: true },
      })

      if (tags.length === 0) return

      await Promise.all(
        tags.map(tag =>
          tx.vocabularyTagOnVocabulary.upsert({
            where: {
              vocabularyId_tagId: {
                vocabularyId: vocabId,
                tagId: tag.id,
              },
            },
            update: {},
            create: { vocabularyId: vocabId, tagId: tag.id },
          }),
        ),
      )
    })

    revalidatePath('/vocabulary')
    invalidateVocabularyGroupsCache()
    return { success: true }
  } catch (error) {
    console.error('updateVocabularyTags error:', error)
    return { success: false, message: '标签保存失败' }
  }
}
