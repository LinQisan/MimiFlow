import prisma from '@/lib/prisma'
import HomeUI from '@/components/HomeUI'
import { guessLanguageCode } from '@/utils/langDetector'

const DAY = 24 * 60 * 60 * 1000
const GAME_TASK_TOTAL = 6
const GAME_TASK_KEYS = [
  'morning_new_content',
  'morning_reading_cycle',
  'afternoon_mixed_practice',
  'evening_feynman_diary',
  'night_light_review',
  'next_morning_dictation',
]

type AttemptStat = {
  count: number
  accuracy: number
  avgSec: number
}

type BreakdownItem = AttemptStat & {
  label: string
}

type ForgettingCurveItem = {
  label: string
  retention: number
  count: number
}

const toDayKey = (date: Date) => date.toISOString().slice(0, 10)
const toTokyoDateKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

const toOneDecimal = (value: number) => Math.round(value * 10) / 10

const calcAttemptStat = (
  rows: { isCorrect: boolean; timeSpentMs: number }[],
): AttemptStat => {
  const count = rows.length
  if (count === 0) {
    return {
      count: 0,
      accuracy: 0,
      avgSec: 0,
    }
  }
  const correct = rows.filter(item => item.isCorrect).length
  const totalSec = rows.reduce(
    (sum, item) => sum + Math.max(0, item.timeSpentMs) / 1000,
    0,
  )
  return {
    count,
    accuracy: toOneDecimal((correct / count) * 100),
    avgSec: toOneDecimal(totalSec / count),
  }
}

const resolveLanguageLabel = (payload: {
  levelTitle: string
  contextSentence: string
}) => {
  const code = guessLanguageCode(`${payload.levelTitle} ${payload.contextSentence}`)
  if (code === 'ja') return '日语'
  if (code === 'zh') return '中文'
  if (code === 'ko') return '韩语'
  if (code === 'ru') return '俄语'
  return '英语'
}

const questionTypeLabelMap: Record<string, string> = {
  PRONUNCIATION: '读音',
  WORD_DISTINCTION: '单词辨析',
  FILL_BLANK: '填空',
  GRAMMAR: '语法',
  TRANSLATION: '翻译',
  SORTING: '排序',
  READING_COMPREHENSION: '阅读理解',
}

const groupAttemptBreakdown = <T extends string>(
  rows: {
    isCorrect: boolean
    timeSpentMs: number
    groupKey: T
  }[],
): BreakdownItem[] => {
  const map = new Map<string, { isCorrect: boolean; timeSpentMs: number }[]>()
  for (const row of rows) {
    const key = row.groupKey.trim() || '未分类'
    const list = map.get(key) || []
    list.push({ isCorrect: row.isCorrect, timeSpentMs: row.timeSpentMs })
    map.set(key, list)
  }
  return [...map.entries()]
    .map(([label, items]) => ({
      label,
      ...calcAttemptStat(items),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

const buildForgettingCurve = (
  rows: { stability: number; last_review: Date | null; createdAt: Date }[],
  now: Date,
): ForgettingCurveItem[] => {
  const buckets = [
    { label: '0-1天', min: 0, max: 1.99 },
    { label: '2-3天', min: 2, max: 3.99 },
    { label: '4-7天', min: 4, max: 7.99 },
    { label: '8-14天', min: 8, max: 14.99 },
    { label: '15天+', min: 15, max: Number.POSITIVE_INFINITY },
  ]

  const collector = buckets.map(bucket => ({
    ...bucket,
    sum: 0,
    count: 0,
  }))

  for (const row of rows) {
    const baseline = row.last_review || row.createdAt
    const elapsedDays = Math.max(0, (now.getTime() - baseline.getTime()) / DAY)
    const stability = Math.max(0.15, row.stability || 0.15)
    const estimatedRetention = Math.max(0, Math.min(1, Math.exp(-elapsedDays / stability)))

    const bucket = collector.find(item => elapsedDays >= item.min && elapsedDays <= item.max)
    if (!bucket) continue
    bucket.sum += estimatedRetention
    bucket.count += 1
  }

  return collector.map(item => ({
    label: item.label,
    retention: item.count ? toOneDecimal((item.sum / item.count) * 100) : 0,
    count: item.count,
  }))
}

export default async function Home() {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 6 * DAY)
  const currentWeekStart = new Date(now.getTime() - 6 * DAY)
  const previousWeekStart = new Date(now.getTime() - 13 * DAY)
  const previousWeekEnd = new Date(now.getTime() - 7 * DAY)

  const currentMonthStart = new Date(now.getTime() - 29 * DAY)
  const previousMonthStart = new Date(now.getTime() - 59 * DAY)
  const previousMonthEnd = new Date(now.getTime() - 30 * DAY)
  const todayTokyoKey = toTokyoDateKey(now)

  const [
    dbLevels,
    vocabCount,
    sentencesCount,
    dueSentencesCount,
    dueRetryCount,
    articlesCount,
    quizzesCount,
    sourceTypeRows,
    recentVocabRows,
    attempts,
    sentenceReviews,
    gameProfile,
    todayGameDoneCount,
  ] = await Promise.all([
    prisma.level.findMany({
      select: { id: true, title: true, description: true },
      orderBy: { id: 'asc' },
    }),
    prisma.vocabulary.count(),
    prisma.sentenceReview.count(),
    prisma.sentenceReview.count({
      where: { due: { lte: now } },
    }),
    prisma.questionRetry.count({
      where: { dueAt: { lte: now } },
    }),
    prisma.passage.count(),
    prisma.quiz.count(),
    prisma.vocabulary.groupBy({
      by: ['sourceType'],
      _count: { _all: true },
    }),
    prisma.vocabulary.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.questionAttempt.findMany({
      select: {
        isCorrect: true,
        timeSpentMs: true,
        createdAt: true,
        question: {
          select: {
            questionType: true,
            contextSentence: true,
            quiz: {
              select: {
                paper: {
                  select: {
                    name: true,
                    level: { select: { title: true } },
                  },
                },
              },
            },
            passage: {
              select: {
                paper: {
                  select: {
                    name: true,
                    level: { select: { title: true } },
                  },
                },
              },
            },
          },
        },
      },
      where: {
        createdAt: {
          gte: previousMonthStart,
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.sentenceReview.findMany({
      select: {
        stability: true,
        last_review: true,
        createdAt: true,
      },
    }),
    prisma.gameProfile.findUnique({
      where: { id: 'default' },
      select: {
        level: true,
        streakDays: true,
      },
    }),
    prisma.gameSessionLog.count({
      where: {
        profileId: 'default',
        dateKey: todayTokyoKey,
        taskKey: { in: GAME_TASK_KEYS },
      },
    }),
  ])

  const sourceTypeMap = sourceTypeRows.reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.sourceType] = row._count._all
      return acc
    },
    {},
  )

  const sourceDistribution = [
    {
      key: 'AUDIO_DIALOGUE',
      label: '听力',
      count: sourceTypeMap.AUDIO_DIALOGUE || 0,
    },
    {
      key: 'ARTICLE_TEXT',
      label: '阅读',
      count: sourceTypeMap.ARTICLE_TEXT || 0,
    },
    {
      key: 'QUIZ_QUESTION',
      label: '题目',
      count: sourceTypeMap.QUIZ_QUESTION || 0,
    },
  ]

  const trendSeed = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(sevenDaysAgo.getTime() + i * DAY)
    return {
      dateKey: toDayKey(date),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      count: 0,
    }
  })

  for (const row of recentVocabRows) {
    const key = toDayKey(row.createdAt)
    const target = trendSeed.find(item => item.dateKey === key)
    if (target) target.count += 1
  }

  const recentTrend = trendSeed.map(({ label, count }) => ({ label, count }))

  const currentWeekRows = attempts.filter(
    item => item.createdAt >= currentWeekStart && item.createdAt <= now,
  )
  const previousWeekRows = attempts.filter(
    item => item.createdAt >= previousWeekStart && item.createdAt <= previousWeekEnd,
  )
  const currentMonthRows = attempts.filter(
    item => item.createdAt >= currentMonthStart && item.createdAt <= now,
  )
  const previousMonthRows = attempts.filter(
    item => item.createdAt >= previousMonthStart && item.createdAt <= previousMonthEnd,
  )

  const currentWeekStat = calcAttemptStat(currentWeekRows)
  const previousWeekStat = calcAttemptStat(previousWeekRows)
  const currentMonthStat = calcAttemptStat(currentMonthRows)
  const previousMonthStat = calcAttemptStat(previousMonthRows)

  const weekCompare = {
    ...currentWeekStat,
    accuracyDelta: toOneDecimal(currentWeekStat.accuracy - previousWeekStat.accuracy),
    avgSecDelta: toOneDecimal(currentWeekStat.avgSec - previousWeekStat.avgSec),
  }
  const monthCompare = {
    ...currentMonthStat,
    accuracyDelta: toOneDecimal(
      currentMonthStat.accuracy - previousMonthStat.accuracy,
    ),
    avgSecDelta: toOneDecimal(currentMonthStat.avgSec - previousMonthStat.avgSec),
  }

  const languageBreakdown = groupAttemptBreakdown(
    currentMonthRows.map(item => {
      const levelTitle =
        item.question.quiz?.paper?.level?.title ||
        item.question.passage?.paper?.level?.title ||
        ''
      return {
        isCorrect: item.isCorrect,
        timeSpentMs: item.timeSpentMs,
        groupKey: resolveLanguageLabel({
          levelTitle,
          contextSentence: item.question.contextSentence,
        }),
      }
    }),
  )

  const categoryBreakdown = groupAttemptBreakdown(
    currentMonthRows.map(item => ({
      isCorrect: item.isCorrect,
      timeSpentMs: item.timeSpentMs,
      groupKey:
        item.question.quiz?.paper?.name ||
        item.question.passage?.paper?.name ||
        '未分类',
    })),
  )

  const questionTypeBreakdown = groupAttemptBreakdown(
    currentMonthRows.map(item => ({
      isCorrect: item.isCorrect,
      timeSpentMs: item.timeSpentMs,
      groupKey: questionTypeLabelMap[item.question.questionType] || item.question.questionType,
    })),
  )

  const forgettingCurve = buildForgettingCurve(sentenceReviews, now)

  return (
    <main>
      <HomeUI
        dbLevels={dbLevels}
        vocabCount={vocabCount}
        sentencesCount={sentencesCount}
        dueSentencesCount={dueSentencesCount}
        dueRetryCount={dueRetryCount}
        articlesCount={articlesCount}
        quizzesCount={quizzesCount}
        sourceDistribution={sourceDistribution}
        recentTrend={recentTrend}
        weekCompare={weekCompare}
        monthCompare={monthCompare}
        languageBreakdown={languageBreakdown}
        categoryBreakdown={categoryBreakdown}
        questionTypeBreakdown={questionTypeBreakdown}
        forgettingCurve={forgettingCurve}
        gameLevel={gameProfile?.level || 1}
        gameStreak={gameProfile?.streakDays || 0}
        gameDoneCount={todayGameDoneCount}
        gameTotalCount={GAME_TASK_TOTAL}
      />
    </main>
  )
}
