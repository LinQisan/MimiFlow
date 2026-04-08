import Link from 'next/link'

import { findLevelsWithPapersAndCounts } from '@/lib/repositories/exam.repo'
import ManagePapersListClient from './ManagePapersListClient'

export default async function ManageExamPapersPage() {
  const levels = await findLevelsWithPapersAndCounts()

  if (levels.length === 0) {
    return (
      <div className='min-h-screen bg-[#f7f8fc] p-6 flex flex-col items-center justify-center text-gray-500'>
        <p>暂无试卷数据</p>
        <Link href='/manage' className='mt-4 text-blue-500 hover:underline'>
          返回管理中心
        </Link>
      </div>
    )
  }

  const totalPaperCount = levels.reduce(
    (sum, level) => sum + level.papers.length,
    0,
  )

  return (
    <ManagePapersListClient levels={levels} totalPaperCount={totalPaperCount} />
  )
}

