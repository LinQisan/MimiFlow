// Practice library route.
import Link from 'next/link'

import {
  findLevelsWithPapersAndCounts,
} from '@/lib/repositories/exam'
import PapersListClient from './PapersListClient'

export default async function AllPapersPage() {
  const levels = await findLevelsWithPapersAndCounts()

  if (levels.length === 0) {
    return (
      <div className='min-h-screen bg-[#f6f5f1] px-4 py-12 font-sans text-slate-900 md:px-6'>
        <div className='mx-auto flex min-h-[62vh] max-w-3xl flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-[0_18px_50px_-42px_rgba(15,23,42,0.5)]'>
          <h1 className='text-3xl font-semibold tracking-tight text-slate-950'>暂无试卷数据</h1>
          <p className='mt-3 text-sm leading-6 text-slate-500'>导入第一份试卷后，就可以从这里开始练习。</p>
          <div className='mt-6 flex flex-wrap justify-center gap-2'>
            <Link href='/practice' className='ui-btn ui-btn-primary'>
              返回试卷库
            </Link>
            <Link href='/manage/practice' className='ui-btn'>
              管理试卷
            </Link>
          </div>
        </div>
      </div>
    )
  }
  const totalPaperCount = levels.reduce(
    (sum, level) => sum + level.papers.length,
    0,
  )

  return (
    <PapersListClient
      levels={levels}
      totalPaperCount={totalPaperCount}
    />
  )
}
