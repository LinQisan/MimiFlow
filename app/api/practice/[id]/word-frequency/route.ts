import { NextResponse } from 'next/server'

import { buildPaperFrequencyDocuments } from '@/modules/practice/domain/paper-word-frequency'
import { getPaperWordbookDistribution } from '@/modules/practice/server/paper-wordbook-distribution'
import { buildWordFrequency } from '@/modules/language/domain/sudachi'
import { getSudachiPronunciationMap } from '@/modules/language/server/sudachi-pronunciation'
import { findPaperDetailById } from '@/lib/repositories/exam'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const paper = await findPaperDetailById(id)
    if (!paper) {
      return NextResponse.json({ message: '试卷不存在' }, { status: 404 })
    }
    const source = buildPaperFrequencyDocuments(paper)
    const pronunciation = await getSudachiPronunciationMap(source.texts)
    const rows = buildWordFrequency(pronunciation.tokens)
    const result = {
      rows,
      stats: source.stats,
      wordbookDistribution: await getPaperWordbookDistribution(
        rows.map(row => row.word),
      ),
    }
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, max-age=300, stale-while-revalidate=3600',
      },
    })
  } catch (error) {
    console.error('加载试卷词频失败:', error)
    return NextResponse.json(
      { message: '试卷词频加载失败' },
      { status: 500 },
    )
  }
}
