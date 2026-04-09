import { CollectionType, MaterialType, QuestionTemplate, QuestionType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { toLegacyMaterialId } from '@/lib/repositories/materials.repo'
import { getMaterialDisplayTitle } from '@/lib/repositories/material-title'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonRecord
  return {}
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toQuestionType(
  content: unknown,
  templateType: QuestionTemplate,
  materialType: MaterialType,
): QuestionType {
  const payload = asRecord(content)
  const explicit = asString(payload.questionType)
  if (explicit) {
    if (
      materialType === MaterialType.VOCAB_GRAMMAR &&
      (explicit === QuestionType.FILL_BLANK ||
        explicit === QuestionType.READING_COMPREHENSION)
    ) {
      return QuestionType.GRAMMAR
    }
    return explicit as QuestionType
  }
  if (materialType === MaterialType.READING) {
    if (templateType === QuestionTemplate.FILL_BLANK) return QuestionType.FILL_BLANK
    if (templateType === QuestionTemplate.CLOZE_TEST) return QuestionType.SORTING
    return QuestionType.READING_COMPREHENSION
  }
  if (materialType === MaterialType.LISTENING) return QuestionType.LISTENING
  if (materialType === MaterialType.VOCAB_GRAMMAR) {
    if (templateType === QuestionTemplate.CLOZE_TEST) return QuestionType.SORTING
    return QuestionType.GRAMMAR
  }
  if (templateType === QuestionTemplate.FILL_BLANK) return QuestionType.FILL_BLANK
  if (templateType === QuestionTemplate.CLOZE_TEST) return QuestionType.SORTING
  return QuestionType.PRONUNCIATION
}

function normalizeQuestionOptions(options: unknown, answer: unknown) {
  const optionRows = asArray<JsonRecord>(options).map((opt, index) => ({
    id: asString(opt.id) || `opt_${index + 1}`,
    text: asString(opt.text),
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

function resolveMaterialIdByAnySync(maybeId: string, type: MaterialType) {
  const prefix =
    type === MaterialType.READING
      ? 'passage'
      : type === MaterialType.VOCAB_GRAMMAR
        ? 'quiz'
        : 'lesson'
  if (maybeId.includes(':')) return maybeId
  return `${prefix}:${maybeId}`
}

export async function resolveMaterialIdByAny(maybeId: string, type: MaterialType) {
  const direct = await prisma.material.findUnique({
    where: { id: maybeId },
    select: { id: true, type: true },
  })
  if (direct?.type === type) return direct.id
  const prefixed = resolveMaterialIdByAnySync(maybeId, type)
  const prefixedRow = await prisma.material.findUnique({
    where: { id: prefixed },
    select: { id: true, type: true },
  })
  return prefixedRow?.type === type ? prefixedRow.id : null
}

export async function getCollectionManageList() {
  return prisma.collection.findMany({
    where: { collectionType: CollectionType.PAPER },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      language: true,
      level: true,
      sortOrder: true,
      collectionType: true,
      createdAt: true,
      _count: { select: { materials: true, children: true } },
    },
  })
}

export async function getCollectionManageDetail(collectionId: string) {
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      materials: {
        orderBy: { sortOrder: 'asc' },
        select: {
          sortOrder: true,
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
  })
  if (!collection) return null

  const items = collection.materials.map(row => {
    const payload = asRecord(row.material.contentPayload)
    return {
      id: row.material.id,
      legacyId: toLegacyMaterialId(row.material.id),
      type: row.material.type,
      title: getMaterialDisplayTitle(
        row.material.type,
        row.material.title,
        row.material.contentPayload,
        toLegacyMaterialId(row.material.id),
      ),
      sortOrder: row.sortOrder,
      questionCount: row.material._count.questions,
      audioFile: asString(payload.audioFile) || asString(payload.audioUrl),
    }
  })

  return {
    id: collection.id,
    title: collection.title,
    createdAt: collection.createdAt,
    listening: items.filter(item => item.type === MaterialType.LISTENING),
    reading: items.filter(item => item.type === MaterialType.READING),
    quizzes: items.filter(item => item.type === MaterialType.VOCAB_GRAMMAR),
  }
}

export async function getReadingEditData(maybeId: string) {
  const materialId = await resolveMaterialIdByAny(maybeId, MaterialType.READING)
  if (!materialId) return null
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: {
      collectionMaterials: {
        take: 1,
        include: {
          collection: { select: { id: true } },
        },
      },
      questions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!material) return null
  const payload = asRecord(material.contentPayload)
  return {
    id: toLegacyMaterialId(material.id),
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      toLegacyMaterialId(material.id),
    ),
    content: asString(payload.text) || asString(payload.transcript),
    category: { levelId: material.collectionMaterials[0]?.collection.id || null },
    questions: material.questions.map(question => ({
      id: question.id,
      questionType: toQuestionType(
        question.content,
        question.templateType,
        material.type,
      ),
      prompt: question.prompt,
      contextSentence: question.context || question.prompt || '',
      options: normalizeQuestionOptions(question.options, question.answer),
    })),
  }
}

export async function getQuizEditData(maybeId: string) {
  const materialId = await resolveMaterialIdByAny(maybeId, MaterialType.VOCAB_GRAMMAR)
  if (!materialId) return null
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: {
      collectionMaterials: {
        take: 1,
        include: { collection: { select: { id: true } } },
      },
      questions: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!material) return null
  return {
    id: toLegacyMaterialId(material.id),
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      toLegacyMaterialId(material.id),
    ),
    category: { levelId: material.collectionMaterials[0]?.collection.id || null },
    questions: material.questions.map(question => {
      const content = asRecord(question.content)
      return {
        id: question.id,
        questionType: toQuestionType(
          question.content,
          question.templateType,
          material.type,
        ),
        contextSentence: asString(content.contextSentence) || question.context || '',
        targetWord: asString(content.targetWord) || null,
        prompt: question.prompt || asString(content.prompt) || null,
        explanation: asString(content.explanation) || question.analysis || null,
        options: normalizeQuestionOptions(question.options, question.answer),
      }
    }),
  }
}

export async function getListeningEditData(maybeId: string) {
  const materialId = await resolveMaterialIdByAny(maybeId, MaterialType.LISTENING)
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
          collection: { select: { title: true } },
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

  const payload = asRecord(material.contentPayload)
  const siblings = siblingRows
    .filter(item => item.material.type === MaterialType.LISTENING)
    .map(item => ({
      id: toLegacyMaterialId(item.material.id),
      title: getMaterialDisplayTitle(
        item.material.type,
        item.material.title,
        null,
        toLegacyMaterialId(item.material.id),
      ),
      _count: { questions: item.material._count.questions },
    }))

  const dialogues = asArray<JsonRecord>(payload.dialogues).map((item, index) => ({
    id: Number(item.id) || index + 1,
    text: asString(item.text),
    start: Number(item.start || 0),
    end: Number(item.end || 0),
  }))

  return {
    id: toLegacyMaterialId(material.id),
    materialId: material.id,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      toLegacyMaterialId(material.id),
    ),
    audioFile: asString(payload.audioFile) || asString(payload.audioUrl),
    collectionId,
    collectionTitle: material.collectionMaterials[0]?.collection.title || '未分组',
    siblings,
    dialogues,
    questions: material.questions.map(question => {
      const content = asRecord(question.content)
      return {
        id: question.id,
        questionType: toQuestionType(
          question.content,
          question.templateType,
          material.type,
        ),
        contextSentence: asString(content.contextSentence) || question.context || '',
        targetWord: asString(content.targetWord) || null,
        prompt: question.prompt || asString(content.prompt) || null,
        explanation: asString(content.explanation) || question.analysis || null,
        options: normalizeQuestionOptions(question.options, question.answer),
      }
    }),
  }
}

export async function getSpeakingEditData(maybeId: string) {
  const normalizedLegacyId = maybeId.includes(':')
    ? maybeId.slice(maybeId.lastIndexOf(':') + 1)
    : maybeId

  const material = await prisma.material.findFirst({
    where: {
      type: MaterialType.SPEAKING,
      OR: [
        { id: maybeId },
        { id: normalizedLegacyId },
        { id: { endsWith: `:${maybeId}` } },
        { id: { endsWith: `:${normalizedLegacyId}` } },
      ],
    },
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
          collection: { select: { title: true } },
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

  const payload = asRecord(material.contentPayload)
  const siblings = siblingRows
    .filter(item => item.material.type === MaterialType.SPEAKING)
    .map(item => ({
      id: toLegacyMaterialId(item.material.id),
      title: getMaterialDisplayTitle(
        item.material.type,
        item.material.title,
        null,
        toLegacyMaterialId(item.material.id),
      ),
      _count: { questions: item.material._count.questions },
    }))

  const dialogues = asArray<JsonRecord>(payload.dialogues).map((item, index) => ({
    id: Number(item.id) || index + 1,
    text: asString(item.text),
    start: Number(item.start || 0),
    end: Number(item.end || 0),
  }))

  return {
    id: toLegacyMaterialId(material.id),
    materialId: material.id,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      toLegacyMaterialId(material.id),
    ),
    audioFile: asString(payload.audioFile) || asString(payload.audioUrl),
    collectionId,
    collectionTitle: material.collectionMaterials[0]?.collection.title || '未分组',
    siblings,
    dialogues,
    questions: material.questions.map(question => {
      const content = asRecord(question.content)
      return {
        id: question.id,
        questionType: toQuestionType(
          question.content,
          question.templateType,
          material.type,
        ),
        contextSentence: asString(content.contextSentence) || question.context || '',
        targetWord: asString(content.targetWord) || null,
        prompt: question.prompt || asString(content.prompt) || null,
        explanation: asString(content.explanation) || question.analysis || null,
        options: normalizeQuestionOptions(question.options, question.answer),
      }
    }),
  }
}
