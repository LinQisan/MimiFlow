import prisma from '@/lib/prisma'
import HomeUI from '@/components/HomeUI'

const DAY = 24 * 60 * 60 * 1000

const toDayKey = (date: Date) => date.toISOString().slice(0, 10)

export default async function Home() {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 6 * DAY)

  const [
    dbLevels,
    vocabCount,
    sentencesCount,
    dueSentencesCount,
    articlesCount,
    quizzesCount,
    sourceTypeRows,
    recentVocabRows,
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
    prisma.article.count(),
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

  return (
    <main>
      <HomeUI
        dbLevels={dbLevels}
        vocabCount={vocabCount}
        sentencesCount={sentencesCount}
        dueSentencesCount={dueSentencesCount}
        articlesCount={articlesCount}
        quizzesCount={quizzesCount}
        sourceDistribution={sourceDistribution}
        recentTrend={recentTrend}
      />
    </main>
  )
}
