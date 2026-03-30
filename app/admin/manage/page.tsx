// app/admin/manage/page.tsx
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import Link from 'next/link'
import DeleteButton from './DeleteButton'
import DeleteLessonButton from './DeleteLessonButton'
import CreateLevelForm from './CreateLevelForm'
import MoveLessonSelect from './MoveLessonSelect'
import EditCategoryIdButton from './EditCategoryIdButton'
import EditLevelIdButton from './EditLevelIdButton'
import EditLessonNumButton from './EditLessonNumButton.tsx'
import AdminSearchPanel from './AdminSearchPanel'
const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL || 'file:./prisma/dev.db',
})
const prisma = new PrismaClient({ adapter })

export default async function ManagePage() {
  const dbLevels = await prisma.level.findMany({
    include: {
      categories: {
        orderBy: { id: 'desc' },
        include: {
          lessons: {
            orderBy: { lessonNum: 'asc' },
          },
        },
      },
    },
  })

  const allCategories = dbLevels.flatMap(level =>
    level.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      levelTitle: level.title,
    })),
  )

  return (
    // 🌟 优化1：移动端减小全局 padding (p-4 md:p-8)
    <main className='min-h-screen bg-gray-50 p-4 md:p-8'>
      <div className='max-w-4xl mx-auto mt-6 md:mt-10'>
        {/* 🌟 优化2：大标题区允许折行，防止手机上按钮被挤掉 */}
        <div className='flex flex-wrap justify-between items-center mb-8 pb-4 border-b border-gray-200 gap-4'>
          <div>
            <Link
              href='/'
              className='text-sm text-blue-500 hover:text-blue-700 mb-2 inline-block'>
              &larr; 返回前台主页
            </Link>
            <h1 className='text-2xl md:text-3xl font-bold text-gray-800'>
              📦 数据管理中心
            </h1>
          </div>
          <Link
            href='/admin/upload'
            className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm md:text-base whitespace-nowrap'>
            + 上传新题库
          </Link>
        </div>
        <AdminSearchPanel />
        <CreateLevelForm />

        <div className='space-y-6 md:space-y-10'>
          {dbLevels.map(level => (
            <section
              key={level.id}
              className='bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100'>
              {/* 🌟 优化3：允许大模块标题和 ID 标签折行 */}
              <div className='mb-4 flex flex-wrap items-center gap-2 md:gap-3'>
                <h2 className='text-lg md:text-xl font-bold text-gray-800'>
                  {level.title}
                </h2>
                <div className='flex items-center'>
                  <span className='text-xs md:text-sm font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono'>
                    ID: {level.id}
                  </span>
                  <EditLevelIdButton levelId={level.id} />
                </div>
              </div>

              <div className='flex flex-col gap-4'>
                {level.categories.map(category => (
                  <div
                    key={category.id}
                    className='p-3 md:p-4 bg-gray-50 rounded-xl border border-gray-200'>
                    {/* 🌟 优化4：试卷标题和删除按钮在手机上变为上下结构 (flex-col md:flex-row) */}
                    <div className='flex flex-col md:flex-row items-start md:items-center justify-between mb-3 pb-3 border-b border-gray-200 gap-3'>
                      <div>
                        <h3 className='font-bold text-base md:text-lg text-gray-800 leading-snug'>
                          {category.name}
                        </h3>
                        <p className='text-xs text-gray-500 mt-1 flex items-center flex-wrap gap-1'>
                          ID:
                          <span className='font-mono bg-gray-100 px-1 rounded'>
                            {category.id}
                          </span>
                          <EditCategoryIdButton categoryId={category.id} />
                        </p>
                      </div>
                      <DeleteButton
                        categoryId={category.id}
                        categoryName={category.name}
                      />
                    </div>

                    <div className='space-y-2 pl-0 md:pl-2'>
                      {category.lessons.length === 0 ? (
                        <p className='text-sm text-gray-400'>暂无题目</p>
                      ) : null}
                      {category.lessons.map(lesson => (
                        // 🌟 优化5：最关键的一层。手机端上下排列内容和按钮，平板以上左右排列
                        <div
                          key={lesson.id}
                          className='flex flex-col xl:flex-row items-start xl:items-center justify-between bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:border-blue-200 gap-3'>
                          {/* 左侧：题号与标题 */}
                          <div className='text-sm font-medium text-gray-700 flex items-center flex-wrap gap-2'>
                            <span className='text-blue-500 font-bold'>
                              {lesson.lessonNum}
                            </span>
                            <EditLessonNumButton
                              lessonId={lesson.id}
                              currentNum={lesson.lessonNum}
                            />
                            <span className='border-l border-gray-300 pl-2 leading-relaxed'>
                              {lesson.title}
                            </span>
                          </div>

                          {/* 🌟 右侧按钮区：允许在空间不足时自动换行排布 */}
                          <div className='flex flex-wrap items-center gap-2 w-full xl:w-auto xl:justify-end'>
                            <Link
                              href={`/admin/manage/lesson/${lesson.id}`}
                              className='text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors whitespace-nowrap'>
                              ✏️ 编辑字幕
                            </Link>
                            <DeleteLessonButton
                              lessonId={lesson.id}
                              title={lesson.title}
                            />
                            {/* 选择框在手机上可能很长，限制宽度或允许其自然伸展 */}
                            <div className='max-w-full'>
                              <MoveLessonSelect
                                lessonId={lesson.id}
                                currentCategoryId={category.id}
                                allCategories={allCategories}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
