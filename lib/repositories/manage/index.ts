import { CollectionType, MaterialType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getMaterialDisplayTitle } from '../materials/material-title'

type UploadPageLevelLite = {
  id: string
  title: string
}

type UploadPageCollectionLite = {
  id: string
  name: string
  parentId?: string | null
  collectionType: CollectionType
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
  if (type === CollectionType.PAPER) return '试卷'
  if (type === CollectionType.CUSTOM_GROUP) return '分组'
  return '收藏夹'
}

export async function getManageIndexData() {
  const [
    collectionCount,
    listeningCount,
    readingCount,
    quizMaterialCount,
    questionCount,
    vocabCount,
    recentCollections,
  ] = await Promise.all([
    prisma.collection.count({ where: { collectionType: CollectionType.PAPER } }),
    prisma.material.count({ where: { type: MaterialType.LISTENING } }),
    prisma.material.count({ where: { type: MaterialType.READING } }),
    prisma.material.count({ where: { type: MaterialType.VOCAB_GRAMMAR } }),
    prisma.question.count(),
    prisma.vocabulary.count(),
    prisma.collection.findMany({
      where: { collectionType: CollectionType.PAPER },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        title: true,
        collectionType: true,
        _count: {
          select: { materials: true },
        },
      },
    }),
  ])

  return {
    collectionCount,
    listeningCount,
    readingCount,
    quizMaterialCount,
    questionCount,
    vocabCount,
    recentCollections,
  }
}

export async function getUploadPageSeedData(): Promise<{
  dbLevels: UploadPageLevelLite[]
  dbCollections: UploadPageCollectionLite[]
}> {
  const collections = await prisma.collection.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      parentId: true,
      sortOrder: true,
      collectionType: true,
      language: true,
      level: true,
      materials: {
        orderBy: { sortOrder: 'desc' },
        take: 30,
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

  const dbLevels: UploadPageLevelLite[] = [
    { id: CollectionType.PAPER, title: '试卷（PAPER）' },
    { id: CollectionType.CUSTOM_GROUP, title: '分组（CUSTOM_GROUP）' },
    { id: CollectionType.FAVORITES, title: '收藏夹（FAVORITES）' },
  ]

  const collectionIds = collections.map(item => item.id)
  const collectionMaterialTypes = await prisma.collectionMaterial.findMany({
    where: { collectionId: { in: collectionIds } },
    select: {
      collectionId: true,
      material: {
        select: {
          type: true,
        },
      },
    },
  })

  const priorityByType: Record<MaterialType, number> = {
    [MaterialType.LISTENING]: 4,
    [MaterialType.READING]: 3,
    [MaterialType.VOCAB_GRAMMAR]: 2,
    [MaterialType.SPEAKING]: 1,
  }
  const dominantMaterialTypeByCollection = new Map<string, MaterialType>()
  const typeCountByCollection = new Map<
    string,
    Record<MaterialType, number>
  >()
  for (const row of collectionMaterialTypes) {
    const current = typeCountByCollection.get(row.collectionId) || {
      [MaterialType.LISTENING]: 0,
      [MaterialType.READING]: 0,
      [MaterialType.VOCAB_GRAMMAR]: 0,
      [MaterialType.SPEAKING]: 0,
    }
    current[row.material.type] += 1
    typeCountByCollection.set(row.collectionId, current)
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

  const dbCollections: UploadPageCollectionLite[] = collections.map(collection => {
    const lessons = collection.materials.map(row => {
      const payload =
        row.material.contentPayload &&
        typeof row.material.contentPayload === 'object'
          ? (row.material.contentPayload as Record<string, unknown>)
          : {}

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
      materialType:
        dominantMaterialTypeByCollection.get(collection.id) ||
        MaterialType.LISTENING,
      language: collection.language || undefined,
      examLevel: collection.level || undefined,
      level: { title: toCollectionTypeLabel(collection.collectionType) },
      lessons,
    }
  })

  return { dbLevels, dbCollections }
}
