import { notFound } from 'next/navigation'
import PaperQuestionEditor from './PaperQuestionEditor'
import { getManagePaperEditData } from '@/lib/repositories/exam'

export default async function ManageExamPaperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const paper = await getManagePaperEditData(id)
  if (!paper) return notFound()

  return <PaperQuestionEditor paper={paper} />
}
