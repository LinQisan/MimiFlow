import { notFound } from 'next/navigation'

import EditQuizUI from '@/features/content/ui/EditQuizUI'
import { getQuizEditData } from '@/lib/repositories/collection/manage'

export default async function ManageQuestionSetEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const quiz = await getQuizEditData(id)
  if (!quiz) return notFound()
  return <EditQuizUI quiz={quiz} />
}
