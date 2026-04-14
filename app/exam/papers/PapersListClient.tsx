'use client'

import Link from 'next/link'

import type { ExamHubLevelSummary } from '@/lib/repositories/exam'

type Props = {
  levels: ExamHubLevelSummary[]
  totalPaperCount: number
}

export default function PapersListClient({ levels, totalPaperCount }: Props) {
  const getLanguageLabel = (value: string | null) => (value || '未设置').trim()
  const getLevelLabel = (value: string | null) => (value || '未设置').trim()

  const groupByLanguageAndLevel = (papers: ExamHubLevelSummary['papers']) => {
    const languageMap = new Map<
      string,
      Map<string, ExamHubLevelSummary['papers']>
    >()
    for (const paper of papers) {
      const language = getLanguageLabel(paper.language)
      const level = getLevelLabel(paper.level)
      if (!languageMap.has(language)) {
        languageMap.set(language, new Map())
      }
      const levelMap = languageMap.get(language)!
      const bucket = levelMap.get(level) || []
      bucket.push(paper)
      levelMap.set(level, bucket)
    }
    return Array.from(languageMap.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], 'zh-CN'),
    )
  }

  return (
    <div className='min-h-screen bg-slate-50 font-sans pb-12'>
      <div className='sticky top-0 z-10 flex items-center border-b border-slate-200/80 bg-white/95 px-6 py-4 backdrop-blur'>
        <Link
          href='/exam'
          className='ui-btn ui-btn-sm -ml-2 w-9 px-0 text-slate-500'>
          ←
        </Link>
        <h1 className='ml-3 text-xl font-bold tracking-tight text-slate-900'>
          全部试卷
        </h1>
        <div className='ml-4 flex items-center gap-2'>
          <Link href='/exam/papers/custom' className='ui-btn ui-btn-sm'>
            自定义抽题
          </Link>
          <Link href='/manage/exam/papers' className='ui-btn ui-btn-sm'>
            去管理
          </Link>
        </div>
        <div className='ml-auto flex items-center gap-3'>
          <span className='ui-tag'>
            共 {totalPaperCount} 套
          </span>
        </div>
      </div>

      <div className='mx-auto max-w-6xl space-y-10 p-6'>
        {levels.map(level => (
          <section key={level.id} className='scroll-mt-20'>
            <div className='mb-4 flex items-center gap-2'>
              <div className='h-6 w-1.5 rounded-full bg-slate-900'></div>
              <h2 className='flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900'>
                {level.title}
                <span className='ui-tag'>
                  {level.papers.length} 套
                </span>
              </h2>
            </div>

            <div className='space-y-8'>
              {groupByLanguageAndLevel(level.papers).map(([language, levelMap]) => (
                <section key={`${level.id}-${language}`} className='space-y-4'>
                  <div className='flex items-center gap-2'>
                    <h3 className='text-sm font-semibold text-slate-700'>
                      语言：{language}
                    </h3>
                    <span className='ui-tag'>
                      {Array.from(levelMap.values()).reduce(
                        (sum, papers) => sum + papers.length,
                        0,
                      )}{' '}
                      套
                    </span>
                  </div>

                  {Array.from(levelMap.entries())
                    .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
                    .map(([paperLevel, papers]) => (
                      <div key={`${level.id}-${language}-${paperLevel}`} className='space-y-3'>
                        <div className='text-xs font-semibold tracking-wide text-slate-500'>
                          等级：{paperLevel}
                        </div>
                        <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
                          {papers.map(paper => (
                            <article
                              key={paper.id}
                              className='rounded-[18px] bg-white p-5 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'>
                              <div className='mb-3 flex items-start justify-between gap-3'>
                                <h3 className='line-clamp-2 text-lg font-bold leading-snug tracking-tight text-slate-900'>
                                  {paper.name}
                                </h3>
                                <span className='text-xs font-semibold text-slate-500'>
                                  模块 {paper.moduleCount} · 总题 {paper.questionCount}
                                </span>
                              </div>
                              <div className='mb-3 flex flex-wrap gap-2 text-[11px] font-semibold'>
                                <span className='ui-tag'>
                                  做题 {paper.attemptCount} 次
                                </span>
                                <span className='ui-tag'>
                                  总体正确率{' '}
                                  {paper.attemptAccuracyPct !== null
                                    ? `${paper.attemptAccuracyPct}%`
                                    : '--'}
                                </span>
                              </div>
                              <div className='mb-3 flex flex-wrap gap-2 text-[11px] font-semibold'>
                                <span className='ui-tag'>
                                  语言: {paper.language || '未设置'}
                                </span>
                                <span className='ui-tag'>
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
                                    className='ui-btn ui-btn-sm'>
                                    查看详情
                                  </Link>
                                  <Link
                                    href={`/exam/papers/${encodeURIComponent(paper.id)}/do`}
                                    className='ui-btn ui-btn-sm ui-btn-primary'>
                                    开始答题
                                  </Link>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ))}
                </section>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
