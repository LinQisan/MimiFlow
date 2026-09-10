// Custom focused practice session.
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PracticePlayer } from '@/components/exam/PracticePlayer'
import {
  getRandomExamQuestionsBySelections,
  type RandomPracticeScope,
} from '@/lib/repositories/exam'

export const dynamic = 'force-dynamic'

function toFirstValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function buildPracticeTitle(
  requestedCount: number,
  sourceCollections: string[] = [],
  filters?: {
    language?: string
    level?: string
    scope?: RandomPracticeScope
  },
): string {
  const core = `随机练习 · ${requestedCount} 题`

  const filterParts: string[] = []
  if (filters?.scope === 'unattempted') filterParts.push('未做题')
  if (filters?.scope === 'attempted') filterParts.push('已做题')
  if (filters?.language) filterParts.push(`语言=${filters.language}`)
  if (filters?.level) filterParts.push(`等级=${filters.level}`)
  const coreWithFilter =
    filterParts.length > 0 ? `${core}（${filterParts.join('，')}）` : core

  if (sourceCollections.length === 0) return coreWithFilter
  const preview = sourceCollections.slice(0, 3).join(' / ')
  const suffix =
    sourceCollections.length > 3
      ? `${preview} 等 ${sourceCollections.length} 套`
      : preview
  return `${coreWithFilter} · ${suffix}`
}

export default async function CustomPaperDoingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolved = await searchParams

  const selectionKeys = (toFirstValue(resolved.sections) || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  const totalRequested = Math.max(
    0,
    Math.min(100, Math.floor(Number(toFirstValue(resolved.count) || 0))),
  )

  if (totalRequested <= 0 || selectionKeys.length === 0) {
    redirect('/practice/custom')
  }

  const language = toFirstValue(resolved.language)?.trim() || ''
  const level = toFirstValue(resolved.level)?.trim() || ''
  const rawScope = toFirstValue(resolved.scope)?.trim()
  const scope: RandomPracticeScope =
    rawScope === 'attempted' || rawScope === 'all'
      ? rawScope
      : 'unattempted'
  const examData = await getRandomExamQuestionsBySelections(
    selectionKeys,
    totalRequested,
    { language, level, scope },
  )

  if (examData.questions.length === 0) {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center bg-[#f6f5f1] p-6 text-center'>
        <div className='ui-empty max-w-md'>
          <p className='text-base font-bold text-slate-900'>
            未找到可用题目
          </p>
          <p className='mt-1'>当前筛选条件下暂无题目，请调整题型或数量后再试。</p>
          <Link
            href='/practice/custom'
            className='ui-btn ui-btn-primary mt-5'>
            返回自定义设置
          </Link>
        </div>
      </div>
    )
  }

  return (
    <PracticePlayer
      questions={examData.questions}
      paperTitle={buildPracticeTitle(totalRequested, examData.sourceCollections, {
        language,
        level,
        scope,
      })}
      paperLanguage={examData.paperLanguage}
      mode='random'
      exitHref='/practice/custom'
      exitLabel='返回自定义设置'
      pronunciationMap={examData.pronunciationMap}
      vocabularyMetaMap={examData.vocabularyMetaMap}
    />
  )
}
