import prisma from '@/lib/prisma'
import { CollectionType, MaterialType, QuestionType } from '@prisma/client'
import { getMaterialDisplayTitle } from '../materials/material-title'
import { reorderExamOptionsForSession } from './exam-option-order'
import { toVocabularyMeta, type VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { normalizeQuestionDisplayText } from '@/modules/practice/domain/question-text'
import {
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
} from '@/utils/questions/optionLabels'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'
import { readJsonRecord, readString } from '@/lib/validation/schema'

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
  listeningSectionCount: number
  quizQuestionCount: number
  attemptCount: number
  attemptCorrectCount: number
  attemptAccuracyPct: number | null
  manageSections: ExamHubManageSection[]
}

export type ExamHubLevelSummary = {
  id: string
  title: string
  papers: ExamHubPaperSummary[]
}

type ExamHubManageSection = {
  key: string
  label: string
  detail: string
  materialType: MaterialType
  questionCount: number
  materialCount: number
  sectionNumber: number | null
}

export const randomPracticeTypeOptions = [
  { key: MaterialType.LISTENING, label: '听力' },
  { key: MaterialType.VOCAB_GRAMMAR, label: '语法' },
  { key: MaterialType.READING, label: '阅读' },
] as const

export type RandomPracticeCountMap = Partial<Record<MaterialType, number>>
export type RandomPracticeScope = 'unattempted' | 'attempted' | 'all'
export type RandomPracticeFilters = {
  language?: string
  level?: string
  scope?: RandomPracticeScope
}

function shuffleList<T>(list: T[]): T[] {
  const copied = [...list]
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copied[i], copied[j]] = [copied[j], copied[i]]
  }
  return copied
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function toAnswerIds(answer: unknown): string[] {
  if (typeof answer === 'string' && answer.length > 0) return [answer]
  if (Array.isArray(answer)) {
    return answer.filter(item => typeof item === 'string') as string[]
  }
  return []
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

const LISTENING_SECTION_FALLBACK = {
  key: 'listening',
  title: '听力',
  partNumber: null,
}

function normalizeSectionKey(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function toPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.floor(value)
    return normalized > 0 ? normalized : null
  }
  if (typeof value === 'string' && value.trim()) {
    const match = value.trim().match(/\d+/)
    if (!match) return null
    const normalized = Number(match[0])
    return Number.isFinite(normalized) && normalized > 0
      ? Math.floor(normalized)
      : null
  }
  return null
}

function resolveListeningSection({
  content,
  payload,
  metadata,
  chapterName,
}: {
  content: Record<string, unknown>
  payload: Record<string, unknown>
  metadata: Record<string, unknown>
  chapterName?: string | null
}) {
  const explicitTitle = firstString(
    payload.listeningSectionTitle,
    payload.sectionTitle,
    payload.partTitle,
    payload.jlptPartTitle,
    metadata.listeningSectionTitle,
    metadata.sectionTitle,
    metadata.partTitle,
    metadata.jlptPartTitle,
    content.listeningSectionTitle,
    content.sectionTitle,
    content.partTitle,
    content.jlptPartTitle,
  )
  const titleFromChapter = chapterName
    ?.match(/(?:問題|问题)\s*\d+(?:\s*[-_－]\s*\d+)?\s*[｜|]\s*(.+)$/i)?.[1]
    ?.trim()
  const explicitPart = toPositiveInteger(
    content.listeningSectionNumber ??
      content.sectionNumber ??
      content.partNumber ??
      content.jlptPartNumber ??
      content.listeningSectionOrder ??
      content.sectionOrder ??
      content.partOrder ??
      payload.listeningSectionNumber ??
      payload.sectionNumber ??
      payload.partNumber ??
      payload.jlptPartNumber ??
      metadata.listeningSectionNumber ??
      metadata.sectionNumber ??
      metadata.partNumber ??
      metadata.jlptPartNumber,
  )
  if (explicitPart) {
    return {
      key: `listening-part-${explicitPart}`,
      title: explicitTitle || titleFromChapter || '听力',
      partNumber: explicitPart,
    }
  }

  const title = firstString(
    content.listeningSectionTitle,
    content.sectionTitle,
    content.partTitle,
    content.jlptPartTitle,
    payload.listeningSectionTitle,
    payload.sectionTitle,
    payload.partTitle,
    payload.jlptPartTitle,
    metadata.listeningSectionTitle,
    metadata.sectionTitle,
    metadata.partTitle,
    metadata.jlptPartTitle,
    content.listeningSection,
    content.section,
    content.part,
    content.jlptPart,
    payload.listeningSection,
    payload.section,
    payload.part,
    payload.jlptPart,
    metadata.listeningSection,
    metadata.section,
    metadata.part,
    metadata.jlptPart,
    chapterName,
  )

  if (!title) return LISTENING_SECTION_FALLBACK
  const canonicalTitle = title.match(
    /(?:問題|问题)\s*(\d+)(?:\s*[-_－]\s*\d+)?\s*[｜|]\s*(.+)$/i,
  )
  if (canonicalTitle) {
    const sectionNumber = toPositiveInteger(canonicalTitle[1])
    const sectionTitle = canonicalTitle[2]?.trim()
    if (sectionNumber && sectionTitle) {
      return {
        key: `listening-part-${sectionNumber}`,
        title: sectionTitle,
        partNumber: sectionNumber,
      }
    }
  }
  const titlePart = toPositiveInteger(title)
  if (titlePart && /部分|part|問題|问题|大题/i.test(title)) {
    return {
      key: `listening-part-${titlePart}`,
      title: '听力',
      partNumber: titlePart,
    }
  }

  return {
    key: normalizeSectionKey(title) || LISTENING_SECTION_FALLBACK.key,
    title,
    partNumber: null,
  }
}

function buildQuestionView(
  row: {
    id: string
    note: string | null
    attempts?: Array<{ isCorrect: boolean }>
    questionType: QuestionType
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
    chapterName?: string | null
    contentPayload: unknown
    metadata?: unknown
  },
  fallbackOrder: number,
) {
  const content = decodeQuestionContent(row.content)
  const payload = decodeMaterialPayloadRecord(material.type, material.contentPayload)
  const questionType = row.questionType
  const answerIds = new Set(toAnswerIds(row.answer))

  const options = asArray<Record<string, unknown>>(row.options).map(item => {
    const id = readString(item.id) || ''
    return {
      id,
      text: readString(item.text) || '',
      isCorrect: answerIds.has(id),
    }
  })
  const orderedOptions = reorderExamOptionsForSession(options, questionType)

  const base = {
    id: row.id,
    note: row.note,
    attempts: row.attempts || [],
    order: toQuestionOrder(content, row.sortOrder || fallbackOrder),
    questionType,
    prompt: normalizeQuestionDisplayText(row.prompt),
    contextSentence: normalizeQuestionDisplayText(row.context),
    targetWord: readString(content.targetWord),
    options: orderedOptions,
    optionLabelFormat: readString(content.optionLabelFormat)
      ? normalizeOptionLabelFormat(content.optionLabelFormat)
      : null,
    customOptionLabels: parseCustomOptionLabels(content.customOptionLabels),
  }

  if (material.type === MaterialType.READING) {
    return {
      ...base,
      passageId: material.id,
      passage: {
        id: material.id,
        content: readString(payload.text) || readString(payload.transcript) || '',
      },
    }
  }

  if (material.type === MaterialType.LISTENING) {
    const rawDialogues = asArray<Record<string, unknown>>(payload.dialogues)
    const section = resolveListeningSection({
      content,
      payload,
      metadata: readJsonRecord(material.metadata),
      chapterName: material.chapterName,
    })
    const dialogues = rawDialogues.map((item, index) => ({
      id: Number(item.id ?? index + 1),
      text: readString(item.text) || '',
      start: Number(item.start ?? 0),
      end: Number(item.end ?? 0),
      sequenceId: Number(item.sequenceId ?? index + 1),
    }))

    return {
      ...base,
      lessonId: material.id,
      lesson: {
        id: material.id,
        audioFile: readString(payload.audioFile) || readString(payload.audioUrl),
        sectionKey: section.key,
        sectionTitle: section.title,
        sectionNumber: section.partNumber,
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
      collectionType: CollectionType.PAPER,
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
              chapterName: true,
              contentPayload: true,
              metadata: true,
              questions: {
                select: {
                  id: true,
                  content: true,
                  attempts: {
                    select: {
                      isCorrect: true,
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
      const listeningSectionKeys = new Set<string>()
      for (const material of lessonMaterials) {
        const payload = decodeMaterialPayloadRecord(
          material.type,
          material.contentPayload,
        )
        const metadata = readJsonRecord(material.metadata)
        if (material.questions.length === 0) {
          const section = resolveListeningSection({
            content: {},
            payload,
            metadata,
            chapterName: material.chapterName,
          })
          listeningSectionKeys.add(section.key)
          continue
        }
        for (const question of material.questions) {
          const section = resolveListeningSection({
            content: decodeQuestionContent(question.content),
            payload,
            metadata,
            chapterName: material.chapterName,
          })
          listeningSectionKeys.add(section.key)
        }
      }
      const quizQuestionCount = quizMaterials.reduce(
        (sum, item) => sum + item.questions.length,
        0,
      )
      const readingQuestionCount = readingMaterials.reduce(
        (sum, item) => sum + item.questions.length,
        0,
      )
      const listeningSectionRows = Array.from(
        lessonMaterials
          .reduce<
            Map<
              string,
              {
                key: string
                label: string
                sectionNumber: number | null
                questionCount: number
                materialIds: Set<string>
              }
            >
          >((acc, material) => {
            const payload = decodeMaterialPayloadRecord(
              material.type,
              material.contentPayload,
            )
            const metadata = readJsonRecord(material.metadata)
            const questionRows =
              material.questions.length > 0 ? material.questions : [{ content: {} }]
            for (const question of questionRows) {
              const section = resolveListeningSection({
                content: decodeQuestionContent(question.content),
                payload,
                metadata,
                chapterName: material.chapterName,
              })
              const current =
                acc.get(section.key) ||
                {
                  key: section.key,
                  label: section.partNumber
                    ? section.title && section.title !== '听力'
                      ? `問題${section.partNumber}｜${section.title}`
                      : `問題${section.partNumber}`
                    : section.title,
                  sectionNumber: section.partNumber,
                  questionCount: 0,
                  materialIds: new Set<string>(),
                }
              current.questionCount += 'id' in question ? 1 : 0
              current.materialIds.add(material.id)
              acc.set(section.key, current)
            }
            return acc
          }, new Map())
          .values(),
      ).sort((a, b) => {
        const aNumber = a.sectionNumber || Number.MAX_SAFE_INTEGER
        const bNumber = b.sectionNumber || Number.MAX_SAFE_INTEGER
        if (aNumber !== bNumber) return aNumber - bNumber
        return a.label.localeCompare(b.label, 'zh-CN')
      })
      const manageSections: ExamHubManageSection[] = [
        ...(quizQuestionCount > 0 || quizMaterials.length > 0
          ? [
              {
                key: 'VOCAB_GRAMMAR',
                label: '文字・語彙・文法',
                detail: `${quizQuestionCount} 题 / ${quizMaterials.length} 模块`,
                materialType: MaterialType.VOCAB_GRAMMAR,
                questionCount: quizQuestionCount,
                materialCount: quizMaterials.length,
                sectionNumber: null,
              },
            ]
          : []),
        ...listeningSectionRows.map(section => ({
          key: `LISTENING:${section.key}`,
          label: section.label,
          detail: `${section.questionCount} 题 / ${section.materialIds.size} 音频`,
          materialType: MaterialType.LISTENING,
          questionCount: section.questionCount,
          materialCount: section.materialIds.size,
          sectionNumber: section.sectionNumber,
        })),
        ...(readingQuestionCount > 0 || readingMaterials.length > 0
          ? [
              {
                key: 'READING',
                label: '読解',
                detail: `${readingQuestionCount} 题 / ${readingMaterials.length} 篇`,
                materialType: MaterialType.READING,
                questionCount: readingQuestionCount,
                materialCount: readingMaterials.length,
                sectionNumber: null,
              },
            ]
          : []),
      ]

      const questionCount =
        lessonQuestionCount + quizQuestionCount + readingQuestionCount
      const moduleCount =
        lessonMaterials.length + readingMaterials.length + quizMaterials.length
      const allQuestions = materials.flatMap(item => item.questions || [])
      const attemptCount = allQuestions.reduce(
        (sum, question) => sum + (question.attempts?.length || 0),
        0,
      )
      const attemptCorrectCount = allQuestions.reduce(
        (sum, question) =>
          sum +
          (question.attempts?.filter(attempt => attempt.isCorrect).length || 0),
        0,
      )
      const attemptAccuracyPct =
        attemptCount > 0
          ? Math.round((attemptCorrectCount / attemptCount) * 100)
          : null

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
        listeningSectionCount: listeningSectionKeys.size,
        quizQuestionCount,
        attemptCount,
        attemptCorrectCount,
        attemptAccuracyPct,
        manageSections,
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
                  questionType: true,
                  content: true,
                  prompt: true,
                  context: true,
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
      const contentPayload = decodeMaterialPayloadRecord(
        material.type,
        material.contentPayload,
      )
      return {
        id: material.id,
        materialType: material.type as 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR',
        title: getMaterialDisplayTitle(
          material.type,
          material.title,
          material.contentPayload,
          material.id,
        ),
        description: readString(contentPayload.description),
        questions: material.questions.map((question, index) => {
          const content = decodeQuestionContent(question.content)
          return {
            id: question.id,
            questionType: question.questionType,
            prompt: normalizeQuestionDisplayText(question.prompt),
            contextSentence: normalizeQuestionDisplayText(question.context),
            order: toQuestionOrder(content, question.sortOrder || index + 1),
          }
        }),
      }
    })

  const lessons = collection.materials
    .map(item => item.material)
    .filter(material => material.type === MaterialType.LISTENING)
    .map(material => {
      const payload = decodeMaterialPayloadRecord(material.type, material.contentPayload)
      const metadata = readJsonRecord(material.metadata)
      return {
        id: material.id,
        materialType: material.type as 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR',
        title: getMaterialDisplayTitle(
          material.type,
          material.title,
          material.contentPayload,
          material.id,
        ),
        audioFile: readString(payload.audioFile) || readString(payload.audioUrl),
        questions: material.questions.map((question, index) => {
          const content = decodeQuestionContent(question.content)
          const section = resolveListeningSection({
            content,
            payload,
            metadata,
            chapterName: material.chapterName || material.title,
          })
          return {
            id: question.id,
            questionType: question.questionType,
            prompt: normalizeQuestionDisplayText(question.prompt),
            contextSentence: normalizeQuestionDisplayText(question.context),
            sectionKey: section.key,
            sectionTitle: section.title,
            sectionNumber: section.partNumber,
            order: toQuestionOrder(content, question.sortOrder || index + 1),
          }
        }),
      }
    })

  const passages = collection.materials
    .map(item => item.material)
    .filter(material => material.type === MaterialType.READING)
    .map(material => {
      const payload = decodeMaterialPayloadRecord(material.type, material.contentPayload)
      return {
        id: material.id,
        materialType: material.type as 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR',
        title: getMaterialDisplayTitle(
          material.type,
          material.title,
          material.contentPayload,
          material.id,
        ),
        content: readString(payload.text) || readString(payload.transcript) || '',
        questions: material.questions.map(question => ({
          id: question.id,
          questionType: question.questionType,
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

export async function getManagePaperEditData(paperId: string) {
  const collection = await prisma.collection.findUnique({
    where: { id: paperId },
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
                  questionType: true,
                  content: true,
                  prompt: true,
                  context: true,
                  options: true,
                  answer: true,
                  analysis: true,
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

  const materials = collection.materials.map(relation => {
    const material = relation.material
    const payload = decodeMaterialPayloadRecord(material.type, material.contentPayload)
    const metadata = readJsonRecord(material.metadata)
    const materialListeningSection =
      material.type === MaterialType.LISTENING
        ? resolveListeningSection({
            content: {},
            payload,
            metadata,
            chapterName: material.chapterName,
          })
        : null
    return {
      id: material.id,
      materialType: material.type,
      title: getMaterialDisplayTitle(
        material.type,
        material.title,
        material.contentPayload,
        material.id,
      ),
      sortOrder: relation.sortOrder,
      questionCount: material.questions.length,
      listeningSectionTitle: materialListeningSection?.title || '',
      listeningSectionKey: materialListeningSection?.key || '',
      listeningSectionNumber: materialListeningSection?.partNumber
        ? String(materialListeningSection.partNumber)
        : '',
      questions: material.questions.map((row, index) => {
        const content = decodeQuestionContent(row.content)
        const answerIds = new Set(toAnswerIds(row.answer))
        const listeningSection =
          material.type === MaterialType.LISTENING
            ? resolveListeningSection({
                content,
                payload,
                metadata,
                chapterName: material.chapterName,
              })
            : null
        const options = asArray<Record<string, unknown>>(row.options).map(
          (item, optionIndex) => {
            const id = readString(item.id) || `opt_${optionIndex + 1}`
            return {
              id,
              text: readString(item.text) || '',
              isCorrect: answerIds.has(id),
            }
          },
        )

        return {
          id: row.id,
          questionType: row.questionType,
          prompt: row.prompt || '',
          contextSentence: row.context || row.prompt || '',
          explanation: row.analysis || '',
          listeningSectionTitle: listeningSection?.title || '',
          listeningSectionKey: listeningSection?.key || '',
          listeningSectionNumber: listeningSection?.partNumber
            ? String(listeningSection.partNumber)
            : '',
          optionLabelFormat: normalizeOptionLabelFormat(
            content.optionLabelFormat,
            collection.language === 'ja' || material.type === MaterialType.LISTENING
              ? 'numeric'
              : 'upper-alpha',
          ),
          customOptionLabels: parseCustomOptionLabels(
            content.customOptionLabels,
          ).join('|'),
          sortOrder: toQuestionOrder(content, row.sortOrder || index + 1),
          options,
        }
      }),
    }
  })

  return {
    id: collection.id,
    title: collection.title,
    description: collection.description,
    language: collection.language,
    level: collection.level,
    materials,
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
                  attempts: {
                    select: {
                      isCorrect: true,
                    },
                  },
                  questionType: true,
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
    paperLanguage: collection.language,
    questions: allQuestions,
    pronunciationMap,
    vocabularyMetaMap,
  }
}

export async function getRandomExamQuestionsByTypeCounts(
  countMap: RandomPracticeCountMap,
  filters?: RandomPracticeFilters,
) {
  const normalizedLanguage = (filters?.language || '').trim()
  const normalizedLevel = (filters?.level || '').trim()
  const scope = filters?.scope || 'unattempted'
  const hasCollectionFilter = Boolean(normalizedLanguage || normalizedLevel)

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
        ...(scope === 'unattempted'
          ? { attempts: { none: {} } }
          : scope === 'attempted'
            ? { attempts: { some: {} } }
            : {}),
        material: {
          type: key,
          ...(hasCollectionFilter
            ? {
                collectionMaterials: {
                  some: {
                    collection: {
                      ...(normalizedLanguage
                        ? { language: normalizedLanguage }
                        : {}),
                      ...(normalizedLevel ? { level: normalizedLevel } : {}),
                    },
                  },
                },
              }
            : {}),
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
      paperLanguage: normalizedLanguage || null,
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
      attempts: {
        select: {
          isCorrect: true,
        },
      },
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
          attempts: row.attempts,
          questionType: row.questionType,
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
    paperLanguage: normalizedLanguage || null,
    sourceCollections,
    questions,
    pronunciationMap,
    vocabularyMetaMap,
    pickedByType,
  }
}

export async function getRandomPracticeFilterOptions() {
  const collections = await prisma.collection.findMany({
    where: {
      materials: {
        some: {},
      },
    },
    select: {
      language: true,
      level: true,
    },
  })

  const languages = Array.from(
    new Set(collections.map(item => (item.language || '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))
  const levels = Array.from(
    new Set(collections.map(item => (item.level || '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))

  return { languages, levels }
}
