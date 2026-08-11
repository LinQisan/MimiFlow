import { CollectionType, MaterialType } from '@prisma/client'

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
    prisma.collection.count({
      where: { collectionType: CollectionType.PAPER },
    }),
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

export async function getUploadPageSeedData({
  includeLessons = true,
  materialType,
}: {
  includeLessons?: boolean
  materialType?: MaterialType
} = {}): Promise<{
  dbLevels: UploadPageLevelLite[]
  dbCollections: UploadPageCollectionLite[]
}> {
  const collections = await prisma.collection.findMany({
    where: materialType
      ? { acceptedMaterialTypes: { has: materialType } }
      : undefined,
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

  const dbLevels: UploadPageLevelLite[] = [
    { id: CollectionType.PAPER, title: '正式试卷 - 真题 / 模考' },
    { id: CollectionType.CUSTOM_GROUP, title: '普通集合 - 教材 / 自定义练习' },
    { id: CollectionType.FAVORITES, title: '收藏夹 - 临时归类 / 精选内容' },
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

  const dbCollections: UploadPageCollectionLite[] = collections.map(
    collection => {
      const lessons = collection.materials.map(row => {
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

  return { dbLevels, dbCollections }
}
