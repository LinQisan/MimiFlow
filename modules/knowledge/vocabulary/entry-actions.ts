'use server'

import { splitJapaneseEtymologies } from '@/modules/language/domain/etymology'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'

import prisma from '@/lib/prisma'
import { invalidateVocabularyGroupsCache } from './server/repository'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { parseJsonStringList, toJsonStringList } from '@/utils/text/jsonList'
import { normalizeVocabularySentenceTextKey } from '@/utils/vocabulary/sentenceQuality'
import {
  normalizeEntryPronunciations,
  structuredPartOfSpeechLabel,
  type VocabularyEntryDraft,
} from './domain/entry'
import {
  serializeVocabularyEntryPosTags,
  vocabularyEntryDraftSchema,
} from './domain/entry-validation'
import {
  computeSingleVocabularyPronunciation,
  batchComputeSentencePronunciations,
} from './server/pronunciation-service'
import { resolveListeningSentenceReferences } from './server/listening-source'
import { PRONUNCIATION_VERSION } from './domain/pronunciation'
import { normalizeVocabularyWord } from './domain/normalized-word'
import { hasJapanese } from '@/modules/language/domain/text'

const compact = (value?: string | null) => value?.trim() || null

async function replaceTags(
  tx: Prisma.TransactionClient,
  vocabularyId: string,
  userId: string,
  names: string[],
) {
  await tx.vocabularyTagOnVocabulary.deleteMany({ where: { vocabularyId } })
  const uniqueNames = Array.from(new Set(names.map(name => name.trim()).filter(Boolean)))
  for (const name of uniqueNames) {
    const tag = await tx.vocabularyTag.upsert({
      where: { userId_name: { userId, name } },
      update: {},
      create: { userId, name },
      select: { id: true },
    })
    await tx.vocabularyTagOnVocabulary.create({
      data: { vocabularyId, tagId: tag.id },
    })
  }
}

async function createRelation(
  tx: Prisma.TransactionClient,
  vocabularyId: string,
  senseId: string,
  relation: VocabularyEntryDraft['senses'][number]['relations'][number],
  sortOrder: number,
) {
  await tx.vocabularyRelation.create({
    data: {
      vocabularyId,
      senseId,
      type: relation.type,
      targetVocabularyId: compact(relation.targetVocabularyId),
      targetText: compact(relation.targetText),
      targetReading: compact(relation.targetReading),
      marker: compact(relation.marker),
      pattern: compact(relation.pattern),
      sortOrder,
    },
  })
}

export async function saveVocabularyEntryDraft(input: unknown) {
  const parsed = vocabularyEntryDraftSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false as const,
      message: parsed.error.issues[0]?.message || '词条数据不完整',
    }
  }

  try {
    const draft = parsed.data as VocabularyEntryDraft
    const userId = await getCurrentUserId()
    const owned = await prisma.vocabulary.findFirst({
      where: { id: draft.vocabularyId, userId },
      select: {
        id: true,
        etymologies: true,
        sentenceLinks: { select: { sentenceId: true, posTags: true } },
      },
    })
    if (!owned) return { success: false as const, message: '单词不存在' }

    const targetIds = Array.from(
      new Set(
        draft.senses.flatMap(sense => sense.relations)
          .map(relation => compact(relation.targetVocabularyId))
          .filter((value): value is string => Boolean(value)),
      ),
    )
    if (targetIds.length > 0) {
      const ownedTargetCount = await prisma.vocabulary.count({
        where: { id: { in: targetIds }, userId },
      })
      if (ownedTargetCount !== targetIds.length) {
        return { success: false as const, message: '关联词不存在或无权访问' }
      }
    }

    const partOfSpeechLabel = structuredPartOfSpeechLabel(draft.grammarPartOfSpeech)

    const classified = splitJapaneseEtymologies(
      draft.word,
      normalizeEntryPronunciations(draft.pronunciations),
      draft.etymologies ?? parseJsonStringList(owned.etymologies),
    )
    const wordPronunciationData = hasJapanese(draft.word)
      ? await computeSingleVocabularyPronunciation(draft.word, classified.pronunciations[0] || null)
      : null

    const recoveredSources = await resolveListeningSentenceReferences(draft.senses.flatMap(sense => sense.examples))
    const exampleTexts = draft.senses
      .flatMap(s => s.examples.map(e => e.text))
      .filter(Boolean)
    const examplePronMap =
      exampleTexts.length > 0 &&
      (hasJapanese(draft.word) || exampleTexts.some(t => hasJapanese(t)))
        ? await batchComputeSentencePronunciations(exampleTexts)
        : new Map()
    const existingSentencePosTags = new Map(
      owned.sentenceLinks.map(link => [link.sentenceId, link.posTags]),
    )

    await prisma.$transaction(async tx => {
      await tx.vocabularyRelation.deleteMany({
        where: { vocabularyId: draft.vocabularyId },
      })
      await tx.vocabularySense.deleteMany({
        where: { vocabularyId: draft.vocabularyId },
      })
      await tx.vocabulary.update({
        where: { id: draft.vocabularyId },
        data: {
          word: draft.word,
          normalizedWord: normalizeVocabularyWord(draft.word),
          pronunciations: toJsonStringList(classified.pronunciations),
          etymologies: toJsonStringList(classified.etymologies),
          partsOfSpeech: toJsonStringList([partOfSpeechLabel]),
          grammarPartOfSpeech: draft.grammarPartOfSpeech,
          transitivity:
            draft.grammarPartOfSpeech === 'verb' ? draft.transitivity : null,
          conjugationType:
            draft.grammarPartOfSpeech === 'verb'
              ? compact(draft.conjugationType)
              : null,
          pronunciationData: wordPronunciationData
            ? (wordPronunciationData as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          pronunciationVersion: wordPronunciationData ? PRONUNCIATION_VERSION : null,
        },
      })
      await replaceTags(tx, draft.vocabularyId, userId, draft.tags)

      for (const [senseIndex, senseDraft] of draft.senses.entries()) {
        const sense = await tx.vocabularySense.create({
          data: { vocabularyId: draft.vocabularyId, order: senseIndex },
          select: { id: true },
        })
        for (const [index, definition] of senseDraft.definitions.entries()) {
          await tx.vocabularyDefinition.create({
            data: {
              vocabularyId: draft.vocabularyId,
              senseId: sense.id,
              language: definition.language,
              dictionaryName: '用户编辑',
              definition: definition.text,
              sortOrder: index,
            },
          })
        }
        for (const [index, example] of senseDraft.examples.entries()) {
          const sourceUrl = example.sourceUrl.trim() || '#'
          const recoveredSourceId = recoveredSources.get(JSON.stringify([sourceUrl, example.text]))
          const recoveredSource = recoveredSourceId ? { sourceType: 'AUDIO_DIALOGUE' as const, sourceId: recoveredSourceId } : {}
          const examplePronData = examplePronMap.get(example.text) || null
          const sentence = await tx.vocabularySentence.upsert({
            where: {
              normalizedText_sourceUrl: {
                normalizedText: normalizeVocabularySentenceTextKey(example.text),
                sourceUrl,
              },
            },
            update: {
              ...recoveredSource,
              text: example.text,
              translation: compact(example.translation),
              source: example.source.trim() || '手动录入',
              ...(examplePronData
                ? {
                    pronunciationData:
                      examplePronData as unknown as Prisma.InputJsonValue,
                    pronunciationVersion: PRONUNCIATION_VERSION,
                  }
                : {}),
            },
            create: {
              ...recoveredSource,
              text: example.text,
              normalizedText: normalizeVocabularySentenceTextKey(example.text),
              translation: compact(example.translation),
              source: example.source.trim() || '手动录入',
              sourceUrl,
              pronunciationData: examplePronData
                ? (examplePronData as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              pronunciationVersion: examplePronData ? PRONUNCIATION_VERSION : null,
            },
            select: { id: true },
          })
          await tx.vocabularySentenceLink.create({
            data: {
              vocabularyId: draft.vocabularyId,
              sentenceId: sentence.id,
              senseId: sense.id,
              posTags: serializeVocabularyEntryPosTags(
                example.posTags,
                existingSentencePosTags.get(sentence.id),
              ),
              sortOrder: index,
            },
          })
        }
        for (const [index, pattern] of senseDraft.patterns.entries()) {
          await tx.vocabularyPattern.create({
            data: { senseId: sense.id, text: pattern.text, meaning: compact(pattern.meaning), sortOrder: index },
          })
        }
        for (const [index, expression] of senseDraft.expressions.entries()) {
          await tx.vocabularyExpression.create({
            data: {
              senseId: sense.id,
              type: expression.type,
              text: expression.text,
              reading: compact(expression.reading),
              meaning: compact(expression.meaning),
              sortOrder: index,
            },
          })
        }
        for (const [index, relation] of senseDraft.relations.entries()) {
          await createRelation(tx, draft.vocabularyId, sense.id, relation, index)
        }
        for (const [index, note] of senseDraft.notes.entries()) {
          await tx.vocabularyUsageNote.create({
            data: { senseId: sense.id, type: note.type, text: note.text, sortOrder: index },
          })
        }
      }
    })

    const oldSentenceIds = Array.from(new Set(owned.sentenceLinks.map(link => link.sentenceId)))
    if (oldSentenceIds.length > 0) {
      await prisma.vocabularySentence.deleteMany({
        where: { id: { in: oldSentenceIds }, links: { none: {} }, grammarExamples: { none: {} } },
      })
    }
    revalidatePath('/vocabulary')
    revalidatePath('/manage/vocabulary')
    invalidateVocabularyGroupsCache()
    return { success: true as const, message: '词条已保存' }
  } catch (error) {
    console.error(error)
    return { success: false as const, message: '词条保存失败，请保留当前内容后重试' }
  }
}
