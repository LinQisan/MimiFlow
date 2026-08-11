import { findLevelsWithPapersAndCounts } from '@/lib/repositories/exam'
import ManagePapersListClient from '@/features/practice/ui/ManagePapersListClient'

export default async function ManageExamPapersPage() {
  const levels = await findLevelsWithPapersAndCounts()
  return <ManagePapersListClient levels={levels} />
}
