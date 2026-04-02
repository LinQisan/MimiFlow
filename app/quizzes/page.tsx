// app/quizzes/page.tsx
import Link from 'next/link'
import prisma from '@/lib/prisma'

export default async function QuizzesIndexPage() {
  const quizzes = await prisma.quiz.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      category: { select: { name: true, level: { select: { title: true } } } },
      _count: { select: { questions: true } },
    },
  })

  const groupedQuizzes = quizzes.reduce<
    { categoryName: string; items: typeof quizzes }[]
  >((acc, quiz) => {
    const categoryName = quiz.category
      ? `${quiz.category.level?.title || '未分级'} · ${quiz.category.name}`
      : '未分类'
    const existing = acc.find(group => group.categoryName === categoryName)
    if (existing) {
      existing.items.push(quiz)
      return acc
    }
    acc.push({ categoryName, items: [quiz] })
    return acc
  }, [])

  return (
    <div className='min-h-screen bg-gray-50 px-4 pb-20 pt-4 md:px-8 md:pt-8'>
      <div className='mx-auto max-w-7xl'>
        <section className='mb-8 border-b border-gray-200 pb-4 md:pb-5'>
          <div className='flex flex-wrap items-end justify-between gap-4'>
            <div>
              <h1 className='text-3xl font-bold tracking-tight text-gray-900 md:text-4xl'>
                题库练习
              </h1>
              <p className='mt-2 text-sm font-medium text-gray-500 md:text-base'>
                选择一套题并开始作答，系统会记录正确率与答题耗时。
              </p>
            </div>
            <div className='ui-tag ui-tag-info md:text-sm'>
              共 {quizzes.length} 套
            </div>
          </div>
        </section>

        <div className='space-y-6'>
          {groupedQuizzes.map(group => (
            <section
              key={group.categoryName}
              className='border-b border-gray-200 pb-4 md:pb-6'>
              <div className='mb-5 flex items-center justify-between'>
                <h2 className='text-lg font-black text-gray-800 md:text-xl'>
                  {group.categoryName}
                </h2>
                <span className='ui-tag ui-tag-muted'>
                  {group.items.length} 套
                </span>
              </div>

              <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
                {group.items.map(quiz => (
                  <div
                    key={quiz.id}
                    className='flex flex-col justify-between border-b border-gray-200 px-1 py-4 transition-colors hover:bg-gray-50'>
                    <div>
                      <h3 className='mb-2 text-lg font-semibold leading-snug text-gray-900 md:text-xl'>
                        {quiz.title}
                      </h3>
                      {quiz.description && (
                        <p className='line-clamp-2 text-sm text-gray-500'>
                          {quiz.description}
                        </p>
                      )}
                    </div>

                    <div className='mt-4 pt-2'>
                      <div className='mb-3 text-xs font-semibold text-gray-400'>
                        共 {quiz._count.questions} 道题
                      </div>

                      <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
                        <Link
                          href={`/quizzes/${quiz.id}?mode=scroll`}
                          className='ui-btn ui-btn-sm border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'>
                          全卷模式
                        </Link>

                        <Link
                          href={`/quizzes/${quiz.id}?mode=random`}
                          className='ui-btn ui-btn-sm border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'>
                          随机模式
                        </Link>

                        <Link
                          href={`/quizzes/${quiz.id}?mode=sequential`}
                          className='ui-btn ui-btn-sm border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'>
                          逐题模式
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {quizzes.length === 0 && (
            <div className='border-b border-dashed border-gray-300 py-16 text-center text-sm font-semibold text-gray-500'>
              当前暂无题库，请先在管理端录入。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
