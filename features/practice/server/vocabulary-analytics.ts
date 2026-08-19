import { CollectionType, MaterialType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { readString } from '@/lib/validation/schema'
import {
  getVocabGrammarQuestionSection,
  isReadingGrammarQuestion,
} from '@/features/questions/domain/paper-editor'
import { getSudachiPronunciationMap } from '@/features/reading/server/sudachi-pronunciation'
import {
  buildPracticeVocabularyAnalytics,
  type PracticeVocabularyCategory,
  type PracticeVocabularyDocument,
} from '@/features/practice/domain/vocabulary-analytics'

const TREND_YEARS = ['2022', '2023', '2024', '2025', '2026']

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

  const sudachi = await getSudachiPronunciationMap(
    documents.map(document => document.text),
  )
  return buildPracticeVocabularyAnalytics({
    documents,
    tokens: sudachi.tokens,
    totalPapers: papers.length,
    years: TREND_YEARS,
  })
}
