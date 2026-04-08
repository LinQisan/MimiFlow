import { notFound } from 'next/navigation'
import Link from 'next/link'
import { findPaperDetailById } from '@/lib/repositories/exam.repo'

function getQuizType(TypeParam: string | null) {
  if (TypeParam === 'PRONUNCIATION') {
    return '读音题'
  }
  if (TypeParam === 'FILL_BLANK') {
    return '语法题'
  }
  if (TypeParam === 'SYNONYM_REPLACEMENT') {
    return '同义词替换'
  }
  if (TypeParam === 'SORTING') {
    return '排序题'
  }
  if (TypeParam === 'WORD_DISTINCTION') {
    return '词汇辨析'
  }
  if (TypeParam === 'GRAMMAR') {
    return '语法题'
  }
  return TypeParam
}

export default async function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const paper = await findPaperDetailById(id)
  // 2. 错误处理：如果数据库中找不到该试卷，返回 404 页面
  if (!paper) {
    notFound()
  }

  // 3. 渲染页面内容
  return (
    <div className='mx-auto max-w-5xl p-4 md:p-6'>
      <header className='mb-6 border border-slate-200 bg-white p-5 md:p-6'>
        <p className='mb-2 text-xs font-bold uppercase tracking-wider text-blue-600'>
          试卷详情
        </p>
        <h1 className='mb-2 text-2xl font-black text-slate-900 md:text-3xl'>
          {paper.name}
        </h1>
        <div className='mb-3 flex flex-wrap gap-2 text-xs font-semibold'>
          <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600'>
            类型: {paper.collectionType}
          </span>
          <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600'>
            语言: {paper.language || '未设置'}
          </span>
          <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600'>
            等级: {paper.level || '未设置'}
          </span>
          <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600'>
            排序: {paper.sortOrder}
          </span>
        </div>
        {paper.description && (
          <p className='text-slate-600'>{paper.description}</p>
        )}
        <p className='mt-2 text-[11px] font-medium text-slate-400'>
          更新于 {paper.updatedAt.toLocaleString('zh-CN')}
        </p>
        <div className='mt-4 flex flex-wrap items-center gap-2'>
          <Link
            href='/exam/papers'
            className='inline-flex h-10 items-center border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100'>
            返回试卷列表
          </Link>
          <Link
            href={`/exam/papers/${encodeURIComponent(paper.id)}/do`}
            className='inline-flex h-10 items-center bg-blue-600 px-5 text-sm font-bold text-white transition-colors hover:bg-blue-700'>
            开始答题
          </Link>
        </div>
      </header>

      {/* 文字·词汇·语法 */}
      {paper.quizzes.length > 0 && (
        <section className='mt-8'>
          <div className='flex items-center gap-2 mb-6'>
            <div className='w-1.5 h-6 bg-blue-600 rounded-sm'></div>
            <h2 className='text-xl font-bold text-gray-800'>文字·词汇·语法</h2>
          </div>

          <div className='space-y-6'>
            {paper.quizzes.map(quiz => {
              const questionCount = quiz.questions.length

              return (
                <div
                  key={quiz.id}
                  className='bg-white p-6 border border-gray-200 rounded-xl shadow-sm'>
                  <div className='flex justify-between items-center mb-5 pb-3 border-b border-gray-100'>
                    <div>
                      <h3 className='text-lg font-bold text-gray-800'>
                        {quiz.title}
                      </h3>
                      <span className='text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full inline-block mt-2'>
                        共 {questionCount} 题
                      </span>
                    </div>
                  </div>

                  <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'>
                    {quiz.questions.map((question, index) => (
                      <Link
                        href={`/exam/papers/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                        key={question.id}
                        /* 预设了按钮的交互样式 (hover, cursor-pointer, transition)
                  后续你只需把最外层的 div 换成 Next.js 的 <Link href={`/question/${question.id}`}> 即可 
                */
                        className='group flex flex-col p-3 border border-gray-200 rounded-lg bg-gray-50 hover:bg-blue-50 hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all duration-200'>
                        {/* 题号 */}
                        <span className='text-xs font-medium text-gray-400 mb-1 group-hover:text-blue-400 transition-colors'>
                          第 {index + 1} 题
                        </span>

                        {/* 题型标签 */}
                        <span className='text-sm font-semibold text-gray-700 group-hover:text-blue-700 transition-colors'>
                          {getQuizType(question.questionType)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
      <section>
        {paper.lessons.length > 0 && (
          <section className='mt-8'>
            <div className='flex items-center gap-2 mb-6'>
              <div className='w-1.5 h-6 bg-blue-600 rounded-sm'></div>
              <h2 className='text-xl font-bold text-gray-800'>听力理解</h2>
            </div>

            {paper.lessons.length > 0 ? (
              <div className='space-y-6'>
                {paper.lessons.map(lesson => {
                  const questions = lesson.questions || []
                  const questionCount = questions.length

                  return (
                    <div
                      key={lesson.id}
                      className='bg-white p-6 border border-gray-200 rounded-xl shadow-sm'>
                      {/* 听力头部信息：简化，移除图标 */}
                      <div className='flex justify-between items-center mb-5 pb-4 border-b border-gray-100 gap-4'>
                        <div className='flex-1'>
                          <h3 className='text-lg font-bold text-gray-800'>
                            {lesson.title}
                          </h3>
                          <span className='mt-2 inline-block shrink-0 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1 rounded-full border border-blue-200'>
                            共 {questionCount} 题
                          </span>
                        </div>
                      </div>

                      {/* 题目网格布局：移除题型，改为紧凑的答题卡样式按钮 */}
                      {questionCount > 0 ? (
                        <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3'>
                          {questions.map((question, index) => (
                            <Link
                              key={question.id}
                              href={`/exam/papers/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                              className='group flex items-center justify-center py-2.5 px-2 border border-gray-200 rounded-lg bg-gray-50 hover:bg-blue-50 hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all duration-200'>
                              <span className='text-sm font-medium text-gray-600 group-hover:text-blue-600 transition-colors'>
                                第 {index + 1} 题
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className='text-sm text-gray-400 italic'>暂无题目</p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className='text-gray-500 italic mt-4'>暂无听力内容</p>
            )}
          </section>
        )}

        {paper.passages.length > 0 && (
          <section className='mt-8'>
            <div className='flex items-center gap-2 mb-6'>
              <div className='w-1.5 h-6 bg-blue-600 rounded-sm'></div>
              <h2 className='text-xl font-bold text-gray-800'>阅读理解</h2>
            </div>

            <div className='space-y-6'>
              {paper.passages.map(passage => {
                const questions = passage.questions || []
                const questionCount = questions.length

                return (
                  <div
                    key={passage.id}
                    className='bg-white p-6 border border-gray-200 rounded-xl shadow-sm'>
                    {/* 文章头部信息 */}
                    <div className='flex justify-between items-start mb-5 pb-4 border-b border-gray-100 gap-4'>
                      <div className='flex-1'>
                        <h3 className='text-lg font-bold text-gray-800 mb-2'>
                          {passage.title}
                        </h3>
                        <p className='line-clamp-2 text-sm text-gray-500 leading-relaxed'>
                          {passage.content}
                        </p>
                      </div>
                      {/* 统一为蓝色徽标 */}
                      <span className='shrink-0 bg-blue-50 text-blue-700 text-xs font-medium px-3 py-1 rounded-full border border-blue-200 mt-1'>
                        共 {questionCount} 题
                      </span>
                    </div>
                    {/* 题目网格布局：因为不需要题型，改为更紧凑的答题卡样式按钮 */}
                    {questionCount > 0 ? (
                      <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3'>
                        {questions.map((question, index) => (
                          <Link
                            href={`/exam/papers/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                            key={question.id}
                            className='group flex items-center justify-center py-2.5 px-2 border border-gray-200 rounded-lg bg-gray-50 hover:bg-blue-50 hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all duration-200'>
                            <span className='text-sm font-medium text-gray-600 group-hover:text-blue-600 transition-colors'>
                              第 {index + 1} 题
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className='text-sm text-gray-400 italic'>
                        暂无关联题目
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </section>
    </div>
  )
}
