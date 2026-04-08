'use server'

import { GameDifficultyPreset } from '@prisma/client'
import prisma from '@/lib/prisma'
import { getTopMaterialSnapshots } from '@/lib/repositories/materials.repo'

export type TodayTaskItem = {
  id: 'review' | 'listening' | 'reading' | 'retry' | 'output'
  title: string
  targetCount: number
  unit: string
  description: string
  href: string
  disabled?: boolean
}

export type TodayStudyPlan = {
  dateKey: string
  tasks: TodayTaskItem[]
  startHref: string
}

const toDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

const countParagraphs = (content: string) => {
  const lines = content
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
  if (lines.length > 0) return lines.length
  const parts = content
    .split(/(?<=[。！？.!?])/)
    .map(item => item.trim())
    .filter(Boolean)
  return parts.length
}

export async function getTodayStudyPlan(): Promise<TodayStudyPlan> {
  const now = new Date()
  const [_dueReviewCount, topMaterials, dueRetryCount, gameProfile] = await Promise.all([
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

  const preset = gameProfile?.difficultyPreset || GameDifficultyPreset.STANDARD
  const targetScale =
    preset === GameDifficultyPreset.CONSERVATIVE
      ? 0.85
      : preset === GameDifficultyPreset.AGGRESSIVE
        ? 1.2
        : 1
  const scaleTarget = (value: number, min = 1) =>
    Math.max(min, Math.round(value * targetScale))

  const reviewCount = _dueReviewCount > 0 ? Math.min(20, _dueReviewCount) : 0
  const topLesson = topMaterials.topLesson
  const topArticle = topMaterials.topArticle
  const listeningCount = topLesson
    ? Math.min(
        16,
        scaleTarget(Math.min(12, Math.max(6, topLesson._count.dialogues)), 4),
      )
    : 0
  const readingParagraphCount = topArticle
    ? Math.min(12, scaleTarget(Math.min(8, Math.max(3, countParagraphs(topArticle.content))), 2))
    : 0

  const reviewTask: TodayTaskItem = {
    id: 'review',
    title: '复习',
    targetCount: scaleTarget(reviewCount, 0),
    unit: '条',
    description: '先处理到期复习，稳定记忆曲线。',
    href: '/review',
    disabled: _dueReviewCount === 0,
  }

  const listeningTask: TodayTaskItem = {
    id: 'listening',
    title: '听力',
    targetCount: listeningCount,
    unit: '句',
    description: topLesson
      ? `推荐从《${topLesson.title}》开始。`
      : '暂无听力语料，请先在管理端录入。',
    href: topLesson ? `/shadowing/${topLesson.id}` : '/manage/upload',
    disabled: !topLesson,
  }

  const readingTask: TodayTaskItem = {
    id: 'reading',
    title: '阅读',
    targetCount: readingParagraphCount,
    unit: '段',
    description: topArticle
      ? `推荐从《${topArticle.title || '阅读材料'}》开始。`
      : '暂无阅读材料，请先在管理端录入。',
    href: topArticle ? `/articles/${topArticle.id}` : '/manage/upload',
    disabled: !topArticle,
  }

  const retryTask: TodayTaskItem = {
    id: 'retry',
    title: '错题回流',
    targetCount: scaleTarget(dueRetryCount, 0),
    unit: '题',
    description:
      dueRetryCount > 0
        ? '按 24h/72h/7d 节奏做二次巩固。'
        : '当前没有到期错题，可先完成主线任务。',
    href: '/review',
    disabled: dueRetryCount === 0,
  }

  const outputTask: TodayTaskItem = {
    id: 'output',
    title: '输出',
    targetCount: 1,
    unit: '次',
    description: '完成 AI 输出任务并回传量化评估。',
    href: '/game',
    disabled: false,
  }

  const coreTasks = [reviewTask, listeningTask, readingTask]
  const orderedCoreTasks =
    _dueReviewCount > 0
      ? coreTasks
      : [listeningTask, readingTask, reviewTask]
  const tasks = [...orderedCoreTasks, retryTask, outputTask]

  const firstActionable = tasks.find(task => !task.disabled)
  return {
    dateKey: toDateKey(now),
    tasks,
    startHref: firstActionable?.href || '/manage/upload',
  }
}
