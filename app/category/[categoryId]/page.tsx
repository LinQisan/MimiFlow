// 文件路径：app/category/[categoryId]/page.tsx
import Link from 'next/link'
import { getCategoryById, getLessonsByCategory } from '../../../data'
import CategoryAccordion from '../../../components/CategoryAccordion' // 引入新建的手风琴组件

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

  // 核心逻辑：按 groupTitle 给题目分组
  const groupedLessons = lessons.reduce(
    (acc, lesson) => {
      const groupName = lesson.groupTitle || '未分类练习'
      if (!acc[groupName]) {
        acc[groupName] = []
      }
      acc[groupName].push(lesson)
      return acc
    },
    {} as Record<string, typeof lessons>,
  )

  return (
    <main className='min-h-screen bg-gray-50 p-8 pb-20'>
      <div className='max-w-3xl mx-auto mt-10'>
        {/* 面包屑导航 */}
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

        {/* 标题区 */}
        <h1 className='text-3xl font-bold mb-2 text-gray-800'>
          {category.title}
        </h1>
        <p className='text-gray-500 mb-10 pb-4 border-b border-gray-200'>
          {category.description}
        </p>

        {/* 渲染手风琴列表 */}
        {Object.keys(groupedLessons).length > 0 ? (
          <CategoryAccordion groupedLessons={groupedLessons} />
        ) : (
          <div className='text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed text-gray-500'>
            该分类下暂时没有材料哦。
          </div>
        )}
      </div>
    </main>
  )
}
