import { findLevelsWithPapersAndCounts } from '@/lib/repositories/exam'
import ManagePapersListClient from '@/modules/practice/components/ManagePapersListClient'

export default async function ManageExamPapersPage() {
  const levels = await findLevelsWithPapersAndCounts()
  return <ManagePapersListClient levels={levels} />
}
