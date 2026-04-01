// app/articles/page.tsx
import Link from 'next/link'
import prisma from '@/lib/prisma'

// ==========================================
// 🧠 智能探测器：根据文章下挂载的题目，自动判定文章类型
// ==========================================
const detectArticleType = (
  questions: { questionType: string }[] | undefined,
) => {
  if (!questions || questions.length === 0) {
    return {
      label: '纯阅读',
      icon: '📚',
      style: 'bg-green-50 text-green-700 border-green-200',
    }
  }

  // 检查是否包含填空题
  const hasFillBlank = questions.some(q => q.questionType === 'FILL_BLANK')
  // 检查是否包含阅读理解题
  const hasReading = questions.some(
    q => q.questionType === 'READING_COMPREHENSION',
  )

  if (hasFillBlank && hasReading) {
    return {
      label: '综合训练',
      icon: '🔥',
      style: 'bg-red-50 text-red-700 border-red-200',
    }
  } else if (hasFillBlank) {
    return {
      label: '完形填空',
      icon: '🧩',
      style: 'bg-orange-50 text-orange-700 border-orange-200',
    }
  } else {
    return {
      label: '阅读理解',
      icon: '📝',
      style: 'bg-blue-50 text-blue-700 border-blue-200',
    }
  }
}

export default async function ArticlesPage() {
  // 1. 从数据库拉取所有文章，同时包含分类信息和极其轻量的题目信息（只查题型，不查长文本，节省性能）
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      category: true,
      questions: {
        select: { questionType: true }, // 🌟 核心优化：只查 questionType 来做类型嗅探
      },
    },
  })

  const groupedArticles = articles.reduce<
    { categoryName: string; items: typeof articles }[]
  >((acc, article) => {
    const categoryName = article.category?.name || '未分类'
    const existing = acc.find(group => group.categoryName === categoryName)
    if (existing) {
      existing.items.push(article)
      return acc
    }
    acc.push({ categoryName, items: [article] })
    return acc
  }, [])

  return (
    <div className='min-h-screen bg-gray-50 p-6 md:p-12 pb-32'>
      <div className='max-w-7xl mx-auto'>
        {/* 头部标题区 */}
        <div className='mb-12'>
          <h1 className='text-3xl md:text-4xl font-black text-gray-900 mb-4 tracking-tight'>
            阅读
          </h1>
          <p className='text-gray-500 font-medium'>
            沉浸式阅读与实战演练，提升你的语感与理解力。
          </p>
        </div>

        {/* 文章网格列表 */}
        {articles.length === 0 ? (
          <div className='text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300'>
            <span className='text-4xl mb-4 block'>📭</span>
            <h3 className='text-xl font-bold text-gray-700 mb-2'>暂无文章</h3>
            <p className='text-gray-400'>后台还没有发布任何阅读内容哦</p>
          </div>
        ) : (
          <div className='space-y-8'>
            {groupedArticles.map(group => (
              <section
                key={group.categoryName}
                className='bg-white border border-gray-100 rounded-3xl p-5 md:p-6 shadow-sm'>
                <div className='flex items-center justify-between mb-5'>
                  <h2 className='text-xl font-black text-gray-800'>
                    {group.categoryName}
                  </h2>
                  <span className='text-xs font-bold bg-gray-100 text-gray-500 px-3 py-1 rounded-full'>
                    {group.items.length} 篇
                  </span>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5'>
                  {group.items.map(article => {
                    const articleType = detectArticleType(article.questions)
                    const dateStr = new Intl.DateTimeFormat('zh-CN', {
                      month: 'short',
                      day: 'numeric',
                    }).format(article.createdAt)

                    return (
                      <Link
                        href={`/articles/${article.id}`}
                        key={article.id}
                        className='group bg-gray-50 rounded-3xl p-6 border border-gray-100 hover:shadow-lg hover:border-indigo-100 hover:-translate-y-1 transition-all duration-300 flex flex-col'>
                        <div className='flex justify-end items-start mb-5'>
                          <span
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${articleType.style}`}>
                            <span>{articleType.icon}</span>
                            {articleType.label}
                            {article.questions.length > 0 && (
                              <span className='opacity-70 ml-1'>
                                ({article.questions.length}题)
                              </span>
                            )}
                          </span>
                        </div>

                        <div className='flex-grow'>
                          <h3 className='text-lg font-black text-gray-800 mb-3 leading-snug group-hover:text-indigo-600 transition-colors line-clamp-2'>
                            {article.title}
                          </h3>
                          <p className='text-gray-500 text-sm leading-relaxed line-clamp-3'>
                            {article.description ||
                              article.content.substring(0, 100) + '...'}
                          </p>
                        </div>

                        <div className='mt-6 pt-4 border-t border-gray-100 flex justify-between items-center'>
                          <span className='text-xs font-bold text-gray-400'>
                            {dateStr}
                          </span>
                          <span className='text-sm font-black text-indigo-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform'>
                            {article.questions.length > 0
                              ? '开始挑战'
                              : '开始阅读'}{' '}
                            <span className='text-lg'>→</span>
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
