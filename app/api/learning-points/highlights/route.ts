import { SourceType } from '@prisma/client'
import { NextResponse } from 'next/server'

import { listLearningPointHighlights } from '@/modules/knowledge/learning-records/server/highlights'

const MAX_SOURCE_COUNT = 300
const sourceTypes = new Set<string>(Object.values(SourceType))

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { sources?: unknown }
    if (!Array.isArray(body.sources)) {
      return NextResponse.json({ message: '缺少来源信息' }, { status: 400 })
    }

    const sources = Array.from(
      new Map(body.sources.flatMap(source => {
        if (!source || typeof source !== 'object') return []
        const candidate = source as { sourceType?: unknown; sourceId?: unknown }
        if (
          typeof candidate.sourceType !== 'string' ||
          !sourceTypes.has(candidate.sourceType) ||
          typeof candidate.sourceId !== 'string'
        ) {
          return []
        }
        const sourceId = candidate.sourceId.trim()
        if (!sourceId || sourceId.length > 500) return []
        const sourceType = candidate.sourceType as SourceType
        return [[`${sourceType}\u0000${sourceId}`, { sourceType, sourceId }] as const]
      })).values(),
    ).slice(0, MAX_SOURCE_COUNT)

    return NextResponse.json({
      highlights: await listLearningPointHighlights(sources),
    })
  } catch (error) {
    console.error('加载学习点高亮失败:', error)
    return NextResponse.json({ message: '学习点加载失败' }, { status: 500 })
  }
}
