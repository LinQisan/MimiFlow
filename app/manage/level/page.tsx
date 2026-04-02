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
        <div className='mb-4 border-b border-gray-200 pb-4 md:mb-6 md:pb-6'>
          <h1 className='text-2xl font-bold text-gray-900 md:text-3xl'>分类管理</h1>
          <p className='mt-2 text-xs text-gray-500 md:text-sm'>
            选择一个分类进入详情页，管理听力、阅读与题库内容。
          </p>
        </div>

        <div className='grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-4 xl:grid-cols-3'>
          {levels.map(level => (
            <Link
              key={level.id}
              href={`/manage/level/${level.id}`}
              className='block border-b border-gray-200 px-2 py-4 transition-colors hover:bg-gray-50 md:py-5'>
              <h2 className='text-lg font-semibold text-gray-800'>{level.title}</h2>
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
