import Link from 'next/link'

import prisma from '@/lib/prisma'
import { resolveResumeActions } from '@/lib/home/resume-actions'
import { MaterialType } from '@prisma/client'
import { getTodayStudyPlan } from '@/app/actions/studyPlan'
import HomeHeaderSearch from '@/components/search/HomeHeaderSearch'

export const revalidate = 60

type HomeContinueItem =
  | {
      kind: 'resume'
      id: string
      title: string
      metaLabel: string
      detailLabel: string
      primaryHref: string
      primaryLabel: string
      secondaryHref: string
      secondaryLabel: string
    }
  | {
      kind: 'task'
      id: string
      title: string
      metaLabel: string
      detailLabel: string
      primaryHref: string
      primaryLabel: string
      disabled?: boolean
    }

type RecentStudyRow = {
  id: string
  materialId: string
  material: {
    id: string
    title: string
    type: MaterialType
  }
  learningMode: string | null
  progressPercent: number
  lastPosition: string | null
  updatedAt: Date
}

type RecentPlaytimeRow = {
  id: string
  materialId: string
  material: {
    id: string
    title: string
    type: MaterialType
  }
  totalSeconds: number
  playedDays: number
  updatedAt: Date
}

const coreEntrances = [
  {
    title: '听力与跟读',
    desc: '字幕精听 + 跟读训练',
    href: '/shadowing',
  },
  {
    title: '套卷练习',
    desc: '整卷模拟 + 专项训练',
    href: '/exam/papers',
  },
  {
    title: '词汇复习',
    desc: '生词与例句复习',
    href: '/vocabulary',
  },
  {
    title: '语法库',
    desc: '标签归类 + 相似语法',
    href: '/grammar',
  },
  {
    title: '错题回顾',
    desc: '按记录回看薄弱点',
    href: '/review',
  },
]

const manageEntrances = [
  {
    title: '上传新内容',
    desc: '音频、文章、题目统一导入',
    href: '/manage/upload',
  },
  {
    title: '内容管理台',
    desc: '统一维护学习材料',
    href: '/manage',
  },
  {
    title: '合集管理',
    desc: '整理套卷与学习集合',
    href: '/manage/collection',
  },
  {
    title: '全局搜索',
    desc: '快速查找词句和内容',
    href: '/search',
  },
]

function SectionTitle({ title }: { title: string }) {
  return (
    <div className='mb-5 flex items-center gap-2'>
      <div className='h-5 w-1.5 rounded-full bg-slate-900' />
      <h2 className='text-lg font-semibold tracking-tight text-slate-900 md:text-xl'>
        {title}
      </h2>
    </div>
  )
}

function toTypeLabel(type: MaterialType): string {
  if (type === MaterialType.LISTENING) return '听力'
  if (type === MaterialType.READING) return '阅读'
  return '题目'
}

function defaultModeByType(type: MaterialType): string {
  if (type === MaterialType.LISTENING) return '字幕精听'
  if (type === MaterialType.READING) return '文章精读'
  return '套卷训练'
}

function toDateKeyInTokyo(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export default async function HomePage() {
  const now = new Date()
  const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
  const weekStartKey = toDateKeyInTokyo(sixDaysAgo)
  const todayKey = toDateKeyInTokyo(now)

  const examTableFlags = await prisma.$queryRaw<
    Array<{
      has_materials: boolean
      has_questions: boolean
      has_collections: boolean
      has_progresses: boolean
    }>
  >`SELECT
      to_regclass('public.materials') IS NOT NULL AS has_materials,
      to_regclass('public.questions') IS NOT NULL AS has_questions,
      to_regclass('public.collections') IS NOT NULL AS has_collections,
      to_regclass('public.material_study_progresses') IS NOT NULL AS has_progresses`

  const examTablesReady = examTableFlags[0] || {
    has_materials: false,
    has_questions: false,
    has_collections: false,
    has_progresses: false,
  }

  const [
    vocabCount,
    wrongCount,
    weekStudyAgg,
    paperCount,
    questionCount,
    todayPlan,
    recentStudyRows,
    recentPlaytimeRows,
  ] = await Promise.all([
    prisma.vocabulary.count(),
    prisma.questionRetry.count(),
    prisma.studyTimeDaily.aggregate({
      _sum: { seconds: true },
      where: {
        dateKey: {
          gte: weekStartKey,
          lte: todayKey,
        },
      },
    }),
    examTablesReady.has_collections
      ? prisma.collection.count({ where: { collectionType: 'PAPER' } })
      : Promise.resolve(0),
    examTablesReady.has_questions
      ? prisma.question.count()
      : Promise.resolve(0),
    getTodayStudyPlan(),
    examTablesReady.has_progresses && examTablesReady.has_materials
      ? prisma.materialStudyProgress.findMany({
          where: { profileId: 'default' },
          orderBy: { updatedAt: 'desc' },
          take: 6,
          include: {
            material: {
              select: {
                id: true,
                title: true,
                type: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    examTablesReady.has_progresses && examTablesReady.has_materials
      ? prisma.materialPlaytimeStat.findMany({
          where: {
            profileId: 'default',
            material: { type: MaterialType.LISTENING },
          },
          orderBy: { updatedAt: 'desc' },
          take: 6,
          include: {
            material: {
              select: {
                id: true,
                title: true,
                type: true,
              },
            },
          },
        })
      : Promise.resolve([]),
  ])

  const totalWeekSeconds = weekStudyAgg._sum.seconds || 0
  const weekHours = (totalWeekSeconds / 3600).toFixed(1)

  const studyRecords: HomeContinueItem[] = [
    ...recentStudyRows.map(row => {
      const actions = resolveResumeActions({
        type: row.material.type,
        materialId: row.material.id,
        learningMode: row.learningMode,
        progressPercent: row.progressPercent,
        lastPosition: row.lastPosition,
      })
      return {
        kind: 'resume' as const,
        id: `study-${row.id}`,
        title: row.material.title,
        metaLabel: `${toTypeLabel(row.material.type)} / ${row.learningMode || defaultModeByType(row.material.type)}`,
        detailLabel: `进度：已完成 ${Math.max(0, Math.min(100, Math.round(row.progressPercent)))}%，上次位置：${row.lastPosition || '未记录位置'}`,
        primaryHref: actions.primary.href,
        primaryLabel: actions.primary.label,
        secondaryHref: actions.secondary.href,
        secondaryLabel: actions.secondary.label,
      }
    }),
    ...recentPlaytimeRows.map(row => {
      const actions = resolveResumeActions({
        type: row.material.type,
        materialId: row.material.id,
        learningMode: 'shadowing',
        progressPercent: Math.min(
          95,
          Math.max(10, Math.round(row.totalSeconds / 60)),
        ),
        lastPosition: `${Math.max(0, row.playedDays)} 天已收听`,
      })
      return {
        kind: 'resume' as const,
        id: `playtime-${row.id}`,
        title: row.material.title,
        metaLabel: '听力 / 跟读记录',
        detailLabel: `累计收听 ${Math.max(1, Math.round(row.totalSeconds / 60))} 分钟，最近活跃 ${Math.max(1, row.playedDays)} 天`,
        primaryHref: actions.primary.href,
        primaryLabel: '继续跟读',
        secondaryHref: actions.secondary.href,
        secondaryLabel: actions.secondary.label,
      }
    }),
    ...todayPlan.tasks
      .filter(task => !task.disabled)
      .map(task => ({
        kind: 'task' as const,
        id: `task-${task.id}`,
        title: task.title,
        metaLabel: `${task.targetCount}${task.unit}`,
        detailLabel: task.description,
        primaryHref: task.href,
        primaryLabel:
          task.id === 'review'
            ? '去复习'
            : task.id === 'listening'
              ? '去听力'
              : task.id === 'reading'
                ? '去阅读'
                : task.id === 'retry'
                  ? '去回流'
                  : '去输出',
        disabled: task.disabled,
      })),
  ].slice(0, 6)

  const assets = [
    { title: '生词本', count: `${vocabCount} 个`, href: '/vocabulary' },
    { title: '错题本', count: `${wrongCount} 题`, href: '/review' },
    { title: '套卷库', count: `${paperCount} 套`, href: '/exam/papers' },
    { title: '题目总量', count: `${questionCount} 题`, href: '/manage' },
  ]

  return (
    <main className='min-h-screen bg-white text-slate-900'>
      <div className='mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-8'>
        <header className='mb-7 border-b border-slate-200 pb-6'>
          <div className='flex flex-wrap items-center gap-3'>
            <Link
              href='/'
              className='text-sm font-semibold tracking-[0.24em] text-slate-500 uppercase transition hover:text-slate-900'>
              MimiFlow
            </Link>
            <div className='ml-auto flex flex-wrap items-center gap-2'>
              <Link href='/shadowing' className='ui-btn ui-btn-primary'>
                开始学习
              </Link>
              <Link href='/manage/upload' className='ui-btn'>
                上传内容
              </Link>
              <HomeHeaderSearch />
            </div>
          </div>

          <div className='grid gap-5 pt-5 md:grid-cols-[1.2fr_0.8fr] md:items-end'>
            <div className='grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-200 pt-5 md:grid-cols-4 md:pt-0'>
              <div>
                <p className='text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase'>
                  本周学习
                </p>
                <p className='mt-1 text-2xl font-semibold tracking-tight text-slate-900'>
                  {weekHours}h
                </p>
              </div>
              <div>
                <p className='text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase'>
                  生词总量
                </p>
                <p className='mt-1 text-2xl font-semibold tracking-tight text-slate-900'>
                  {vocabCount}
                </p>
              </div>
              <div>
                <p className='text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase'>
                  套卷数量
                </p>
                <p className='mt-1 text-2xl font-semibold tracking-tight text-slate-900'>
                  {paperCount}
                </p>
              </div>
              <div>
                <p className='text-[11px] font-semibold tracking-[0.24em] text-slate-500 uppercase'>
                  错题待复习
                </p>
                <p className='mt-1 text-2xl font-semibold tracking-tight text-slate-900'>
                  {wrongCount}
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className='mb-6'>
          <SectionTitle title='今日继续' />
          {studyRecords.length === 0 ? (
            <div className='border-t border-slate-200 py-5'>
              <p className='text-sm text-slate-500'>
                暂无学习进度记录，可从下方学习入口直接开始。
              </p>
            </div>
          ) : (
            <div className='space-y-4 border-t border-slate-200 pt-4'>
              {studyRecords.map(card => (
                <div
                  key={card.id}
                  className='flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between'>
                  <div className='min-w-0'>
                    <h3 className='truncate text-lg font-semibold tracking-tight text-slate-900'>
                      {card.title}
                    </h3>
                    <p className='mt-2 text-sm text-slate-500'>
                      {card.metaLabel}
                    </p>
                    <p className='mt-2 text-sm leading-6 text-slate-600'>
                      {card.detailLabel}
                    </p>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Link
                      href={card.primaryHref}
                      className={`ui-btn ui-btn-primary ${
                        card.kind === 'task' && card.disabled
                          ? 'pointer-events-none opacity-50'
                          : ''
                      }`}>
                      {card.primaryLabel}
                    </Link>
                    {card.kind === 'resume' ? (
                      <Link href={card.secondaryHref} className='ui-btn'>
                        {card.secondaryLabel}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className='mb-6'>
          <SectionTitle title='学习入口' />
          <div className='grid grid-cols-1 gap-2 border-t border-slate-200 pt-4 lg:grid-cols-2'>
            {coreEntrances.map(card => (
              <Link
                key={card.title}
                href={card.href}
                className='group flex items-start justify-between border-b border-slate-200 py-4 transition-colors hover:bg-slate-50/60'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <h3 className='text-base font-semibold tracking-tight text-slate-900'>
                      {card.title}
                    </h3>
                    <p className='mt-2 text-sm leading-6 text-slate-500'>
                      {card.desc}
                    </p>
                  </div>
                  <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
                    进入
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className='mb-6'>
          <SectionTitle title='管理入口' />
          <div className='grid grid-cols-1 gap-2 border-t border-slate-200 pt-4 md:grid-cols-2'>
            {manageEntrances.map(item => (
              <Link
                key={item.title}
                href={item.href}
                className='group flex items-start justify-between border-b border-slate-200 py-4 transition-colors hover:bg-slate-50/60'>
                <h3 className='text-base font-semibold tracking-tight text-slate-900'>
                  {item.title}
                </h3>
                <p className='mt-2 text-sm leading-6 text-slate-500'>
                  {item.desc}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle title='学习资产' />
          <div className='grid grid-cols-1 gap-2 border-t border-slate-200 pt-4 md:grid-cols-2 xl:grid-cols-4'>
            {assets.map(item => (
              <Link
                key={item.title}
                href={item.href}
                className='flex items-center justify-between border-b border-slate-200 py-4 transition-colors hover:bg-slate-50/60'>
                <div>
                  <h3 className='text-sm font-semibold tracking-tight text-slate-900'>
                    {item.title}
                  </h3>
                  <p className='mt-1 text-sm text-slate-500'>{item.count}</p>
                </div>
                <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
                  查看
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
