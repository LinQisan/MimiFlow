import Link from 'next/link'

import { findLevelsWithPapersAndCounts } from '@/lib/repositories/exam'
import ManagePapersListClient from './ManagePapersListClient'

export default async function ManageExamPapersPage() {
  const levels = await findLevelsWithPapersAndCounts()

  if (levels.length === 0) {
    return (
      <div className='min-h-screen bg-[#f7f8fc] p-6 flex flex-col items-center justify-center text-gray-500'>
        <p>暂无试卷数据</p>
        <Link
          href='/'
          className='mt-4 inline-flex items-center gap-1.5 text-sm font-semibold tracking-[0.24em] text-slate-500 uppercase transition hover:text-slate-900'
          aria-label='返回首页'
          title='返回首页'>
          <span>MimiFlow</span>
          <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M15 19l-7-7 7-7'
            />
          </svg>
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
