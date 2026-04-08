import { notFound, redirect } from 'next/navigation'

import { getDueRetryQuestions, getRetryQueueSummary } from '@/app/actions/retry'
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

  if (items.length === 0) {
    redirect('/review')
  }

  const currentIndex = items.findIndex(item => item.retryId === id)
  if (currentIndex === -1) {
    if (items[0]?.retryId) {
      redirect(`/review/${items[0].retryId}`)
    }
    notFound()
  }

  const currentItem = items[currentIndex]
  const queue = items.map(item => ({ retryId: item.retryId }))

  return (
    <ReviewQuestionClient
      initialSummary={summary}
      currentItem={currentItem}
      queue={queue}
      currentIndex={currentIndex}
    />
  )
}
