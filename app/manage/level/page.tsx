import Link from 'next/link'
import prisma from '@/lib/prisma'

export default async function AdminLevelIndexPage() {
  const levels = await prisma.level.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, title: true, description: true },
  })

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl'>
        <div className='mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:mb-6 md:p-6'>
          <h1 className='text-xl font-black text-gray-900 md:text-3xl'>分类管理</h1>
          <p className='mt-2 text-xs text-gray-500 md:text-sm'>
            选择一个分类进入详情页，管理听力、阅读与题库内容。
          </p>
        </div>

        <div className='grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-4 xl:grid-cols-3'>
          {levels.map(level => (
            <Link
              key={level.id}
              href={`/manage/level/${level.id}`}
              className='block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md md:p-5'>
              <h2 className='text-lg font-bold text-gray-800'>{level.title}</h2>
              {level.description && (
                <p className='text-sm text-gray-500 mt-2 line-clamp-2'>
                  {level.description}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
