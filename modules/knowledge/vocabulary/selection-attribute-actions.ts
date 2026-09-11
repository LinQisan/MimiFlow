'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { executeAction } from '@/lib/actions/result'
import { DomainError } from '@/lib/errors/domain-error'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { normalizeVocabularyWord } from './domain/normalized-word'
import { inferStructuredPartOfSpeech } from './domain/entry'
import { parseJsonStringList, toJsonStringList } from '@/utils/text/jsonList'
import { normalizeVocabularySentenceTextKey } from '@/utils/vocabulary/sentenceQuality'
import { invalidateVocabularyGroupsCache, resolveVocabularySourceMeta } from './server/repository'
import { batchComputeVocabularyPronunciations, batchComputeSentencePronunciations } from './server/pronunciation-service'
import { PRONUNCIATION_VERSION } from './domain/pronunciation'
import { selectionAttributeSchema } from './domain/selection-attribute'
import { listVocabularyMeanings } from './domain/meanings'

export async function findSelectionAttributeTargets(terms: string[], query = '') {
  return executeAction(async () => {
    const userId = await getCurrentUserId()
    const parsed = z.object({ terms: z.array(z.string().trim().max(300)).max(40), query: z.string().trim().max(300) }).parse({ terms, query })
    if (!parsed.terms.length && !parsed.query) return { targets: [] }
    const targets = await prisma.vocabulary.findMany({
      where: { userId, ...(parsed.query ? { word: { contains: parsed.query, mode: 'insensitive' as const } } : { OR: [{ word: { in: parsed.terms } }, { normalizedWord: { in: parsed.terms } }] }) },
      orderBy: [{ word: 'asc' }, { createdAt: 'asc' }], take: 30,
      select: { id: true, word: true, pronunciations: true, senses: { orderBy: { order: 'asc' }, select: { id: true, order: true, definitions: { orderBy: { sortOrder: 'asc' }, select: { definition: true } } } } },
    })
    return { targets: targets.map(target => ({ ...target, meanings: listVocabularyMeanings(target.senses), pronunciations: parseJsonStringList(target.pronunciations) })) }
  }, { fallbackMessage: '关联单词查询失败，请重试。' })
}

export async function saveSelectionAttribute(input: unknown) {
  return executeAction(async () => {
    const parsed = selectionAttributeSchema.safeParse(input)
    if (!parsed.success) throw new DomainError('VALIDATION_ERROR', parsed.error.issues[0]?.message || '请检查表达内容')
    const value = parsed.data
    const userId = await getCurrentUserId()
    const source = await resolveVocabularySourceMeta(value.sourceType, value.sourceId)
    const ownedWords = await prisma.vocabulary.findMany({ where: { userId, id: { in: value.targets.filter(t => !t.newWord).map(t => t.vocabularyId) } }, select: { word: true } })
    const [wordPronunciations, sentencePronunciations] = await Promise.all([
      batchComputeVocabularyPronunciations([...ownedWords.map(w => w.word), ...value.targets.flatMap(t => t.newWord ? [t.newWord.word] : [])]),
      batchComputeSentencePronunciations(value.contextSentence ? [value.contextSentence] : []),
    ])
    await prisma.$transaction(async tx => {
      const existingTargets = value.targets.filter(t => !t.newWord)
      const words = await tx.vocabulary.findMany({ where: { id: { in: existingTargets.map(t => t.vocabularyId) }, userId }, include: { senses: true, definitions: true } })
      if (words.length !== existingTargets.length) throw new DomainError('FORBIDDEN', '关联单词不存在或无权编辑')
      for (const target of value.targets) {
        let word = words.find(w => w.id === target.vocabularyId)
        if (target.newWord) {
          const draft = target.newWord
          word = await tx.vocabulary.findFirst({ where: { userId, normalizedWord: normalizeVocabularyWord(draft.word) }, include: { senses: true, definitions: true } }) || undefined
          if (!word) {
            const created = await tx.vocabulary.create({ data: { userId, word: draft.word, normalizedWord: normalizeVocabularyWord(draft.word), pronunciations: toJsonStringList([draft.reading].filter(Boolean)), partsOfSpeech: toJsonStringList([draft.partOfSpeech].filter(Boolean)), grammarPartOfSpeech: inferStructuredPartOfSpeech([draft.partOfSpeech]), pronunciationData: wordPronunciations.get(draft.word) as Prisma.InputJsonValue, pronunciationVersion: PRONUNCIATION_VERSION, sourceType: value.sourceType, sourceId: value.sourceId } })
            const sense = await tx.vocabularySense.create({ data: { vocabularyId: created.id, order: 0 } })
            await tx.vocabularyDefinition.create({ data: { vocabularyId: created.id, senseId: sense.id, definition: draft.meaning, language: 'zh', dictionaryName: source.source, sortOrder: 0 } })
            word = await tx.vocabulary.findUniqueOrThrow({ where: { id: created.id }, include: { senses: true, definitions: true } })
          }
        }
        if (!word) throw new DomainError('FORBIDDEN', '关联单词不存在或无权编辑')
        if (word.pronunciationVersion !== PRONUNCIATION_VERSION && wordPronunciations.has(word.word)) {
          await tx.vocabulary.update({ where: { id: word.id }, data: { pronunciationData: wordPronunciations.get(word.word) as Prisma.InputJsonValue, pronunciationVersion: PRONUNCIATION_VERSION } })
        }
        if (target.senseId && !word.senses.some(s => s.id === target.senseId)) throw new DomainError('VALIDATION_ERROR', '义项已变化，请重新选择')
        if (!target.senseId && word.senses.length > 1) throw new DomainError('VALIDATION_ERROR', '请选择要关联的义项')
        const senseId = target.senseId || word.senses[0]?.id
        if (!senseId) throw new DomainError('VALIDATION_ERROR', '单词没有可关联的义项')
        if (value.type === 'collocation' || value.type === 'idiom') {
          const existing = await tx.vocabularyExpression.findFirst({ where: { senseId, type: value.type, text: value.text } })
          if (!existing) {
            const last = await tx.vocabularyExpression.aggregate({ where: { senseId }, _max: { sortOrder: true } })
            await tx.vocabularyExpression.create({ data: { senseId, type: value.type, text: value.text, reading: value.reading || null, meaning: value.meaning || null, sortOrder: (last._max.sortOrder ?? -1) + 1 } })
          }
        } else {
          const existing = await tx.vocabularyRelation.findFirst({ where: { vocabularyId: word.id, senseId, type: value.type, targetText: value.text } })
          if (!existing) {
            const last = await tx.vocabularyRelation.aggregate({ where: { vocabularyId: word.id }, _max: { sortOrder: true } })
            await tx.vocabularyRelation.create({ data: { vocabularyId: word.id, senseId, type: value.type, targetText: value.text, targetReading: value.reading || null, sortOrder: (last._max.sortOrder ?? -1) + 1 } })
          }
        }
        if (value.contextSentence) {
          const sentence = await tx.vocabularySentence.upsert({
            where: { normalizedText_sourceUrl: { normalizedText: normalizeVocabularySentenceTextKey(value.contextSentence), sourceUrl: source.sourceUrl } },
            update: {}, create: { text: value.contextSentence, normalizedText: normalizeVocabularySentenceTextKey(value.contextSentence), source: source.source, sourceUrl: source.sourceUrl, sourceType: value.sourceType, sourceId: value.sourceId, pronunciationData: sentencePronunciations.get(value.contextSentence) as Prisma.InputJsonValue, pronunciationVersion: PRONUNCIATION_VERSION },
          })
          if (sentence.pronunciationVersion !== PRONUNCIATION_VERSION && sentence.text === value.contextSentence) {
            await tx.vocabularySentence.update({ where: { id: sentence.id }, data: { pronunciationData: sentencePronunciations.get(value.contextSentence) as Prisma.InputJsonValue, pronunciationVersion: PRONUNCIATION_VERSION } })
          }
          await tx.vocabularySentenceLink.upsert({ where: { vocabularyId_sentenceId: { vocabularyId: word.id, sentenceId: sentence.id } }, update: {}, create: { vocabularyId: word.id, sentenceId: sentence.id, senseId } })
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    invalidateVocabularyGroupsCache()
    revalidatePath('/vocabulary')
    return { count: value.targets.length }
  }, { fallbackMessage: '保存失败，请刷新关联单词后重试。' })
}
