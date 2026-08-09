// Practice paper editor route.
import { notFound } from 'next/navigation'
import PaperQuestionEditor from '@/features/practice/ui/PaperQuestionEditor'
import { getManagePaperEditData } from '@/lib/repositories/exam'

export default async function ManageExamPaperDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ section?: string | string[] }>
}) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawSection = Array.isArray(resolvedSearchParams.section)
    ? resolvedSearchParams.section[0]
    : resolvedSearchParams.section
  const paper = await getManagePaperEditData(id)
  if (!paper) return notFound()

  return <PaperQuestionEditor paper={paper} activeSectionKey={rawSection || null} />
}
