import Link from 'next/link'
import CategoryAccordion from '../../../components/CategoryAccordion'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

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
    <main className='min-h-screen bg-gray-50 p-8 pb-20'>
      <div className='max-w-3xl mx-auto mt-10'>
        {/* 面包屑导航 */}
        <Link
          href='/'
          className='inline-flex items-center text-gray-500 hover:text-blue-600 mb-6 transition-colors font-medium'>
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
          {levelData.title}
        </h1>
        <p className='text-gray-500 mb-10 pb-4 border-b border-gray-200'>
          {levelData.description}
        </p>

        {/* 渲染手风琴列表 */}
        {levelData.categories.length > 0 ? (
          // 4. 将数组直接传给手风琴组件（注意属性名改为了 lessonGroups）
          <CategoryAccordion lessonGroups={levelData.categories as any} />
        ) : (
          <div className='text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed text-gray-500'>
            该分类下暂时没有材料哦。
          </div>
        )}
      </div>
    </main>
  )
}
