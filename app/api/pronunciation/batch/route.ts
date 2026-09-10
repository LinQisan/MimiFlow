import { NextResponse } from 'next/server'

import { getCurrentUserId } from '@/modules/users/server/current-user'
import {
  materializeVocabularyBatch,
  materializeSentenceBatch,
} from '@/modules/knowledge/vocabulary/server/pronunciation-service'

const MAX_BATCH_IDS = 100

export async function POST(request: Request) {
  let raw: string
  try {
    raw = await request.text()
  } catch {
    return NextResponse.json({ message: '请求体读取失败' }, { status: 400 })
  }

  if (!raw.trim()) {
    return NextResponse.json({ message: '请求体为空' }, { status: 400 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ message: '请求体不是有效 JSON' }, { status: 400 })
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ message: '请求参数格式不正确' }, { status: 400 })
  }

  const { vocabularyIds: rawVocabIds, sentenceIds: rawSentenceIds } =
    payload as Record<string, unknown>

  const vocabularyIds = Array.isArray(rawVocabIds)
    ? rawVocabIds
        .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
        .slice(0, MAX_BATCH_IDS)
    : []

  const sentenceIds = Array.isArray(rawSentenceIds)
    ? rawSentenceIds
        .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
        .slice(0, MAX_BATCH_IDS)
    : []

  if (vocabularyIds.length === 0 && sentenceIds.length === 0) {
    return NextResponse.json({
      available: true,
      vocabularies: {},
      sentences: {},
    })
  }

  try {
    const userId = await getCurrentUserId()

    const [vocabularies, sentences] = await Promise.all([
      vocabularyIds.length > 0
        ? materializeVocabularyBatch(vocabularyIds, userId)
        : Promise.resolve({}),
      sentenceIds.length > 0
        ? materializeSentenceBatch(sentenceIds, userId)
        : Promise.resolve({}),
    ])

    return NextResponse.json({
      available: true,
      vocabularies,
      sentences,
    })
  } catch (error) {
    console.error('批量加载/计算注音失败:', error)
    return NextResponse.json({ message: '批量注音失败' }, { status: 500 })
  }
}
