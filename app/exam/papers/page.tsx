import Link from 'next/link'

import { findLevelsWithPapersAndCounts } from '@/lib/repositories/exam'
import PapersListClient from './PapersListClient'

export default async function AllPapersPage() {
  const levels = await findLevelsWithPapersAndCounts()

  if (levels.length === 0) {
    return (
      <div className='min-h-screen bg-slate-50 px-6 py-10 font-sans'>
        <div className='mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center rounded-[20px] bg-white px-6 py-10 text-center shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
          <p className='text-base font-semibold text-slate-700'>暂无试卷数据</p>
          <p className='mt-2 text-sm text-slate-500'>
            先去训练中心补一些试卷，或者稍后再来看看。
          </p>
          <Link href='/exam' className='ui-btn ui-btn-primary mt-6'>
            返回训练中心
          </Link>
        </div>
      </div>
    )
  }
  const totalPaperCount = levels.reduce(
    (sum, level) => sum + level.papers.length,
    0,
  )

  return <PapersListClient levels={levels} totalPaperCount={totalPaperCount} />
}
