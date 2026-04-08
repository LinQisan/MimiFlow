import Link from 'next/link'

import prisma from '@/lib/prisma'
import { resolveResumeActions } from '@/lib/home/resume-actions'
import { MaterialType } from '@prisma/client'

export const revalidate = 60

type HomeResumeCard = {
  id: string
  title: string
  typeLabel: string
  modeLabel: string
  progressLabel: string
  positionLabel: string
  primaryHref: string
  primaryLabel: string
  secondaryHref: string
  secondaryLabel: string
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
    <div className='mb-4 flex items-center gap-2'>
      <div className='h-5 w-1.5 rounded-full bg-blue-500' />
      <h2 className='text-lg font-semibold text-slate-900 md:text-xl'>
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

function toLegacyId(materialId: string): string {
  const idx = materialId.indexOf(':')
  return idx >= 0 ? materialId.slice(idx + 1) : materialId
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
    recentProgressRows,
    recentMaterialRows,
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
    examTablesReady.has_progresses && examTablesReady.has_materials
      ? prisma.materialStudyProgress.findMany({
          where: { profileId: 'default' },
          orderBy: { updatedAt: 'desc' },
          take: 2,
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
    examTablesReady.has_materials
      ? prisma.material.findMany({
          orderBy: [{ createdAt: 'desc' }, { title: 'asc' }],
          take: 6,
          select: {
            id: true,
            title: true,
            type: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ])

  const totalWeekSeconds = weekStudyAgg._sum.seconds || 0
  const weekHours = (totalWeekSeconds / 3600).toFixed(1)

  const resumeCards: HomeResumeCard[] =
    recentProgressRows.length > 0
      ? recentProgressRows.map(row => {
          const actions = resolveResumeActions({
            type: row.material.type,
            materialId: row.material.id,
            learningMode: row.learningMode,
            progressPercent: row.progressPercent,
            lastPosition: row.lastPosition,
          })
          return {
            id: row.id,
            title: row.material.title,
            typeLabel: toTypeLabel(row.material.type),
            modeLabel: row.learningMode || defaultModeByType(row.material.type),
            progressLabel: `${Math.max(0, Math.min(100, Math.round(row.progressPercent)))}%`,
            positionLabel: row.lastPosition || '未记录位置',
            primaryHref: actions.primary.href,
            primaryLabel: actions.primary.label,
            secondaryHref: actions.secondary.href,
            secondaryLabel: actions.secondary.label,
          }
        })
      : recentMaterialRows.slice(0, 2).map(material => {
          const actions = resolveResumeActions({
            type: material.type,
            materialId: material.id,
            progressPercent: 0,
            lastPosition: null,
            learningMode: null,
          })
          return {
            id: material.id,
            title: material.title,
            typeLabel: toTypeLabel(material.type),
            modeLabel: defaultModeByType(material.type),
            progressLabel: '0%',
            positionLabel: '尚未开始',
            primaryHref: actions.primary.href,
            primaryLabel: actions.primary.label,
            secondaryHref: actions.secondary.href,
            secondaryLabel: actions.secondary.label,
          }
        })

  const assets = [
    { title: '生词本', count: `${vocabCount} 个`, href: '/vocabulary' },
    { title: '错题本', count: `${wrongCount} 题`, href: '/review' },
    { title: '套卷库', count: `${paperCount} 套`, href: '/exam/papers' },
    { title: '题目总量', count: `${questionCount} 题`, href: '/manage' },
  ]

  return (
    <main className='min-h-screen bg-slate-50 pb-16'>
      <div className='relative mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8'>
        <header className='mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5'>
          <div className='flex flex-wrap items-center gap-3'>
            <Link
              href='/'
              className='text-xl font-black tracking-tight text-slate-900'>
              MimiFlow
            </Link>
            <div className='ml-auto flex items-center gap-2'>
              <Link
                href='/search'
                className='rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700'>
                搜索
              </Link>
              <Link
                href='/vocabulary'
                className='rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700'>
                生词本
              </Link>
              <Link
                href='/settings'
                className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700'>
                我
              </Link>
            </div>
          </div>
        </header>

        <section className='mb-8 grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-[1.25fr_0.75fr] md:p-8'>
          <div>
            <h1 className='text-2xl font-semibold leading-snug text-slate-900 md:text-3xl'>
              统一入口，专注学习。
            </h1>
            <p className='mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base'>
              首页已整合为学习、管理、资产三类入口。减少跳转重复，让你更快进入下一步。
            </p>
            <div className='mt-5 flex flex-wrap gap-3'>
              <Link
                href='/shadowing'
                className='rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700'>
                开始学习
              </Link>
              <Link
                href='/manage/upload'
                className='rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100'>
                上传新内容
              </Link>
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <article className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
              <p className='text-xs text-slate-500'>本周学习</p>
              <p className='mt-1 text-2xl font-bold text-slate-900'>
                {weekHours}h
              </p>
            </article>
            <article className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
              <p className='text-xs text-slate-500'>生词总量</p>
              <p className='mt-1 text-2xl font-bold text-slate-900'>
                {vocabCount}
              </p>
            </article>
            <article className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
              <p className='text-xs text-slate-500'>套卷数量</p>
              <p className='mt-1 text-2xl font-bold text-slate-900'>
                {paperCount}
              </p>
            </article>
            <article className='rounded-2xl border border-slate-200 bg-slate-50 p-4'>
              <p className='text-xs text-slate-500'>错题待复习</p>
              <p className='mt-1 text-2xl font-bold text-slate-900'>
                {wrongCount}
              </p>
            </article>
          </div>
        </section>

        <section className='mb-8'>
          <SectionTitle title='今日继续' />
          {resumeCards.length === 0 ? (
            <article className='rounded-2xl border border-dashed border-slate-300 bg-white/75 p-5 text-sm text-slate-500'>
              暂无学习进度记录，可从下方学习入口直接开始。
            </article>
          ) : (
            <div className='space-y-4'>
              {resumeCards.map(card => (
                <article
                  key={card.id}
                  className='rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.45)]'>
                  <h3 className='text-lg font-semibold text-slate-900'>
                    {card.title}
                  </h3>
                  <p className='mt-1 text-sm text-slate-500'>
                    {card.typeLabel} / {card.modeLabel}
                  </p>
                  <p className='mt-2 text-sm text-slate-600'>
                    进度：已完成 {card.progressLabel}，上次位置：
                    {card.positionLabel}
                  </p>
                  <div className='mt-4 flex flex-wrap gap-2'>
                    <Link
                      href={card.primaryHref}
                      className='rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700'>
                      {card.primaryLabel}
                    </Link>
                    <Link
                      href={card.secondaryHref}
                      className='rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700'>
                      {card.secondaryLabel}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className='mb-8'>
          <SectionTitle title='学习入口' />
          <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
            {coreEntrances.map(card => (
              <Link
                key={card.title}
                href={card.href}
                className='group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200'>
                <h3 className='font-semibold text-slate-900 group-hover:text-blue-800'>
                  {card.title}
                </h3>
                <p className='mt-1 text-sm text-slate-500'>{card.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className='mb-8'>
          <SectionTitle title='管理入口' />
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            {manageEntrances.map(item => (
              <Link
                key={item.title}
                href={item.href}
                className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200'>
                <h3 className='font-semibold text-slate-900'>{item.title}</h3>
                <p className='mt-1 text-sm text-slate-500'>{item.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle title='学习资产' />
          <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
            {assets.map(item => (
              <article
                key={item.title}
                className='rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.45)]'>
                <h3 className='font-semibold text-slate-900'>{item.title}</h3>
                <p className='mt-1 text-sm text-slate-500'>{item.count}</p>
                <Link
                  href={item.href}
                  className='mt-3 inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700'>
                  查看
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
