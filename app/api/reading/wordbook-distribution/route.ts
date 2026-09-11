import { NextResponse } from 'next/server'

import { getPaperWordbookDistribution } from '@/modules/practice/server/paper-wordbook-distribution'

const MAX_WORD_COUNT = 5_000
const MAX_WORD_LENGTH = 100

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { words?: unknown }
    if (!Array.isArray(body.words)) {
      return NextResponse.json({ message: '缺少文章词汇' }, { status: 400 })
    }
    const words = Array.from(
      new Set(
        body.words
          .slice(0, MAX_WORD_COUNT)
          .filter((word): word is string => typeof word === 'string')
          .map(word => word.normalize('NFKC').trim())
          .filter(word => word && word.length <= MAX_WORD_LENGTH),
      ),
    )
    const distribution = await getPaperWordbookDistribution(words)
    return NextResponse.json(distribution, {
      headers: {
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600',
      },
    })
  } catch (error) {
    console.error('加载文章单词书分布失败:', error)
    return NextResponse.json(
      { message: '单词书分布加载失败' },
      { status: 500 },
    )
  }
}
