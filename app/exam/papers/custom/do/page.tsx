import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PracticePlayer } from '@/components/exam/PracticePlayer'
import {
  getRandomExamQuestionsByTypeCounts,
  randomPracticeTypeOptions,
  type RandomPracticeCountMap,
} from '@/lib/repositories/exam.repo'

export const dynamic = 'force-dynamic'

function toFirstValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function buildTitleFromCounts(
  countMap: RandomPracticeCountMap,
  sourceCollections: string[] = [],
  filters?: { language?: string; level?: string },
): string {
  const parts = randomPracticeTypeOptions
    .map(option => {
      const count = countMap[option.key] || 0
      if (count <= 0) return null
      return `${option.label}${count}题`
    })
    .filter((item): item is string => Boolean(item))

  const core =
    parts.length === 0 ? '自定义随机练习' : `自定义随机练习 · ${parts.join(' + ')}`

  const filterParts: string[] = []
  if (filters?.language) filterParts.push(`语言=${filters.language}`)
  if (filters?.level) filterParts.push(`等级=${filters.level}`)
  const coreWithFilter =
    filterParts.length > 0 ? `${core}（${filterParts.join('，')}）` : core

  if (sourceCollections.length === 0) return coreWithFilter
  const preview = sourceCollections.slice(0, 3).join(' / ')
  const suffix =
    sourceCollections.length > 3
      ? `（来自：${preview} 等 ${sourceCollections.length} 套）`
      : `（来自：${preview}）`
  return `${coreWithFilter} ${suffix}`
}

export default async function CustomPaperDoingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolved = await searchParams

  const countMap: RandomPracticeCountMap = {}
  for (const option of randomPracticeTypeOptions) {
    const key = `count_${option.key}`
    const rawValue = toFirstValue(resolved[key])
    const parsed = Math.max(0, Math.floor(Number(rawValue || 0)))
    if (parsed > 0) {
      countMap[option.key] = parsed
    }
  }

  const totalRequested = Object.values(countMap).reduce(
    (sum, value) => sum + (value || 0),
    0,
  )

  if (totalRequested <= 0) {
    redirect('/exam/papers/custom')
  }

  const language = toFirstValue(resolved.language)?.trim() || ''
  const level = toFirstValue(resolved.level)?.trim() || ''
  const examData = await getRandomExamQuestionsByTypeCounts(countMap, {
    language,
    level,
  })

  if (examData.questions.length === 0) {
    return (
      <div className='flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f7f8fc] p-6 text-center'>
        <h1 className='text-xl font-semibold text-gray-800'>未找到可用题目</h1>
        <p className='text-sm text-gray-500'>
          当前筛选条件下暂无题目，请调整题型或数量后再试。
        </p>
        <Link
          href='/exam/papers/custom'
          className='rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700'>
          返回自定义设置
        </Link>
      </div>
    )
  }

  return (
    <PracticePlayer
      questions={examData.questions}
      paperTitle={buildTitleFromCounts(countMap, examData.sourceCollections, {
        language,
        level,
      })}
      paperLanguage={examData.paperLanguage}
      mode='random'
      pronunciationMap={examData.pronunciationMap}
      vocabularyMetaMap={examData.vocabularyMetaMap}
    />
  )
}
