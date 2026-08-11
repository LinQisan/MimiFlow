// Vocabulary and wordbook server actions.
'use server'

import {
  MaterialType,
  SourceType,
} from '@prisma/client'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
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
  cleanupOrphanSentence,
  findExistingVocabularyCandidate,
  findSentenceLinkByText,
  listVocabularySentenceRecords,
  normalizeSentencePosTags,
  resolveVocabularySourceMeta,
  upsertVocabularySentenceLink,
} from './server/repository'
import type { VocabularySentenceRecord } from './server/repository'
import { extractSentenceContainingSelection } from '@/utils/text/sentenceContext'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'



export async function saveVocabulary(
  word: string,
  originalSelectedText: string,
  contextSentence: string,
  sourceType: SourceType,
  sourceId: string,
  pronunciation?: string,
  pronunciations?: string[],
  meanings?: string[],
  partOfSpeech?: string,
  partsOfSpeech?: string[],
) {
  try {
    const trimmedWord = word.trim()
    if (!trimmedWord) return { success: false, message: '单词为空' }
    const normalizedContextSentence = extractSentenceContainingSelection(
      contextSentence,
      originalSelectedText,
    )
    const sourceMeta = await resolveVocabularySourceMeta(sourceType, sourceId)

    const normalizedPronunciations = sanitizePronunciations(
      trimmedWord,
      pronunciations || [],
    )
    const normalizedPrimaryPronunciation = sanitizePronunciation(
      trimmedWord,
      pronunciation || '',
    )
    const normalizedPartsOfSpeech = Array.from(
      new Set(
        [partOfSpeech || '', ...(partsOfSpeech || [])]
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

    let exists = await prisma.vocabulary.findFirst({
      where: { word: normalizedWord },
    })

    if (!exists) {
      exists = await findExistingVocabularyCandidate(normalizedWord)
    }

    if (exists) {
      const mergedPronunciations = toJsonStringList([
        normalizedPrimaryPronunciation,
        ...normalizedPronunciations,
        ...sanitizePronunciations(
          trimmedWord,
          parseJsonStringList(exists.pronunciations),
        ),
      ])
      const mergedMeanings = toJsonStringList([
        ...normalizedMeanings,
        ...parseJsonStringList(exists.meanings),
      ])
      const mergedPartsOfSpeech = toJsonStringList([
        ...normalizedPartsOfSpeech,
        ...parseJsonStringList(exists.partsOfSpeech),
      ])
      const newSentence: VocabularySentenceRecord | null =
        normalizedContextSentence
          ? {
              text: normalizedContextSentence,
              source: sourceMeta.source,
              sourceUrl: sourceMeta.sourceUrl,
              meaningIndex: null,
              posTags: normalizeSentencePosTags(normalizedPartsOfSpeech),
            }
          : null
      const existedLink = newSentence
        ? await findSentenceLinkByText(exists.id, newSentence.text)
        : null

      await prisma.vocabulary.update({
        where: { id: exists.id },
        data: {
          pronunciations: mergedPronunciations,
          partsOfSpeech: mergedPartsOfSpeech,
          meanings: mergedMeanings,
        },
      })
      const mergedMeta: VocabularyMeta = {
        pronunciations: parseJsonStringList(mergedPronunciations),
        partsOfSpeech: parseJsonStringList(mergedPartsOfSpeech),
        meanings: parseJsonStringList(mergedMeanings),
      }
      if (newSentence && !existedLink) {
        await upsertVocabularySentenceLink(exists.id, {
          text: newSentence.text,
          source: newSentence.source,
          sourceUrl: newSentence.sourceUrl,
          sourceType,
          sourceId,
          meaningIndex: null,
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

    const created = await prisma.vocabulary.create({
      data: {
        word: normalizedWord,
        sourceType: sourceType,
        sourceId: sourceId,
        pronunciations: toJsonStringList([
          normalizedPrimaryPronunciation,
          ...normalizedPronunciations,
        ]),
        partsOfSpeech: toJsonStringList(normalizedPartsOfSpeech),
        meanings: toJsonStringList(normalizedMeanings),
      },
    })
    if (normalizedContextSentence) {
      await upsertVocabularySentenceLink(created.id, {
        text: normalizedContextSentence,
        source: sourceMeta.source,
        sourceUrl: sourceMeta.sourceUrl,
        sourceType,
        sourceId,
        meaningIndex: null,
        posTags: normalizeSentencePosTags(normalizedPartsOfSpeech),
      })
    }

    return {
      success: true,
      state: 'success',
      message: '已收藏至生词本',
      word: created.word,
      meta: {
        pronunciations: parseJsonStringList(created.pronunciations),
        partsOfSpeech: parseJsonStringList(created.partsOfSpeech),
        meanings: parseJsonStringList(created.meanings),
      } satisfies VocabularyMeta,
    }
  } catch (error) {
    console.error(error)
    return { success: false, state: 'error', message: '保存失败' }
  }
}

export async function updateVocabularyPronunciationById(
  id: string,
  pronunciation: string,
) {
  try {
    const target = await prisma.vocabulary.findUnique({
      where: { id },
      select: { word: true },
    })
    if (!target) return { success: false }
    const nextPron = sanitizePronunciation(target.word, pronunciation)
    await prisma.vocabulary.update({
      where: { id },
      data: {
        pronunciations: toJsonStringList(nextPron ? [nextPron] : []),
      },
    })
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false }
  }
}

export async function updateVocabularyPartsOfSpeechById(
  id: string,
  partsOfSpeech: string[],
) {
  try {
    const normalized = Array.from(
      new Set(partsOfSpeech.map(item => item.trim()).filter(Boolean)),
    )
    await prisma.vocabulary.update({
      where: { id },
      data: {
        partsOfSpeech: toJsonStringList(normalized),
      },
    })
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '词性保存失败' }
  }
}



export async function deleteVocabulary(id: string) {
  try {
    await prisma.vocabulary.delete({ where: { id } })
    return { success: true, message: '删除成功' }
  } catch (error) {
    console.error(error)
    return { success: false, message: '删除失败' }
  }
}

export async function searchSentencesForWord(word: string) {
  try {
    const articles = await prisma.material.findMany({
      where: { type: MaterialType.READING },
      select: { id: true, title: true, contentPayload: true },
    })

    const questions = await prisma.question.findMany({
      where: {
        OR: [
          { prompt: { contains: word } },
          { context: { contains: word } },
        ],
      },
      select: {
        id: true,
        prompt: true,
        context: true,
        material: { select: { id: true, title: true, type: true } },
      },
    })

    const results: {
      text: string
      source: string
      sourceUrl: string
      sourceType?: SourceType
    }[] = []
    articles.forEach(a => {
      const payload = decodeMaterialPayloadRecord(
        MaterialType.READING,
        a.contentPayload,
      )
      const articleText = String(payload.text || payload.transcript || '')
      const parts = articleText.match(/[^。！？.!\?\n]+[。！？.!\?\n]*/g) || [
        articleText,
      ]
      parts.forEach(p => {
        const t = p.trim()
        if (t.includes(word) && t.length > 5) {
          results.push({
            text: t,
            source: `阅读：${a.title}`,
            sourceUrl: `/reading/articles/${a.id}`,
            sourceType: 'ARTICLE_TEXT',
          })
        }
      })
    })

    questions.forEach(q => {
      const t = (q.context || q.prompt || '').trim()
      if (t.includes(word) && t.length > 5) {
        results.push({
          text: t,
          source: `题目：${q.material?.title || '练习题'}`,
          sourceUrl: '/practice/custom',
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
) {
  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }

    const normalizedSentence: VocabularySentenceRecord = {
      text: newSentenceObj.text.trim(),
      source: newSentenceObj.source.trim() || '未知来源',
      sourceUrl: newSentenceObj.sourceUrl.trim() || '#',
      meaningIndex: null,
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
      meaningIndex: null,
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

export async function assignVocabularySentenceMeaning(
  id: string,
  sentenceText: string,
  meaningIndex: number,
) {
  try {
    if (!sentenceText.trim()) {
      return { success: false, message: '句子不能为空' }
    }
    if (!Number.isInteger(meaningIndex) || meaningIndex < 0) {
      return { success: false, message: '释义索引不合法' }
    }

    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }

    const targetText = sentenceText.trim()
    const link = await findSentenceLinkByText(id, targetText)
    if (!link) {
      return { success: false, message: '未找到该例句' }
    }
    await prisma.vocabularySentenceLink.update({
      where: { id: link.id },
      data: { meaningIndex },
    })
    revalidatePath('/vocabulary')
    return { success: true, message: '释义匹配已保存' }
  } catch (error) {
    console.error(error)
    return { success: false, message: '保存失败' }
  }
}

export async function clearVocabularySentenceMeaning(
  id: string,
  sentenceText: string,
) {
  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }
    const targetText = sentenceText.trim()
    const link = await findSentenceLinkByText(id, targetText)
    if (link) {
      await prisma.vocabularySentenceLink.update({
        where: { id: link.id },
        data: { meaningIndex: null },
      })
    }
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '取消匹配失败' }
  }
}

export async function updateVocabularySentencePosTags(
  id: string,
  sentenceText: string,
  posTags: string[] | string,
) {
  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }

    const targetText = sentenceText.trim()
    const normalized = normalizeSentencePosTags(
      Array.isArray(posTags) ? posTags : [posTags],
    )
    const link = await findSentenceLinkByText(id, targetText)
    if (link) {
      await prisma.$transaction(async tx => {
        await tx.vocabularySentenceLink.update({
          where: { id: link.id },
          data: { posTags: toJsonStringList(normalized) },
        })
        if (normalized.length > 0) {
          const merged = Array.from(
            new Set([
              ...parseJsonStringList(vocab.partsOfSpeech),
              ...normalized,
            ]),
          )
          await tx.vocabulary.update({
            where: { id },
            data: {
              partsOfSpeech: toJsonStringList(merged),
            },
          })
        }
      })
    } else {
      return { success: false, message: '未找到该句子' }
    }
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '句子词性更新失败' }
  }
}

export async function deleteVocabularySentence(
  id: string,
  sentenceText: string,
) {
  try {
    const vocab = await prisma.vocabulary.findUnique({ where: { id } })
    if (!vocab) return { success: false, message: '单词不存在' }
    const targetText = sentenceText.trim()
    const link = await findSentenceLinkByText(id, targetText)
    if (link) {
      await prisma.vocabularySentenceLink.delete({ where: { id: link.id } })
      await cleanupOrphanSentence(link.sentenceId)
    }
    revalidatePath('/vocabulary')
    return { success: true }
  } catch (error) {
    console.error(error)
    return { success: false, message: '句子删除失败' }
  }
}

export async function updateVocabularyTags(
  vocabId: string,
  tagNames: string[],
) {
  try {
    if (!vocabId) {
      return { success: false, message: '缺少词汇 ID' }
    }

    const normalizedTags = Array.from(
      new Set(tagNames.map(tag => tag.trim()).filter(Boolean)),
    )

    await prisma.$transaction(async tx => {
      await tx.vocabularyTagOnVocabulary.deleteMany({
        where: { vocabularyId: vocabId },
      })

      if (normalizedTags.length === 0) return

      await Promise.all(
        normalizedTags.map(name =>
          tx.vocabularyTag.upsert({
            where: { name },
            update: {},
            create: { name },
          }),
        ),
      )

      const tags = await tx.vocabularyTag.findMany({
        where: {
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
    return { success: true }
  } catch (error) {
    console.error('updateVocabularyTags error:', error)
    return { success: false, message: '标签保存失败' }
  }
}
