import prisma from '@/lib/prisma'
import { MaterialType, QuestionTemplate } from '@prisma/client'
import { getMaterialDisplayTitle } from './material-title'

type JsonRecord = Record<string, unknown>

const MATERIAL_PREFIX: Record<MaterialType, string> = {
  [MaterialType.LISTENING]: 'lesson:',
  [MaterialType.READING]: 'passage:',
  [MaterialType.VOCAB_GRAMMAR]: 'quiz:',
  [MaterialType.SPEAKING]: 'lesson:',
}

function asRecord(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord
  }
  return {}
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown, fallback = 0): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(item => typeof item === 'string') as string[]
}

export function toMaterialId(type: MaterialType, legacyId: string): string {
  return `${MATERIAL_PREFIX[type]}${legacyId}`
}

export function toLegacyMaterialId(materialId: string): string {
  const index = materialId.indexOf(':')
  return index >= 0 ? materialId.slice(index + 1) : materialId
}

function toLegacyQuestionType(
  materialType: MaterialType,
  templateType: QuestionTemplate,
  content: JsonRecord,
) {
  const explicitType = asString(content.questionType)
  if (explicitType) {
    if (
      materialType === MaterialType.VOCAB_GRAMMAR &&
      (explicitType === 'FILL_BLANK' || explicitType === 'READING_COMPREHENSION')
    ) {
      return 'GRAMMAR'
    }
    return explicitType
  }

  if (materialType === MaterialType.LISTENING) return 'LISTENING'
  if (materialType === MaterialType.READING) {
    return templateType === QuestionTemplate.CLOZE_TEST ||
      templateType === QuestionTemplate.FILL_BLANK
      ? 'FILL_BLANK'
      : 'READING_COMPREHENSION'
  }
  if (materialType === MaterialType.VOCAB_GRAMMAR) {
    return templateType === QuestionTemplate.CLOZE_TEST ? 'SORTING' : 'GRAMMAR'
  }
  return 'GRAMMAR'
}

function toAnswerIds(answer: unknown): string[] {
  if (typeof answer === 'string' && answer) return [answer]
  if (Array.isArray(answer)) {
    return answer.filter(item => typeof item === 'string') as string[]
  }
  return []
}

export function normalizeQuestionOptions(
  options: unknown,
  answer: unknown,
): Array<{ id: string; text: string; isCorrect: boolean }> {
  const answerIds = new Set(toAnswerIds(answer))
  return asArray<JsonRecord>(options).map(item => {
    const id = asString(item.id) || ''
    return {
      id,
      text: asString(item.text) || '',
      isCorrect: answerIds.has(id),
    }
  })
}

export function normalizeQuestionContext(
  prompt: string | null,
  context: string | null,
) {
  return context || prompt || '（未填写语境句）'
}

export function materialDialogueItems(contentPayload: unknown) {
  return asArray<JsonRecord>(asRecord(contentPayload).dialogues).map(
    (item, index) => ({
      id: asNumber(item.id, index + 1),
      text: asString(item.text) || '',
      start: asNumber(item.start),
      end: asNumber(item.end),
      sequenceId: asNumber(item.sequenceId, index + 1),
    }),
  )
}

export async function getArticleByLegacyId(legacyId: string) {
  const material = await prisma.material.findUnique({
    where: { id: toMaterialId(MaterialType.READING, legacyId) },
    include: {
      collectionMaterials: {
        take: 1,
        include: {
          collection: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
      questions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          attempts: {
            take: 1000,
            orderBy: { createdAt: 'desc' },
            select: { isCorrect: true },
          },
        },
      },
    },
  })

  if (!material) return null

  const payload = asRecord(material.contentPayload)
  const category = material.collectionMaterials[0]?.collection

  return {
    id: legacyId,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      legacyId,
    ),
    content: asString(payload.text) || asString(payload.transcript) || '',
    category: category ? { name: category.title } : null,
    questions: material.questions.map(question => {
      const content = asRecord(question.content)
      return {
        id: question.id,
        questionType: toLegacyQuestionType(
          material.type,
          question.templateType,
          content,
        ),
        prompt: question.prompt,
        contextSentence: normalizeQuestionContext(question.prompt, question.context),
        options: normalizeQuestionOptions(question.options, question.answer),
      }
    }),
  }
}

export async function listReadingMaterials() {
  const rows = await prisma.material.findMany({
    where: { type: MaterialType.READING },
    orderBy: [{ createdAt: 'desc' }, { title: 'asc' }],
    include: {
      collectionMaterials: {
        orderBy: { sortOrder: 'asc' },
        take: 1,
        include: {
          collection: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
      questions: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          templateType: true,
          content: true,
        },
      },
    },
  })

  return rows.map(material => {
    const payload = asRecord(material.contentPayload)
    const category = material.collectionMaterials[0]?.collection
    return {
      id: toLegacyMaterialId(material.id),
      title: getMaterialDisplayTitle(
        material.type,
        material.title,
        material.contentPayload,
        toLegacyMaterialId(material.id),
      ),
      description: asString(payload.description),
      content: asString(payload.text) || asString(payload.transcript) || '',
      paper: category
        ? {
            id: category.id,
            name: category.title,
            level: null,
          }
        : null,
      questions: material.questions.map(question => ({
        questionType: toLegacyQuestionType(
          material.type,
          question.templateType,
          asRecord(question.content),
        ),
      })),
    }
  })
}

export async function getLessonByLegacyId(legacyId: string) {
  const material = await prisma.material.findUnique({
    where: { id: toMaterialId(MaterialType.LISTENING, legacyId) },
    include: {
      collectionMaterials: {
        take: 1,
        include: {
          collection: {
            include: {
              materials: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  material: {
                    select: {
                      id: true,
                      title: true,
                      type: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!material) return null

  const payload = asRecord(material.contentPayload)
  const collection = material.collectionMaterials[0]?.collection
  const siblings =
    collection?.materials
      .map(item => item.material)
      .filter(item => item.type === MaterialType.LISTENING)
      .map(item => ({
        id: toLegacyMaterialId(item.id),
        title: item.title,
      })) || []

  const currentIndex = siblings.findIndex(item => item.id === legacyId)

  return {
    id: legacyId,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      legacyId,
    ),
    audioFile: asString(payload.audioFile) || asString(payload.audioUrl) || '',
    dialogues: materialDialogueItems(material.contentPayload),
    paper: collection
      ? {
          id: collection.id,
          name: collection.title,
          description: null,
          levelId: null,
          lessons: siblings,
        }
      : {
          id: 'default',
          name: '听力',
          description: null,
          levelId: null,
          lessons: siblings,
        },
    prevId: currentIndex > 0 ? siblings[currentIndex - 1]?.id || null : null,
    nextId:
      currentIndex >= 0 && currentIndex < siblings.length - 1
        ? siblings[currentIndex + 1]?.id || null
        : null,
  }
}

export async function getSpeakingByLegacyId(legacyId: string) {
  const trimmedId = legacyId.trim()
  const normalizedLegacyId = trimmedId.includes(':')
    ? trimmedId.slice(trimmedId.lastIndexOf(':') + 1)
    : trimmedId
  const prefixedId = toMaterialId(MaterialType.LISTENING, normalizedLegacyId)
  const candidateIds = Array.from(
    new Set([trimmedId, normalizedLegacyId, prefixedId].filter(Boolean)),
  )

  const material = await prisma.material.findFirst({
    where: {
      type: MaterialType.SPEAKING,
      OR: [
        { id: { in: candidateIds } },
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
          collection: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
  })

  if (!material) return null

  const payload = asRecord(material.contentPayload)
  const resolvedLegacyId = toLegacyMaterialId(material.id)
  const collectionId = material.collectionMaterials[0]?.collectionId || null
  const collection = material.collectionMaterials[0]?.collection || null

  const siblingRows = collectionId
    ? await prisma.collectionMaterial.findMany({
        where: {
          collectionId,
          material: { type: MaterialType.SPEAKING },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          material: {
            select: {
              id: true,
              title: true,
              type: true,
              contentPayload: true,
            },
          },
        },
      })
    : []

  const siblings = siblingRows.map(row => {
    const siblingLegacyId = toLegacyMaterialId(row.material.id)
    return {
      id: siblingLegacyId,
      title: getMaterialDisplayTitle(
        row.material.type,
        row.material.title,
        row.material.contentPayload,
        siblingLegacyId,
      ),
    }
  })

  const currentIndex = siblings.findIndex(item => item.id === resolvedLegacyId)

  return {
    id: resolvedLegacyId,
    materialId: material.id,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      resolvedLegacyId,
    ),
    audioFile: asString(payload.audioFile) || asString(payload.audioUrl) || '',
    dialogues: materialDialogueItems(material.contentPayload),
    paper: collection
      ? {
          id: collection.id || 'default',
          name: collection.title || '跟读',
          description: null,
          levelId: null,
          lessons: siblings,
        }
      : {
          id: 'default',
          name: '跟读',
          description: null,
          levelId: null,
          lessons: siblings,
        },
    prevId: currentIndex > 0 ? siblings[currentIndex - 1]?.id || null : null,
    nextId:
      currentIndex >= 0 && currentIndex < siblings.length - 1
        ? siblings[currentIndex + 1]?.id || null
        : null,
  }
}

export async function getTopMaterialSnapshots() {
  const [topLesson, topArticle, topQuiz] = await Promise.all([
    prisma.material.findFirst({
      where: { type: MaterialType.LISTENING },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        contentPayload: true,
      },
    }),
    prisma.material.findFirst({
      where: { type: MaterialType.READING },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        contentPayload: true,
      },
    }),
    prisma.material.findFirst({
      where: { type: MaterialType.VOCAB_GRAMMAR },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
      },
    }),
  ])

  return {
    topLesson: topLesson
      ? {
          id: toLegacyMaterialId(topLesson.id),
          title: getMaterialDisplayTitle(
            MaterialType.LISTENING,
            topLesson.title,
            topLesson.contentPayload,
            toLegacyMaterialId(topLesson.id),
          ),
          _count: { dialogues: materialDialogueItems(topLesson.contentPayload).length },
        }
      : null,
    topArticle: topArticle
      ? {
          id: toLegacyMaterialId(topArticle.id),
          title: getMaterialDisplayTitle(
            MaterialType.READING,
            topArticle.title,
            topArticle.contentPayload,
            toLegacyMaterialId(topArticle.id),
          ),
          content:
            asString(asRecord(topArticle.contentPayload).text) ||
            asString(asRecord(topArticle.contentPayload).transcript) ||
            '',
        }
      : null,
    topQuiz: topQuiz
      ? {
          id: toLegacyMaterialId(topQuiz.id),
          title: getMaterialDisplayTitle(
            MaterialType.VOCAB_GRAMMAR,
            topQuiz.title,
            null,
            toLegacyMaterialId(topQuiz.id),
          ),
        }
      : null,
  }
}

async function listMaterialsForShadowingByType(materialType: MaterialType) {
  const rows = await prisma.material.findMany({
    where: { type: materialType },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
              parent: {
                select: {
                  id: true,
                  title: true,
                  collectionType: true,
                  parent: {
                    select: {
                      id: true,
                      title: true,
                      collectionType: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      _count: {
        select: { questions: true },
      },
    },
  })

  return rows.map(material => {
    const payload = asRecord(material.contentPayload)
    const collection = material.collectionMaterials[0]?.collection || null
    const tags = asStringArray(payload.tags)
    const parent = collection?.parent || null
    const grandParent = parent?.parent || null

    const rootCollection =
      collection?.collectionType === 'LIBRARY_ROOT'
        ? collection
        : parent?.collectionType === 'LIBRARY_ROOT'
          ? parent
          : grandParent?.collectionType === 'LIBRARY_ROOT'
            ? grandParent
            : null
    const bookCollection =
      collection?.collectionType === 'BOOK'
        ? collection
        : parent?.collectionType === 'BOOK'
          ? parent
          : null
    const chapterCollection =
      collection?.collectionType === 'CHAPTER' ? collection : null

    const hierarchyPath = [
      rootCollection?.title,
      bookCollection?.title,
      chapterCollection?.title,
    ].filter(Boolean) as string[]

    return {
      id: toLegacyMaterialId(material.id),
      materialId: material.id,
      materialType: material.type as 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR',
      chapterName: (material.chapterName || '').trim(),
      title: getMaterialDisplayTitle(
        material.type,
        material.title,
        material.contentPayload,
        toLegacyMaterialId(material.id),
      ),
      audioFile: asString(payload.audioFile) || asString(payload.audioUrl) || '',
      description: asString(payload.description) || '',
      transcript: asString(payload.transcript) || '',
      source: asString(payload.source) || '',
      language: asString(payload.language) || '',
      difficulty: asString(payload.difficulty) || '',
      tags,
      tagsText: tags.join(', '),
      dialogueCount: materialDialogueItems(material.contentPayload).length,
      questionCount: material._count.questions,
      rootId: rootCollection?.id || null,
      bookId: bookCollection?.id || null,
      chapterId: chapterCollection?.id || null,
      hierarchyPath,
      pathLabel:
        hierarchyPath.length > 0
          ? hierarchyPath.join(' / ')
          : collection?.title || '未归类',
      isClassified: Boolean(chapterCollection?.id),
      collection: collection
        ? {
            id: collection.id,
            title: collection.title,
            collectionType: collection.collectionType,
          }
        : null,
    }
  })
}

export async function listListeningMaterialsForShadowing() {
  return listMaterialsForShadowingByType(MaterialType.SPEAKING)
}

export async function listListeningLessonsForShadowing() {
  return listMaterialsForShadowingByType(MaterialType.LISTENING)
}

export async function getListeningMaterialEditorByLegacyId(legacyId: string) {
  const material = await prisma.material.findFirst({
    where: { id: { endsWith: `:${legacyId}` }, type: 'SPEAKING' as MaterialType },
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
            },
          },
        },
      },
      _count: {
        select: { questions: true },
      },
    },
  })
  if (!material) return null
  const payload = asRecord(material.contentPayload)
  const collection = material.collectionMaterials[0]?.collection || null
  const tags = asStringArray(payload.tags)

  return {
    id: toLegacyMaterialId(material.id),
    materialId: material.id,
    materialType: material.type as 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR',
    chapterName: (material.chapterName || '').trim(),
    title: material.title,
    displayTitle: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      toLegacyMaterialId(material.id),
    ),
    audioFile: asString(payload.audioFile) || asString(payload.audioUrl) || '',
    description: asString(payload.description) || '',
    transcript: asString(payload.transcript) || '',
    source: asString(payload.source) || '',
    language: asString(payload.language) || '',
    difficulty: asString(payload.difficulty) || '',
    tags,
    tagsText: tags.join(', '),
    dialogueCount: materialDialogueItems(material.contentPayload).length,
    questionCount: material._count.questions,
    collection: collection
      ? {
          id: collection.id,
          title: collection.title,
          collectionType: collection.collectionType,
        }
      : null,
  }
}
