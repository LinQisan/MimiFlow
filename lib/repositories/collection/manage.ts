import { MaterialType } from '#prisma-client'

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
  }))
  const answerIds = new Set(
    Array.isArray(answer)
      ? answer.filter(item => typeof item === 'string')
      : typeof answer === 'string'
        ? [answer]
        : [],
  )
  return optionRows.map(item => ({
    id: item.id,
    text: item.text,
    isCorrect: answerIds.has(item.id),
  }))
}

async function resolveMaterialId(maybeId: string, type: MaterialType) {
  const direct = await prisma.material.findUnique({
    where: { id: maybeId },
    select: { id: true, type: true },
  })
  if (direct?.type === type) return direct.id
  return null
}

export async function getReadingEditData(maybeId: string) {
  const materialId = await resolveMaterialId(maybeId, MaterialType.READING)
  if (!materialId) return null
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: {
      collectionMaterials: {
        take: 1,
        include: {
          collection: { select: { id: true, collectionType: true } },
        },
      },
      questions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!material) return null
  const payload = decodeMaterialPayloadRecord(material.type, material.contentPayload)
  return {
    id: material.id,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      material.id,
    ),
    content: readString(payload.text) || readString(payload.transcript),
    category: {
      levelId: material.collectionMaterials[0]?.collection.id || null,
      collectionType:
        material.collectionMaterials[0]?.collection.collectionType || null,
    },
    questions: material.questions.map(question => ({
      id: question.id,
      questionType: question.questionType,
      prompt: question.prompt,
      contextSentence: question.context || '',
      options: normalizeQuestionOptions(question.options, question.answer),
    })),
  }
}

export async function getQuizEditData(maybeId: string) {
  const materialId = await resolveMaterialId(maybeId, MaterialType.VOCAB_GRAMMAR)
  if (!materialId) return null
  const material = await prisma.material.findUnique({
    where: { id: materialId },
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
    questions: material.questions.map(question => {
      const content = decodeQuestionContent(question.content)
      return {
        id: question.id,
        questionType: question.questionType,
        contextSentence: question.context || '',
        targetWord: readString(content.targetWord) || null,
        prompt: question.prompt,
        explanation: question.analysis,
        listeningSectionNumber: asPositiveIntegerString(
          content.listeningSectionNumber,
          content.sectionNumber,
          content.partNumber,
          content.listeningSectionTitle,
          content.sectionTitle,
        ),
        optionLabelFormat: normalizeOptionLabelFormat(
          content.optionLabelFormat,
          question.questionType === 'LISTENING' ? 'numeric' : 'upper-alpha',
        ),
        customOptionLabels: parseCustomOptionLabels(
          content.customOptionLabels,
        ).join('|'),
        options: normalizeQuestionOptions(question.options, question.answer),
      }
    }),
  }
}

export async function getListeningEditData(maybeId: string) {
  const materialId = await resolveMaterialId(maybeId, MaterialType.LISTENING)
  if (!materialId) return null
  const material = await prisma.material.findUnique({
    where: { id: materialId },
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

  const payload = decodeMaterialPayloadRecord(material.type, material.contentPayload)
  const siblings = siblingRows
    .filter(item => item.material.type === MaterialType.LISTENING)
    .map(item => ({
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
  const dialogues = asArray<JsonRecord>(payload.dialogues).map((item, index) => ({
    id: Number(item.id) || index + 1,
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
    audioFile: readString(payload.audioFile) || readString(payload.audioUrl),
    listeningSectionNumber: asPositiveIntegerString(
      payload.listeningSectionNumber,
      payload.sectionNumber,
      payload.partNumber,
      payload.jlptPartNumber,
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
    collectionTitle: material.collectionMaterials[0]?.collection.title || '未分组',
    collectionType:
      material.collectionMaterials[0]?.collection.collectionType || null,
    siblings,
    dialogues,
    questions: material.questions.map(question => {
      const content = decodeQuestionContent(question.content)
      return {
        id: question.id,
        questionType: question.questionType,
        contextSentence: question.context || '',
        targetWord: readString(content.targetWord) || null,
        prompt: question.prompt,
        explanation: question.analysis,
        listeningSectionNumber: asPositiveIntegerString(
          content.listeningSectionNumber,
          content.sectionNumber,
          content.partNumber,
          content.listeningSectionTitle,
          content.sectionTitle,
        ),
        optionLabelFormat: normalizeOptionLabelFormat(
          content.optionLabelFormat,
          question.questionType === 'LISTENING' ? 'numeric' : 'upper-alpha',
        ),
        customOptionLabels: parseCustomOptionLabels(
          content.customOptionLabels,
        ).join('|'),
        options: normalizeQuestionOptions(question.options, question.answer),
      }
    }),
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

  const payload = decodeMaterialPayloadRecord(material.type, material.contentPayload)
  const siblings = siblingRows
    .filter(item => item.material.type === MaterialType.SPEAKING)
    .map(item => ({
      id: item.material.id,
      title: getMaterialDisplayTitle(
        item.material.type,
        item.material.title,
        null,
        item.material.id,
      ),
      _count: { questions: item.material._count.questions },
    }))

  const dialogues = asArray<JsonRecord>(payload.dialogues).map((item, index) => ({
    id: Number(item.id) || index + 1,
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
    audioFile: readString(payload.audioFile) || readString(payload.audioUrl),
    collectionId,
    collectionTitle: material.collectionMaterials[0]?.collection.title || '未分组',
    collectionType:
      material.collectionMaterials[0]?.collection.collectionType || null,
    siblings,
    dialogues,
    questions: material.questions.map(question => {
      const content = decodeQuestionContent(question.content)
      return {
        id: question.id,
        questionType: question.questionType,
        contextSentence: question.context || '',
        targetWord: readString(content.targetWord) || null,
        prompt: question.prompt,
        explanation: question.analysis,
        listeningSectionNumber: asPositiveIntegerString(
          content.listeningSectionNumber,
          content.sectionNumber,
        ),
        optionLabelFormat: normalizeOptionLabelFormat(
          content.optionLabelFormat,
          question.questionType === 'LISTENING' ? 'numeric' : 'upper-alpha',
        ),
        customOptionLabels: parseCustomOptionLabels(
          content.customOptionLabels,
        ).join('|'),
        options: normalizeQuestionOptions(question.options, question.answer),
      }
    }),
  }
}
