import prisma from '@/lib/prisma'
import { CollectionType, MaterialType, QuestionTemplate } from '@prisma/client'
import { getMaterialDisplayTitle } from '@/lib/repositories/material-title'
import { reorderExamOptionsForSession } from '@/lib/repositories/exam-option-order'
import { toVocabularyMeta, type VocabularyMeta } from '@/utils/vocabularyMeta'

export type ExamHubPaperSummary = {
  id: string
  name: string
  collectionType: CollectionType
  description: string | null
  language: string | null
  level: string | null
  parentId: string | null
  sortOrder: number
  createdAt: string | Date
  updatedAt: string | Date
  passageCount: number
  lessonCount: number
  quizCount: number
  moduleCount: number
  questionCount: number
  lessonQuestionCount: number
  quizQuestionCount: number
}

export type ExamHubLevelSummary = {
  id: string
  title: string
  papers: ExamHubPaperSummary[]
}

export const randomPracticeTypeOptions = [
  { key: MaterialType.LISTENING, label: '听力' },
  { key: MaterialType.VOCAB_GRAMMAR, label: '语法' },
  { key: MaterialType.READING, label: '阅读' },
] as const

export type RandomPracticeCountMap = Partial<Record<MaterialType, number>>

function shuffleList<T>(list: T[]): T[] {
  const copied = [...list]
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copied[i], copied[j]] = [copied[j], copied[i]]
  }
  return copied
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toAnswerIds(answer: unknown): string[] {
  if (typeof answer === 'string' && answer.length > 0) return [answer]
  if (Array.isArray(answer)) {
    return answer.filter(item => typeof item === 'string') as string[]
  }
  return []
}

function toLegacyQuestionType({
  materialType,
  templateType,
  content,
}: {
  materialType: MaterialType
  templateType: QuestionTemplate
  content: Record<string, unknown>
}): string {
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
    if (
      templateType === QuestionTemplate.FILL_BLANK ||
      templateType === QuestionTemplate.CLOZE_TEST
    ) {
      return 'FILL_BLANK'
    }
    return 'READING_COMPREHENSION'
  }

  if (materialType === MaterialType.VOCAB_GRAMMAR) {
    return templateType === QuestionTemplate.CLOZE_TEST ? 'SORTING' : 'GRAMMAR'
  }
  return 'GRAMMAR'
}

function toQuestionOrder(
  content: Record<string, unknown>,
  fallback: number,
): number {
  const fromContent = content.order
  if (typeof fromContent === 'number' && Number.isFinite(fromContent)) {
    return Math.max(0, Math.floor(fromContent))
  }
  return fallback
}

function buildQuestionView(
  row: {
    id: string
    note: string | null
    templateType: QuestionTemplate
    content: unknown
    prompt: string | null
    context: string | null
    options: unknown
    answer: unknown
    sortOrder: number
  },
  material: {
    id: string
    type: MaterialType
    contentPayload: unknown
  },
  fallbackOrder: number,
) {
  const content = asRecord(row.content)
  const payload = asRecord(material.contentPayload)
  const questionType = toLegacyQuestionType({
    materialType: material.type,
    templateType: row.templateType,
    content,
  })
  const answerIds = new Set(toAnswerIds(row.answer))

  const options = asArray<Record<string, unknown>>(row.options).map(item => {
    const id = asString(item.id) || ''
    return {
      id,
      text: asString(item.text) || '',
      isCorrect: answerIds.has(id),
    }
  })
  const orderedOptions = reorderExamOptionsForSession(options, questionType)

  const base = {
    id: row.id,
    note: row.note,
    order: toQuestionOrder(content, row.sortOrder || fallbackOrder),
    questionType,
    prompt: row.prompt,
    contextSentence: row.context,
    targetWord: asString(content.targetWord),
    options: orderedOptions,
  }

  if (material.type === MaterialType.READING) {
    return {
      ...base,
      passageId: material.id,
      passage: {
        id: material.id,
        content: asString(payload.text) || asString(payload.transcript) || '',
      },
    }
  }

  if (material.type === MaterialType.LISTENING) {
    const rawDialogues = asArray<Record<string, unknown>>(payload.dialogues)
    const dialogues = rawDialogues.map((item, index) => ({
      id: Number(item.id ?? index + 1),
      text: asString(item.text) || '',
      start: Number(item.start ?? 0),
      end: Number(item.end ?? 0),
      sequenceId: Number(item.sequenceId ?? index + 1),
    }))

    return {
      ...base,
      lessonId: material.id,
      lesson: {
        id: material.id,
        audioFile: asString(payload.audioFile) || asString(payload.audioUrl),
        dialogues,
      },
    }
  }

  return base
}

async function buildVocabularyMaps() {
  const vocabularyRows = await prisma.vocabulary.findMany({
    where: {
      OR: [{ pronunciations: { not: null } }, { meanings: { not: null } }],
    },
    select: {
      word: true,
      pronunciations: true,
      partsOfSpeech: true,
      meanings: true,
    },
  })

  const pronunciationMap: Record<string, string> = {}
  const vocabularyMetaMap = vocabularyRows.reduce<Record<string, VocabularyMeta>>(
    (acc, item) => {
      const meta = toVocabularyMeta({ ...item, word: item.word })
      acc[item.word] = meta
      if (meta.pronunciations[0]) pronunciationMap[item.word] = meta.pronunciations[0]
      return acc
    },
    {},
  )

  return { pronunciationMap, vocabularyMetaMap }
}

export async function findLevelsWithPapersAndCounts(): Promise<
  ExamHubLevelSummary[]
> {
  const collections = await prisma.collection.findMany({
    where: {
      materials: {
        some: {},
      },
    },
    orderBy: {
      title: 'asc',
    },
    include: {
      materials: {
        include: {
          material: {
            select: {
              id: true,
              type: true,
              questions: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const papers = collections
    .map(collection => {
      const materials = collection.materials.map(item => item.material)
      const lessonMaterials = materials.filter(
        item => item.type === MaterialType.LISTENING,
      )
      const readingMaterials = materials.filter(
        item => item.type === MaterialType.READING,
      )
      const quizMaterials = materials.filter(
        item => item.type === MaterialType.VOCAB_GRAMMAR,
      )

      const lessonQuestionCount = lessonMaterials.reduce(
        (sum, item) => sum + item.questions.length,
        0,
      )
      const quizQuestionCount = quizMaterials.reduce(
        (sum, item) => sum + item.questions.length,
        0,
      )
      const readingQuestionCount = readingMaterials.reduce(
        (sum, item) => sum + item.questions.length,
        0,
      )

      const questionCount =
        lessonQuestionCount + quizQuestionCount + readingQuestionCount
      const moduleCount =
        lessonMaterials.length + readingMaterials.length + quizMaterials.length

      return {
        id: collection.id,
        name: collection.title,
        collectionType: collection.collectionType,
        description: collection.description,
        language: collection.language,
        level: collection.level,
        parentId: collection.parentId,
        sortOrder: collection.sortOrder,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
        passageCount: readingMaterials.length,
        lessonCount: lessonMaterials.length,
        quizCount: quizMaterials.length,
        moduleCount,
        questionCount,
        lessonQuestionCount,
        quizQuestionCount,
      }
    })
    .filter(item => item.questionCount > 0 || item.moduleCount > 0)

  if (papers.length === 0) return []

  const grouped = new Map<string, ExamHubPaperSummary[]>()
  for (const paper of papers) {
    const key = paper.collectionType
    const bucket = grouped.get(key) || []
    bucket.push(paper)
    grouped.set(key, bucket)
  }

  const levels: ExamHubLevelSummary[] = []
  const order: Array<{ type: CollectionType; title: string }> = [
    { type: CollectionType.PAPER, title: '试卷' },
    { type: CollectionType.CUSTOM_GROUP, title: '分组' },
    { type: CollectionType.FAVORITES, title: '收藏夹' },
  ]
  for (const item of order) {
    const rows = grouped.get(item.type) || []
    if (rows.length === 0) continue
    levels.push({
      id: `collectionType-${item.type}`,
      title: item.title,
      papers: rows,
    })
  }

  return levels
}

export async function findPaperDetailById(id: string) {
  const collection = await prisma.collection.findFirst({
    where: {
      id,
    },
    include: {
      materials: {
        orderBy: { sortOrder: 'asc' },
        include: {
          material: {
            include: {
              questions: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
                  templateType: true,
                  content: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!collection) return null

  const quizzes = collection.materials
    .map(item => item.material)
    .filter(material => material.type === MaterialType.VOCAB_GRAMMAR)
    .map(material => {
      const contentPayload = asRecord(material.contentPayload)
      return {
        id: material.id,
        materialType: material.type as 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR',
        title: getMaterialDisplayTitle(
          material.type,
          material.title,
          material.contentPayload,
          material.id,
        ),
        description: asString(contentPayload.description),
        questions: material.questions.map((question, index) => {
          const content = asRecord(question.content)
          return {
            id: question.id,
            questionType: toLegacyQuestionType({
              materialType: material.type,
              templateType: question.templateType,
              content,
            }),
            order: toQuestionOrder(content, question.sortOrder || index + 1),
          }
        }),
      }
    })

  const lessons = collection.materials
    .map(item => item.material)
    .filter(material => material.type === MaterialType.LISTENING)
    .map(material => ({
      id: material.id,
      materialType: material.type as 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR',
      title: getMaterialDisplayTitle(
        material.type,
        material.title,
        material.contentPayload,
        material.id,
      ),
      questions: material.questions.map(question => ({
        id: question.id,
      })),
    }))

  const passages = collection.materials
    .map(item => item.material)
    .filter(material => material.type === MaterialType.READING)
    .map(material => {
      const payload = asRecord(material.contentPayload)
      return {
        id: material.id,
        materialType: material.type as 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR',
        title: getMaterialDisplayTitle(
          material.type,
          material.title,
          material.contentPayload,
          material.id,
        ),
        content: asString(payload.text) || asString(payload.transcript) || '',
        questions: material.questions.map(question => ({
          id: question.id,
        })),
      }
    })

  return {
    id: collection.id,
    name: collection.title,
    collectionType: collection.collectionType,
    description: collection.description,
    language: collection.language,
    level: collection.level,
    parentId: collection.parentId,
    sortOrder: collection.sortOrder,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    quizzes,
    lessons,
    passages,
  }
}

export async function getExamQuestionsByPaperId(paperId: string) {
  const collection = await prisma.collection.findFirst({
    where: {
      id: paperId,
    },
    include: {
      materials: {
        orderBy: { sortOrder: 'asc' },
        include: {
          material: {
            include: {
              questions: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
                  note: true,
                  templateType: true,
                  content: true,
                  prompt: true,
                  context: true,
                  options: true,
                  answer: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!collection) return null

  const vocabGrammarQs: ReturnType<typeof buildQuestionView>[] = []
  const readingQs: ReturnType<typeof buildQuestionView>[] = []
  const listeningQs: ReturnType<typeof buildQuestionView>[] = []

  for (const relation of collection.materials) {
    const material = relation.material
    if (
      material.type !== MaterialType.LISTENING &&
      material.type !== MaterialType.READING &&
      material.type !== MaterialType.VOCAB_GRAMMAR
    ) {
      continue
    }
    const questions = material.questions.map((row, index) =>
      buildQuestionView(row, material, index + 1),
    )

    if (material.type === MaterialType.VOCAB_GRAMMAR) {
      vocabGrammarQs.push(...questions)
      continue
    }

    if (material.type === MaterialType.READING) {
      readingQs.push(...questions)
      continue
    }

    if (material.type === MaterialType.LISTENING) {
      listeningQs.push(...questions)
    }
  }

  const allQuestions = [...vocabGrammarQs, ...readingQs, ...listeningQs]
  const { pronunciationMap, vocabularyMetaMap } = await buildVocabularyMaps()

  return {
    paperTitle: collection.title,
    questions: allQuestions,
    pronunciationMap,
    vocabularyMetaMap,
  }
}

export async function getRandomExamQuestionsByTypeCounts(
  countMap: RandomPracticeCountMap,
) {
  const selectedQuestionIds: string[] = []
  const pickedByType: Array<{
    materialType: MaterialType
    requested: number
    selected: number
  }> = []

  for (const { key } of randomPracticeTypeOptions) {
    const requested = Math.max(0, Math.floor(countMap[key] || 0))
    if (requested <= 0) continue

    const rows = await prisma.question.findMany({
      where: {
        material: {
          type: key,
        },
      },
      select: { id: true },
    })

    if (rows.length === 0) {
      pickedByType.push({ materialType: key, requested, selected: 0 })
      continue
    }

    const pickedIds = shuffleList(rows.map(row => row.id)).slice(0, requested)
    selectedQuestionIds.push(...pickedIds)
    pickedByType.push({
      materialType: key,
      requested,
      selected: pickedIds.length,
    })
  }

  const uniqueIds: string[] = []
  const seen = new Set<string>()
  for (const id of selectedQuestionIds) {
    if (seen.has(id)) continue
    seen.add(id)
    uniqueIds.push(id)
  }

  if (uniqueIds.length === 0) {
    return {
      paperTitle: '自定义练习',
      sourceCollections: [] as string[],
      questions: [],
      pronunciationMap: {},
      vocabularyMetaMap: {},
      pickedByType,
    }
  }

  const questionRows = await prisma.question.findMany({
    where: { id: { in: uniqueIds } },
    include: {
      material: {
        select: {
          id: true,
          type: true,
          contentPayload: true,
          collectionMaterials: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: {
              collection: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      },
    },
  })

  const byId = new Map(questionRows.map(row => [row.id, row]))
  const questions = uniqueIds
    .map((id, index) => {
      const row = byId.get(id)
      if (!row) return null
      return buildQuestionView(
        {
          id: row.id,
          note: row.note,
          templateType: row.templateType,
          content: row.content,
          prompt: row.prompt,
          context: row.context,
          options: row.options,
          answer: row.answer,
          sortOrder: row.sortOrder,
        },
        row.material,
        index + 1,
      )
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)

  const sourceCollections = Array.from(
    new Set(
      questionRows
        .map(
          row =>
            row.material.collectionMaterials[0]?.collection.title?.trim() || '',
        )
        .filter(Boolean),
    ),
  )

  const { pronunciationMap, vocabularyMetaMap } = await buildVocabularyMaps()

  return {
    paperTitle: '自定义练习',
    sourceCollections,
    questions,
    pronunciationMap,
    vocabularyMetaMap,
    pickedByType,
  }
}
