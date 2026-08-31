// Practice paper editor route.
import { notFound } from 'next/navigation'
import PaperQuestionEditor from '@/features/practice/ui/PaperQuestionEditor'
import {
  getManagePaperEditData,
  getManagePaperMoveTargets,
} from '@/lib/repositories/exam'

export default async function ManageExamPaperDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ section?: string | string[] }>
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams ||
      Promise.resolve<{ section?: string | string[] }>({}),
  ])
  const rawSection = Array.isArray(resolvedSearchParams.section)
    ? resolvedSearchParams.section[0]
    : resolvedSearchParams.section
  const [paper, moveTargets] = await Promise.all([
    getManagePaperEditData(id),
    getManagePaperMoveTargets(id),
  ])
  if (!paper) return notFound()

  return (
    <PaperQuestionEditor
      paper={paper}
      moveTargets={moveTargets}
      activeSectionKey={rawSection || null}
    />
  )
}
