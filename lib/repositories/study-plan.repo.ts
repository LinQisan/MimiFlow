import { GameDifficultyPreset } from '@prisma/client'

import prisma from '@/lib/prisma'
import { getTopMaterialSnapshots } from './materials.repo'

export type TodayPlanLesson = {
  id: string
  title: string
  _count: { dialogues: number }
}

export type TodayPlanArticle = {
  id: string
  title: string | null
  content: string
}

export type TodayStudyPlanSnapshot = {
  dueReviewCount: number
  topLesson: TodayPlanLesson | null
  topArticle: TodayPlanArticle | null
  dueRetryCount: number
  difficultyPreset: GameDifficultyPreset
}

export async function getTodayStudyPlanSnapshot(
  now: Date,
): Promise<TodayStudyPlanSnapshot> {
  const [dueReviewCount, topMaterials, dueRetryCount, gameProfile] =
    await Promise.all([
      prisma.sentenceReview.count({ where: { due: { lte: now } } }),
      getTopMaterialSnapshots(),
      prisma.questionRetry.count({
        where: { dueAt: { lte: now } },
      }),
      prisma.gameProfile.findUnique({
        where: { id: 'default' },
        select: { difficultyPreset: true },
      }),
    ])

  return {
    dueReviewCount,
    topLesson: topMaterials.topLesson,
    topArticle: topMaterials.topArticle,
    dueRetryCount,
    difficultyPreset:
      gameProfile?.difficultyPreset || GameDifficultyPreset.STANDARD,
  }
}

export type MixedPlanSnapshot = {
  topLesson: { id: string; title: string } | null
  topArticle: { id: string; title: string | null } | null
  topQuiz: { id: string; title: string | null } | null
  dueRetryCount: number
}

export async function getMixedPlanSnapshot(now: Date): Promise<MixedPlanSnapshot> {
  const [topMaterials, dueRetryCount] = await Promise.all([
    getTopMaterialSnapshots(),
    prisma.questionRetry.count({ where: { dueAt: { lte: now } } }),
  ])

  return {
    topLesson: topMaterials.topLesson
      ? { id: topMaterials.topLesson.id, title: topMaterials.topLesson.title }
      : null,
    topArticle: topMaterials.topArticle
      ? { id: topMaterials.topArticle.id, title: topMaterials.topArticle.title }
      : null,
    topQuiz: topMaterials.topQuiz
      ? { id: topMaterials.topQuiz.id, title: topMaterials.topQuiz.title }
      : null,
    dueRetryCount,
  }
}
