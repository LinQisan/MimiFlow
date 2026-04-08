'use client'

import Link from 'next/link'

import type { ExamHubLevelSummary } from '@/lib/repositories/exam.repo'

type Props = {
  levels: ExamHubLevelSummary[]
  totalPaperCount: number
}

export default function PapersListClient({ levels, totalPaperCount }: Props) {
  return (
    <div className='min-h-screen bg-slate-50 font-sans pb-12'>
      <div className='sticky top-0 z-10 flex items-center border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur'>
        <Link
          href='/exam'
          className='p-2 -ml-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600'>
          ←
        </Link>
        <h1 className='ml-2 text-xl font-bold text-slate-800'>全部试卷</h1>
        <Link
          href='/exam/papers/custom'
          className='ml-4 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100'>
          自定义抽题
        </Link>
        <Link
          href='/manage/exam/papers'
          className='ml-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50'>
          去管理
        </Link>
        <div className='ml-auto flex items-center gap-3'>
          <span className='rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600'>
            共 {totalPaperCount} 套
          </span>
        </div>
      </div>

      <div className='mx-auto max-w-6xl space-y-10 p-6'>
        {levels.map(level => (
          <section key={level.id} className='scroll-mt-20'>
            <div className='mb-4 flex items-center gap-2'>
              <div className='h-6 w-1.5 rounded-full bg-blue-500'></div>
              <h2 className='flex items-center gap-2 text-xl font-bold text-slate-900'>
                {level.title}
                <span className='rounded-md bg-slate-100 px-2 py-0.5 text-sm font-normal text-slate-500'>
                  {level.papers.length} 套
                </span>
              </h2>
            </div>

            <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
              {level.papers.map(paper => (
                <article
                  key={paper.id}
                  className='border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-200'>
                  <div className='mb-3 flex items-start justify-between gap-3'>
                    <h3 className='line-clamp-2 text-lg font-bold leading-snug text-slate-900'>
                      {paper.name}
                    </h3>
                    <span className='text-xs font-semibold text-slate-500'>
                      模块 {paper.moduleCount} · 总题 {paper.questionCount}
                    </span>
                  </div>
                  <div className='mb-3 flex flex-wrap gap-2 text-[11px] font-semibold'>
                    <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600'>
                      语言: {paper.language || '未设置'}
                    </span>
                    <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600'>
                      等级: {paper.level || '未设置'}
                    </span>
                  </div>
                  {paper.description ? (
                    <p className='line-clamp-2 text-xs leading-relaxed text-slate-500'>
                      {paper.description}
                    </p>
                  ) : null}

                  <div className='mt-4 border-t border-slate-100 pt-4'>
                    <div className='mb-3 text-[13px] font-medium text-slate-500'>
                      {paper.passageCount} 阅读 · {paper.lessonCount} 听力 ·{' '}
                      {paper.quizQuestionCount} 语法
                    </div>
                    <div className='flex items-center gap-2'>
                      <Link
                        href={`/exam/papers/${encodeURIComponent(paper.id)}`}
                        className='inline-flex h-9 items-center border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700'>
                        查看详情
                      </Link>
                      <Link
                        href={`/exam/papers/${encodeURIComponent(paper.id)}/do`}
                        className='inline-flex h-9 items-center bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700'>
                        开始答题
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
