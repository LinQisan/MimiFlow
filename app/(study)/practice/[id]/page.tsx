// Practice paper overview.
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { findPaperDetailById } from '@/lib/repositories/exam'

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

  const listeningSections = Array.from(
    paper.lessons
      .flatMap(lesson =>
        (lesson.questions || []).map(question => ({
          ...question,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          audioFile: lesson.audioFile,
          sectionKey: question.sectionKey || 'listening',
          sectionTitle: question.sectionTitle || '听力',
          sectionNumber: question.sectionNumber || null,
        })),
      )
      .reduce<
        Map<
          string,
          {
            key: string
            title: string
            sectionNumber: number | null
            questions: Array<{
              id: string
              lessonId: string
              lessonTitle: string
              audioFile: string | null
              prompt: string | null
              contextSentence: string | null
              sectionKey: string
              sectionTitle: string
              sectionNumber: number | null
            }>
          }
        >
      >((acc, question) => {
        const key = question.sectionKey
        const existing =
          acc.get(key) ||
          {
            key,
            title: question.sectionTitle,
            sectionNumber: question.sectionNumber,
            questions: [],
          }
        existing.questions.push(question)
        acc.set(key, existing)
        return acc
      }, new Map())
      .values(),
  ).sort((a, b) => {
    const aNumber = a.sectionNumber || Number.MAX_SAFE_INTEGER
    const bNumber = b.sectionNumber || Number.MAX_SAFE_INTEGER
    if (aNumber !== bNumber) return aNumber - bNumber
    return a.title.localeCompare(b.title, 'zh-CN')
  })

  // 3. 渲染页面内容
  return (
    <div className='mx-auto max-w-5xl p-4 md:p-6'>
      <header className='mb-6 rounded-[20px] bg-white p-5 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:p-6'>
        <p className='mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500'>
          试卷详情
        </p>
        <h1 className='mb-2 text-2xl font-black tracking-tight text-slate-900 md:text-3xl'>
          {paper.name}
        </h1>
        <div className='mb-3 flex flex-wrap gap-2 text-xs font-semibold'>
          <span className='ui-tag'>
            类型: {paper.collectionType}
          </span>
          <span className='ui-tag'>
            语言: {paper.language || '未设置'}
          </span>
          <span className='ui-tag'>
            等级: {paper.level || '未设置'}
          </span>
          <span className='ui-tag'>
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
            href='/practice'
            className='ui-btn'>
            返回试卷列表
          </Link>
          <Link
            href={`/practice/${encodeURIComponent(paper.id)}/do`}
            className='ui-btn ui-btn-primary'>
            开始答题
          </Link>
        </div>
      </header>

      {/* 文字·词汇·语法 */}
      {paper.quizzes.length > 0 && (
        <section className='mt-8'>
          <div className='flex items-center gap-2 mb-6'>
            <div className='h-6 w-1.5 rounded-full bg-slate-900'></div>
            <h2 className='text-xl font-bold tracking-tight text-slate-900'>
              文字·词汇·语法
            </h2>
          </div>

          <div className='space-y-6'>
            {paper.quizzes.map(quiz => {
              const questionCount = quiz.questions.length

              return (
                <div
                  key={quiz.id}
                  className='rounded-[18px] bg-white p-6 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
                  <div className='mb-5 flex items-center justify-between gap-3 border-b border-slate-100 pb-3'>
                    <div>
                      <h3 className='text-lg font-bold tracking-tight text-slate-900'>
                        {quiz.title}
                      </h3>
                      <span className='ui-tag mt-2 inline-flex'>
                        共 {questionCount} 题
                      </span>
                    </div>
                  </div>

                  <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'>
                    {quiz.questions.map((question, index) => (
                      <Link
                        href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                        key={question.id}
                        className='group flex flex-col rounded-xl bg-slate-50 p-3 shadow-[inset_0_1px_1px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'>
                        <span className='mb-1 text-xs font-medium text-slate-400 transition-colors group-hover:text-slate-600'>
                          第 {index + 1} 题
                        </span>

                        <span className='text-sm font-semibold text-slate-700 transition-colors group-hover:text-slate-900'>
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
      {listeningSections.length > 0 && (
        <section className='mt-8'>
          <div className='mb-6 flex items-center gap-2'>
            <div className='h-6 w-1.5 rounded-full bg-slate-900'></div>
            <h2 className='text-xl font-bold tracking-tight text-slate-900'>
              听力理解
            </h2>
          </div>

          <div className='space-y-6'>
            {listeningSections.map((section, sectionIndex) => {
              const questionCount = section.questions.length
              const firstQuestion = section.questions[0]

              return (
                <div
                  key={section.key}
                  className='rounded-[18px] bg-white p-6 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
                  <div className='mb-5 flex items-center justify-between gap-4 border-b border-slate-100 pb-4'>
                    <div className='flex-1'>
                      <p className='mb-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400'>
                        听力部分 {sectionIndex + 1}
                      </p>
                      <h3 className='text-lg font-bold tracking-tight text-slate-900'>
                        {section.title}
                      </h3>
                      <div className='mt-2 flex flex-wrap gap-2'>
                        <span className='ui-tag inline-flex shrink-0'>
                          {questionCount} 道题
                        </span>
                        <span className='ui-tag inline-flex shrink-0'>
                          每题独立音频
                        </span>
                      </div>
                    </div>
                    {firstQuestion && (
                      <Link
                        href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(firstQuestion.id)}`}
                        className='ui-btn ui-btn-primary shrink-0'>
                        进入本部分
                      </Link>
                    )}
                  </div>

                  {questionCount > 0 ? (
                    <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'>
                      {section.questions.map((question, index) => (
                        <Link
                          key={question.id}
                          href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                          className='group rounded-xl bg-slate-50 px-3 py-3 shadow-[inset_0_1px_1px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'>
                          <span className='block text-xs font-semibold text-slate-400 transition-colors group-hover:text-slate-600'>
                            第 {index + 1} 题
                          </span>
                          <span className='mt-1 block truncate text-sm font-medium text-slate-700 transition-colors group-hover:text-slate-900'>
                            {question.prompt ||
                              question.contextSentence ||
                              question.lessonTitle ||
                              '纯听力选项题'}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className='text-sm italic text-slate-400'>暂无题目</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {paper.passages.length > 0 && (
        <section className='mt-8'>
          <div className='mb-6 flex items-center gap-2'>
            <div className='h-6 w-1.5 rounded-full bg-slate-900'></div>
            <h2 className='text-xl font-bold tracking-tight text-slate-900'>
              阅读理解
            </h2>
          </div>

          <div className='space-y-6'>
            {paper.passages.map(passage => {
              const questions = passage.questions || []
              const questionCount = questions.length

              return (
                <div
                  key={passage.id}
                  className='rounded-[18px] bg-white p-6 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
                  <div className='mb-5 flex items-start justify-between gap-4 border-b border-slate-100 pb-4'>
                    <div className='flex-1'>
                      <h3 className='mb-2 text-lg font-bold tracking-tight text-slate-900'>
                        {passage.title}
                      </h3>
                      <p className='line-clamp-2 text-sm leading-relaxed text-slate-500'>
                        {passage.content}
                      </p>
                    </div>
                    <span className='ui-tag mt-1 shrink-0'>
                      共 {questionCount} 题
                    </span>
                  </div>
                  {questionCount > 0 ? (
                    <div className='grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'>
                      {questions.map((question, index) => (
                        <Link
                          href={`/practice/${encodeURIComponent(paper.id)}/do?qid=${encodeURIComponent(question.id)}`}
                          key={question.id}
                          className='group flex items-center justify-center rounded-xl bg-slate-50 px-2 py-2.5 text-center shadow-[inset_0_1px_1px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'>
                          <span className='text-sm font-medium text-slate-600 transition-colors group-hover:text-slate-900'>
                            第 {index + 1} 题
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className='text-sm italic text-slate-400'>暂无关联题目</p>
                  )}
                </div>
              )
            })}
            </div>
          </section>
        )}
    </div>
  )
}
