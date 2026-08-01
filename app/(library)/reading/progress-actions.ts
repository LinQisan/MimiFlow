'use server'

import { MaterialType } from '@prisma/client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
import {
  toLegacyMaterialId,
  toMaterialId,
} from '@/lib/repositories/materials'

const LEARNING_MODE = 'article-reading'

export async function saveReadingProgress(input: {
  articleId: string
  progressPercent: number
  lastPosition: string
}) {
  const legacyId = toLegacyMaterialId(input.articleId.trim())
  const material = await prisma.material.findFirst({
    where: {
      type: MaterialType.READING,
      id: {
        in: [input.articleId.trim(), legacyId, toMaterialId(MaterialType.READING, legacyId)],
      },
    },
    select: { id: true },
  })

  if (!material) return { success: false, message: '阅读材料不存在' }

  const progressPercent = Math.max(
    0,
    Math.min(100, Number(input.progressPercent) || 0),
  )
  const lastPosition = input.lastPosition.trim().slice(0, 120)

  await prisma.$transaction(async tx => {
    await tx.learnerProfile.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    })
    await tx.materialStudyProgress.upsert({
      where: {
        profileId_materialId_learningMode: {
          profileId: 'default',
          materialId: material.id,
          learningMode: LEARNING_MODE,
        },
      },
      create: {
        profileId: 'default',
        materialId: material.id,
        learningMode: LEARNING_MODE,
        progressPercent,
        lastPosition,
      },
      update: {
        progressPercent,
        lastPosition,
      },
    })
  })

  revalidatePath('/')
  revalidatePath('/reading')
  return { success: true }
}
