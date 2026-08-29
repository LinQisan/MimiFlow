import { NextResponse } from 'next/server'

import { getPracticePerformanceGroups } from '@/lib/repositories/exam'

export async function GET() {
  try {
    const groups = await getPracticePerformanceGroups()
    return NextResponse.json(groups, {
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    console.error('加载练习统计失败:', error)
    return NextResponse.json(
      { message: '练习统计加载失败' },
      { status: 500 },
    )
  }
}
