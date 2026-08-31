import { CollectionType, MaterialType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { readString } from '@/lib/validation/schema'
import {
  getVocabGrammarQuestionSection,
  isReadingGrammarQuestion,
} from '@/modules/questions/domain/paper-editor'
import { getSudachiPronunciationMap } from '@/features/reading/server/sudachi-pronunciation'
import type { SudachiToken } from '@/modules/language/domain/sudachi'
import {
  applyPracticeVocabularyKnowledge,
  buildPracticeVocabularyWordbookOptions,
  buildPracticeVocabularyAnalytics,
  type PracticeVocabularyAnalytics,
  type PracticeVocabularyCategory,
  type PracticeVocabularyDocument,
} from '@/features/practice/domain/vocabulary-analytics'
import { getCurrentUserId } from '@/modules/users/server/current-user'
import { parseJsonStringList } from '@/utils/text/jsonList'

const VOCABULARY_MATCH_BATCH_SIZE = 1_500
const SUDACHI_ANALYSIS_BATCH_CHARACTERS = 40_000
const SUDACHI_ANALYSIS_BATCH_TEXTS = 120

const asArray = <T = unknown>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : []

const extractYear = (value: string) =>
  value.match(/(?:19|20)\d{2}/)?.[0] || ''

const isJapaneseLanguage = (value: string | null) => {
  const language = (value || '').trim().toLowerCase()
  return (
    language === 'ja' ||
    language.startsWith('ja-') ||
    language === 'japanese' ||
    language === '日语' ||
    language === '日本語'
  )
}

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

export async function personalizePracticeVocabularyAnalytics(
  analytics: PracticeVocabularyAnalytics,
) {
  const userId = await getCurrentUserId()
  const candidateWords = Array.from(new Set(analytics.words.map(row => row.word)))
  const wordBatches = Array.from(
    { length: Math.ceil(candidateWords.length / VOCABULARY_MATCH_BATCH_SIZE) },
    (_, index) => candidateWords.slice(
      index * VOCABULARY_MATCH_BATCH_SIZE,
      (index + 1) * VOCABULARY_MATCH_BATCH_SIZE,
    ),
  )
  const activeWordbookWhere = {
    userId,
    NOT: { id: { startsWith: 'legacy-' } },
  } as const
  const [wordbookRows, masteredRows, vocabularyBatches] = await Promise.all([
    prisma.wordbook.findMany({
      where: activeWordbookWhere,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        series: { select: { title: true } },
        _count: { select: { entries: true } },
      },
    }),
    prisma.practiceVocabularyPreference.findMany({
      where: { userId, mastered: true },
      select: { normalizedWord: true },
    }),
    Promise.all(wordBatches.map(words => prisma.vocabulary.findMany({
      where: {
        userId,
        word: { in: words },
        wordbooks: { some: { wordbook: activeWordbookWhere } },
      },
      select: {
        word: true,
        wordbooks: {
          where: { wordbook: activeWordbookWhere },
          select: { wordbookId: true },
        },
      },
    }))),
  ])
  const wordbookOptions = buildPracticeVocabularyWordbookOptions(
    wordbookRows.map(row => ({
      id: row.id,
      title: row.title,
      seriesTitle: row.series.title,
      count: row._count.entries,
    })),
  )
  const pathById = new Map(wordbookOptions.map(option => [option.id, option.pathLabel]))
  const wordbookMatches = vocabularyBatches.flat().map(vocabulary => {
    const directIds = vocabulary.wordbooks.map(link => link.wordbookId)
    return {
      word: vocabulary.word,
      wordbookIds: Array.from(new Set(directIds)),
      wordbookNames: Array.from(
        new Set(directIds.map(id => pathById.get(id)).filter(Boolean)),
      ) as string[],
    }
  })
  return applyPracticeVocabularyKnowledge(
    analytics,
    wordbookMatches,
    masteredRows.map(row => row.normalizedWord),
    wordbookOptions,
  )
}

export async function getPracticeVocabularyWordbookEntries(
  requestedWordbookIds: string[],
) {
  const userId = await getCurrentUserId()
  const selectedIds = Array.from(
    new Set(requestedWordbookIds.map(id => id.trim()).filter(Boolean)),
  ).slice(0, 50)
  if (selectedIds.length === 0) return []

  const wordbooks = await prisma.wordbook.findMany({
    where: {
      userId,
      NOT: { id: { startsWith: 'legacy-' } },
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
    const matchedSelections = validSelectedIds.filter(id => id === link.wordbookId)
    if (matchedSelections.length === 0) return
    const current = matchesByVocabulary.get(link.vocabulary.id) || {
      word: link.vocabulary.word,
      reading: parseJsonStringList(link.vocabulary.pronunciations)[0] || '',
      partOfSpeech: parseJsonStringList(link.vocabulary.partsOfSpeech)[0] || '',
      wordbookIds: new Set<string>(),
      wordbookNames: new Set<string>(),
    }
    matchedSelections.forEach(id => {
      current.wordbookIds.add(id)
      const wordbook = byId.get(id)
      current.wordbookNames.add(
        wordbook ? `${wordbook.series.title} / ${wordbook.title}` : '',
      )
    })
    matchesByVocabulary.set(link.vocabulary.id, current)
  })

  return [...matchesByVocabulary.values()].map(row => ({
    word: row.word,
    reading: row.reading,
    partOfSpeech: row.partOfSpeech,
    wordbookIds: [...row.wordbookIds],
    wordbookNames: [...row.wordbookNames].filter(Boolean),
  }))
}

export async function getPracticeVocabularyAnalytics() {
  const collections = await prisma.collection.findMany({
    where: { collectionType: CollectionType.PAPER },
    orderBy: [{ title: 'asc' }, { createdAt: 'asc' }],
    include: {
      materials: {
        orderBy: { sortOrder: 'asc' },
        include: {
          material: {
            select: {
              id: true,
              type: true,
              contentPayload: true,
              questions: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
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
  const papers = collections.filter(collection =>
    isJapaneseLanguage(collection.language),
  )
  const documents: PracticeVocabularyDocument[] = []

  const append = (
    paperId: string,
    year: string,
    category: PracticeVocabularyCategory,
    kind: PracticeVocabularyDocument['kind'],
    value: string,
  ) => {
    const text = cleanAnalyticsText(value).trim()
    if (!text) return
    documents.push({ paperId, year, category, kind, text })
  }

  papers.forEach(paper => {
    const year = extractYear(paper.title)
    paper.materials.forEach(relation => {
      const material = relation.material
      if (
        material.type !== MaterialType.VOCAB_GRAMMAR &&
        material.type !== MaterialType.READING &&
        material.type !== MaterialType.LISTENING
      ) return
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
          paper.id,
          year,
          readingCategory,
          'body',
          readString(payload.text) || readString(payload.transcript),
        )
      }
      if (material.type === MaterialType.LISTENING) {
        const dialogueText = asArray<Record<string, unknown>>(payload.dialogues)
          .map(dialogue => readString(dialogue.text))
          .filter(Boolean)
          .join('\n')
        append(
          paper.id,
          year,
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
        if (
          context &&
          comparableText(context) !== comparableText(prompt)
        ) questionParts.push(context)
        append(paper.id, year, category, 'question', questionParts.join('\n'))

        const optionRows = asArray<Record<string, unknown>>(question.options)
          .map(option => ({
            id: readString(option.id),
            text: readString(option.text),
          }))
          .filter(option => option.text)
        append(
          paper.id,
          year,
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
          paper.id,
          year,
          category,
          'target',
          Array.from(new Set(targetParts.filter(Boolean))).join('\n'),
        )
      })
    })
  })

  const tokens = await analyzePracticeVocabularyDocuments(documents)
  return buildPracticeVocabularyAnalytics({
    documents,
    tokens,
    totalPapers: papers.length,
  })
}
