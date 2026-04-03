import Link from 'next/link'
import prisma from '@/lib/prisma'

export default async function ManageIndexPage() {
  const [
    levelCount,
    categoryCount,
    lessonCount,
    articleCount,
    quizCount,
    vocabCount,
    recentLevels,
  ] = await Promise.all([
    prisma.level.count(),
    prisma.paper.count(),
    prisma.lesson.count(),
    prisma.passage.count(),
    prisma.quiz.count(),
    prisma.vocabulary.count(),
    prisma.level.findMany({
      orderBy: { id: 'asc' },
      take: 8,
      select: { id: true, title: true, description: true },
    }),
  ])

  const statCards = [
    {
      label: '等级分类',
      value: levelCount,
      tone: 'ui-surface-primary',
    },
    {
      label: '语料分组',
      value: categoryCount,
      tone: 'ui-surface-secondary',
    },
    {
      label: '听力语料',
      value: lessonCount,
      tone: 'ui-surface-primary',
    },
    {
      label: '阅读文章',
      value: articleCount,
      tone: 'ui-surface-secondary',
    },
    {
      label: '题库题目',
      value: quizCount,
      tone: 'ui-surface-primary',
    },
    {
      label: '词库词条',
      value: vocabCount,
      tone: 'ui-surface-secondary',
    },
  ]

  const quickLinks = [
    {
      href: '/manage/upload',
      title: '语料录入',
      desc: '录入听力、阅读与题目，统一入库。',
    },
    {
      href: '/manage/vocabulary',
      title: '词库管理',
      desc: '维护注音、词性、释义与例句。',
    },
    {
      href: '/manage/audio',
      title: '录音管理',
      desc: '管理站内录音文件与引用状态。',
    },
    {
      href: '/manage/level',
      title: '分类管理',
      desc: '维护等级与语料分组结构。',
    },
  ]

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4 md:space-y-6'>
        <section className='border-b border-gray-200 pb-4 md:pb-8'>
          <h1 className='text-2xl font-bold text-gray-900 md:text-3xl'>管理中心</h1>
          <p className='mt-2 text-xs text-gray-500 md:text-sm'>
            统一管理语料、词库与题库。移动端建议优先使用下方快捷入口。
          </p>
          <div className='mt-4 grid grid-cols-2 gap-2.5 md:mt-5 md:grid-cols-3 md:gap-3'>
            {statCards.map(card => (
              <div
                key={card.label}
                className={`border ui-mobile-py-sm px-3 md:px-4 ${card.tone}`}>
                <p className='text-[11px] font-bold md:text-xs'>{card.label}</p>
                <p className='mt-1 text-xl font-black md:text-2xl'>{card.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className='border-b border-gray-200 pb-4 md:pb-8'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='text-lg font-semibold text-gray-900'>快捷入口</h2>
          </div>
          <div className='grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4 md:gap-3'>
            {quickLinks.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className='border-b border-gray-200 px-1 ui-mobile-py-sm transition-colors hover:bg-gray-50'>
                <p className='font-semibold text-gray-800'>{item.title}</p>
                <p className='mt-1 text-xs text-gray-500'>{item.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className='border-b border-gray-200 pb-4 md:pb-8'>
          <h2 className='text-lg font-semibold text-gray-900 mb-4'>分类导航</h2>
          {recentLevels.length === 0 ? (
            <p className='text-sm text-gray-500'>
              暂无分类数据，请先在“分类管理”中创建。
            </p>
          ) : (
            <div className='grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 xl:grid-cols-3'>
              {recentLevels.map(level => (
                <Link
                  key={level.id}
                  href={`/manage/level/${level.id}`}
                  className='border-b border-gray-200 px-1 ui-mobile-py-sm transition-colors hover:bg-gray-50'>
                  <p className='font-semibold text-gray-900'>{level.title}</p>
                  <p className='mt-1 text-xs text-gray-500 line-clamp-2'>
                    {level.description || '未填写分类说明'}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
