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
      style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
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
      style: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    }
  } else if (hasFillBlank) {
    return {
      label: '完形填空',
      style: 'bg-amber-50 text-amber-700 border-amber-200',
    }
  } else {
    return {
      label: '阅读理解',
      style: 'bg-sky-50 text-sky-700 border-sky-200',
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
    <div className='min-h-screen bg-gray-50 px-4 pb-28 pt-4 md:px-8 md:pt-8'>
      <div className='mx-auto max-w-7xl'>
        <section className='mb-8 border-b border-gray-200 pb-4 md:pb-5'>
          <h1 className='mb-2 text-3xl font-bold tracking-tight text-gray-900 md:text-4xl'>
            阅读
          </h1>
          <p className='text-sm font-medium text-gray-500 md:text-base'>
            沉浸式阅读与实战演练，提升你的语感与理解力。
          </p>
        </section>

        {articles.length === 0 ? (
          <div className='border-b border-dashed border-gray-300 py-16 text-center'>
            <h3 className='mb-2 text-xl font-bold text-gray-700'>暂无文章</h3>
            <p className='text-gray-500'>当前还没有可阅读内容</p>
          </div>
        ) : (
          <div className='space-y-6'>
            {groupedArticles.map(group => (
              <section
                key={group.categoryName}
                className='border-b border-gray-200 pb-4 md:pb-6'>
                <div className='mb-5 flex items-center justify-between'>
                  <h2 className='text-lg font-black text-gray-800 md:text-xl'>
                    {group.categoryName}
                  </h2>
                  <span className='ui-tag ui-tag-muted'>
                    {group.items.length} 篇
                  </span>
                </div>

                <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
                  {group.items.map(article => {
                    const articleType = detectArticleType(article.questions)

                    return (
                      <Link
                        href={`/articles/${article.id}`}
                        key={article.id}
                        className='group flex flex-col border-b border-gray-200 px-1 py-4 transition-colors hover:bg-gray-50'>
                        <div className='mb-4 flex justify-end'>
                          <span
                            className={`ui-tag ${articleType.style}`}>
                            {articleType.label}
                            {article.questions.length > 0 && (
                              <span className='ml-1 opacity-70'>
                                ({article.questions.length}题)
                              </span>
                            )}
                          </span>
                        </div>

                        <div className='flex-grow'>
                          <h3 className='mb-2 line-clamp-2 text-lg font-semibold leading-snug text-gray-800 transition-colors group-hover:text-indigo-600'>
                            {article.title}
                          </h3>
                          <p className='line-clamp-3 text-sm leading-relaxed text-gray-500'>
                            {article.description ||
                              article.content.substring(0, 100) + '...'}
                          </p>
                        </div>

                        <div className='mt-4 flex items-center justify-end pt-2'>
                          <span className='text-sm font-semibold text-indigo-600 transition-colors group-hover:text-indigo-700'>
                            {article.questions.length > 0
                              ? '开始挑战'
                              : '开始阅读'}
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
