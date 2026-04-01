import CategoryAccordion from '../../../components/CategoryAccordion'
import prisma from '@/lib/prisma'

export default async function LevelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const levelData = await prisma.level.findUnique({
    where: { id: id }, // 转小写防报错
    include: {
      categories: {
        orderBy: { id: 'asc' }, // 试卷按最新导入排序
        include: {
          lessons: {
            select: { id: true, title: true, lessonNum: true },
            orderBy: { lessonNum: 'asc' }, // 题目按 1.1, 1.2 顺序排
          },
        },
      },
    },
  })

  if (!levelData) {
    return <div className='text-center mt-20 text-gray-500'>找不到该分类</div>
  }

  return (
    <main className='min-h-screen bg-gray-50 px-4 md:px-8 xl:px-10 py-6 md:py-8'>
      <div className='w-full max-w-7xl mx-auto'>
        <header className='mb-8 md:mb-10'>
          <h1 className='text-3xl md:text-4xl font-black mb-2 text-gray-900 tracking-tight'>
            {levelData.title}
          </h1>
          {levelData.description && (
            <p className='text-gray-500 max-w-3xl'>{levelData.description}</p>
          )}
        </header>

        {levelData.categories.length > 0 ? (
          <CategoryAccordion lessonGroups={levelData.categories} />
        ) : (
          <div className='text-center py-16 bg-white rounded-3xl border border-dashed border-gray-300 text-gray-500'>
            该分类下暂时没有材料
          </div>
        )}
      </div>
    </main>
  )
}
