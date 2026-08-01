'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import type { ExamHubLevelSummary } from '@/lib/repositories/exam'
import PaperAttributeForm from '@/app/(study)/practice/PaperAttributeForm'
import PaperAdminPanel from '@/app/(study)/practice/PaperAdminPanel'
import { formatTokyoDateTime } from '@/utils/time/format'

type Props = {
  levels: ExamHubLevelSummary[]
  totalPaperCount: number
}

export default function ManagePapersListClient({
  levels,
  totalPaperCount,
}: Props) {
  const [query, setQuery] = useState('')
  const [expandedPaperId, setExpandedPaperId] = useState<string | null>(null)
  const allPapers = useMemo(
    () => levels.flatMap(level => level.papers),
    [levels],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredLevels = useMemo(
    () =>
      levels
        .map(level => ({
          ...level,
          papers: level.papers.filter(paper => {
            if (!normalizedQuery) return true
            return [
              paper.name,
              paper.description,
              paper.language,
              paper.level,
              String(paper.sortOrder),
            ]
              .filter(Boolean)
              .some(value =>
                String(value).toLowerCase().includes(normalizedQuery),
              )
          }),
        }))
        .filter(level => level.papers.length > 0),
    [levels, normalizedQuery],
  )
  const visiblePaperCount = filteredLevels.reduce(
    (sum, level) => sum + level.papers.length,
    0,
  )
  const totalQuestionCount = allPapers.reduce(
    (sum, paper) => sum + paper.questionCount,
    0,
  )
  const totalListeningSections = allPapers.reduce(
    (sum, paper) => sum + paper.listeningSectionCount,
    0,
  )
  const totalAttempts = allPapers.reduce(
    (sum, paper) => sum + paper.attemptCount,
    0,
  )

  return (
    <div className='min-h-screen bg-slate-50 pb-12 font-sans text-slate-900'>
      <section className='border-b border-slate-200 bg-white'>
        <div className='mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 md:px-6 md:py-6'>
          <div className='flex flex-wrap items-center gap-2'>
            <div>
              <h1 className='text-2xl font-black tracking-tight text-slate-900 md:text-3xl'>
                试卷管理
              </h1>
              <p className='mt-1 text-sm text-slate-500'>
                只维护正式试卷的分区、材料和题目。
              </p>
            </div>
            <div className='ml-auto flex flex-wrap items-center gap-2'>
              <Link href='/manage/import?type=questions' className='ui-btn ui-btn-primary ui-btn-sm'>
                导入题目
              </Link>
              <Link href='/practice' className='ui-btn ui-btn-sm'>
                查看练习页
              </Link>
            </div>
          </div>

          <div className='grid gap-2 sm:grid-cols-[minmax(240px,1fr)_auto]'>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder='搜索试卷名 / 语言 / 等级 / 描述'
              className='h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
            />
            <button
              type='button'
              onClick={() => setQuery('')}
              className='ui-btn h-10'>
              清除搜索
            </button>
          </div>
          <p className='text-xs font-semibold text-slate-500'>
            {visiblePaperCount} / {totalPaperCount} 套 · {totalQuestionCount} 题 · {totalListeningSections} 个听力部分 · {totalAttempts} 次作答
          </p>
        </div>
      </section>

      <main className='mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6'>
        {filteredLevels.length === 0 ? (
          <section className='border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-medium text-slate-500'>
            没有匹配的试卷。
          </section>
        ) : (
          filteredLevels.map(level => (
            <section key={level.id} className='scroll-mt-32'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <div>
                  <h2 className='text-base font-black tracking-tight text-slate-900'>
                    {level.title}
                  </h2>
                  <p className='text-xs font-medium text-slate-500'>
                    {level.papers.length} 套内容
                  </p>
                </div>
              </div>

              <div className='space-y-3'>
                {level.papers.map(paper => {
                  const isExpanded = expandedPaperId === paper.id
                  const accuracy =
                    paper.attemptAccuracyPct == null
                      ? '--'
                      : `${paper.attemptAccuracyPct}%`

                  return (
                    <article
                      key={paper.id}
                      className='rounded-xl border border-slate-200 bg-white shadow-sm'>
                      <div className='grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]'>
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-start justify-between gap-3'>
                            <div className='min-w-0'>
                              <div className='mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500'>
                                <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1'>
                                  正式试卷
                                </span>
                                <span>{paper.language || '语言未设置'}</span>
                                <span>{paper.level || '等级未设置'}</span>
                                <span>排序 {paper.sortOrder}</span>
                              </div>
                              <h3 className='line-clamp-2 text-lg font-black leading-snug text-slate-900'>
                                {paper.name}
                              </h3>
                              {paper.description ? (
                                <p className='mt-1 line-clamp-2 text-sm leading-6 text-slate-600'>
                                  {paper.description}
                                </p>
                              ) : (
                                <p className='mt-1 text-sm font-medium text-slate-400'>
                                  暂无描述
                                </p>
                              )}
                            </div>
                            <div className='text-right text-xs font-semibold text-slate-500'>
                              <div>{paper.moduleCount} 模块</div>
                              <div>{paper.questionCount} 题</div>
                            </div>
                          </div>

                          <div className='mt-4 grid grid-cols-3 gap-2'>
                            <StructureTile
                              label='文字语法'
                              primary={`${paper.quizQuestionCount} 题`}
                              secondary={`${paper.quizCount} 模块`}
                            />
                            <StructureTile
                              label='听力'
                              primary={`${paper.listeningSectionCount} 部分`}
                              secondary={`${paper.lessonQuestionCount} 题 / ${paper.lessonCount} 音频`}
                            />
                            <StructureTile
                              label='阅读'
                              primary={`${paper.passageCount} 篇`}
                              secondary={`${paper.questionCount -
                                paper.quizQuestionCount -
                                paper.lessonQuestionCount} 题`}
                            />
                          </div>

                          {paper.manageSections.length > 0 && (
                            <div className='mt-4 border border-slate-200 bg-white p-3'>
                              <div className='mb-2 text-xs font-black text-slate-700'>
                                进入各部分修改
                              </div>
                              <div className='flex flex-wrap gap-2'>
                                {paper.manageSections.map(section => (
                                  <Link
                                    key={section.key}
                                    href={`/manage/practice/${encodeURIComponent(
                                      paper.id,
                                    )}?section=${encodeURIComponent(section.key)}`}
                                    className='inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'>
                                    <span>{section.label}</span>
                                    <span className='font-semibold text-slate-400'>
                                      {section.detail}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <aside className='border border-slate-200 bg-slate-50 p-3'>
                          <div className='grid grid-cols-2 gap-2 text-xs'>
                            <Info label='正确率' value={accuracy} />
                            <Info label='作答' value={`${paper.attemptCount} 次`} />
                          </div>
                          <div className='mt-3 grid grid-cols-2 gap-2'>
                            <Link
                              href={`/manage/practice/${encodeURIComponent(paper.id)}`}
                              className='ui-btn ui-btn-primary h-9 justify-center text-sm'>
                              编辑结构
                            </Link>
                            <Link
                              href={`/practice/${encodeURIComponent(paper.id)}`}
                              className='ui-btn h-9 justify-center text-sm'>
                              预览
                            </Link>
                            <Link
                              href={`/practice/${encodeURIComponent(paper.id)}/do`}
                              className='ui-btn h-9 justify-center text-sm'>
                              作答
                            </Link>
                            <button
                              type='button'
                              onClick={() =>
                                setExpandedPaperId(isExpanded ? null : paper.id)
                              }
                              className='ui-btn h-9 justify-center text-sm'>
                              {isExpanded ? '收起元信息' : '元信息'}
                            </button>
                          </div>
                        </aside>
                      </div>

                      {isExpanded && (
                        <div className='border-t border-slate-200 bg-white p-4'>
                          <div className='mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-400'>
                            试卷信息与管理
                          </div>
                          <PaperAttributeForm
                            paperId={paper.id}
                            defaultTitle={paper.name}
                            defaultDescription={paper.description || ''}
                            defaultLanguage={paper.language || ''}
                            defaultLevel={paper.level || ''}
                            defaultParentId={paper.parentId || ''}
                            defaultSortOrder={paper.sortOrder}
                            createdAt={formatTokyoDateTime(paper.createdAt)}
                            updatedAt={formatTokyoDateTime(paper.updatedAt)}
                            defaultCollectionType={paper.collectionType}
                          />
                          <PaperAdminPanel paperId={paper.id} />
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  )
}

function StructureTile({
  label,
  primary,
  secondary,
}: {
  label: string
  primary: string
  secondary: string
}) {
  return (
    <div className='min-w-0 border border-slate-200 bg-slate-50 p-2.5 md:p-3'>
      <div className='text-xs font-bold text-slate-500'>{label}</div>
      <div className='mt-1 text-sm font-black text-slate-900'>{primary}</div>
      <div className='mt-0.5 text-xs font-medium text-slate-500'>
        {secondary}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0 border border-slate-200 bg-white px-2.5 py-2'>
      <div className='text-[11px] font-bold text-slate-400'>{label}</div>
      <div className='mt-1 truncate text-xs font-semibold text-slate-700'>
        {value}
      </div>
    </div>
  )
}
