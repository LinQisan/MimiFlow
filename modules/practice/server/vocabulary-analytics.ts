import 'server-only'

import { CollectionType, MaterialType, Prisma } from '@prisma/client'
import { revalidateTag } from 'next/cache'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'

import prisma from '@/lib/prisma'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { readString } from '@/lib/validation/schema'
import {
  getVocabGrammarQuestionSection,
  isReadingGrammarQuestion,
} from '@/modules/questions/domain/paper-editor'
import { getSudachiPronunciationMap } from '@/modules/language/server/sudachi-pronunciation'
import type { SudachiToken } from '@/modules/language/domain/sudachi'
import { normalizeVocabularyWord } from '@/modules/knowledge/vocabulary/domain/normalized-word'
import {
  applyPracticeVocabularyKnowledge,
  buildPracticeVocabularyWordbookOptions,
  buildPracticeVocabularyAnalytics,
  buildPracticeVocabularyAnalyticsSummary,
  type PracticeVocabularyAnalytics,
  type PracticeVocabularyCategory,
  type PracticeVocabularyDocument,
  type PracticeVocabularyAnalyticsSummary,
} from '@/modules/practice/domain/vocabulary-analytics'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { parseJsonStringList } from '@/utils/text/jsonList'

// Batch the corpus through the shared native dictionary. Its version key is
// unchanged because Rust reproduces the same engine/dictionary/split-C output.
const SUDACHI_ANALYSIS_BATCH_CHARACTERS = 120_000
const SUDACHI_ANALYSIS_BATCH_TEXTS = 1_000
export const SUDACHI_ANALYSIS_TOKENIZER_VERSION =
  process.env.SUDACHI_TOKENIZER_VERSION?.trim() ||
  'sudachipy-0.6.11:sudachidict-full-20260428:split-c'

export const invalidatePracticeVocabularyAnalytics = () => {
  revalidateTag('practice-vocabulary-analytics', 'max')
}

const roundMilliseconds = (value: number) => Math.round(value * 10) / 10

const measurePromise = <T>(promise: PromiseLike<T>) => {
  const startedAt = performance.now()
  return Promise.resolve(promise).then(value => ({
    value,
    milliseconds: performance.now() - startedAt,
  }))
}

const asArray = <T = unknown>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : []

const extractYear = (value: string) =>
  value.match(/(?:19|20)\d{2}/)?.[0] || ''

const categoryForQuestion = (
  materialType: MaterialType,
  questionType: string,
): PracticeVocabularyCategory => {
  if (materialType === MaterialType.LISTENING) return 'LISTENING'
  if (materialType === MaterialType.READING) {
    return isReadingGrammarQuestion(questionType) ? 'GRAMMAR' : 'READING'
  }
  const section = getVocabGrammarQuestionSection(questionType).sectionNumber
  return section >= 1 && section <= 4 ? 'TEXT_VOCAB' : 'GRAMMAR'
}

const comparableText = (value: string) => value.replace(/\s+/g, ' ').trim()

const cleanAnalyticsText = (value: string) =>
  value
    .replace(/\[\[(?:sort(?::star)?|blank)\]\]/gi, ' ')
    .replace(/选项\s*\d*/g, ' ')

type PracticeVocabularyQuestionSource = {
  questionType: string
  content: unknown
  prompt: string | null
  context: string | null
  options: unknown
  answer: unknown
}

type PracticeVocabularyMaterialSource = {
  id: string
  type: MaterialType
  contentPayload: unknown
  questions: PracticeVocabularyQuestionSource[]
}

type MaterialDocumentGroup = {
  materialId: string
  documents: PracticeVocabularyDocument[]
  occurrences: Array<{ globalStart: number; length: number }>
  sourceHash: string
  cachedTokens?: SudachiToken[]
}

type StoredSudachiToken = {
  surface: string
  dictionaryForm: string
  normalizedForm: string
  reading: string
  dictionaryReading: string
  partsOfSpeech: string[]
  textIndex: number
}

const buildPracticeVocabularyMaterialDocuments = ({
  paperId,
  year,
  material,
}: {
  paperId: string
  year: string
  material: PracticeVocabularyMaterialSource
}) => {
  const documents: PracticeVocabularyDocument[] = []
  const append = (
    category: PracticeVocabularyCategory,
    kind: PracticeVocabularyDocument['kind'],
    value: string,
  ) => {
    const text = cleanAnalyticsText(value).trim()
    if (!text) return
    documents.push({ paperId, year, category, kind, text })
  }
  const payload = decodeMaterialPayloadRecord(
    material.type,
    material.contentPayload,
  )

  if (material.type === MaterialType.READING) {
    const readingCategory = material.questions.every(question =>
      isReadingGrammarQuestion(question.questionType),
    )
      ? 'GRAMMAR'
      : 'READING'
    append(
      readingCategory,
      'body',
      readString(payload.text),
    )
  }
  if (material.type === MaterialType.LISTENING) {
    const dialogueText = asArray<Record<string, unknown>>(payload.dialogues)
      .map(dialogue => readString(dialogue.text))
      .filter(Boolean)
      .join('\n')
    append(
      'LISTENING',
      'body',
      dialogueText || readString(payload.transcript) || readString(payload.text),
    )
  }

  material.questions.forEach(question => {
    const category = categoryForQuestion(
      material.type,
      question.questionType,
    )
    const prompt = readString(question.prompt)
    const context = readString(question.context)
    const questionParts = [prompt]
    if (context && comparableText(context) !== comparableText(prompt)) {
      questionParts.push(context)
    }
    append(category, 'question', questionParts.join('\n'))

    const optionRows = asArray<Record<string, unknown>>(question.options)
      .map(option => ({
        id: readString(option.id),
        text: readString(option.text),
      }))
      .filter(option => option.text)
    append(
      category,
      'option',
      optionRows.map(option => option.text).join('\n'),
    )

    const content = decodeQuestionContent(question.content)
    const answerIds = new Set(
      (Array.isArray(question.answer)
        ? question.answer
        : [question.answer]
      ).filter((value): value is string => typeof value === 'string'),
    )
    const correctOptionTexts = optionRows
      .filter(option => answerIds.has(option.id))
      .map(option => option.text)
    const targetParts = [readString(content.targetWord)]
    if (category === 'TEXT_VOCAB') {
      if (question.questionType === 'WORD_DISTINCTION') {
        targetParts.push(prompt)
      }
      if (
        question.questionType === 'GRAMMAR' ||
        !readString(content.targetWord)
      ) {
        targetParts.push(...correctOptionTexts)
      }
    }
    append(
      category,
      'target',
      Array.from(new Set(targetParts.filter(Boolean))).join('\n'),
    )
  })

  return documents
}

const getMaterialSourceHash = (documents: PracticeVocabularyDocument[]) =>
  createHash('sha256')
    .update(JSON.stringify(documents.map(document => document.text)))
    .digest('hex')

const toStoredSudachiTokens = (tokens: SudachiToken[]): StoredSudachiToken[] =>
  tokens.map(token => ({
    surface: token.surface,
    dictionaryForm: token.dictionaryForm,
    normalizedForm: token.normalizedForm,
    reading: token.reading,
    dictionaryReading: token.dictionaryReading,
    partsOfSpeech: token.partsOfSpeech,
    textIndex: token.textIndex,
  }))

const parseStoredSudachiTokens = (value: unknown): SudachiToken[] | null => {
  if (!Array.isArray(value)) return null
  const tokens: SudachiToken[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    if (
      typeof row.surface !== 'string' ||
      typeof row.dictionaryForm !== 'string' ||
      typeof row.normalizedForm !== 'string' ||
      typeof row.reading !== 'string' ||
      typeof row.dictionaryReading !== 'string' ||
      !Array.isArray(row.partsOfSpeech) ||
      !row.partsOfSpeech.every(part => typeof part === 'string') ||
      typeof row.textIndex !== 'number' ||
      !Number.isInteger(row.textIndex) ||
      row.textIndex < 0
    ) {
      return null
    }
    tokens.push({
      surface: row.surface,
      dictionaryForm: row.dictionaryForm,
      normalizedForm: row.normalizedForm,
      reading: row.reading,
      dictionaryReading: row.dictionaryReading,
      partsOfSpeech: row.partsOfSpeech,
      textIndex: row.textIndex,
      begin: 0,
      end: 0,
    })
  }
  return tokens
}

async function analyzePracticeVocabularyDocuments(
  documents: PracticeVocabularyDocument[],
) {
  const batches: Array<{
    documentIndexes: number[]
    texts: string[]
  }> = []
  let documentIndexes: number[] = []
  let texts: string[] = []
  let characterCount = 0

  const flush = () => {
    if (texts.length === 0) return
    batches.push({ documentIndexes, texts })
    documentIndexes = []
    texts = []
    characterCount = 0
  }

  documents.forEach((document, documentIndex) => {
    const exceedsBatchLimit =
      texts.length > 0 &&
      (texts.length >= SUDACHI_ANALYSIS_BATCH_TEXTS ||
        characterCount + document.text.length > SUDACHI_ANALYSIS_BATCH_CHARACTERS)
    if (exceedsBatchLimit) flush()
    documentIndexes.push(documentIndex)
    texts.push(document.text)
    characterCount += document.text.length
  })
  flush()

  const tokens: SudachiToken[] = []
  // Each worker loads the full Sudachi dictionary. Keep batches sequential so
  // large requests do not start several memory-heavy Python processes at once.
  for (const batch of batches) {
    const analysis = await getSudachiPronunciationMap(batch.texts)
    if (!analysis.available) {
      throw new Error('SudachiPy is unavailable for practice vocabulary analysis')
    }
    analysis.tokens.forEach(token => {
      const documentIndex = batch.documentIndexes[token.textIndex]
      if (documentIndex === undefined) return
      tokens.push({ ...token, textIndex: documentIndex })
    })
  }

  if (documents.length > 0 && tokens.length === 0) {
    throw new Error('SudachiPy returned no tokens for practice vocabulary analysis')
  }
  return tokens
}

const cachedTokensForMaterial = (value: unknown) => {
  const parsed = parseStoredSudachiTokens(value)
  return parsed && parsed.every(token => token.textIndex >= 0) ? parsed : null
}

const persistMaterialAnalyses = async (
  entries: Array<{
    materialId: string
    sourceHash: string
    tokens: SudachiToken[]
  }>,
) => {
  if (entries.length === 0) return
  const materialIds = entries.map(entry => entry.materialId)
  const existingRows = await prisma.materialSudachiAnalysis.findMany({
    where: { materialId: { in: materialIds } },
    select: { materialId: true },
  })
  const existingIds = new Set(existingRows.map(row => row.materialId))
  const now = new Date()
  const rows = entries.map(entry => ({
    materialId: entry.materialId,
    sourceHash: entry.sourceHash,
    tokenizerVersion: SUDACHI_ANALYSIS_TOKENIZER_VERSION,
    tokenizedAt: now,
    tokens: toStoredSudachiTokens(entry.tokens) as unknown as Prisma.InputJsonValue,
  }))
  const rowsToCreate = rows.filter(row => !existingIds.has(row.materialId))
  const rowsToUpdate = rows.filter(row => existingIds.has(row.materialId))
  if (rowsToCreate.length > 0) {
    await prisma.materialSudachiAnalysis.createMany({
      data: rowsToCreate,
      skipDuplicates: true,
    })
  }
  // Updates are uncommon (only source/version changes). They are independent
  // and do not need a long serial transaction that blocks the request pool.
  await Promise.all(
    rowsToUpdate.map(row =>
      prisma.materialSudachiAnalysis.update({
        where: { materialId: row.materialId },
        data: {
          sourceHash: row.sourceHash,
          tokenizerVersion: row.tokenizerVersion,
          tokenizedAt: row.tokenizedAt,
          tokens: row.tokens,
        },
      }),
    ),
  )
}

const analyzeMissingMaterialGroups = async (
  groups: MaterialDocumentGroup[],
) => {
  if (groups.length === 0) {
    return {
      tokensByMaterialId: new Map<string, SudachiToken[]>(),
      persisted: 0,
    }
  }
  const missingDocuments: PracticeVocabularyDocument[] = []
  const offsets = new Map<string, { start: number; length: number }>()
  groups.forEach(group => {
    const start = missingDocuments.length
    missingDocuments.push(...group.documents)
    offsets.set(group.materialId, {
      start,
      length: group.documents.length,
    })
  })
  const missingTokens = await analyzePracticeVocabularyDocuments(missingDocuments)
  const entries = groups.map(group => {
    const offset = offsets.get(group.materialId)!
    return {
      materialId: group.materialId,
      sourceHash: group.sourceHash,
      tokens: missingTokens
        .filter(
          token =>
            token.textIndex >= offset.start &&
            token.textIndex < offset.start + offset.length,
        )
        .map(token => ({
          ...token,
          textIndex: token.textIndex - offset.start,
        })),
    }
  })
  await persistMaterialAnalyses(entries)
  return {
    tokensByMaterialId: new Map(
      entries.map(entry => [entry.materialId, entry.tokens]),
    ),
    persisted: entries.length,
  }
}

export async function personalizePracticeVocabularyAnalytics(
  analytics: PracticeVocabularyAnalytics,
) {
  const startedAt = performance.now()
  const userId = await getCurrentUserId()
  const userLookupMs = performance.now() - startedAt
  const candidateWords = Array.from(new Set(analytics.words.map(row => row.word)))
  const activeWordbookWhere = { userId } as const
  const databaseStartedAt = performance.now()
  // Keep this as one flat query and return only the fields needed for the Map.
  // Prisma relation filters otherwise materialize nested vocabulary objects and
  // add avoidable overhead to the large candidate-word predicate. Passing the
  // words as one text[] parameter also avoids generating a 4,000+ placeholder
  // statement when the full corpus is personalized.
  const wordbookLinksPromise = candidateWords.length === 0
    ? Promise.resolve<Array<{ wordbookId: string; word: string }>>([])
    : prisma.$queryRaw<Array<{ wordbookId: string; word: string }>>`
        SELECT wv.wordbook_id AS "wordbookId", vocabulary.word
        FROM wordbook_vocabularies AS wv
        INNER JOIN wordbooks AS wordbook
          ON wordbook.id = wv.wordbook_id
        INNER JOIN "Vocabulary" AS vocabulary
          ON vocabulary.id = wv.vocabulary_id
        WHERE wordbook.user_id = ${userId}
          AND vocabulary.user_id = ${userId}
          AND vocabulary.word = ANY(${candidateWords})
      `
  const [wordbookResult, masteredResult, wordbookLinksResult] = await Promise.all([
    measurePromise(prisma.wordbook.findMany({
      where: activeWordbookWhere,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        series: { select: { id: true, title: true } },
        _count: { select: { entries: true } },
      },
    })),
    measurePromise(prisma.practiceVocabularyPreference.findMany({
      where: { userId, mastered: true },
      select: { normalizedWord: true },
    })),
    measurePromise(wordbookLinksPromise),
  ])
  const wordbookRows = wordbookResult.value
  const masteredRows = masteredResult.value
  const wordbookLinks = wordbookLinksResult.value
  const databaseMs = performance.now() - databaseStartedAt
  const calculationStartedAt = performance.now()
  const wordbookOptions = buildPracticeVocabularyWordbookOptions(
    wordbookRows.map(row => ({
      id: row.id,
      title: row.title,
      seriesTitle: row.series.title,
      seriesId: row.series.id,
      count: row._count.entries,
    })),
  )
  const matchesByWord = new Map<
    string,
    { word: string; wordbookIds: Set<string> }
  >()
  wordbookLinks.forEach(link => {
    const current = matchesByWord.get(link.word) || {
      word: link.word,
      wordbookIds: new Set<string>(),
    }
    current.wordbookIds.add(link.wordbookId)
    matchesByWord.set(link.word, current)
  })
  const wordbookMatches = [...matchesByWord.values()].map(match => ({
    word: match.word,
    wordbookIds: [...match.wordbookIds],
  }))
  const personalized = applyPracticeVocabularyKnowledge(
    analytics,
    wordbookMatches,
    masteredRows.map(row => row.normalizedWord),
    wordbookOptions,
  )
  console.info(
    '[practice-vocabulary-analytics] personalization timing',
    JSON.stringify({
      userLookupMs: roundMilliseconds(userLookupMs),
      databaseMs: roundMilliseconds(databaseMs),
      wordbooksQueryMs: roundMilliseconds(wordbookResult.milliseconds),
      masteredQueryMs: roundMilliseconds(masteredResult.milliseconds),
      wordbookLinksQueryMs: roundMilliseconds(wordbookLinksResult.milliseconds),
      calculationMs: roundMilliseconds(performance.now() - calculationStartedAt),
      candidateWords: candidateWords.length,
      matchedWords: wordbookMatches.length,
      wordbookLinks: wordbookLinks.length,
      wordbooks: wordbookOptions.length,
    }),
  )
  return personalized
}

export async function getPracticeVocabularyAnalyticsSummary(
  analytics: PracticeVocabularyAnalytics,
): Promise<PracticeVocabularyAnalyticsSummary> {
  const startedAt = performance.now()
  const userId = await getCurrentUserId()
  const userLookupMs = performance.now() - startedAt
  const databaseStartedAt = performance.now()
  const masteredRows = await prisma.practiceVocabularyPreference.findMany({
    where: { userId, mastered: true },
    select: { normalizedWord: true },
  })
  const databaseMs = performance.now() - databaseStartedAt
  const calculationStartedAt = performance.now()
  const summary = buildPracticeVocabularyAnalyticsSummary(
    analytics,
    masteredRows.map(row => row.normalizedWord),
  )
  const calculationMs = performance.now() - calculationStartedAt
  console.info(
    '[practice-vocabulary-analytics] summary timing',
    JSON.stringify({
      userLookupMs: roundMilliseconds(userLookupMs),
      databaseMs: roundMilliseconds(databaseMs),
      calculationMs: roundMilliseconds(calculationMs),
      totalMs: roundMilliseconds(performance.now() - startedAt),
      masteredWords: masteredRows.length,
      wordCount: summary.wordCount,
      topItemCount: summary.topItems.words.length,
    }),
  )
  return summary
}

export async function getPracticeVocabularyWordbookEntries(
  requestedWordbookIds: string[],
) {
  const userId = await getCurrentUserId()
  const selectedIds = Array.from(
    new Set(requestedWordbookIds.map(id => id.trim()).filter(Boolean)),
  )
  if (selectedIds.length === 0) return []

  const wordbooks = await prisma.wordbook.findMany({
    where: {
      id: { in: selectedIds },
      userId,
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, series: { select: { title: true } } },
  })
  const byId = new Map(wordbooks.map(row => [row.id, row]))
  const validSelectedIds = selectedIds.filter(id => byId.has(id))
  if (validSelectedIds.length === 0) return []

  const links = await prisma.wordbookVocabulary.findMany({
    where: {
      wordbookId: { in: validSelectedIds },
      wordbook: { userId },
      vocabulary: { userId },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      wordbookId: true,
      vocabulary: {
        select: {
          id: true,
          word: true,
          pronunciations: true,
          partsOfSpeech: true,
        },
      },
    },
  })
  const masteredRows = await prisma.practiceVocabularyPreference.findMany({
    where: { userId, mastered: true },
    select: { normalizedWord: true },
  })
  const masteredWords = new Set(masteredRows.map(row => row.normalizedWord))
  const matchesByVocabulary = new Map<
    string,
    {
      word: string
      reading: string
      partOfSpeech: string
      wordbookIds: Set<string>
      wordbookNames: Set<string>
    }
  >()
  links.forEach(link => {
    const current = matchesByVocabulary.get(link.vocabulary.id) || {
      word: link.vocabulary.word,
      reading: parseJsonStringList(link.vocabulary.pronunciations)[0] || '',
      partOfSpeech: parseJsonStringList(link.vocabulary.partsOfSpeech)[0] || '',
      wordbookIds: new Set<string>(),
      wordbookNames: new Set<string>(),
    }
    current.wordbookIds.add(link.wordbookId)
    const wordbook = byId.get(link.wordbookId)
    current.wordbookNames.add(
      wordbook ? `${wordbook.series.title} / ${wordbook.title}` : '',
    )
    matchesByVocabulary.set(link.vocabulary.id, current)
  })

  return [...matchesByVocabulary.values()].map(row => ({
    word: row.word,
    reading: row.reading,
    partOfSpeech: row.partOfSpeech,
    wordbookIds: [...row.wordbookIds],
    wordbookNames: [...row.wordbookNames].filter(Boolean),
    isMastered: masteredWords.has(normalizeVocabularyWord(row.word)),
  }))
}

export async function precomputePracticeVocabularyMaterialAnalyses(
  requestedMaterialIds: string[] = [],
) {
  const startedAt = performance.now()
  const materialIds = Array.from(
    new Set(requestedMaterialIds.map(id => id.trim()).filter(Boolean)),
  )
  const materials = await prisma.material.findMany({
    where: {
      ...(materialIds.length > 0 ? { id: { in: materialIds } } : {}),
      type: {
        in: [
          MaterialType.VOCAB_GRAMMAR,
          MaterialType.READING,
          MaterialType.LISTENING,
        ],
      },
      collectionMaterials: {
        some: {
          collection: {
            collectionType: CollectionType.PAPER,
            OR: [
              { language: { equals: 'ja', mode: 'insensitive' } },
              { language: { startsWith: 'ja-', mode: 'insensitive' } },
              { language: { equals: 'japanese', mode: 'insensitive' } },
              { language: { in: ['日语', '日本語'] } },
            ],
          },
        },
      },
    },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      type: true,
      contentPayload: true,
      questions: {
        orderBy: { sortOrder: 'asc' },
        select: {
          questionType: true,
          content: true,
          prompt: true,
          context: true,
          options: true,
          answer: true,
        },
      },
      collectionMaterials: {
        where: {
          collection: {
            collectionType: CollectionType.PAPER,
            OR: [
              { language: { equals: 'ja', mode: 'insensitive' } },
              { language: { startsWith: 'ja-', mode: 'insensitive' } },
              { language: { equals: 'japanese', mode: 'insensitive' } },
              { language: { in: ['日语', '日本語'] } },
            ],
          },
        },
        take: 1,
        select: {
          collection: { select: { id: true, title: true } },
        },
      },
    },
  })
  const groups = materials.flatMap(material => {
    const paper = material.collectionMaterials[0]?.collection
    if (!paper) return []
    const documents = buildPracticeVocabularyMaterialDocuments({
      paperId: paper.id,
      year: extractYear(paper.title),
      material,
    })
    if (documents.length === 0) return []
    return [
      {
        materialId: material.id,
        documents,
        occurrences: [{ globalStart: 0, length: documents.length }],
        sourceHash: getMaterialSourceHash(documents),
      } satisfies MaterialDocumentGroup,
    ]
  })
  const existingRows = groups.length === 0
    ? []
    : await prisma.materialSudachiAnalysis.findMany({
        where: { materialId: { in: groups.map(group => group.materialId) } },
        select: {
          materialId: true,
          sourceHash: true,
          tokenizerVersion: true,
          tokens: true,
        },
      })
  const existingByMaterialId = new Map(
    existingRows.map(row => [row.materialId, row]),
  )
  const missingGroups = groups.filter(group => {
    const row = existingByMaterialId.get(group.materialId)
    const tokens =
      row &&
      row.sourceHash === group.sourceHash &&
      row.tokenizerVersion === SUDACHI_ANALYSIS_TOKENIZER_VERSION
        ? cachedTokensForMaterial(row.tokens)
        : null
    return !tokens || !tokens.every(token => token.textIndex < group.documents.length)
  })
  const analysisStartedAt = performance.now()
  let result: { persisted: number }
  try {
    result = await analyzeMissingMaterialGroups(missingGroups)
  } catch (error) {
    // Precomputation is an optimization on the write path. A missing Python
    // environment must not turn a successful content write into a failed one;
    // the read path will retry the missing/stale row with its correctness
    // preserving fallback.
    console.warn(
      '[practice-vocabulary-analytics] precompute skipped',
      error instanceof Error ? error.message : error,
    )
    result = { persisted: 0 }
  }
  console.info(
    '[practice-vocabulary-analytics] precompute timing',
    JSON.stringify({
      requestedMaterials: materialIds.length,
      eligibleMaterials: groups.length,
      cacheHitMaterials: groups.length - missingGroups.length,
      missingMaterials: missingGroups.length,
      persistedMaterials: result.persisted,
      databaseMs: roundMilliseconds(analysisStartedAt - startedAt),
      sudachiAndPersistMs: roundMilliseconds(performance.now() - analysisStartedAt),
      totalMs: roundMilliseconds(performance.now() - startedAt),
    }),
  )
  return {
    eligibleMaterials: groups.length,
    cacheHitMaterials: groups.length - missingGroups.length,
    analyzedMaterials: result.persisted,
  }
}

export async function getPracticeVocabularyAnalytics() {
  const startedAt = performance.now()
  const databaseStartedAt = performance.now()
  const collections = await prisma.collection.findMany({
    where: {
      collectionType: CollectionType.PAPER,
      OR: [
        { language: { equals: 'ja', mode: 'insensitive' } },
        { language: { startsWith: 'ja-', mode: 'insensitive' } },
        { language: { equals: 'japanese', mode: 'insensitive' } },
        { language: { in: ['日语', '日本語'] } },
      ],
    },
    orderBy: [{ title: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      materials: {
        where: {
          material: {
            type: {
              in: [
                MaterialType.VOCAB_GRAMMAR,
                MaterialType.READING,
                MaterialType.LISTENING,
              ],
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
        select: {
          material: {
            select: {
              id: true,
              type: true,
              contentPayload: true,
              questions: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  questionType: true,
                  content: true,
                  prompt: true,
                  context: true,
                  options: true,
                  answer: true,
                },
              },
            },
          },
        },
      },
    },
  })
  const baseDatabaseMs = performance.now() - databaseStartedAt
  const documentStartedAt = performance.now()
  const papers = collections
  const documents: PracticeVocabularyDocument[] = []
  const materialGroups = new Map<string, MaterialDocumentGroup>()

  papers.forEach(paper => {
    const year = extractYear(paper.title)
    paper.materials.forEach(relation => {
      const material = relation.material
      if (
        material.type !== MaterialType.VOCAB_GRAMMAR &&
        material.type !== MaterialType.READING &&
        material.type !== MaterialType.LISTENING
      ) return
      const localDocuments = buildPracticeVocabularyMaterialDocuments({
        paperId: paper.id,
        year,
        material,
      })
      if (localDocuments.length === 0) return
      let group = materialGroups.get(material.id)
      if (!group) {
        group = {
          materialId: material.id,
          documents: localDocuments,
          occurrences: [],
          sourceHash: getMaterialSourceHash(localDocuments),
        }
        materialGroups.set(material.id, group)
      }
      const globalStart = documents.length
      documents.push(...localDocuments.map(document => ({ ...document, paperTitle: paper.title })))
      group.occurrences.push({
        globalStart,
        length: localDocuments.length,
      })
    })
  })
  const documentMs = performance.now() - documentStartedAt

  const analysisCacheStartedAt = performance.now()
  const materialIds = [...materialGroups.keys()]
  const analysisRows = materialIds.length === 0
    ? []
    : await prisma.materialSudachiAnalysis.findMany({
        where: { materialId: { in: materialIds } },
        select: {
          materialId: true,
          sourceHash: true,
          tokenizerVersion: true,
          tokens: true,
        },
      })
  const analysisCacheQueryMs = performance.now() - analysisCacheStartedAt
  const analysisRowsByMaterialId = new Map(
    analysisRows.map(row => [row.materialId, row]),
  )
  const missingGroups: MaterialDocumentGroup[] = []
  let cacheHitMaterials = 0
  let staleMaterials = 0
  materialGroups.forEach(group => {
    const cached = analysisRowsByMaterialId.get(group.materialId)
    const cachedTokens =
      cached &&
      cached.sourceHash === group.sourceHash &&
      cached.tokenizerVersion === SUDACHI_ANALYSIS_TOKENIZER_VERSION
        ? cachedTokensForMaterial(cached.tokens)
        : null
    if (
      cachedTokens &&
      cachedTokens.every(token => token.textIndex < group.documents.length)
    ) {
      group.cachedTokens = cachedTokens
      cacheHitMaterials += 1
      return
    }
    if (cached) staleMaterials += 1
    missingGroups.push(group)
  })

  const sudachiStartedAt = performance.now()
  const missingAnalysis = await analyzeMissingMaterialGroups(missingGroups)
  const sudachiMs = performance.now() - sudachiStartedAt
  const tokens: SudachiToken[] = []
  materialGroups.forEach(group => {
    const localTokens =
      group.cachedTokens ||
      missingAnalysis.tokensByMaterialId.get(group.materialId) ||
      []
    group.occurrences.forEach(occurrence => {
      localTokens.forEach(token => {
        if (token.textIndex >= group.documents.length) return
        tokens.push({
          ...token,
          textIndex: occurrence.globalStart + token.textIndex,
        })
      })
    })
  })
  const calculationStartedAt = performance.now()
  const analytics = buildPracticeVocabularyAnalytics({
    documents,
    tokens,
    totalPapers: papers.length,
  })
  const calculationMs = performance.now() - calculationStartedAt
  console.info(
    '[practice-vocabulary-analytics] base timing',
    JSON.stringify({
      databaseMs: roundMilliseconds(baseDatabaseMs + analysisCacheQueryMs),
      baseDatabaseMs: roundMilliseconds(baseDatabaseMs),
      analysisCacheQueryMs: roundMilliseconds(analysisCacheQueryMs),
      documentMs: roundMilliseconds(documentMs),
      sudachiMs: roundMilliseconds(sudachiMs),
      calculationMs: roundMilliseconds(calculationMs),
      totalMs: roundMilliseconds(performance.now() - startedAt),
      papers: papers.length,
      documents: documents.length,
      tokens: tokens.length,
      words: analytics.words.length,
      materialGroups: materialGroups.size,
      cacheHitMaterials,
      staleMaterials,
      missingMaterials: missingGroups.length,
      persistedMaterials: missingAnalysis.persisted,
    }),
  )
  return analytics
}
