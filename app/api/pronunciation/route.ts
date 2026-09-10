import { NextResponse } from 'next/server'

import { getSudachiPronunciationMap } from '@/modules/language/server/sudachi-pronunciation'
import { getPaperWordbookDistribution } from '@/features/practice/server/paper-wordbook-distribution'
import { buildWordFrequency } from '@/modules/language/domain/sudachi'

const MAX_TEXTS = 600
const MAX_CHARACTERS = 250_000

export async function POST(request: Request) {
  // Read the raw body first so empty/truncated uploads (e.g. a client-aborted
  // duplicate POST from StrictMode remount or a superseded debounce) are
  // answered with a 400 instead of surfacing as a Sudachi/server 500.
  let raw: string
  try {
    raw = await request.text()
  } catch {
    return NextResponse.json({ message: '注音请求体读取失败' }, { status: 400 })
  }
  if (!raw.trim()) {
    return NextResponse.json({ message: '注音请求体为空' }, { status: 400 })
  }
  let payload: unknown
  try {
    payload = JSON.parse(raw) as unknown
  } catch {
    return NextResponse.json({ message: '注音请求体不是有效 JSON' }, { status: 400 })
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ message: '注音文本格式不正确' }, { status: 400 })
  }
  const { texts: rawTexts, includeWordbookAnalysis: rawFlag } =
    payload as Record<string, unknown>
  if (!Array.isArray(rawTexts)) {
    return NextResponse.json({ message: '注音文本格式不正确' }, { status: 400 })
  }
  if (rawFlag !== undefined && typeof rawFlag !== 'boolean') {
    return NextResponse.json({ message: '注音请求参数格式不正确' }, { status: 400 })
  }
  try {
    const texts = rawTexts
      .slice(0, MAX_TEXTS)
      .filter((text): text is string => typeof text === 'string')
      .map(text => text.trim())
      .filter(Boolean)
    const characterCount = texts.reduce((sum, text) => sum + text.length, 0)
    if (characterCount > MAX_CHARACTERS) {
      return NextResponse.json({ message: '注音文本过长' }, { status: 413 })
    }
    // Preserve the existing empty-input semantics
    // (getSudachiPronunciationMap([]) resolves available:true with empty maps)
    // without warming the persistent worker or touching wordbook tables.
    const includeWordbookAnalysis = rawFlag === true
    if (texts.length === 0) {
      return NextResponse.json({
        available: true,
        pronunciationMap: {},
        lexicon: {},
        ...(includeWordbookAnalysis
          ? {
              wordbookDistributionWords: [],
              wordbookDistribution: undefined,
            }
          : {}),
      })
    }

    const result = await getSudachiPronunciationMap(texts)
    const wordbookDistributionWords = includeWordbookAnalysis
      ? buildWordFrequency(result.tokens).map(row => row.word)
      : []
    const wordbookDistribution =
      includeWordbookAnalysis && wordbookDistributionWords.length > 0
        ? await getPaperWordbookDistribution(wordbookDistributionWords)
        : undefined
    return NextResponse.json({
      available: result.available,
      pronunciationMap: result.pronunciationMap,
      lexicon: result.lexicon,
      ...(includeWordbookAnalysis
        ? {
            wordbookDistributionWords,
            wordbookDistribution,
          }
        : {}),
    })
  } catch (error) {
    console.error('加载日语注音失败:', error)
    return NextResponse.json({ message: '注音加载失败' }, { status: 500 })
  }
}
