import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { performance } from 'node:perf_hooks'

import {
  getPracticeVocabularyAnalytics,
  getPracticeVocabularyAnalyticsSummary,
} from '@/features/practice/server/vocabulary-analytics'

const getCachedPracticeVocabularyAnalytics = unstable_cache(
  getPracticeVocabularyAnalytics,
  ['practice-vocabulary-analytics-v10'],
  { revalidate: 300, tags: ['practice-vocabulary-analytics'] },
)

export async function GET() {
  const requestStartedAt = performance.now()
  const baseAnalyticsStartedAt = performance.now()
  try {
    const baseAnalytics = await getCachedPracticeVocabularyAnalytics()
    const baseAnalyticsMs = performance.now() - baseAnalyticsStartedAt
    const summaryStartedAt = performance.now()
    const summary = await getPracticeVocabularyAnalyticsSummary(baseAnalytics)
    const summaryMs = performance.now() - summaryStartedAt
    const serializationStartedAt = performance.now()
    const serializedBody = JSON.stringify(summary)
    const serializationMs = performance.now() - serializationStartedAt
    const response = new NextResponse(serializedBody, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Length': String(Buffer.byteLength(serializedBody)),
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
    const totalMs = performance.now() - requestStartedAt
    console.info(
      '[practice-vocabulary-analytics] request timing',
      JSON.stringify({
        baseAnalyticsMs: Math.round(baseAnalyticsMs * 10) / 10,
        summaryMs: Math.round(summaryMs * 10) / 10,
        serializationMs: Math.round(serializationMs * 10) / 10,
        totalMs: Math.round(totalMs * 10) / 10,
        payloadBytes: Buffer.byteLength(serializedBody),
        wordCount: summary.wordCount,
        topItemCount: summary.topItems.words.length,
      }),
    )
    response.headers.set(
      'Server-Timing',
      [
        `base-analytics;dur=${baseAnalyticsMs.toFixed(1)}`,
        `summary;dur=${summaryMs.toFixed(1)}`,
        `serialization;dur=${serializationMs.toFixed(1)}`,
        `total;dur=${totalMs.toFixed(1)}`,
      ].join(', '),
    )
    return response
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
