'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import type { ExamHubLevelSummary } from '@/lib/repositories/exam'
import { getPaperQuestionBreakdown } from '@/modules/practice/domain/paper-library'
import PaperAttributeForm from '@/modules/practice/components/PaperAttributeForm'

type Props = {
  levels: ExamHubLevelSummary[]
}

export default function ManagePapersListClient({ levels }: Props) {
  const [query, setQuery] = useState('')
  const [expandedPaperId, setExpandedPaperId] = useState<string | null>(null)
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

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-6'>
      <div className='mx-auto max-w-5xl space-y-5'>
        <div className='flex items-center justify-between gap-3'>
          <p className='ui-meta'>{levels.reduce((sum, level) => sum + level.papers.length, 0)} 套试卷</p>
          <Link
            href='/manage/import?language=ja&scope=paper&type=questions'
            className='ui-btn ui-btn-sm ui-btn-primary'>
            导入题目
          </Link>
        </div>

        <input
          type='search'
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder='搜索试卷'
          aria-label='搜索试卷'
          className='h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
        />

        {filteredLevels.length === 0 ? (
          <p className='ui-empty'>
            暂无试卷
          </p>
        ) : (
          filteredLevels.map(level => (
            <section key={level.id} className='space-y-2'>
              <div className='flex items-center gap-2'>
                <h2 className='ui-section-head'>{level.title}</h2>
                <span className='ui-meta'>{level.papers.length}</span>
              </div>

              <div className='space-y-7'>
                {level.papers.map(paper => {
                  const isExpanded = expandedPaperId === paper.id
                  const breakdown = getPaperQuestionBreakdown(paper)

                  return (
                    <article
                      key={paper.id}
                      className='py-3'>
                      <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
                        <div className='min-w-0 flex-1'>
                          <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400'>
                            <span>{paper.language || '未设置语言'}</span>
                            <span>{paper.level || '未设置等级'}</span>
                            <span>{paper.moduleCount} 模块</span>
                            <span>{paper.questionCount} 题</span>
                          </div>
                          <h3 className='mt-0.5 truncate font-bold text-slate-900'>
                            {paper.name}
                          </h3>
                          <div className='mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500'>
                            {breakdown.map(item => (
                              <span key={item.label}>
                                {item.label} {item.value}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className='flex shrink-0 gap-2'>
                          <a
                            href={`/api/manage/practice/${encodeURIComponent(paper.id)}/export`}
                            target='_blank'
                            rel='noreferrer'
                            className='ui-btn ui-btn-sm'
                            title='下载试题、答案、听力原文和音频压缩包'>
                            导出 ZIP
                          </a>
                          <Link
                            href={`/manage/practice/${encodeURIComponent(paper.id)}`}
                            prefetch={false}
                            className='ui-btn ui-btn-sm ui-btn-primary'>
                            编辑
                          </Link>
                          <button
                            type='button'
                            onClick={() =>
                              setExpandedPaperId(isExpanded ? null : paper.id)
                            }
                            className='ui-btn ui-btn-sm'>
                            {isExpanded ? '收起' : '设置'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className='mt-3 pt-3'>
                          <PaperAttributeForm
                            paperId={paper.id}
                            defaultTitle={paper.name}
                            defaultDescription={paper.description || ''}
                            defaultLanguage={paper.language || ''}
                            defaultLevel={paper.level || ''}
                            defaultParentId={paper.parentId || ''}
                            defaultSortOrder={paper.sortOrder}
                            defaultCollectionType={paper.collectionType}
                          />
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  )
}
