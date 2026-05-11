'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import type { ExamHubLevelSummary } from '@/lib/repositories/exam'
import PaperAttributeForm from '@/app/(study)/exam/papers/PaperAttributeForm'
import PaperAdminPanel from '@/app/(study)/exam/papers/PaperAdminPanel'
import FavoriteCollectionCreateForm from '@/app/(study)/exam/papers/FavoriteCollectionCreateForm'
import { formatTokyoDateTime } from '@/utils/time/format'

type Props = {
  levels: ExamHubLevelSummary[]
  totalPaperCount: number
}

const collectionTypeLabel: Record<string, string> = {
  PAPER: '正式试卷',
  CUSTOM_GROUP: '普通集合',
  FAVORITES: '收藏夹',
}

export default function ManagePapersListClient({
  levels,
  totalPaperCount,
}: Props) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
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
            if (
              typeFilter !== 'ALL' &&
              String(paper.collectionType) !== typeFilter
            ) {
              return false
            }
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
    [levels, normalizedQuery, typeFilter],
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
      <header className='sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur'>
        <div className='mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:px-6'>
          <div className='flex flex-wrap items-center gap-2'>
            <Link
              href='/'
              className='ui-btn ui-btn-sm'
              aria-label='返回首页'
              title='返回首页'>
              ←
            </Link>
            <div>
              <h1 className='text-xl font-black tracking-tight text-slate-900'>
                试卷结构管理
              </h1>
              <p className='mt-0.5 text-xs font-medium text-slate-500'>
                按真实考试结构维护：试卷、模块、听力部分、题目。
              </p>
            </div>
            <div className='ml-auto flex flex-wrap items-center gap-2'>
              <Link href='/exam/papers' className='ui-btn ui-btn-sm'>
                查看试卷页
              </Link>
              <span className='rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600'>
                {visiblePaperCount} / {totalPaperCount} 套
              </span>
            </div>
          </div>

          <div className='grid gap-2 md:grid-cols-[minmax(240px,1fr)_180px_auto]'>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder='搜索试卷名 / 语言 / 等级 / 描述'
              className='h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
            />
            <select
              value={typeFilter}
              onChange={event => setTypeFilter(event.target.value)}
              className='h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'>
              <option value='ALL'>全部类型</option>
              <option value='PAPER'>试卷</option>
              <option value='CUSTOM_GROUP'>分组</option>
              <option value='FAVORITES'>收藏夹</option>
            </select>
            <button
              type='button'
              onClick={() => {
                setQuery('')
                setTypeFilter('ALL')
              }}
              className='ui-btn h-10'>
              重置
            </button>
          </div>
        </div>
      </header>

      <main className='mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6'>
        <section className='grid gap-3 md:grid-cols-4'>
          <Metric label='试卷' value={totalPaperCount} />
          <Metric label='总题数' value={totalQuestionCount} />
          <Metric label='听力部分' value={totalListeningSections} />
          <Metric label='作答记录' value={totalAttempts} />
        </section>

        <section className='border border-slate-200 bg-white p-4 shadow-sm'>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
            <div>
              <h2 className='text-sm font-black text-slate-900'>新建入口</h2>
              <p className='text-xs font-medium text-slate-500'>
                用集合承载一套试卷，再从上传中心或详情页维护材料与题目。
              </p>
            </div>
            <Link href='/upload' className='ui-btn ui-btn-primary ui-btn-sm'>
              去上传中心
            </Link>
          </div>
          <FavoriteCollectionCreateForm />
        </section>

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
                      className='border border-slate-200 bg-white shadow-sm'>
                      <div className='grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]'>
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-start justify-between gap-3'>
                            <div className='min-w-0'>
                              <div className='mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500'>
                                <span className='rounded border border-slate-200 bg-slate-50 px-2 py-1'>
                                  {collectionTypeLabel[String(paper.collectionType)] ||
                                    paper.collectionType}
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

                          <div className='mt-4 grid gap-2 sm:grid-cols-3'>
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
                                    href={`/papers/manage/${encodeURIComponent(
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
                            <Info
                              label='创建'
                              value={formatTokyoDateTime(paper.createdAt)}
                            />
                            <Info
                              label='更新'
                              value={formatTokyoDateTime(paper.updatedAt)}
                            />
                          </div>
                          <div className='mt-3 grid grid-cols-2 gap-2'>
                            <Link
                              href={`/papers/manage/${encodeURIComponent(paper.id)}`}
                              className='ui-btn ui-btn-primary h-9 justify-center text-sm'>
                              编辑结构
                            </Link>
                            <Link
                              href={`/exam/papers/${encodeURIComponent(paper.id)}`}
                              className='ui-btn h-9 justify-center text-sm'>
                              预览
                            </Link>
                            <Link
                              href={`/exam/papers/${encodeURIComponent(paper.id)}/do`}
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
                            Metadata
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className='border border-slate-200 bg-white p-4 shadow-sm'>
      <div className='text-xs font-bold uppercase tracking-[0.18em] text-slate-400'>
        {label}
      </div>
      <div className='mt-2 text-2xl font-black tabular-nums text-slate-900'>
        {value}
      </div>
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
    <div className='border border-slate-200 bg-slate-50 p-3'>
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
