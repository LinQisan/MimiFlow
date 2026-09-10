import {
  CollectionType,
  MaterialType,
  Prisma,
  QuestionType,
} from '@prisma/client'

import prisma from '@/lib/prisma'
import { getMaterialDisplayTitle } from '../materials/material-title'
import { decodeMaterialPayloadRecord } from '@/lib/codecs/material-payload'

type UploadPageLevelLite = {
  id: string
  title: string
}

type UploadPageCollectionLite = {
  id: string
  name: string
  parentId?: string | null
  collectionType: CollectionType
  acceptedMaterialTypes: MaterialType[]
  materialType: MaterialType
  sortOrder?: number
  language?: string
  examLevel?: string
  level: { title: string }
  lessons: {
    title: string
    audioFile: string
    chapterName: string
    materialType: MaterialType
  }[]
}

function toCollectionTypeLabel(type: CollectionType) {
  if (type === CollectionType.PAPER) return '正式试卷'
  if (type === CollectionType.CUSTOM_GROUP) return '普通集合'
  if (type === CollectionType.BOOK) return '教材'
  if (type === CollectionType.CHAPTER) return '章节'
  return '教材库'
}

export async function getUploadPageSeedData({
  includeLessons = true,
  materialType,
  language,
  collectionTypes,
}: {
  includeLessons?: boolean
  materialType?: MaterialType
  language?: string
  collectionTypes?: CollectionType[]
} = {}): Promise<{
  dbLevels: UploadPageLevelLite[]
  dbCollections: UploadPageCollectionLite[]
}> {
  const isPaperQuizImport =
    materialType === MaterialType.VOCAB_GRAMMAR &&
    collectionTypes?.length === 1 &&
    collectionTypes[0] === CollectionType.PAPER
  const collections = await prisma.collection.findMany({
    where: {
      ...(materialType && !isPaperQuizImport
        ? { acceptedMaterialTypes: { has: materialType } }
        : {}),
      ...(collectionTypes?.length
        ? { collectionType: { in: collectionTypes } }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      parentId: true,
      sortOrder: true,
      collectionType: true,
      acceptedMaterialTypes: true,
      language: true,
      level: true,
      materials: {
        orderBy: { sortOrder: 'desc' },
        take: includeLessons ? 30 : 0,
        select: {
          material: {
            select: {
              title: true,
              chapterName: true,
              type: true,
              contentPayload: true,
            },
          },
        },
      },
    },
  })
  const allowsPaper =
    !collectionTypes || collectionTypes.includes(CollectionType.PAPER)
  const allowsMaterial =
    !collectionTypes ||
    collectionTypes.some((type) => type !== CollectionType.PAPER)
  const dbLevels: UploadPageLevelLite[] = [
    ...(allowsPaper
      ? [{ id: CollectionType.PAPER, title: '正式试卷 - 真题 / 模考' }]
      : []),
    ...(allowsMaterial
      ? [
          {
            id: CollectionType.CUSTOM_GROUP,
            title: '资料集 - 教材 / 新闻 / 自定义内容',
          },
        ]
      : []),
  ]

  const priorityByType: Record<MaterialType, number> = {
    [MaterialType.LISTENING]: 4,
    [MaterialType.MEDIA_SUBTITLE]: 3,
    [MaterialType.READING]: 2,
    [MaterialType.VOCAB_GRAMMAR]: 1,
    [MaterialType.SPEAKING]: 0,
  }
  const dominantMaterialTypeByCollection = new Map<string, MaterialType>()
  const typeCountByCollection = new Map<string, Record<MaterialType, number>>()
  for (const collection of collections) {
    const current = {
      [MaterialType.LISTENING]: 0,
      [MaterialType.MEDIA_SUBTITLE]: 0,
      [MaterialType.READING]: 0,
      [MaterialType.VOCAB_GRAMMAR]: 0,
      [MaterialType.SPEAKING]: 0,
    }
    for (const row of collection.materials) current[row.material.type] += 1
    typeCountByCollection.set(collection.id, current)
  }
  for (const [collectionId, countMap] of typeCountByCollection.entries()) {
    const ranked = (Object.keys(countMap) as MaterialType[]).sort((a, b) => {
      const countDiff = countMap[b] - countMap[a]
      if (countDiff !== 0) return countDiff
      return priorityByType[b] - priorityByType[a]
    })
    dominantMaterialTypeByCollection.set(
      collectionId,
      ranked[0] || MaterialType.LISTENING,
    )
  }

  const allDbCollections: UploadPageCollectionLite[] = collections.map(
    (collection) => {
      const lessons = collection.materials.map((row) => {
        const payload = decodeMaterialPayloadRecord(
          row.material.type,
          row.material.contentPayload,
        )

        return {
          title: getMaterialDisplayTitle(
            row.material.type,
            row.material.title,
            row.material.contentPayload,
            row.material.title,
          ),
          chapterName: row.material.chapterName || '',
          materialType: row.material.type,
          audioFile: String(payload.audioFile || payload.audioUrl || ''),
        }
      })

      return {
        id: collection.id,
        name: collection.title,
        parentId: collection.parentId,
        sortOrder: collection.sortOrder,
        collectionType: collection.collectionType,
        acceptedMaterialTypes: collection.acceptedMaterialTypes,
        materialType:
          dominantMaterialTypeByCollection.get(collection.id) ||
          MaterialType.LISTENING,
        language: collection.language || undefined,
        examLevel: collection.level || undefined,
        level: { title: toCollectionTypeLabel(collection.collectionType) },
        lessons,
      }
    },
  )

  const collectionById = new Map(
    collections.map((collection) => [collection.id, collection]),
  )
  const languageById = new Map<string, string | null>()
  const resolveCollectionLanguage = (
    collectionId: string,
    visited = new Set<string>(),
  ): string | null => {
    if (languageById.has(collectionId))
      return languageById.get(collectionId) ?? null
    if (visited.has(collectionId)) return null
    visited.add(collectionId)
    const collection = collectionById.get(collectionId)
    if (!collection) return null
    const ownLanguage = collection.language?.trim().toLowerCase()
    const resolved: string | null =
      ownLanguage ||
      (collection.parentId
        ? resolveCollectionLanguage(collection.parentId, visited)
        : null)
    languageById.set(collectionId, resolved)
    return resolved
  }
  const normalizedLanguage = language?.trim().toLowerCase()
  const dbCollections = normalizedLanguage
    ? allDbCollections.filter(
        (collection) =>
          resolveCollectionLanguage(collection.id) === normalizedLanguage,
      )
    : allDbCollections

  return { dbLevels, dbCollections }
}

export async function getDefaultListeningQuestionsPerMaterial({
  language,
  questionType,
  listeningSectionNumber,
}: {
  language: string
  questionType: QuestionType
  listeningSectionNumber?: number
}): Promise<number | null> {
  const sectionFilter = listeningSectionNumber
    ? Prisma.sql`AND COALESCE(
        CASE
          WHEN m.content_payload->>'listeningSectionNumber' ~ '^[1-9][0-9]*$'
            THEN (m.content_payload->>'listeningSectionNumber')::int
        END,
        CASE
          WHEN m.content_payload->>'sectionNumber' ~ '^[1-9][0-9]*$'
            THEN (m.content_payload->>'sectionNumber')::int
        END,
        CASE
          WHEN q.content->>'listeningSectionNumber' ~ '^[1-9][0-9]*$'
            THEN (q.content->>'listeningSectionNumber')::int
        END,
        CASE
          WHEN q.content->>'sectionNumber' ~ '^[1-9][0-9]*$'
            THEN (q.content->>'sectionNumber')::int
        END
      ) = ${listeningSectionNumber}`
    : Prisma.empty

  const rows = await prisma.$queryRaw<
    Array<{ questionCount: number; materialCount: number }>
  >(Prisma.sql`
    WITH material_question_counts AS (
      SELECT
        m.id,
        COUNT(q.id)::int AS question_count
      FROM materials m
      JOIN questions q ON q.material_id = m.id
      WHERE m.type = 'LISTENING'
        AND q.question_type = ${questionType}::"QuestionType"
        ${sectionFilter}
        AND EXISTS (
          SELECT 1
          FROM collection_materials cm
          JOIN collections c ON c.id = cm.collection_id
          WHERE cm.material_id = m.id
            AND c.collection_type = 'PAPER'
            AND LOWER(c.language) = LOWER(${language})
        )
      GROUP BY m.id
    )
    SELECT
      question_count AS "questionCount",
      COUNT(*)::int AS "materialCount"
    FROM material_question_counts
    WHERE question_count BETWEEN 1 AND 5
    GROUP BY question_count
    ORDER BY "materialCount" DESC, "questionCount" DESC
    LIMIT 1
  `)

  return rows[0]?.questionCount ?? null
}
