import Link from 'next/link'

import { getDueMemoryReviewItems } from '@/modules/review/server/queries'
import MemoryReviewClient from './MemoryReviewClient'

export const dynamic = 'force-dynamic'

export default async function MemoryReviewPage() {
  const items = await getDueMemoryReviewItems()

  return (
    <main className='min-h-screen bg-[#f6f5f1] px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-3xl'>
        <div className='mb-5 flex items-start justify-between gap-3'>
          <div>
            <Link href='/review' className='text-sm font-semibold text-slate-600 hover:text-slate-900'>
            返回复习中心
            </Link>
            <h1 className='mt-3 text-2xl font-bold tracking-tight text-slate-900'>
              记忆复习
            </h1>
          </div>
          <span className='ui-tag shrink-0'>到期 {items.length} 条</span>
        </div>
        <MemoryReviewClient initialItems={items} />
      </div>
    </main>
  )
}
