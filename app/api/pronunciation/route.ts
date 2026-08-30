import { NextResponse } from 'next/server'

import { getSudachiPronunciationMap } from '@/features/reading/server/sudachi-pronunciation'

const MAX_TEXTS = 600
const MAX_CHARACTERS = 250_000

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { texts?: unknown }
    if (!Array.isArray(payload.texts)) {
      return NextResponse.json({ message: '注音文本格式不正确' }, { status: 400 })
    }
    const texts = payload.texts
      .slice(0, MAX_TEXTS)
      .filter((text): text is string => typeof text === 'string')
      .map(text => text.trim())
      .filter(Boolean)
    const characterCount = texts.reduce((sum, text) => sum + text.length, 0)
    if (characterCount > MAX_CHARACTERS) {
      return NextResponse.json({ message: '注音文本过长' }, { status: 413 })
    }

    const result = await getSudachiPronunciationMap(texts)
    return NextResponse.json({
      available: result.available,
      pronunciationMap: result.pronunciationMap,
      lexicon: result.lexicon,
    })
  } catch (error) {
    console.error('加载日语注音失败:', error)
    return NextResponse.json({ message: '注音加载失败' }, { status: 500 })
  }
}
