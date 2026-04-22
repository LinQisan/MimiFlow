import Link from 'next/link'
import prisma from '@/lib/prisma'
import WordbooksBrowser from './WordbooksBrowser'

export default async function WordbooksPage() {
  const wordbooks = await prisma.wordbook.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      parentId: true,
      _count: {
        select: { entries: true },
      },
    },
  })

  const totalWordbooks = wordbooks.length
  const rootCount = wordbooks.filter(item => !item.parentId).length
  const totalEntries = wordbooks.reduce(
    (sum, item) => sum + item._count.entries,
    0,
  )

  return (
    <main className='min-h-screen bg-white text-slate-900'>
      <div className='mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8'>
        <header className='mb-6 rounded-[18px] bg-white p-5 shadow-[rgba(19,19,22,0.7)_0px_1px_5px_-4px,rgba(34,42,53,0.08)_0px_0px_0px_1px,rgba(34,42,53,0.05)_0px_4px_8px_0px]'>
          <div className='flex flex-wrap items-center gap-2'>
            <Link
              href='/'
              className='inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:text-slate-900'>
              <span>Miniflow</span>
              <span>←</span>
            </Link>
            <div className='ml-auto'>
              <Link href='/vocabulary' className='ui-btn'>
                词汇工作台
              </Link>
            </div>
          </div>
          <h1 className='mt-4 text-4xl font-semibold tracking-tight text-[#242424] md:text-5xl'>
            单词书
          </h1>
          <p className='mt-2 text-sm text-[#898989]'>
            像跟读材料一样浏览：先看书架，再进入单词书查看词条。
          </p>
          <div className='mt-5 grid grid-cols-3 gap-2 md:max-w-xl'>
            <div className='rounded-xl bg-slate-50 px-3 py-2'>
              <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500'>
                总书数
              </p>
              <p className='mt-1 text-2xl font-semibold text-[#242424]'>
                {totalWordbooks}
              </p>
            </div>
            <div className='rounded-xl bg-slate-50 px-3 py-2'>
              <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500'>
                根分组
              </p>
              <p className='mt-1 text-2xl font-semibold text-[#242424]'>
                {rootCount}
              </p>
            </div>
            <div className='rounded-xl bg-slate-50 px-3 py-2'>
              <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500'>
                收录词条
              </p>
              <p className='mt-1 text-2xl font-semibold text-[#242424]'>
                {totalEntries}
              </p>
            </div>
          </div>
        </header>

        <WordbooksBrowser
          items={wordbooks.map(item => ({
            id: item.id,
            title: item.title,
            parentId: item.parentId,
            count: item._count.entries,
          }))}
        />
      </div>
    </main>
  )
}
