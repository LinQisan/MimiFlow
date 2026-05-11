import { notFound, redirect } from 'next/navigation'

import {
  getDueRetryQuestions,
  getRetryQuestionById,
  getRetryQueueSummary,
} from '@/app/actions/retry'
import ReviewQuestionClient from './ReviewQuestionClient'

export const dynamic = 'force-dynamic'

export default async function ReviewQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [summary, items] = await Promise.all([
    getRetryQueueSummary(),
    getDueRetryQuestions(100),
  ])

  const foundIndex = items.findIndex(item => item.retryId === id)
  if (foundIndex === -1) {
    const currentItem = await getRetryQuestionById(id)
    if (currentItem) {
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
        />
      )
    }

    if (items.length === 0) {
      redirect('/review')
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
    />
  )
}
