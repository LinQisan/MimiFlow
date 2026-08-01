import Link from 'next/link'

import { getDueMemoryReviewItems } from '@/modules/review/server/queries'
import MemoryReviewClient from './MemoryReviewClient'

export const dynamic = 'force-dynamic'

export default async function MemoryReviewPage() {
  const items = await getDueMemoryReviewItems()

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-3xl'>
        <div className='mb-4 flex items-center justify-between gap-3'>
          <Link href='/review' className='text-sm font-semibold text-slate-600'>
            返回复习中心
          </Link>
          <span className='text-sm text-slate-500'>到期 {items.length} 条</span>
        </div>
        <MemoryReviewClient initialItems={items} />
      </div>
    </main>
  )
}
