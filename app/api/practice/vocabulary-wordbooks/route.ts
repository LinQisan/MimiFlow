import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { getPracticeVocabularyWordbookEntries } from '@/features/practice/server/vocabulary-analytics'

export async function GET(request: NextRequest) {
  try {
    const ids = request.nextUrl.searchParams
      .getAll('id')
      .flatMap(value => value.split(','))
    const words = await getPracticeVocabularyWordbookEntries(ids)
    return NextResponse.json(
      { words },
      { headers: { 'Cache-Control': 'private, max-age=60' } },
    )
  } catch (error) {
    console.error('加载单词书词汇失败:', error)
    return NextResponse.json({ message: '单词书词汇加载失败' }, { status: 500 })
  }
}
