// app/admin/level/[id]/page.tsx
import Link from 'next/link'
import prisma from '@/lib/prisma'

import DeleteButton from '../DeleteButton'
import DeleteLessonButton from '../DeleteLessonButton'
import CreateLevelForm from '../CreateLevelForm'
import MoveLessonSelect from '../MoveLessonSelect'
import EditCategoryIdButton from '../EditCategoryIdButton'
import EditLevelIdButton from '../EditLevelIdButton'
import EditLessonNumButton from '../EditLessonNumButton.tsx'
import DeleteQuizButton from '../DeleteQuizButton'
import DeleteArticleButton from '../DeleteArticleButton'

// 引入拖拽组件和拦截器
import {
  SortableList,
  SortableItem,
  DragHandle,
  ActionInterceptor,
} from '../DndSystem'
import { updateSortOrder } from '@/app/actions/content'

// 折叠小箭头
const ChevronIcon = () => (
  <svg
    className='w-5 h-5 text-gray-400 transition-transform duration-300 group-open:-rotate-180'
    fill='none'
    stroke='currentColor'
    viewBox='0 0 24 24'>
    <path
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={2.5}
      d='M19 9l-7 7-7-7'
    />
  </svg>
)

export default async function LevelPage({
  params,
}: {
  // 兼容最新版 Next.js
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolvedParams = await params
  const targetId: string = resolvedParams.id

  const level = await prisma.level.findUnique({
    where: { id: targetId },
    include: {
      categories: {
        orderBy: { sortOrder: 'asc' },
        include: {
          lessons: { orderBy: { sortOrder: 'asc' } },
          articles: { orderBy: { sortOrder: 'asc' } },
          quizzes: {
            orderBy: { sortOrder: 'asc' },
            include: { questions: { select: { questionType: true } } },
          },
        },
      },
    },
  })

  const allCategoriesRaw = await prisma.category.findMany({
    include: { level: true },
  })
  const allCategories = allCategoriesRaw.map(cat => ({
    id: cat.id,
    name: cat.name,
    levelTitle: cat.level?.title || 'Unknown',
  }))

  if (!level) {
    return (
      <div className='p-10 text-center text-gray-400 font-bold mt-32 flex flex-col items-center gap-4'>
        <span className='text-4xl'>📭</span>
        找不到该分类的数据，请检查链接。
      </div>
    )
  }

  return (
    <div className='p-4 md:p-8 max-w-5xl mx-auto pb-32 animate-in fade-in duration-500'>
      {/* ================= 核心面板 ================= */}
      <div className='bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden'>
        {/* 🌟 极致优化的主卡片头部 */}
        <div className='p-5 md:p-6 bg-white border-b border-gray-100 flex flex-wrap justify-between items-center gap-4'>
          <div className='flex items-center gap-4'>
            <h2 className='text-2xl font-black text-gray-900 tracking-tight'>
              {level.title}
            </h2>
            <div className='flex items-center gap-1.5'>
              <span className='text-xs font-bold text-gray-400 bg-gray-50 px-2.5 py-1.5 rounded-lg font-mono border border-gray-100'>
                ID: {level.id}
              </span>
              <ActionInterceptor>
                <EditLevelIdButton levelId={level.id} />
              </ActionInterceptor>
            </div>
          </div>
          <div className='text-sm font-bold text-gray-400 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 shadow-sm'>
            {level.categories.length}
          </div>
        </div>

        {/* 试卷 (Categories) 列表 */}
        <SortableList
          items={level.categories}
          action={updateSortOrder.bind(null, 'Category')}
          className='p-4 md:p-6 flex flex-col gap-6 bg-gray-50/40'>
          {level.categories.map(category => (
            <SortableItem key={category.id} id={category.id}>
              <details
                open
                className='group/cat bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm transition-all hover:shadow-md'>
                {/* 试卷 Header */}
                <summary className='p-4 md:p-5 hover:bg-gray-50/80 cursor-pointer list-none flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-transparent group-open/cat:border-gray-100 transition-colors [&::-webkit-details-marker]:hidden'>
                  <div className='flex items-center gap-3 w-full md:w-auto'>
                    <ActionInterceptor>
                      <DragHandle />
                    </ActionInterceptor>
                    <div>
                      <h3 className='font-bold text-lg text-gray-800 leading-snug flex items-center gap-2'>
                        {category.name}
                        <ChevronIcon />
                      </h3>
                      <div className='text-[11px] text-gray-500 mt-1.5 flex items-center flex-wrap gap-2'>
                        <span className='font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md border border-gray-200/60'>
                          ID: {category.id}
                        </span>
                        <ActionInterceptor>
                          <EditCategoryIdButton categoryId={category.id} />
                        </ActionInterceptor>
                      </div>
                    </div>
                  </div>
                  <ActionInterceptor className='shrink-0'>
                    <DeleteButton
                      categoryId={category.id}
                      categoryName={category.name}
                    />
                  </ActionInterceptor>
                </summary>

                {/* 试卷内部内容 */}
                <div className='p-4 md:p-6 space-y-8 bg-gray-50/30'>
                  {category.lessons.length === 0 &&
                    category.articles.length === 0 &&
                    category.quizzes.length === 0 && (
                      <div className='flex justify-center items-center py-6 text-sm text-gray-400 font-medium bg-white rounded-xl border border-dashed border-gray-200'>
                        <span className='mr-2'>📭</span>{' '}
                        暂无任何语料，请点击下方新增
                      </div>
                    )}

                  {/* 🎧 听力列表 */}
                  {category.lessons.length > 0 && (
                    <div>
                      <h4 className='text-sm font-black text-blue-600 mb-4 flex items-center gap-2'>
                        <span className='w-1.5 h-4 bg-blue-500 rounded-full'></span>
                        听力 ({category.lessons.length})
                      </h4>
                      <SortableList
                        items={category.lessons}
                        action={updateSortOrder.bind(null, 'Lesson')}
                        className='space-y-3'>
                        {category.lessons.map(lesson => (
                          <SortableItem key={lesson.id} id={lesson.id}>
                            <div className='flex flex-col xl:flex-row items-start xl:items-center justify-between bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm hover:border-blue-300 transition-all gap-4'>
                              <div className='text-sm font-medium text-gray-700 flex items-center flex-wrap gap-2'>
                                <DragHandle />
                                <span className='text-blue-600 font-black ml-1 bg-blue-50 px-2 py-0.5 rounded-md'>
                                  {lesson.lessonNum}
                                </span>
                                <EditLessonNumButton
                                  lessonId={lesson.id}
                                  currentNum={lesson.lessonNum}
                                />
                                <span className='border-l-2 border-gray-100 pl-3 ml-1 text-gray-800 font-bold tracking-wide'>
                                  {lesson.title}
                                </span>
                              </div>
                              <div className='flex flex-wrap items-center gap-2.5 w-full xl:w-auto xl:justify-end'>
                                <Link
                                  href={`/admin/level/lesson/${lesson.id}`}
                                  className='text-xs px-4 py-2 bg-blue-50 text-blue-600 font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-colors whitespace-nowrap shadow-sm'>
                                  编辑听力
                                </Link>
                                <div className='max-w-full'>
                                  <MoveLessonSelect
                                    lessonId={lesson.id}
                                    currentCategoryId={category.id}
                                    allCategories={allCategories}
                                  />
                                </div>
                                <DeleteLessonButton
                                  lessonId={lesson.id}
                                  title={lesson.title}
                                />
                              </div>
                            </div>
                          </SortableItem>
                        ))}
                      </SortableList>
                    </div>
                  )}

                  {/* 📄 阅读文章 */}
                  {category.articles.length > 0 && (
                    <div>
                      <h4 className='text-sm font-black text-emerald-600 mb-4 flex items-center gap-2'>
                        <span className='w-1.5 h-4 bg-emerald-500 rounded-full'></span>
                        阅读文章 ({category.articles.length})
                      </h4>
                      <SortableList
                        items={category.articles}
                        action={updateSortOrder.bind(null, 'Article')}
                        className='space-y-3'>
                        {category.articles.map(article => (
                          <SortableItem key={article.id} id={article.id}>
                            <div className='flex flex-col md:flex-row items-start md:items-center justify-between bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm hover:border-emerald-300 transition-all gap-4'>
                              <div className='flex items-center gap-3 text-sm font-bold text-gray-800 tracking-wide'>
                                <DragHandle />
                                <span>{article.title}</span>
                              </div>
                              <div className='flex gap-2.5 shrink-0'>
                                <Link
                                  href={`/admin/level/article/${article.id}`}
                                  className='text-xs px-4 py-2 bg-emerald-50 text-emerald-600 font-bold rounded-lg hover:bg-emerald-600 hover:text-white transition-colors whitespace-nowrap shadow-sm'>
                                  编辑文章
                                </Link>
                                <DeleteArticleButton
                                  articleId={article.id}
                                  title={article.title}
                                />
                              </div>
                            </div>
                          </SortableItem>
                        ))}
                      </SortableList>
                    </div>
                  )}

                  {/* 📝 选择题库 */}
                  {category.quizzes.length > 0 && (
                    <div>
                      <h4 className='text-sm font-black text-purple-600 mb-4 flex items-center gap-2'>
                        <span className='w-1.5 h-4 bg-purple-500 rounded-full'></span>
                        题库专区 ({category.quizzes.length})
                      </h4>
                      <SortableList
                        items={category.quizzes}
                        action={updateSortOrder.bind(null, 'Quiz')}
                        className='space-y-3'>
                        {category.quizzes.map(quiz => {
                          const fillBlankCount = quiz.questions.filter(
                            (q: any) => q.questionType === 'FILL_BLANK',
                          ).length
                          const sortingCount = quiz.questions.filter(
                            (q: any) => q.questionType === 'SORTING',
                          ).length
                          const pronCount = quiz.questions.filter(
                            (q: any) => q.questionType === 'PRONUNCIATION',
                          ).length
                          const readingCount = quiz.questions.filter(
                            (q: any) =>
                              q.questionType === 'READING_COMPREHENSION',
                          ).length

                          return (
                            <SortableItem key={quiz.id} id={quiz.id}>
                              <details className='group/quiz bg-white rounded-xl border border-gray-200 shadow-sm hover:border-purple-300 transition-all'>
                                <summary className='flex flex-col md:flex-row items-start md:items-center justify-between p-3.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden gap-4'>
                                  <div className='flex items-center gap-3 text-sm font-bold text-gray-800 tracking-wide w-full md:w-auto'>
                                    <ActionInterceptor>
                                      <DragHandle />
                                    </ActionInterceptor>
                                    <span>{quiz.title}</span>
                                    <span className='text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-md ml-2 flex items-center gap-1'>
                                      共 {quiz.questions.length} 题{' '}
                                      <ChevronIcon />
                                    </span>
                                  </div>
                                  <ActionInterceptor className='flex gap-2.5 shrink-0'>
                                    <Link
                                      href={`/admin/level/quiz/${quiz.id}`}
                                      className='text-xs px-4 py-2 bg-purple-50 text-purple-600 font-bold rounded-lg hover:bg-purple-600 hover:text-white transition-colors whitespace-nowrap shadow-sm'>
                                      编辑题目
                                    </Link>
                                    <DeleteQuizButton
                                      quizId={quiz.id}
                                      title={quiz.title}
                                    />
                                  </ActionInterceptor>
                                </summary>
                                <div className='px-12 pb-5 pt-1 text-xs text-gray-500 flex flex-wrap gap-4 border-t border-gray-100 bg-gray-50/50 rounded-b-xl'>
                                  {fillBlankCount > 0 && (
                                    <span className='flex items-center gap-1.5 mt-3'>
                                      <span className='w-2 h-2 rounded-full bg-blue-400 shadow-sm'></span>{' '}
                                      完形填空:{' '}
                                      <b className='text-gray-700'>
                                        {fillBlankCount}
                                      </b>
                                    </span>
                                  )}
                                  {sortingCount > 0 && (
                                    <span className='flex items-center gap-1.5 mt-3'>
                                      <span className='w-2 h-2 rounded-full bg-orange-400 shadow-sm'></span>{' '}
                                      星号排序:{' '}
                                      <b className='text-gray-700'>
                                        {sortingCount}
                                      </b>
                                    </span>
                                  )}
                                  {pronCount > 0 && (
                                    <span className='flex items-center gap-1.5 mt-3'>
                                      <span className='w-2 h-2 rounded-full bg-green-400 shadow-sm'></span>{' '}
                                      读音假名:{' '}
                                      <b className='text-gray-700'>
                                        {pronCount}
                                      </b>
                                    </span>
                                  )}
                                  {readingCount > 0 && (
                                    <span className='flex items-center gap-1.5 mt-3'>
                                      <span className='w-2 h-2 rounded-full bg-purple-400 shadow-sm'></span>{' '}
                                      阅读理解:{' '}
                                      <b className='text-gray-700'>
                                        {readingCount}
                                      </b>
                                    </span>
                                  )}
                                  {quiz.questions.length === 0 && (
                                    <span className='mt-3 text-red-400 font-medium bg-red-50 px-2 py-1 rounded'>
                                      题库目前为空，请添加题目
                                    </span>
                                  )}
                                </div>
                              </details>
                            </SortableItem>
                          )
                        })}
                      </SortableList>
                    </div>
                  )}
                </div>
              </details>
            </SortableItem>
          ))}
        </SortableList>
      </div>
    </div>
  )
}
