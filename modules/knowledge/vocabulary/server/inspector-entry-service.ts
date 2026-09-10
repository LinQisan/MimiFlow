import { splitJapaneseEtymologies } from '@/modules/language/domain/etymology'
import 'server-only'

import { Prisma } from '@prisma/client'

import prisma from '@/lib/prisma'
import { DomainError } from '@/lib/errors/domain-error'
import { parseJsonStringList, toJsonStringList } from '@/utils/text/jsonList'
import { normalizeVocabularySentenceTextKey } from '@/utils/vocabulary/sentenceQuality'
import { normalizeVocabularyWord } from '../domain/normalized-word'
import { normalizeRelationMetadata } from '../domain/relations'
import { normalizeSentencePosTags } from './repository'
import {
  hasClientSenseId,
  parseVocabularyInspectorEntry,
  type VocabularyInspectorEntryInput,
} from '../domain/inspector-entry-validation'
import type { VocabularyInspectorData } from '../inspector-actions'
import type { VocabularyInspectorEntryDraft } from '../domain/inspector-entry'
import {
  computeSingleSentencePronunciation,
  computeSingleVocabularyPronunciation,
} from './pronunciation-service'
import { PRONUNCIATION_VERSION } from '../domain/pronunciation'
import { hasJapanese } from '@/modules/language/domain/text'
import { filterVocabularyTags } from '../domain/jlpt'
import { dedupeAndRankSentences } from '@/utils/vocabulary/sentenceQuality'

const INSPECTOR_ORIGINAL_SOURCE_URL = '__mimiflowInspectorOriginalSourceUrl'

const wordbookLabel = (wordbook: { title: string; series: { title: string } }) =>
  [wordbook.series.title, wordbook.title].filter(Boolean).join(' / ')

const INSPECTOR_SELECT = {
  id: true,
  word: true,
  normalizedWord: true,
  etymologies: true,
  pronunciations: true,
  partsOfSpeech: true,
  meanings: true,
  grammarPartOfSpeech: true,
  transitivity: true,
  conjugationType: true,
  wordAudio: true,
  tags: { select: { tag: { select: { name: true } } } },
  definitions: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      language: true,
      dictionaryName: true,
      definition: true,
      senseId: true,
    },
  },
  senses: {
    orderBy: { order: 'asc' },
    select: {
      id: true,
      order: true,
      definitions: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, language: true, dictionaryName: true, definition: true, senseId: true },
      },
      examples: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          senseId: true,
          meaningIndex: true,
          posTags: true,
          sentence: {
            select: {
              text: true,
              translation: true,
              audioFile: true,
              source: true,
              sourceUrl: true,
              sourceType: true,
              sourceId: true,
              sourceMetadata: true,
              provider: true,
              externalId: true,
            },
          },
        },
      },
      patterns: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, senseId: true, text: true, meaning: true },
      },
      expressions: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, senseId: true, type: true, text: true, reading: true, meaning: true },
      },
      relations: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, senseId: true, type: true, targetVocabularyId: true,
          targetText: true, targetReading: true, marker: true, pattern: true,
          targetVocabulary: { select: { userId: true, word: true } },
        },
      },
      notes: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, senseId: true, type: true, text: true },
      },
    },
  },
  relations: {
    where: { senseId: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, senseId: true, type: true, targetVocabularyId: true,
      targetText: true, targetReading: true, marker: true, pattern: true,
      targetVocabulary: { select: { userId: true, word: true } },
    },
  },
  sentenceLinks: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      senseId: true,
      meaningIndex: true,
      posTags: true,
      sentence: {
        select: {
          text: true, translation: true, audioFile: true, source: true,
          sourceUrl: true, sourceType: true, sourceId: true,
          sourceMetadata: true, provider: true, externalId: true,
        },
      },
    },
  },
  wordbooks: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { wordbook: { select: { id: true, title: true, series: { select: { title: true } } } } },
  },
} satisfies Prisma.VocabularySelect

type InspectorRow = Prisma.VocabularyGetPayload<{ select: typeof INSPECTOR_SELECT }>

function effectiveSourceUrl(sourceUrl: string, sourceMetadata: Prisma.JsonValue | null) {
  if (sourceMetadata && typeof sourceMetadata === 'object' && !Array.isArray(sourceMetadata)) {
    const value = sourceMetadata[INSPECTOR_ORIGINAL_SOURCE_URL]
    if (typeof value === 'string' && value) return value
  }
  return sourceUrl
}

function clonedSourceMetadata(sourceMetadata: Prisma.JsonValue | null, originalSourceUrl: string) {
  const object = sourceMetadata && typeof sourceMetadata === 'object' && !Array.isArray(sourceMetadata)
    ? sourceMetadata
    : {}
  return {
    ...object,
    [INSPECTOR_ORIGINAL_SOURCE_URL]: originalSourceUrl,
  } as Prisma.InputJsonValue
}

function buildEntry(row: InspectorRow, userId: string): VocabularyInspectorEntryDraft {
  const senses = row.senses.map(sense => ({ id: sense.id }))
  const definitions = row.definitions.map(definition => ({
    id: definition.id,
    language: definition.language,
    dictionaryName: definition.dictionaryName,
    definition: definition.definition,
    senseId: definition.senseId,
  }))
  const sentences = row.sentenceLinks.map(link => ({
    id: link.id,
    senseId: link.senseId,
    text: link.sentence.text,
    translation: link.sentence.translation,
    source: link.sentence.source,
    sourceUrl: effectiveSourceUrl(link.sentence.sourceUrl, link.sentence.sourceMetadata),
    audioFile: link.sentence.audioFile,
    meaningIndex: link.meaningIndex,
    posTags: normalizeSentencePosTags(parseJsonStringList(link.posTags)),
  }))
  const patterns = row.senses.flatMap(sense => sense.patterns.map(pattern => ({ ...pattern })))
  const expressions = row.senses.flatMap(sense => sense.expressions.map(expression => ({ ...expression })))
  const relations = [
    ...row.relations,
    ...row.senses.flatMap(sense => sense.relations),
  ].map(relation => ({
    id: relation.id,
    senseId: relation.senseId,
    type: relation.type,
    targetVocabularyId: relation.targetVocabularyId,
    targetText: relation.targetVocabulary?.userId === userId ? relation.targetVocabulary.word : relation.targetText || '',
    targetReading: relation.targetReading,
    marker: relation.marker,
    pattern: relation.pattern,
  }))
  const notes = row.senses.flatMap(sense => sense.notes.map(note => ({ ...note })))

  return {
    id: row.id,
    word: row.word,
    ...splitJapaneseEtymologies(row.word, parseJsonStringList(row.pronunciations), parseJsonStringList(row.etymologies)),
    partsOfSpeech: parseJsonStringList(row.partsOfSpeech),
    meanings: parseJsonStringList(row.meanings),
    grammarPartOfSpeech: row.grammarPartOfSpeech,
    transitivity: row.transitivity,
    conjugationType: row.conjugationType,
    wordAudio: row.wordAudio,
    tags: row.tags.map(item => item.tag.name),
    wordbookIds: row.wordbooks.map(item => item.wordbook.id),
    senses,
    definitions,
    sentences,
    patterns,
    expressions,
    relations,
    notes,
  }
}

function buildLegacyData(row: InspectorRow, userId: string, availableWordbooks: Array<{ id: string; title: string; series: { title: string } }>): VocabularyInspectorData {
  const entry = buildEntry(row, userId)
  const expressions = row.senses.flatMap(sense => sense.expressions.map(expression => ({
    id: expression.id,
    type: expression.type,
    text: expression.text,
    reading: expression.reading,
    meaning: expression.meaning,
    senseOrder: sense.order,
  })))
  const relations = [...row.relations, ...row.senses.flatMap(sense => sense.relations)].map(relation => ({
    id: relation.id,
    type: relation.type,
    text: relation.targetVocabulary?.userId === userId ? relation.targetVocabulary.word : relation.targetText || '',
    reading: relation.targetReading,
    senseOrder: relation.senseId ? row.senses.find(sense => sense.id === relation.senseId)?.order ?? null : null,
  }))
  const summarySentences = dedupeAndRankSentences(row.sentenceLinks.map(link => ({
    text: link.sentence.text.trim(),
    translation: link.sentence.translation?.trim() || null,
    audioFile: link.sentence.audioFile || null,
    source: link.sentence.source.trim(),
    sourceUrl: effectiveSourceUrl(link.sentence.sourceUrl, link.sentence.sourceMetadata),
    sourceType: link.sentence.sourceType,
    meaningIndex: link.meaningIndex,
    posTags: normalizeSentencePosTags(parseJsonStringList(link.posTags)),
  })), 12).map(({ text, translation, audioFile, source, posTags }) => ({ text, translation, audioFile, source, posTags }))

  return {
    id: row.id,
    word: row.word,
    pronunciations: entry.pronunciations,
    etymologies: entry.etymologies,
    partsOfSpeech: entry.partsOfSpeech,
    tags: filterVocabularyTags(entry.tags),
    meanings: entry.meanings,
    expressions,
    relations,
    structured: row.senses.length > 0,
    wordAudio: row.wordAudio,
    sentences: summarySentences,
    memberships: row.wordbooks.map(item => ({ id: item.wordbook.id, label: wordbookLabel(item.wordbook) })),
    availableWordbooks: availableWordbooks.map(item => ({ id: item.id, label: wordbookLabel(item) })),
    definitions: row.definitions.map(({ id, language, dictionaryName, definition }) => ({ id, language, dictionaryName, definition })),
    entry,
  }
}

export async function readVocabularyInspectorData(userId: string, vocabularyId: string, wordbookId?: string) {
  const row = await prisma.vocabulary.findFirst({
    where: { id: vocabularyId, userId, ...(wordbookId ? { wordbooks: { some: { wordbookId } } } : {}) },
    select: INSPECTOR_SELECT,
  })
  if (!row) return null
  const availableWordbooks = await prisma.wordbook.findMany({
    where: { userId, NOT: { id: { startsWith: 'legacy-' } } },
    orderBy: [{ series: { sortOrder: 'asc' } }, { series: { createdAt: 'asc' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, series: { select: { title: true } } },
  })
  return buildLegacyData(row, userId, availableWordbooks)
}

export async function findVocabularyInspectorData(userId: string, word: string, wordbookId?: string) {
  const normalizedWord = word.normalize('NFKC').trim()
  if (!normalizedWord) return null
  const row = await prisma.vocabulary.findFirst({
    where: { userId, word: { equals: normalizedWord, mode: 'insensitive' }, ...(wordbookId ? { wordbooks: { some: { wordbookId } } } : {}) },
    select: { id: true },
  })
  return row ? readVocabularyInspectorData(userId, row.id, wordbookId) : null
}

function fail(message: string, code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL_ERROR' = 'VALIDATION_ERROR'): never {
  throw new DomainError(code, message)
}

function duplicateIds(items: Array<{ id?: string }>, label: string) {
  const ids = items.flatMap(item => item.id ? [item.id] : [])
  if (new Set(ids).size !== ids.length) fail(`${label}包含重复记录，请重新打开后编辑。`)
  return ids
}

function assertExistingIds(ids: string[], owned: Set<string>, label: string) {
  if (ids.some(id => !owned.has(id))) fail(`${label}已变化，请重新打开后编辑。`, 'CONFLICT')
}

function senseIdFor(value: string | null, senseMap: Map<string, string>, label: string) {
  if (!value) return null
  const mapped = senseMap.get(value)
  if (!mapped) fail(`${label}引用了不存在的义项。`)
  return mapped
}

type Tx = Prisma.TransactionClient

async function replaceTags(tx: Tx, vocabularyId: string, userId: string, names: string[]) {
  await tx.vocabularyTagOnVocabulary.deleteMany({ where: { vocabularyId } })
  const uniqueNames = Array.from(new Set(names.filter(Boolean)))
  for (const name of uniqueNames) {
    const tag = await tx.vocabularyTag.upsert({
      where: { userId_name: { userId, name } },
      update: {},
      create: { userId, name },
      select: { id: true },
    })
    await tx.vocabularyTagOnVocabulary.create({ data: { vocabularyId, tagId: tag.id } })
  }
}

async function sentenceCollision(tx: Tx, text: string, sourceUrl: string, currentId?: string) {
  const existing = await tx.vocabularySentence.findUnique({
    where: { normalizedText_sourceUrl: { normalizedText: normalizeVocabularySentenceTextKey(text), sourceUrl } },
    select: { id: true },
  })
  if (existing && existing.id !== currentId) fail('例句与已有记录的文本和来源地址冲突，请保留当前内容后调整来源地址。', 'CONFLICT')
}

async function writeSentence(
  tx: Tx,
  vocabularyId: string,
  item: VocabularyInspectorEntryInput['sentences'][number],
  senseId: string | null,
  sortOrder: number,
  existingLink: { id: string; sentenceId: string; senseId: string | null; meaningIndex: number | null; posTags: string | null; sentence: { id: string; text: string; translation: string | null; audioFile: string | null; source: string; sourceUrl: string; sourceType: any; sourceId: string | null; sourceMetadata: Prisma.JsonValue | null; provider: string | null; externalId: string | null; pronunciationData: Prisma.JsonValue | null; pronunciationVersion: number | null; _count: { links: number; grammarExamples: number } } } | undefined,
  sentencePronunciations: Map<string, Awaited<ReturnType<typeof computeSingleSentencePronunciation>>>,
) {
  const currentEffectiveSourceUrl = existingLink
    ? effectiveSourceUrl(existingLink.sentence.sourceUrl, existingLink.sentence.sourceMetadata)
    : null
  const storageSourceUrl = existingLink && currentEffectiveSourceUrl === item.sourceUrl
    ? existingLink.sentence.sourceUrl
    : item.sourceUrl
  const textChanged = !existingLink || existingLink.sentence.text !== item.text || currentEffectiveSourceUrl !== item.sourceUrl
  const contentChanged = !existingLink || textChanged || existingLink.sentence.translation !== (item.translation ?? null) || existingLink.sentence.audioFile !== (item.audioFile ?? null) || existingLink.sentence.source !== item.source
  const currentSentence = existingLink?.sentence

  if (!existingLink) {
    await sentenceCollision(tx, item.text, storageSourceUrl)
    const pron = sentencePronunciations.get(item.text)
    const created = await tx.vocabularySentence.create({
      data: {
        text: item.text,
        normalizedText: normalizeVocabularySentenceTextKey(item.text),
        translation: item.translation ?? null,
        audioFile: item.audioFile ?? null,
        source: item.source,
        sourceUrl: storageSourceUrl,
        pronunciationData: pron ? (pron as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        pronunciationVersion: pron ? PRONUNCIATION_VERSION : null,
      },
      select: { id: true },
    })
    await tx.vocabularySentenceLink.create({
      data: {
        vocabularyId,
        sentenceId: created.id,
        senseId,
        meaningIndex: item.meaningIndex,
        posTags: toJsonStringList(normalizeSentencePosTags(item.posTags)),
        sortOrder,
      },
    })
    return created.id
  }

  if (!contentChanged) {
    await tx.vocabularySentenceLink.update({ where: { id: existingLink.id }, data: { senseId, meaningIndex: item.meaningIndex, posTags: toJsonStringList(normalizeSentencePosTags(item.posTags)), sortOrder } })
    return existingLink.sentenceId
  }

  await sentenceCollision(tx, item.text, storageSourceUrl, currentSentence?.id)
  const shared = Boolean(currentSentence && (currentSentence._count.links > 1 || currentSentence._count.grammarExamples > 0))
  const pron = textChanged ? sentencePronunciations.get(item.text) : undefined
  if (shared) {
    // The source identity is deliberately not copied: provider+externalId is a
    // global unique key. The source fields and opaque metadata remain intact.
    const cloneSourceUrl = storageSourceUrl === existingLink.sentence.sourceUrl && currentEffectiveSourceUrl === item.sourceUrl
      ? `${storageSourceUrl}${storageSourceUrl.includes('#') ? '&' : '#'}mimiflow-inspector-${vocabularyId}-${existingLink.id}`
      : storageSourceUrl
    await sentenceCollision(tx, item.text, cloneSourceUrl)
    const created = await tx.vocabularySentence.create({
      data: {
        text: item.text,
        normalizedText: normalizeVocabularySentenceTextKey(item.text),
        translation: item.translation ?? null,
        audioFile: item.audioFile ?? null,
        source: item.source,
        sourceUrl: cloneSourceUrl,
        sourceType: currentSentence?.sourceType,
        sourceId: currentSentence?.sourceId,
        sourceMetadata: clonedSourceMetadata(currentSentence?.sourceMetadata ?? null, item.sourceUrl),
        pronunciationData: textChanged ? (pron ? (pron as unknown as Prisma.InputJsonValue) : Prisma.JsonNull) : currentSentence?.pronunciationData === null ? Prisma.JsonNull : currentSentence?.pronunciationData,
        pronunciationVersion: textChanged ? (pron ? PRONUNCIATION_VERSION : null) : currentSentence?.pronunciationVersion,
      },
      select: { id: true },
    })
    await tx.vocabularySentenceLink.update({ where: { id: existingLink.id }, data: { sentenceId: created.id, senseId, meaningIndex: item.meaningIndex, posTags: toJsonStringList(normalizeSentencePosTags(item.posTags)), sortOrder } })
    return created.id
  }

  await tx.vocabularySentence.update({
    where: { id: existingLink.sentenceId },
    data: {
      text: item.text,
      normalizedText: normalizeVocabularySentenceTextKey(item.text),
      translation: item.translation ?? null,
      audioFile: item.audioFile ?? null,
      source: item.source,
      sourceUrl: storageSourceUrl,
      ...(textChanged ? { pronunciationData: pron ? (pron as unknown as Prisma.InputJsonValue) : Prisma.JsonNull, pronunciationVersion: pron ? PRONUNCIATION_VERSION : null } : {}),
    },
  })
  await tx.vocabularySentenceLink.update({ where: { id: existingLink.id }, data: { senseId, meaningIndex: item.meaningIndex, posTags: toJsonStringList(normalizeSentencePosTags(item.posTags)), sortOrder } })
  return existingLink.sentenceId
}

export async function updateFullVocabularyFromInspector(userId: string, input: unknown) {
  const parsed = parseVocabularyInspectorEntry(input)
  if (!parsed.success) fail(parsed.error.issues[0]?.message || '词条数据不完整。')
  const draft = parsed.data
  if (draft.id.trim() === '') fail('单词记录不能为空。')

  const wordPronunciation = hasJapanese(draft.word)
    ? await computeSingleVocabularyPronunciation(draft.word, splitJapaneseEtymologies(draft.word, draft.pronunciations).pronunciations[0] || null)
    : null
  const sentencePronunciations = new Map<string, Awaited<ReturnType<typeof computeSingleSentencePronunciation>>>()
  const sentenceTexts = Array.from(new Set(draft.sentences.map(item => item.text)))
  for (const text of sentenceTexts) {
    if (hasJapanese(text)) sentencePronunciations.set(text, await computeSingleSentencePronunciation(text))
  }

  const oldSentenceIds = new Set<string>()
  await prisma.$transaction(async tx => {
    const vocabulary = await tx.vocabulary.findFirst({ where: { id: draft.id, userId }, select: { id: true, etymologies: true } })
    if (!vocabulary) fail('单词不存在或无权编辑。', 'NOT_FOUND')

    const requestedWordbookIds = Array.from(new Set(draft.wordbookIds))
    const wordbooks = await tx.wordbook.findMany({ where: { id: { in: requestedWordbookIds }, userId }, select: { id: true } })
    if (wordbooks.length !== requestedWordbookIds.length) fail('单词本不存在或无权访问。', 'FORBIDDEN')

    const existingSenses = await tx.vocabularySense.findMany({ where: { vocabularyId: vocabulary.id }, select: { id: true } })
    const existingDefinitions = await tx.vocabularyDefinition.findMany({ where: { vocabularyId: vocabulary.id }, select: { id: true } })
    const existingLinks = await tx.vocabularySentenceLink.findMany({ where: { vocabularyId: vocabulary.id }, select: { id: true, sentenceId: true } })
    const existingPatterns = await tx.vocabularyPattern.findMany({ where: { sense: { vocabularyId: vocabulary.id } }, select: { id: true } })
    const existingExpressions = await tx.vocabularyExpression.findMany({ where: { sense: { vocabularyId: vocabulary.id } }, select: { id: true } })
    const existingNotes = await tx.vocabularyUsageNote.findMany({ where: { sense: { vocabularyId: vocabulary.id } }, select: { id: true } })
    const existingRelations = await tx.vocabularyRelation.findMany({ where: { vocabularyId: vocabulary.id }, select: { id: true } })

    const senseIds = duplicateIds(draft.senses, '义项')
    const existingSenseIds = new Set(existingSenses.map(item => item.id))
    assertExistingIds(senseIds.filter(id => !hasClientSenseId(id)), existingSenseIds, '义项')
    if (senseIds.some(id => hasClientSenseId(id) && senseIds.filter(value => value === id).length > 1)) fail('新义项包含重复标识。')
    const senseMap = new Map<string, string>()
    const temporaryOrderBase = 1_000_000 + existingSenses.length
    for (const [index, existingSense] of existingSenses.entries()) {
      await tx.vocabularySense.update({ where: { id: existingSense.id }, data: { order: temporaryOrderBase + index } })
    }
    for (const [index, sense] of draft.senses.entries()) {
      if (hasClientSenseId(sense.id)) {
        const created = await tx.vocabularySense.create({ data: { vocabularyId: vocabulary.id, order: temporaryOrderBase + existingSenses.length + index }, select: { id: true } })
        senseMap.set(sense.id, created.id)
      } else {
        senseMap.set(sense.id, sense.id)
      }
    }
    for (const [order, sense] of draft.senses.entries()) {
      await tx.vocabularySense.update({ where: { id: senseMap.get(sense.id)! }, data: { order } })
    }

    const definitionIds = duplicateIds(draft.definitions, '释义')
    assertExistingIds(definitionIds, new Set(existingDefinitions.map(item => item.id)), '释义')
    const sentenceIds = duplicateIds(draft.sentences, '例句')
    assertExistingIds(sentenceIds, new Set(existingLinks.map(item => item.id)), '例句')
    const patternIds = duplicateIds(draft.patterns, '句型')
    assertExistingIds(patternIds, new Set(existingPatterns.map(item => item.id)), '句型')
    const expressionIds = duplicateIds(draft.expressions, '表达')
    assertExistingIds(expressionIds, new Set(existingExpressions.map(item => item.id)), '表达')
    const noteIds = duplicateIds(draft.notes, '用法备注')
    assertExistingIds(noteIds, new Set(existingNotes.map(item => item.id)), '用法备注')
    const relationIds = duplicateIds(draft.relations, '关联词')
    assertExistingIds(relationIds, new Set(existingRelations.map(item => item.id)), '关联词')

    for (const item of [...draft.definitions, ...draft.sentences, ...draft.relations]) senseIdFor(item.senseId, senseMap, '记录')
    for (const item of [...draft.patterns, ...draft.expressions, ...draft.notes]) {
      if (!item.senseId) fail('句型、表达和用法备注必须归属于义项。')
      senseIdFor(item.senseId, senseMap, '记录')
    }

    const targetVocabularyIds = Array.from(new Set(draft.relations.map(item => item.targetVocabularyId).filter((id): id is string => Boolean(id))))
    if (targetVocabularyIds.length) {
      const targets = await tx.vocabulary.findMany({ where: { id: { in: targetVocabularyIds }, userId }, select: { id: true } })
      if (targets.length !== targetVocabularyIds.length) fail('关联词目标不存在或无权访问。', 'FORBIDDEN')
    }
    for (const relation of draft.relations) {
      if (!relation.targetVocabularyId && !relation.targetText) fail('关联词不能为空。')
    }

    const sentenceRows = await tx.vocabularySentenceLink.findMany({
      where: { vocabularyId: vocabulary.id },
      select: {
        id: true, sentenceId: true, senseId: true, meaningIndex: true, posTags: true,
        sentence: {
          select: {
            id: true, text: true, translation: true, audioFile: true, source: true, sourceUrl: true,
            sourceType: true, sourceId: true, sourceMetadata: true, provider: true, externalId: true,
            pronunciationData: true, pronunciationVersion: true,
            _count: { select: { links: true, grammarExamples: true } },
          },
        },
      },
    })
    sentenceRows.forEach(item => oldSentenceIds.add(item.sentenceId))
    const sentenceById = new Map(sentenceRows.map(item => [item.id, item]))

    await tx.vocabulary.update({
      where: { id: vocabulary.id },
      data: {
        word: draft.word,
        normalizedWord: normalizeVocabularyWord(draft.word),
        pronunciations: JSON.stringify(splitJapaneseEtymologies(draft.word, draft.pronunciations).pronunciations),
        etymologies: JSON.stringify(splitJapaneseEtymologies(draft.word, draft.pronunciations, draft.etymologies ?? parseJsonStringList(vocabulary.etymologies)).etymologies),
        partsOfSpeech: draft.partsOfSpeech.length ? JSON.stringify(draft.partsOfSpeech) : null,
        meanings: draft.meanings.length ? JSON.stringify(draft.meanings) : null,
        grammarPartOfSpeech: draft.grammarPartOfSpeech,
        transitivity: draft.transitivity,
        conjugationType: draft.conjugationType ?? null,
        wordAudio: draft.wordAudio ?? null,
        pronunciationData: wordPronunciation ? (wordPronunciation as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        pronunciationVersion: wordPronunciation ? PRONUNCIATION_VERSION : null,
      },
    })
    await replaceTags(tx, vocabulary.id, userId, draft.tags)

    const submittedDefinitionIds = new Set(definitionIds)
    await tx.vocabularyDefinition.deleteMany({ where: { vocabularyId: vocabulary.id, id: { notIn: Array.from(submittedDefinitionIds) } } })
    for (const [sortOrder, item] of draft.definitions.entries()) {
      const senseId = senseIdFor(item.senseId, senseMap, '释义')
      if (item.id) await tx.vocabularyDefinition.update({ where: { id: item.id }, data: { language: item.language, dictionaryName: item.dictionaryName, definition: item.definition, senseId, sortOrder } })
      else await tx.vocabularyDefinition.create({ data: { vocabularyId: vocabulary.id, language: item.language, dictionaryName: item.dictionaryName, definition: item.definition, senseId, sortOrder } })
    }

    const submittedSentenceIds = new Set(sentenceIds)
    await tx.vocabularySentenceLink.deleteMany({ where: { vocabularyId: vocabulary.id, id: { notIn: Array.from(submittedSentenceIds) } } })
    const perSenseSentenceOrder = new Map<string, number>()
    for (const item of draft.sentences) {
      const mappedSenseId = senseIdFor(item.senseId, senseMap, '例句')
      const orderKey = mappedSenseId || 'root'
      const sortOrder = perSenseSentenceOrder.get(orderKey) || 0
      perSenseSentenceOrder.set(orderKey, sortOrder + 1)
      await writeSentence(tx, vocabulary.id, item, mappedSenseId, sortOrder, item.id ? sentenceById.get(item.id) : undefined, sentencePronunciations)
    }

    const submittedPatternIds = new Set(patternIds)
    await tx.vocabularyPattern.deleteMany({ where: { sense: { vocabularyId: vocabulary.id }, id: { notIn: Array.from(submittedPatternIds) } } })
    const patternOrder = new Map<string, number>()
    for (const item of draft.patterns) {
      const senseId = senseIdFor(item.senseId, senseMap, '句型')!
      const sortOrder = patternOrder.get(senseId) || 0
      patternOrder.set(senseId, sortOrder + 1)
      if (item.id) await tx.vocabularyPattern.update({ where: { id: item.id }, data: { senseId, text: item.text, meaning: item.meaning ?? null, sortOrder } })
      else await tx.vocabularyPattern.create({ data: { senseId, text: item.text, meaning: item.meaning ?? null, sortOrder } })
    }

    const submittedExpressionIds = new Set(expressionIds)
    await tx.vocabularyExpression.deleteMany({ where: { sense: { vocabularyId: vocabulary.id }, id: { notIn: Array.from(submittedExpressionIds) } } })
    const expressionOrder = new Map<string, number>()
    for (const item of draft.expressions) {
      const senseId = senseIdFor(item.senseId, senseMap, '表达')!
      const sortOrder = expressionOrder.get(senseId) || 0
      expressionOrder.set(senseId, sortOrder + 1)
      if (item.id) await tx.vocabularyExpression.update({ where: { id: item.id }, data: { senseId, type: item.type, text: item.text, reading: item.reading ?? null, meaning: item.meaning ?? null, sortOrder } })
      else await tx.vocabularyExpression.create({ data: { senseId, type: item.type, text: item.text, reading: item.reading ?? null, meaning: item.meaning ?? null, sortOrder } })
    }

    const submittedNoteIds = new Set(noteIds)
    await tx.vocabularyUsageNote.deleteMany({ where: { sense: { vocabularyId: vocabulary.id }, id: { notIn: Array.from(submittedNoteIds) } } })
    const noteOrder = new Map<string, number>()
    for (const item of draft.notes) {
      const senseId = senseIdFor(item.senseId, senseMap, '用法备注')!
      const sortOrder = noteOrder.get(senseId) || 0
      noteOrder.set(senseId, sortOrder + 1)
      if (item.id) await tx.vocabularyUsageNote.update({ where: { id: item.id }, data: { senseId, type: item.type, text: item.text, sortOrder } })
      else await tx.vocabularyUsageNote.create({ data: { senseId, type: item.type, text: item.text, sortOrder } })
    }

    const submittedRelationIds = new Set(relationIds)
    await tx.vocabularyRelation.deleteMany({ where: { vocabularyId: vocabulary.id, id: { notIn: Array.from(submittedRelationIds) } } })
    const relationOrder = new Map<string, number>()
    for (const item of draft.relations) {
      const senseId = senseIdFor(item.senseId, senseMap, '关联词')
      const orderKey = senseId || 'root'
      const sortOrder = relationOrder.get(orderKey) || 0
      relationOrder.set(orderKey, sortOrder + 1)
      const normalized = normalizeRelationMetadata(item)
      const data = { senseId, type: normalized.type, targetVocabularyId: normalized.targetVocabularyId ?? null, targetText: normalized.targetText || null, targetReading: normalized.targetReading ?? null, marker: normalized.marker ?? null, pattern: normalized.pattern ?? null, sortOrder }
      if (item.id) await tx.vocabularyRelation.update({ where: { id: item.id }, data })
      else await tx.vocabularyRelation.create({ data: { vocabularyId: vocabulary.id, ...data } })
    }

    // Delete removed senses last; deleting them earlier would cascade-delete
    // their authored children before the submitted-ID checks and updates above.
    await tx.vocabularySense.deleteMany({ where: { vocabularyId: vocabulary.id, id: { notIn: Array.from(senseMap.values()) } } })

    await tx.wordbookVocabulary.deleteMany({ where: { vocabularyId: vocabulary.id, ...(requestedWordbookIds.length ? { wordbookId: { notIn: requestedWordbookIds } } : {}) } })
    if (requestedWordbookIds.length) await tx.wordbookVocabulary.createMany({ data: requestedWordbookIds.map(wordbookId => ({ vocabularyId: vocabulary.id, wordbookId })), skipDuplicates: true })
  })

  if (oldSentenceIds.size) {
    await prisma.vocabularySentence.deleteMany({ where: { id: { in: Array.from(oldSentenceIds) }, links: { none: {} }, grammarExamples: { none: {} } } })
  }
  const data = await readVocabularyInspectorData(userId, draft.id)
  if (!data) fail('保存后的单词记录无法读取。', 'INTERNAL_ERROR')
  return {
    data,
    meta: {
      pronunciations: data.entry.pronunciations,
      etymologies: data.entry.etymologies,
      partsOfSpeech: data.entry.partsOfSpeech,
      meanings: data.entry.meanings,
      wordAudio: data.entry.wordAudio,
    },
  }
}
