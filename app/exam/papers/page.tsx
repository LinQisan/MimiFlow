import Link from 'next/link'

import { findLevelsWithPapersAndCounts } from '@/lib/repositories/exam.repo'
import PapersListClient from './PapersListClient'

export default async function AllPapersPage() {
  const levels = await findLevelsWithPapersAndCounts()

  if (levels.length === 0) {
    return (
      <div className='min-h-screen bg-[#f7f8fc] p-6 flex flex-col items-center justify-center text-gray-500'>
        <p>暂无试卷数据</p>
        <Link href='/exam' className='mt-4 text-blue-500 hover:underline'>
          返回训练中心
        </Link>
      </div>
    )
  }
  const totalPaperCount = levels.reduce(
    (sum, level) => sum + level.papers.length,
    0,
  )

  return <PapersListClient levels={levels} totalPaperCount={totalPaperCount} />
}
