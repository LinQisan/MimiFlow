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
    <div className='min-h-screen bg-gray-50 p-6 md:p-12'>
      <div className='max-w-7xl mx-auto'>
        <div className='mb-10'>
          <h1 className='text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-3'>
            📝 刷题
          </h1>
          <p className='text-gray-500'>
            选择适合你的刷题模式。系统将自动统计正确率与答题耗时，智能评估题目难度。
          </p>
        </div>

        <div className='space-y-8'>
          {groupedQuizzes.map(group => (
            <section
              key={group.categoryName}
              className='bg-white border border-gray-100 rounded-3xl p-5 md:p-6 shadow-sm'>
              <div className='flex items-center justify-between mb-5'>
                <h2 className='text-xl font-black text-gray-800'>
                  {group.categoryName}
                </h2>
                <span className='text-xs font-bold bg-gray-100 text-gray-500 px-3 py-1 rounded-full'>
                  {group.items.length} 套
                </span>
              </div>

              <div className='grid grid-cols-1 xl:grid-cols-2 gap-5'>
                {group.items.map(quiz => (
                  <div
                    key={quiz.id}
                    className='bg-gray-50 p-6 rounded-3xl border border-gray-100 hover:shadow-lg transition-all duration-300 flex flex-col justify-between'>
                    <div>
                      <h3 className='text-xl font-bold text-gray-800 mb-2 leading-snug'>
                        {quiz.title}
                      </h3>
                      {quiz.description && (
                        <p className='text-sm text-gray-500 line-clamp-2'>
                          {quiz.description}
                        </p>
                      )}
                    </div>

                    <div className='mt-6 pt-5 border-t border-gray-100'>
                      <div className='text-xs text-gray-400 font-bold mb-4 text-center'>
                        共 {quiz._count.questions} 道题
                      </div>

                      <div className='grid grid-cols-3 gap-2 md:gap-3'>
                        <Link
                          href={`/quizzes/${quiz.id}?mode=scroll`}
                          className='flex flex-col items-center justify-center py-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 hover:-translate-y-1 transition-all group'>
                          <span className='text-xl mb-1 group-hover:scale-110 transition-transform'>
                            📜
                          </span>
                          <span className='text-xs font-bold'>展开全卷</span>
                        </Link>

                        <Link
                          href={`/quizzes/${quiz.id}?mode=random`}
                          className='flex flex-col items-center justify-center py-3 bg-purple-50 text-purple-600 rounded-2xl hover:bg-purple-100 hover:-translate-y-1 transition-all group'>
                          <span className='text-xl mb-1 group-hover:scale-110 transition-transform'>
                            🔀
                          </span>
                          <span className='text-xs font-bold'>随机乱序</span>
                        </Link>

                        <Link
                          href={`/quizzes/${quiz.id}?mode=sequential`}
                          className='flex flex-col items-center justify-center py-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 hover:-translate-y-1 transition-all group'>
                          <span className='text-xl mb-1 group-hover:scale-110 transition-transform'>
                            🎯
                          </span>
                          <span className='text-xs font-bold'>逐题通关</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {quizzes.length === 0 && (
            <div className='col-span-full py-20 text-center text-gray-400'>
              暂时没有题库，请前往后台录入。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
