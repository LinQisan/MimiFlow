import { notFound } from 'next/navigation'

import EditQuizUI from '@/app/(library)/collections/quiz/[id]/EditQuizUI'
import { getQuizEditData } from '@/lib/repositories/collection/manage'

export default async function ManageCollectionQuizEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const quiz = await getQuizEditData(id)
  if (!quiz) return notFound()
  return <EditQuizUI quiz={quiz} />
}
