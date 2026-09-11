import { notFound } from 'next/navigation'

import EditQuizUI from '@/modules/content/components/EditQuizUI'
import { getQuizEditData } from '@/lib/repositories/collection/manage'

export default async function ManageQuestionSetEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ focus?: string | string[] }>
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([params, searchParams])
  const quiz = await getQuizEditData(id)
  if (!quiz) return notFound()
  const focusValue = Array.isArray(resolvedSearchParams.focus)
    ? resolvedSearchParams.focus[0]
    : resolvedSearchParams.focus
  return <EditQuizUI quiz={quiz} initialFocusQuestionId={focusValue?.trim()} />
}
