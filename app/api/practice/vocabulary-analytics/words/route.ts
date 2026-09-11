import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'
import { performance } from 'node:perf_hooks'

import {
  filterPracticeVocabularyWords,
  isPracticeVocabularyCategory,
  type PracticeVocabularyAnalyticsWordsResponse,
} from '@/modules/practice/domain/vocabulary-analytics'
import {
  getPracticeVocabularyAnalytics,
  personalizePracticeVocabularyAnalytics,
} from '@/modules/practice/server/vocabulary-analytics'

const getCachedPracticeVocabularyAnalytics = unstable_cache(
  getPracticeVocabularyAnalytics,
  ['practice-vocabulary-analytics-v10'],
  { revalidate: 300, tags: ['practice-vocabulary-analytics'] },
)

const MAX_PAGE_SIZE = 200

const parsePositiveInteger = (
  value: string | null,
  fallback: number,
) => {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const serializeJsonResponse = (payload: unknown, cacheControl: string) => {
  const serializedBody = JSON.stringify(payload)
  return {
    response: new NextResponse(serializedBody, {
      headers: {
        'Cache-Control': cacheControl,
        'Content-Length': String(Buffer.byteLength(serializedBody)),
        'Content-Type': 'application/json; charset=utf-8',
      },
    }),
    payloadBytes: Buffer.byteLength(serializedBody),
  }
}

export async function GET(request: Request) {
  const requestStartedAt = performance.now()
  const baseAnalyticsStartedAt = performance.now()
  try {
    const baseAnalytics = await getCachedPracticeVocabularyAnalytics()
    const baseAnalyticsMs = performance.now() - baseAnalyticsStartedAt
    const searchParams = new URL(request.url).searchParams
    const profileValue = searchParams.get('profile') || undefined
    const profile = profileValue && isPracticeVocabularyCategory(profileValue)
      ? profileValue
      : undefined
    const query = searchParams.get('q') || undefined
    const all = searchParams.get('all') === 'true'
    const page = all
      ? 1
      : parsePositiveInteger(searchParams.get('page'), 1)
    const limit = all
      ? null
      : Math.min(
          MAX_PAGE_SIZE,
          parsePositiveInteger(searchParams.get('limit'), 100),
        )
    const wordbookIds = new Set(
      searchParams.getAll('wordbookId').map(id => id.trim()).filter(Boolean),
    )
    const includeOutside = searchParams.get('outside') === 'true'
    const filterStartedAt = performance.now()
    const filteredBaseWords = filterPracticeVocabularyWords(
      baseAnalytics.words,
      { profile, query },
    )
    const hasWordbookScope = wordbookIds.size > 0 || includeOutside
    const baseWordsForPersonalization = hasWordbookScope || limit === null
      ? filteredBaseWords
      : filteredBaseWords.slice((page - 1) * limit, page * limit)
    const filteredAnalytics = {
      ...baseAnalytics,
      words: baseWordsForPersonalization,
    }
    const filterMs = performance.now() - filterStartedAt
    const personalizationStartedAt = performance.now()
    const personalized = await personalizePracticeVocabularyAnalytics(
      filteredAnalytics,
    )
    const personalizationMs = performance.now() - personalizationStartedAt
    const scopedWords = hasWordbookScope
      ? personalized.words.filter(row =>
          (includeOutside && row.wordbookIds.length === 0) ||
          row.wordbookIds.some(id => wordbookIds.has(id)),
        )
      : personalized.words
    const total = hasWordbookScope ? scopedWords.length : filteredBaseWords.length
    const words = hasWordbookScope && limit !== null
      ? scopedWords.slice((page - 1) * limit, page * limit)
      : scopedWords
    const payload: PracticeVocabularyAnalyticsWordsResponse = {
      words,
      wordbooks: personalized.wordbooks,
      total,
      page,
      limit,
      hasNextPage: limit !== null && page * limit < total,
    }
    const serializationStartedAt = performance.now()
    const { response, payloadBytes } = serializeJsonResponse(
      payload,
      'private, no-store',
    )
    const serializationMs = performance.now() - serializationStartedAt
    const totalMs = performance.now() - requestStartedAt
    console.info(
      '[practice-vocabulary-analytics] words request timing',
      JSON.stringify({
        baseAnalyticsMs: Math.round(baseAnalyticsMs * 10) / 10,
        filterMs: Math.round(filterMs * 10) / 10,
        personalizationMs: Math.round(personalizationMs * 10) / 10,
        serializationMs: Math.round(serializationMs * 10) / 10,
        totalMs: Math.round(totalMs * 10) / 10,
        payloadBytes,
        profile: profile || null,
        query: query ? 'set' : null,
        page,
        limit,
        wordCount: words.length,
        total,
      }),
    )
    response.headers.set(
      'Server-Timing',
      [
        `base-analytics;dur=${baseAnalyticsMs.toFixed(1)}`,
        `filter;dur=${filterMs.toFixed(1)}`,
        `personalization;dur=${personalizationMs.toFixed(1)}`,
        `serialization;dur=${serializationMs.toFixed(1)}`,
        `total;dur=${totalMs.toFixed(1)}`,
      ].join(', '),
    )
    return response
  } catch (error) {
    console.error('加载试卷词汇明细失败:', error)
    return NextResponse.json(
      {
        message: '试卷词汇明细加载失败',
        ...(process.env.NODE_ENV === 'development' && error instanceof Error
          ? { detail: error.message }
          : {}),
      },
      { status: 500 },
    )
  }
}
