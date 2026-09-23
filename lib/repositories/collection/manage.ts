import { MaterialType, type Question } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getMaterialDisplayTitle } from '../materials/material-title'
import {
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
} from '@/utils/questions/optionLabels'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { readBoolean, readString } from '@/lib/validation/schema'

type JsonRecord = Record<string, unknown>

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asPositiveIntegerString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const normalized = Math.floor(value)
      if (normalized > 0) return String(normalized)
    }
    if (typeof value === 'string' && value.trim()) {
      const matched = value.trim().match(/\d+/)
      if (!matched) continue
      const normalized = Number(matched[0])
      if (Number.isFinite(normalized) && normalized > 0) {
        return String(Math.floor(normalized))
      }
    }
  }
  return ''
}

function normalizeQuestionOptions(options: unknown, answer: unknown) {
  const optionRows = asArray<JsonRecord>(options).map((opt, index) => ({
    id: readString(opt.id) || `opt_${index + 1}`,
    text: readString(opt.text),
    imageUrl: readString(opt.imageUrl),
  }))
  const answerIds = new Set(
    Array.isArray(answer)
      ? answer.filter((item) => typeof item === 'string')
      : typeof answer === 'string'
        ? [answer]
        : [],
  )
  return optionRows.map((item) => ({
    id: item.id,
    text: item.text,
    imageUrl: item.imageUrl || null,
    isCorrect: answerIds.has(item.id),
  }))
}

function toQuestionEditorData(
  question: Pick<
    Question,
    | 'id'
    | 'questionType'
    | 'context'
    | 'content'
    | 'prompt'
    | 'analysis'
    | 'options'
    | 'answer'
  >,
) {
  const content = decodeQuestionContent(question.content)
  return {
    id: question.id,
    questionType: question.questionType,
    contextSentence: question.context || '',
    targetWord: readString(content.targetWord) || null,
    sortingOrder: Array.isArray(content.sortingOrder)
      ? content.sortingOrder
      : [],
    prompt: question.prompt,
    explanation: question.analysis,
    listeningSectionNumber: asPositiveIntegerString(
      content.listeningSectionNumber,
      content.listeningSectionTitle,
    ),
    optionLabelFormat: normalizeOptionLabelFormat(
      content.optionLabelFormat,
      'numeric',
    ),
    customOptionLabels: parseCustomOptionLabels(
      content.customOptionLabels,
    ).join('|'),
    shuffleOptions: content.shuffleOptions !== false,
    options: normalizeQuestionOptions(question.options, question.answer),
  }
}

export async function getReadingEditData(maybeId: string) {
  const material = await prisma.material.findFirst({
    where: { id: maybeId, type: MaterialType.READING },
    include: {
      collectionMaterials: {
        take: 1,
        orderBy: { sortOrder: 'asc' },
        include: {
          collection: {
            select: {
              id: true,
              title: true,
              collectionType: true,
              materials: {
                where: { material: { type: MaterialType.READING } },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                select: {
                  material: {
                    select: {
                      id: true,
                      type: true,
                      title: true,
                      contentPayload: true,
                      _count: { select: { questions: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      questions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!material) return null
  const payload = decodeMaterialPayloadRecord(
    material.type,
    material.contentPayload,
  )
  const collection = material.collectionMaterials[0]?.collection
  return {
    id: material.id,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      material.id,
    ),
    content: readString(payload.text),
    sourceKind: readString(payload.sourceKind),
    publishedDate: readString(payload.publishedDate),
    edition: readString(payload.edition),
    newsSection: readString(payload.newsSection),
    audioFile: readString(payload.audioFile),
    category: {
      levelId: collection?.id || null,
      title: collection?.title || '',
      collectionType: collection?.collectionType || null,
      siblings: (collection?.materials || []).map(item => ({
        id: item.material.id,
        title: getMaterialDisplayTitle(
          item.material.type,
          item.material.title,
          item.material.contentPayload,
          item.material.id,
        ),
        questionCount: item.material._count.questions,
      })),
    },
    questions: material.questions.map((question) => ({
      id: question.id,
      questionType: question.questionType,
      prompt: question.prompt,
      contextSentence: question.context || '',
      options: normalizeQuestionOptions(question.options, question.answer),
    })),
  }
}

export async function getQuizEditData(maybeId: string) {
  const material = await prisma.material.findFirst({
    where: { id: maybeId, type: MaterialType.VOCAB_GRAMMAR },
    include: {
      collectionMaterials: {
        take: 1,
        include: { collection: { select: { id: true, collectionType: true } } },
      },
      questions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!material) return null
  return {
    id: material.id,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      material.id,
    ),
    category: {
      levelId: material.collectionMaterials[0]?.collection.id || null,
      collectionType:
        material.collectionMaterials[0]?.collection.collectionType || null,
    },
    questions: material.questions.map(toQuestionEditorData)
  }
}

export async function getListeningEditData(maybeId: string) {
  const material = await prisma.material.findFirst({
    where: { id: maybeId, type: MaterialType.LISTENING },
    select: {
      id: true,
      type: true,
      title: true,
      contentPayload: true,
      collectionMaterials: {
        take: 1,
        select: {
          collectionId: true,
          collection: { select: { title: true, collectionType: true } },
        },
      },
      questions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!material) return null
  const collectionId = material.collectionMaterials[0]?.collectionId || null
  const siblingRows = collectionId
    ? await prisma.collectionMaterial.findMany({
        where: { collectionId },
        orderBy: { sortOrder: 'asc' },
        select: {
          material: {
            select: {
              id: true,
              title: true,
              type: true,
              _count: { select: { questions: true } },
            },
          },
        },
      })
    : []

  const payload = decodeMaterialPayloadRecord(
    material.type,
    material.contentPayload,
  )
  const siblings = siblingRows
    .filter((item) => item.material.type === MaterialType.LISTENING)
    .map((item) => ({
      id: item.material.id,
      title: getMaterialDisplayTitle(
        item.material.type,
        item.material.title,
        null,
        item.material.id,
      ),
      _count: { questions: item.material._count.questions },
    }))

  const titleSectionNumber =
    material.title.match(/(?:問題|问题|P)\s*0*(\d+)/i)?.[1] || ''
  const dialogues = asArray<JsonRecord>(payload.dialogues).map(item => ({
    stableId: readString(item.stableId),
    text: readString(item.text),
    start: Number(item.start || 0),
    end: Number(item.end || 0),
  }))

  return {
    id: material.id,
    materialId: material.id,
    materialType: material.type,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      material.id,
    ),
    audioFile: readString(payload.audioFile),
    listeningSectionNumber: asPositiveIntegerString(
      payload.listeningSectionNumber,
      titleSectionNumber,
    ),
    subtitleMeta: {
      noAudio: readBoolean(payload.subtitleNoAudio),
      sourceType:
        readString(payload.subtitleSourceType) === 'TV' ? 'TV' : 'MOVIE',
      workTitle: readString(payload.subtitleWorkTitle),
      season: readString(payload.subtitleSeason),
      episode: readString(payload.subtitleEpisode),
    },
    collectionId,
    collectionTitle:
      material.collectionMaterials[0]?.collection.title || '未分组',
    collectionType:
      material.collectionMaterials[0]?.collection.collectionType || null,
    siblings,
    dialogues,
    questions: material.questions.map(toQuestionEditorData)
  }
}

export async function getSpeakingEditData(maybeId: string) {
  const material = await prisma.material.findFirst({
    where: { type: MaterialType.SPEAKING, id: maybeId },
    select: {
      id: true,
      type: true,
      title: true,
      contentPayload: true,
      collectionMaterials: {
        take: 1,
        orderBy: { sortOrder: 'asc' },
        select: {
          collectionId: true,
          collection: { select: { title: true, collectionType: true } },
        },
      },
      questions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!material) return null

  const collectionId = material.collectionMaterials[0]?.collectionId || null
  const siblingRows = collectionId
    ? await prisma.collectionMaterial.findMany({
        where: { collectionId },
        orderBy: { sortOrder: 'asc' },
        select: {
          material: {
            select: {
              id: true,
              title: true,
              type: true,
              _count: { select: { questions: true } },
            },
          },
        },
      })
    : []

  const payload = decodeMaterialPayloadRecord(
    material.type,
    material.contentPayload,
  )
  const siblings = siblingRows
    .filter((item) => item.material.type === MaterialType.SPEAKING)
    .map((item) => ({
      id: item.material.id,
      title: getMaterialDisplayTitle(
        item.material.type,
        item.material.title,
        null,
        item.material.id,
      ),
      _count: { questions: item.material._count.questions },
    }))

  const dialogues = asArray<JsonRecord>(payload.dialogues).map(
    (item, index) => ({
      id: Number(item.id) || index + 1,
      text: readString(item.text),
      start: Number(item.start || 0),
      end: Number(item.end || 0),
    }),
  )

  return {
    id: material.id,
    materialId: material.id,
    materialType: material.type,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      material.id,
    ),
    audioFile: readString(payload.audioFile),
    collectionId,
    collectionTitle:
      material.collectionMaterials[0]?.collection.title || '未分组',
    collectionType:
      material.collectionMaterials[0]?.collection.collectionType || null,
    siblings,
    dialogues,
    questions: material.questions.map((question) => {
      const content = decodeQuestionContent(question.content)
      return {
        id: question.id,
        questionType: question.questionType,
        contextSentence: question.context || '',
        targetWord: readString(content.targetWord) || null,
        sortingOrder: Array.isArray(content.sortingOrder)
          ? content.sortingOrder
          : [],
        prompt: question.prompt,
        explanation: question.analysis,
        listeningSectionNumber: asPositiveIntegerString(
          content.listeningSectionNumber,
        ),
        optionLabelFormat: normalizeOptionLabelFormat(
          content.optionLabelFormat,
          'numeric',
        ),
        customOptionLabels: parseCustomOptionLabels(
          content.customOptionLabels,
        ).join('|'),
        options: normalizeQuestionOptions(question.options, question.answer),
      }
    }),
  }
}
