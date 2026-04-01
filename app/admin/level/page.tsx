import Link from 'next/link'
import prisma from '@/lib/prisma'

export default async function AdminLevelIndexPage() {
  const levels = await prisma.level.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, title: true, description: true },
  })

  return (
    <main className='min-h-full px-4 md:px-6 py-6 md:py-8'>
      <div className='max-w-6xl mx-auto'>
        <div className='mb-6'>
          <h1 className='text-2xl md:text-3xl font-black text-gray-900'>分类管理</h1>
          <p className='text-sm text-gray-500 mt-2'>选择一个分类进入管理。</p>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
          {levels.map(level => (
            <Link
              key={level.id}
              href={`/admin/level/${level.id}`}
              className='block bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all'>
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
