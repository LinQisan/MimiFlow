// 文件路径：app/category/[categoryId]/page.tsx
import Link from 'next/link'
import { getCategoryById, getLessonsByCategory } from '../../../data'

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ categoryId: string }>
}) {
  const { categoryId } = await params

  const category = getCategoryById(categoryId)
  const lessons = getLessonsByCategory(categoryId)

  if (!category) {
    return <div className='text-center mt-20 text-gray-500'>找不到该分类</div>
  }

  return (
    <main className='min-h-screen bg-gray-50 p-8'>
      <div className='max-w-3xl mx-auto mt-10'>
        {/* 顶部面包屑导航 */}
        <Link
          href='/'
          className='inline-flex items-center text-gray-500 hover:text-indigo-600 mb-6 transition-colors font-medium'>
          <svg
            className='w-5 h-5 mr-1'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M10 19l-7-7m0 0l7-7m-7 7h18'
            />
          </svg>
          返回首页
        </Link>

        <h1 className='text-3xl font-bold mb-2 text-gray-800'>
          {category.title}
        </h1>
        <p className='text-gray-500 mb-8 pb-4 border-b border-gray-200'>
          {category.description}
        </p>

        {/* 该分类下的具体材料列表 */}
        <div className='space-y-4'>
          {lessons.length > 0 ? (
            lessons.map(lesson => (
              <Link
                key={lesson.id}
                href={`/lesson/${lesson.id}`}
                className='flex items-center justify-between p-5 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-green-400 transition-all duration-200 group'>
                <div className='flex items-center gap-4'>
                  <div className='bg-green-50 text-green-600 p-3 rounded-full group-hover:bg-green-500 group-hover:text-white transition-colors'>
                    <svg
                      className='w-5 h-5'
                      fill='currentColor'
                      viewBox='0 0 20 20'>
                      <path
                        fillRule='evenodd'
                        d='M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z'
                        clipRule='evenodd'
                      />
                    </svg>
                  </div>
                  <h2 className='text-lg font-semibold text-gray-800 group-hover:text-green-600 transition-colors'>
                    {lesson.title}
                  </h2>
                </div>
                <span className='text-gray-400 text-sm group-hover:text-green-500 transition-colors'>
                  去听写 &rarr;
                </span>
              </Link>
            ))
          ) : (
            <div className='text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed text-gray-500'>
              该分类下暂时没有听力材料哦，快去 data/index.ts 里添加吧！
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
