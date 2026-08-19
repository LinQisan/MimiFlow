import prisma from '@/lib/prisma'
import { MaterialType } from '@prisma/client'
import {
  getMaterialDisplayTitle,
  getReadingCardTitle,
  isReadingTitleDerivedFromContent,
} from './material-title'
import { toVocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { buildSurfaceAliasMapForText } from '@/utils/vocabulary/japaneseInflection'
import { prepareEbookChapters } from '@/lib/ebooks/chapter-display'
import { isEbookSourceKind } from '@/lib/ebooks/source-kind'
import {
  readFiniteNumber,
  readString,
  readStringArray,
} from '@/lib/validation/schema'
import { decodeMaterialPayload } from '@/lib/codecs/material-payload'
import { decodeQuestionContent } from '@/lib/codecs/question-content'

type JsonRecord = Record<string, unknown>

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asChapterArray(value: unknown) {
  return asArray<JsonRecord>(value)
    .map((item, index) => ({
      id: readString(item.id) || `chapter-${index + 1}`,
      title: readString(item.title) || `第 ${index + 1} 页`,
      text: readString(item.text) || '',
      href: readString(item.href) || '',
    }))
    .filter((item) => item.text.trim())
}

function toAnswerIds(answer: unknown): string[] {
  if (typeof answer === 'string' && answer) return [answer]
  if (Array.isArray(answer)) {
    return answer.filter((item) => typeof item === 'string') as string[]
  }
  return []
}

export function normalizeQuestionOptions(
  options: unknown,
  answer: unknown,
): Array<{ id: string; text: string; isCorrect: boolean }> {
  const answerIds = new Set(toAnswerIds(answer))
  return asArray<JsonRecord>(options).map((item) => {
    const id = readString(item.id) || ''
    return {
      id,
      text: readString(item.text) || '',
      isCorrect: answerIds.has(id),
    }
  })
}

export function normalizeQuestionContext(
  prompt: string | null,
  context: string | null,
) {
  return context || prompt || ''
}

export function materialDialogueItems(
  type: MaterialType,
  contentPayload: unknown,
) {
  const payload =
    type === MaterialType.LISTENING
      ? decodeMaterialPayload(MaterialType.LISTENING, contentPayload)
      : type === MaterialType.SPEAKING
        ? decodeMaterialPayload(MaterialType.SPEAKING, contentPayload)
        : type === MaterialType.MEDIA_SUBTITLE
          ? decodeMaterialPayload(MaterialType.MEDIA_SUBTITLE, contentPayload)
          : null
  return (payload?.dialogues ?? []).map((item, index) => ({
    id: readFiniteNumber(item.id, index + 1),
    text: readString(item.text) || '',
    start: readFiniteNumber(item.start),
    end: readFiniteNumber(item.end),
    sequenceId: readFiniteNumber(item.sequenceId, index + 1),
  }))
}

const buildVocabularyMetaMapForText = async (
  text: string,
  sourceIds: string[],
) => {
  const rows = await prisma.vocabulary.findMany({
    where: {
      OR: [
        { sourceType: 'ARTICLE_TEXT', sourceId: { in: sourceIds } },
        { pronunciations: { not: null } },
        { meanings: { not: null } },
      ],
    },
    select: {
      word: true,
      pronunciations: true,
      partsOfSpeech: true,
      meanings: true,
      sourceType: true,
      sourceId: true,
    },
  })

  const sourceIdSet = new Set(sourceIds)
  const aliasMap = buildSurfaceAliasMapForText(
    text,
    rows.map((row) => row.word),
  )
  const matchedBaseWords = new Set(Object.values(aliasMap))

  return rows.reduce<Record<string, ReturnType<typeof toVocabularyMeta>>>(
    (acc, row) => {
      if (row.sourceType !== 'ARTICLE_TEXT' || !sourceIdSet.has(row.sourceId)) {
        if (!matchedBaseWords.has(row.word)) return acc
      }
      acc[row.word] = toVocabularyMeta(row)
      return acc
    },
    {},
  )
}

export async function getArticleById(id: string) {
  const material = await prisma.material.findFirst({
    where: { type: MaterialType.READING, id },
    include: {
      collectionMaterials: {
        take: 1,
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
      questions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: {
            select: { attempts: true },
          },
        },
      },
      studyProgresses: {
        where: {
          profileId: 'default',
          learningMode: 'article-reading',
        },
        take: 1,
      },
    },
  })

  if (!material) return null

  const payload = decodeMaterialPayload(
    MaterialType.READING,
    material.contentPayload,
  )
  const category = material.collectionMaterials[0]?.collection
  const materialText =
    readString(payload.text) || readString(payload.transcript) || ''
  const displayTitle = getMaterialDisplayTitle(
    material.type,
    material.title,
    material.contentPayload,
    id,
  )
  const hasAuthenticTitle = !(
    category?.collectionType === 'PAPER' &&
    isReadingTitleDerivedFromContent(displayTitle, materialText)
  )
  const vocabularyMetaMap = await buildVocabularyMetaMapForText(materialText, [
    material.id,
  ])

  return {
    id: material.id,
    materialId: material.id,
    title: displayTitle,
    shortTitle: getReadingCardTitle(displayTitle),
    hasAuthenticTitle,
    content: materialText,
    sourceKind: readString(payload.sourceKind),
    publishedDate: readString(payload.publishedDate),
    edition: readString(payload.edition),
    newsSeries: readString(payload.newsSeries),
    pageNumber: readString(payload.pageNumber),
    newsSource: readString(payload.newsSource),
    newsType: readString(payload.newsType),
    newsSection: readString(payload.newsSection),
    newsColumn: readString(payload.newsColumn),
    newsTopic: readString(payload.newsTopic),
    audioFile: readString(payload.audioFile),
    author: readString(payload.author),
    description: readString(payload.description),
    chapters: asChapterArray(payload.chapters),
    vocabularyMetaMap,
    category: category
      ? { name: category.title, collectionType: category.collectionType }
      : null,
    progress: material.studyProgresses[0]
      ? {
          percent: material.studyProgresses[0].progressPercent,
          lastPosition: material.studyProgresses[0].lastPosition,
          updatedAt: material.studyProgresses[0].updatedAt,
        }
      : null,
    questions: material.questions.map((question) => {
      const contextSentence =
        question.context && question.context.trim() !== question.prompt?.trim()
          ? question.context
          : null
      return {
        id: question.id,
        questionType: question.questionType,
        prompt: question.prompt,
        contextSentence,
        options: normalizeQuestionOptions(
          question.options,
          question.answer,
        ).map(({ id, text }) => ({ id, text })),
        analysis: question.analysis,
        attemptCount: question._count.attempts,
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
              collectionType: true,
            },
          },
        },
      },
      questions: {
        select: { id: true },
      },
      studyProgresses: {
        where: {
          profileId: 'default',
          learningMode: 'article-reading',
        },
        take: 1,
      },
    },
  })

  return rows.map((material) => {
    const payload = decodeMaterialPayload(
      material.type,
      material.contentPayload,
    )
    const category = material.collectionMaterials[0]?.collection
    const content =
      readString(payload.text) || readString(payload.transcript) || ''
    const displayTitle = getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      material.id,
    )
    const hasAuthenticTitle = !(
      category?.collectionType === 'PAPER' &&
      isReadingTitleDerivedFromContent(displayTitle, content)
    )
    const chapters = asChapterArray(payload.chapters)
    return {
      id: material.id,
      title: displayTitle,
      shortTitle: getReadingCardTitle(displayTitle),
      hasAuthenticTitle,
      description: readString(payload.description),
      content,
      sourceKind: readString(payload.sourceKind),
      publishedDate: readString(payload.publishedDate),
      edition: readString(payload.edition),
      newsSeries: readString(payload.newsSeries),
      pageNumber: readString(payload.pageNumber),
      newsSource: readString(payload.newsSource),
      newsType: readString(payload.newsType),
      newsSection: readString(payload.newsSection),
      newsColumn: readString(payload.newsColumn),
      newsTopic: readString(payload.newsTopic),
      author: readString(payload.author),
      chapterCount: isEbookSourceKind(readString(payload.sourceKind))
        ? prepareEbookChapters(chapters, displayTitle).length
        : chapters.length,
      progress: material.studyProgresses[0]
        ? {
            percent: material.studyProgresses[0].progressPercent,
            lastPosition: material.studyProgresses[0].lastPosition,
            updatedAt: material.studyProgresses[0].updatedAt,
          }
        : null,
      paper: category
        ? {
            id: category.id,
            name: category.title,
            level: null,
            collectionType: category.collectionType,
          }
        : null,
      questionCount: material.questions.length,
    }
  })
}

export async function getLessonById(id: string) {
  const material = await prisma.material.findUnique({
    where: { id },
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

  const payload = decodeMaterialPayload(
    MaterialType.LISTENING,
    material.contentPayload,
  )
  const collection = material.collectionMaterials[0]?.collection
  const siblings =
    collection?.materials
      .map((item) => item.material)
      .filter((item) => item.type === MaterialType.LISTENING)
      .map((item) => ({
        id: item.id,
        title: item.title,
      })) || []

  const currentIndex = siblings.findIndex((item) => item.id === id)

  return {
    id: material.id,
    materialId: material.id,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      material.id,
    ),
    audioFile:
      readString(payload.audioFile) || readString(payload.audioUrl) || '',
    dialogues: materialDialogueItems(
      MaterialType.LISTENING,
      material.contentPayload,
    ),
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

export async function getSpeakingById(id: string) {
  const material = await prisma.material.findFirst({
    where: { type: MaterialType.SPEAKING, id },
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

  const payload = decodeMaterialPayload(
    MaterialType.SPEAKING,
    material.contentPayload,
  )
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

  const siblings = siblingRows.map((row) => {
    return {
      id: row.material.id,
      title: getMaterialDisplayTitle(
        row.material.type,
        row.material.title,
        row.material.contentPayload,
        row.material.id,
      ),
    }
  })

  const currentIndex = siblings.findIndex((item) => item.id === material.id)

  return {
    id: material.id,
    materialId: material.id,
    title: getMaterialDisplayTitle(
      material.type,
      material.title,
      material.contentPayload,
      material.id,
    ),
    audioFile:
      readString(payload.audioFile) || readString(payload.audioUrl) || '',
    dialogues: materialDialogueItems(
      MaterialType.SPEAKING,
      material.contentPayload,
    ),
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
        type: true,
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
          id: topLesson.id,
          title: getMaterialDisplayTitle(
            MaterialType.LISTENING,
            topLesson.title,
            topLesson.contentPayload,
            topLesson.id,
          ),
          _count: {
            dialogues: materialDialogueItems(
              topLesson.type,
              topLesson.contentPayload,
            ).length,
          },
        }
      : null,
    topArticle: topArticle
      ? {
          id: topArticle.id,
          title: getMaterialDisplayTitle(
            MaterialType.READING,
            topArticle.title,
            topArticle.contentPayload,
            topArticle.id,
          ),
          content: decodeMaterialPayload(
            MaterialType.READING,
            topArticle.contentPayload,
          ).text,
        }
      : null,
    topQuiz: topQuiz
      ? {
          id: topQuiz.id,
          title: getMaterialDisplayTitle(
            MaterialType.VOCAB_GRAMMAR,
            topQuiz.title,
            null,
            topQuiz.id,
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
              language: true,
              level: true,
              collectionType: true,
              parent: {
                select: {
                  id: true,
                  title: true,
                  language: true,
                  level: true,
                  collectionType: true,
                  parent: {
                    select: {
                      id: true,
                      title: true,
                      language: true,
                      level: true,
                      collectionType: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      questions: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { content: true },
      },
    },
  })

  return rows.map((material) => {
    const payload = decodeMaterialPayload(
      material.type,
      material.contentPayload,
    )
    const collection = material.collectionMaterials[0]?.collection || null
    const tags = readStringArray(payload.tags)
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
    const paperCollection =
      collection?.collectionType === 'PAPER' ? collection : null

    const listeningSectionNumbers = material.questions
      .map((question) => {
        const content = decodeQuestionContent(question.content)
        const raw =
          content.listeningSectionNumber ??
          content.sectionNumber ??
          content.partNumber ??
          content.jlptPartNumber
        const parsed = Number(raw)
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null
      })
      .filter((value): value is number => value !== null)
    const rawMaterialSectionNumber =
      payload.listeningSectionNumber ??
      payload.sectionNumber ??
      payload.partNumber ??
      payload.jlptPartNumber
    const parsedMaterialSectionNumber = Number(rawMaterialSectionNumber)
    const materialSectionNumber =
      Number.isInteger(parsedMaterialSectionNumber) &&
      parsedMaterialSectionNumber > 0
        ? parsedMaterialSectionNumber
        : null
    const listeningSectionNumber =
      listeningSectionNumbers[0] || materialSectionNumber || null
    const isExamMaterial = Boolean(paperCollection)

    const hierarchyPath = [
      rootCollection?.title,
      bookCollection?.title,
      chapterCollection?.title,
    ].filter(Boolean) as string[]

    return {
      id: material.id,
      materialId: material.id,
      materialType: material.type as
        'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR',
      chapterName: (material.chapterName || '').trim(),
      title: getMaterialDisplayTitle(
        material.type,
        material.title,
        material.contentPayload,
        material.id,
      ),
      audioFile:
        readString(payload.audioFile) || readString(payload.audioUrl) || '',
      description: readString(payload.description) || '',
      transcript: readString(payload.transcript) || '',
      source: readString(payload.source) || '',
      language:
        readString(payload.language) ||
        collection?.language?.trim() ||
        parent?.language?.trim() ||
        grandParent?.language?.trim() ||
        '',
      difficulty:
        readString(payload.difficulty) ||
        collection?.level?.trim() ||
        parent?.level?.trim() ||
        grandParent?.level?.trim() ||
        '',
      tags,
      tagsText: tags.join(', '),
      dialogueCount: materialDialogueItems(
        material.type,
        material.contentPayload,
      ).length,
      questionCount: material.questions.length,
      listeningSectionNumber,
      needsQuestion:
        material.type === MaterialType.LISTENING &&
        material.questions.length === 0,
      needsSection:
        material.type === MaterialType.LISTENING &&
        material.questions.length > 0 &&
        listeningSectionNumbers.length !== material.questions.length,
      collectionId: collection?.id || null,
      collectionType: collection?.collectionType || null,
      isExamMaterial,
      rootId: rootCollection?.id || null,
      bookId: bookCollection?.id || null,
      chapterId: chapterCollection?.id || null,
      hierarchyPath,
      pathLabel:
        hierarchyPath.length > 0
          ? hierarchyPath.join(' / ')
          : collection?.title || '未归类',
      isClassified: Boolean(paperCollection?.id || chapterCollection?.id),
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
