import { CollectionType, MaterialType } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getMaterialDisplayTitle } from '@/lib/repositories/material-title'

type UploadPageLevelLite = {
  id: string
  title: string
}

type UploadPageCollectionLite = {
  id: string
  name: string
  collectionType: CollectionType
  parentTitle?: string
  level: { title: string }
  lessons: { title: string; audioFile: string }[]
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
      collectionType: true,
      parent: {
        select: {
          title: true,
        },
      },
      materials: {
        where: {
          material: { type: MaterialType.LISTENING },
        },
        orderBy: { sortOrder: 'desc' },
        take: 1,
        select: {
          material: {
            select: {
              title: true,
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

  const dbCollections: UploadPageCollectionLite[] = collections.map(collection => {
    const lessons = collection.materials.map(row => {
      const payload =
        row.material.contentPayload &&
        typeof row.material.contentPayload === 'object'
          ? (row.material.contentPayload as Record<string, unknown>)
          : {}

      return {
        title: getMaterialDisplayTitle(
          MaterialType.LISTENING,
          row.material.title,
          row.material.contentPayload,
          row.material.title,
        ),
        audioFile: String(payload.audioFile || payload.audioUrl || ''),
      }
    })

    return {
      id: collection.id,
      name: collection.title,
      collectionType: collection.collectionType,
      parentTitle: collection.parent?.title || undefined,
      level: { title: toCollectionTypeLabel(collection.collectionType) },
      lessons,
    }
  })

  return { dbLevels, dbCollections }
}
