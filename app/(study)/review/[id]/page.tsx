import { notFound, redirect } from 'next/navigation'

import {
  getDueRetryQuestions,
  getDueRetryQuestionTypeSummaries,
  getRetryQuestionById,
  getRetryQueueSummary,
} from '@/modules/review/actions/mistakes'
import ReviewQuestionClient from './ReviewQuestionClient'

export const dynamic = 'force-dynamic'

const groupRetryItems = <T extends { retryId: string; lessonId: string | null }>(
  items: T[],
) => {
  const groups: T[][] = []
  const lessonGroupIndexes = new Map<string, number>()

  items.forEach(item => {
    if (!item.lessonId) {
      groups.push([item])
      return
    }
    const existingIndex = lessonGroupIndexes.get(item.lessonId)
    if (existingIndex !== undefined) {
      groups[existingIndex].push(item)
      return
    }
    lessonGroupIndexes.set(item.lessonId, groups.length)
    groups.push([item])
  })

  return groups
}

export default async function ReviewQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string | string[] }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const requestedType = Array.isArray(query.type) ? query.type[0] : query.type
  const [summary, typeSummaries] = await Promise.all([
    getRetryQueueSummary(),
    getDueRetryQuestionTypeSummaries(),
  ])
  const activeQuestionType = typeSummaries.some(
    item => item.questionType === requestedType,
  )
    ? requestedType
    : undefined
  const items = await getDueRetryQuestions(100, activeQuestionType)
  const itemGroups = groupRetryItems(items)
  const foundGroupIndex = itemGroups.findIndex(group =>
    group.some(item => item.retryId === id),
  )
  if (foundGroupIndex === -1) {
    const currentItem = await getRetryQuestionById(id)
    if (currentItem) {
      if (
        activeQuestionType &&
        currentItem.questionType !== activeQuestionType &&
        items[0]
      ) {
        redirect(
          `/review/${items[0].retryId}?type=${encodeURIComponent(activeQuestionType)}`,
        )
      }
      const relatedItems = currentItem.lessonId
        ? items.filter(item => item.lessonId === currentItem.lessonId)
        : []
      const currentItems = [
        currentItem,
        ...relatedItems.filter(item => item.retryId !== currentItem.retryId),
      ]
      const relatedIds = new Set(currentItems.map(item => item.retryId))
      const remainingGroups = groupRetryItems(
        items.filter(item => !relatedIds.has(item.retryId)),
      )
      const queue = [
        { retryId: currentItem.retryId },
        ...remainingGroups.map(group => ({ retryId: group[0].retryId })),
      ]
      return (
        <ReviewQuestionClient
          initialSummary={summary}
          currentItems={currentItems}
          queue={queue}
          currentIndex={0}
          activeQuestionType={activeQuestionType || null}
          questionTypes={typeSummaries}
        />
      )
    }

    if (items.length === 0) {
      redirect('/review/mistakes')
    }
    notFound()
  }

  const currentItems = itemGroups[foundGroupIndex]
  const queue = itemGroups.map(group => ({ retryId: group[0].retryId }))

  return (
    <ReviewQuestionClient
      initialSummary={summary}
      currentItems={currentItems}
      queue={queue}
      currentIndex={foundGroupIndex}
      activeQuestionType={activeQuestionType || null}
      questionTypes={typeSummaries}
    />
  )
}
