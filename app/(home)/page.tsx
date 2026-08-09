import Link from 'next/link'

import prisma from '@/lib/prisma'
import { resolveResumeActions } from '@/lib/home/resume-actions'
import { MaterialType } from '@prisma/client'
import { getTodayStudyPlan } from '@/modules/progress/server/today-plan'

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

type HomeEntrance = {
  title: string
  desc: string
  href: string
  metric?: 'papers' | 'vocabulary' | 'mistakes'
}

const coreEntrances: HomeEntrance[] = [
  {
    title: '语法库',
    desc: '标签归类 + 相似语法',
    href: '/grammar',
  },
  {
    title: '影视字幕',
    desc: '按电影和剧集浏览字幕',
    href: '/subtitles',
  },
]


function SectionTitle({ title }: { title: string }) {
  return (
    <div className='mb-6 flex items-baseline justify-between border-b border-slate-200 pb-3'>
      <h2 className='text-xl font-semibold tracking-tight text-slate-900 md:text-2xl'>
        {title}
      </h2>
      <span className='text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400'>Index</span>
    </div>
  )
}

function toTypeLabel(type: MaterialType): string {
  if (type === MaterialType.LISTENING) return '听力'
  if (type === MaterialType.MEDIA_SUBTITLE) return '影视字幕'
  if (type === MaterialType.READING) return '阅读'
  return '题目'
}

function defaultModeByType(type: MaterialType): string {
  if (type === MaterialType.LISTENING) return '字幕精听'
  if (type === MaterialType.MEDIA_SUBTITLE) return '影视浏览'
  if (type === MaterialType.READING) return '文章精读'
  return '套卷训练'
}

function formatLearningMeta(
  type: MaterialType,
  learningMode?: string | null,
): string {
  const labels = [
    toTypeLabel(type),
    ...(learningMode || defaultModeByType(type))
      .split('/')
      .map(label => label.trim()),
  ].filter(Boolean)

  return [...new Set(labels)].join(' · ')
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

  const [
    vocabCount,
    weekStudyAgg,
    paperCount,
    questionCount,
    todayPlan,
    recentStudyRows,
    recentPlaytimeRows,
  ] = await Promise.all([
    prisma.vocabulary.count(),
    prisma.studyTimeDaily.aggregate({
      _sum: { seconds: true },
      where: {
        dateKey: {
          gte: weekStartKey,
          lte: todayKey,
        },
      },
    }),
    prisma.collection.count({ where: { collectionType: 'PAPER' } }),
    prisma.question.count(),
    getTodayStudyPlan(),
    prisma.materialStudyProgress.findMany({
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
    }),
    prisma.materialPlaytimeStat.findMany({
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
    }),
  ])

  const wrongCount =
    todayPlan.tasks.find(task => task.id === 'retry')?.targetCount || 0

  const totalWeekSeconds = weekStudyAgg._sum.seconds || 0
  const weekHours = (totalWeekSeconds / 3600).toFixed(1)

  const todayTaskRecords: HomeContinueItem[] = todayPlan.tasks
    .filter(task => !task.disabled)
    .map(task => ({
      kind: 'task' as const,
      id: `task-${task.id}`,
      title: task.title,
      metaLabel: `今日目标 · ${task.targetCount}${task.unit}`,
      detailLabel: task.description,
      primaryHref: task.href,
      primaryLabel:
        task.id === 'memory'
          ? '去复习'
          : task.id === 'listening'
            ? '去听力'
            : task.id === 'reading'
              ? '去阅读'
              : '去巩固',
      disabled: task.disabled,
    }))

  const recentStudyMaterialIds = new Set(
    recentStudyRows.map(row => row.material.id),
  )
  const activeStudyRecords: HomeContinueItem[] = recentStudyRows
    .filter(row => row.progressPercent < 98)
    .map(row => {
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
        metaLabel: formatLearningMeta(row.material.type, row.learningMode),
        detailLabel: `进度：已完成 ${Math.max(0, Math.min(100, Math.round(row.progressPercent)))}%，上次位置：${row.lastPosition || '未记录位置'}`,
        primaryHref: actions.primary.href,
        primaryLabel: actions.primary.label,
        secondaryHref: actions.secondary.href,
        secondaryLabel: actions.secondary.label,
      }
    })

  const activePlaytimeRecords: HomeContinueItem[] = recentPlaytimeRows
    .filter(row => !recentStudyMaterialIds.has(row.material.id))
    .map(row => {
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
    })

  const studyRecords: HomeContinueItem[] = [
    ...todayTaskRecords,
    ...activeStudyRecords,
    ...activePlaytimeRecords,
  ].slice(0, 4)

  const entranceMetrics: Record<
    NonNullable<HomeEntrance['metric']>,
    string
  > = {
    papers: `${paperCount} 套 · ${questionCount} 题`,
    vocabulary: `${vocabCount} 个生词`,
    mistakes: `${wrongCount} 题待复习`,
  }

  return (
    <main className='min-h-screen bg-white text-slate-900'>
      <div className='mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-16'>
        <header className='mb-12 border-b border-slate-200 pb-10 md:mb-16 md:pb-14'>
          <div className='mb-8'>
            <p className='editorial-kicker'>
              MIMIFLOW / TODAY
            </p>
            <h1 className='mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-6xl'>
              今日学习
            </h1>
          </div>
          <div className='grid gap-5 md:grid-cols-[1.2fr_0.8fr] md:items-end'>
            <div className='grid grid-cols-2 gap-x-8 gap-y-6 border-t border-slate-200 pt-6 md:grid-cols-4'>
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

        <section className='mb-14 md:mb-20'>
          <SectionTitle title='今日继续' />
          {studyRecords.length === 0 ? (
            <div className='border-t border-slate-200 py-5'>
              <p className='text-sm text-slate-500'>
                今日任务已完成，可从下方学习中心开始新的内容。
              </p>
            </div>
          ) : (
            <div className='space-y-2 border-t border-slate-200 pt-2'>
              {studyRecords.map(card => (
                <div
                  key={card.id}
                  className='flex flex-col gap-2 border-b border-slate-200 py-3 md:flex-row md:items-center md:justify-between'>
                  <div className='min-w-0 space-y-1'>
                    <h3 className='truncate text-base font-semibold tracking-tight text-slate-900'>
                      {card.title}
                    </h3>
                    <p className='truncate text-sm text-slate-500'>
                      {card.metaLabel}
                    </p>
                    <p className='truncate text-xs text-slate-500'>
                      {card.detailLabel}
                    </p>
                  </div>
                  <div className='flex shrink-0 flex-wrap gap-2'>
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
                      <Link
                        href={card.secondaryHref}
                        className='ui-btn'>
                        {card.secondaryLabel}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className='mb-10'>
          <SectionTitle title='资料与工具' />
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
                    {card.metric ? (
                      <p className='mt-1 text-xs font-medium text-slate-500'>
                        {entranceMetrics[card.metric]}
                      </p>
                    ) : null}
                  </div>
                  <span className='text-lg font-light text-slate-400 transition-transform group-hover:translate-x-1'>
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
