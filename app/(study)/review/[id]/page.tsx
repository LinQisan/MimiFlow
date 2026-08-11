import { notFound, redirect } from 'next/navigation'

import {
  getDueRetryQuestions,
  getDueRetryQuestionTypeSummaries,
  getRetryQuestionById,
  getRetryQueueSummary,
} from '@/modules/review/actions/mistakes'
import ReviewQuestionClient from './ReviewQuestionClient'

export const dynamic = 'force-dynamic'

export default async function ReviewQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ type?: string | string[] }>
}) {
  const { id } = await params
  const query = await searchParams
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

  const foundIndex = items.findIndex(item => item.retryId === id)
  if (foundIndex === -1) {
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
      const queue = [
        { retryId: currentItem.retryId },
        ...items.map(item => ({ retryId: item.retryId })),
      ]
      return (
        <ReviewQuestionClient
          initialSummary={summary}
          currentItem={currentItem}
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

  const currentItem = items[foundIndex]
  const queue = items.map(item => ({ retryId: item.retryId }))

  return (
    <ReviewQuestionClient
      initialSummary={summary}
      currentItem={currentItem}
      queue={queue}
      currentIndex={foundIndex}
      activeQuestionType={activeQuestionType || null}
      questionTypes={typeSummaries}
    />
  )
}
