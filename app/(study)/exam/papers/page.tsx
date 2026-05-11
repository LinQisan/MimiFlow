import Link from 'next/link'

import { findLevelsWithPapersAndCounts } from '@/lib/repositories/exam'
import PapersListClient from './PapersListClient'

export default async function AllPapersPage() {
  const levels = await findLevelsWithPapersAndCounts()

  if (levels.length === 0) {
    return (
      <div className='min-h-screen bg-[#f7f8fb] px-4 py-10 font-sans text-slate-900 md:px-6'>
        <div className='mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center border border-dashed border-slate-300 bg-white px-6 py-10 text-center'>
          <p className='text-2xl font-black text-slate-950'>暂无试卷数据</p>
          <p className='mt-2 text-sm text-slate-500'>
            先去训练中心补一些试卷，或者稍后再来看看。
          </p>
          <div className='mt-6 flex flex-wrap justify-center gap-2'>
            <Link href='/exam' className='ui-btn ui-btn-primary'>
              返回训练中心
            </Link>
            <Link href='/papers/manage' className='ui-btn'>
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

  return <PapersListClient levels={levels} totalPaperCount={totalPaperCount} />
}
