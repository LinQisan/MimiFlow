import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

import {
  getPracticeVocabularyAnalytics,
  personalizePracticeVocabularyAnalytics,
} from '@/features/practice/server/vocabulary-analytics'

const getCachedPracticeVocabularyAnalytics = unstable_cache(
  getPracticeVocabularyAnalytics,
  ['practice-vocabulary-analytics-v7'],
  { revalidate: 300, tags: ['practice-vocabulary-analytics'] },
)

export async function GET() {
  try {
    const analytics = await personalizePracticeVocabularyAnalytics(
      await getCachedPracticeVocabularyAnalytics(),
    )
    return NextResponse.json(analytics, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('加载试卷词汇分析失败:', error)
    return NextResponse.json(
      {
        message: '试卷词汇分析加载失败',
        ...(process.env.NODE_ENV === 'development' && error instanceof Error
          ? { detail: error.message }
          : {}),
      },
      { status: 500 },
    )
  }
}
