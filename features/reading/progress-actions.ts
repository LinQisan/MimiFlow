'use server'

import { MaterialType } from '#prisma-client'
import { revalidatePath } from 'next/cache'

import prisma from '@/lib/prisma'
const LEARNING_MODE = 'article-reading'

export async function saveReadingProgress(input: {
  articleId: string
  progressPercent: number
  lastPosition: string
}) {
  const material = await prisma.material.findFirst({
    where: { type: MaterialType.READING, id: input.articleId.trim() },
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
