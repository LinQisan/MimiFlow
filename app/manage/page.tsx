import Link from 'next/link'
import type { ReactNode } from 'react'

import { getManageIndexData } from '@/lib/repositories/manage'

const quickLinks = [
  {
    href: '/manage/upload',
    title: '语料录入',
    desc: '统一上传听力、阅读与题目，批量导入更快。',
    badge: '核心',
  },
  {
    href: '/manage/collection',
    title: '集合管理',
    desc: '按树形结构维护集合，支持同名与多级归类。',
    badge: '结构',
  },
  {
    href: '/manage/shadowing',
    title: '跟读管理',
    desc: '整理听力、跟读与章节关系，方便后续练习。',
    badge: '音频',
  },
  {
    href: '/manage/audio',
    title: '录音管理',
    desc: '浏览、移动和重命名站内录音文件。',
    badge: '媒体',
  },
  {
    href: '/manage/vocabulary',
    title: '词库管理',
    desc: '维护词条、例句、标签与分类归档。',
    badge: '词汇',
  },
  {
    href: '/manage/exam/papers',
    title: '试卷管理',
    desc: '统一管理试卷、层级和材料归属。',
    badge: '试卷',
  },
  {
    href: '/manage/fsrs',
    title: 'FSRS 调度',
    desc: '查看复习参数、拟合状态和最近趋势。',
    badge: '调度',
  },
]

const statCards = [
  {
    label: '语料分组',
    valueKey: 'collectionCount' as const,
  },
  {
    label: '听力语料',
    valueKey: 'listeningCount' as const,
  },
  {
    label: '阅读文章',
    valueKey: 'readingCount' as const,
  },
  {
    label: '题库材料',
    valueKey: 'quizMaterialCount' as const,
  },
  {
    label: '题库题目',
    valueKey: 'questionCount' as const,
  },
  {
    label: '词库词条',
    valueKey: 'vocabCount' as const,
  },
]

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className='mb-5 flex flex-wrap items-end justify-between gap-3'>
      <div>
        <div className='flex items-center gap-2'>
          <div className='h-5 w-1.5 rounded-full bg-slate-900' />
          <h2 className='text-lg font-semibold tracking-tight text-slate-900 md:text-xl'>
            {title}
          </h2>
        </div>
        {desc ? (
          <p className='mt-1 max-w-2xl text-sm text-slate-500 md:text-[15px]'>
            {desc}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function SurfaceCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-[18px] border border-slate-200 bg-white shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.06),0_4px_10px_rgba(15,23,42,0.04)] ${className}`}>
      {children}
    </div>
  )
}

export default async function ManageIndexPage() {
  const data = await getManageIndexData()

  return (
    <main className='min-h-screen bg-white text-slate-900'>
      <div className='mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-8'>
        <header className='mb-6 flex flex-col gap-4 rounded-[20px] bg-white px-5 py-5 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:px-6 md:py-6'>
          <div className='flex flex-wrap items-center gap-3'>
            <Link
              href='/'
              className='inline-flex items-center gap-1.5 text-sm font-semibold tracking-[0.24em] text-slate-500 uppercase transition hover:text-slate-900'
              aria-label='返回首页'
              title='返回首页'>
              <span>MimiFlow</span>
              <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M15 19l-7-7 7-7'
                />
              </svg>
            </Link>
            <div className='ml-auto flex flex-wrap items-center gap-2'>
              <Link
                href='/manage/upload'
                className='inline-flex h-10 items-center justify-center rounded-[10px] bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700'>
                语料录入
              </Link>
              <Link
                href='/manage/collection'
                className='inline-flex h-10 items-center justify-center rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'>
                集合管理
              </Link>
            </div>
          </div>

          <div className='grid gap-5 md:grid-cols-[1.3fr_0.7fr] md:items-end'>
            <div>
              <p className='text-xs font-semibold tracking-[0.28em] text-slate-500 uppercase'>
                管理中心
              </p>
              <h1 className='mt-3 text-4xl font-semibold tracking-tight text-slate-900 md:text-6xl'>
                内容后台总览
              </h1>
              <p className='mt-4 max-w-2xl text-sm leading-7 text-slate-500 md:text-base'>
                统一管理语料、集合、词库与题库。页面采用更克制的黑白层级，让入口和数据都像清晰排布的工作台，而不是一堆颜色块。
              </p>
            </div>
            <div className='rounded-[18px] bg-slate-50 p-4 shadow-[inset_0_1px_1px_rgba(15,23,42,0.08)]'>
              <p className='text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase'>
                快速提示
              </p>
              <p className='mt-2 text-sm leading-6 text-slate-600'>
                先去语料录入补材料，再到集合管理整理树形结构；如果你要回看内容，直接从最近试卷进入即可。
              </p>
            </div>
          </div>
        </header>

        <section className='mb-6'>
          <SectionTitle title='数据概览' desc='先看整体规模，再决定要进入哪个工作区。' />
          <div className='grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4'>
            {statCards.map(card => (
              <SurfaceCard key={card.label} className='p-4 md:p-5'>
                <p className='text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase'>
                  {card.label}
                </p>
                <p className='mt-3 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl'>
                  {data[card.valueKey]}
                </p>
              </SurfaceCard>
            ))}
          </div>
        </section>

        <section className='mb-6'>
          <SectionTitle title='功能入口' desc='按工作流进入对应模块，减少反复切页。' />
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {quickLinks.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className='group block rounded-[18px] bg-white p-5 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <p className='text-base font-semibold tracking-tight text-slate-900'>
                      {item.title}
                    </p>
                    <p className='mt-2 text-sm leading-6 text-slate-500'>
                      {item.desc}
                    </p>
                  </div>
                  <span className='shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
                    {item.badge}
                  </span>
                </div>
                <div className='mt-4 flex items-center justify-between text-sm font-semibold text-slate-900'>
                  <span>打开模块</span>
                  <span className='transition group-hover:translate-x-0.5'>
                    →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle title='最近试卷' desc='保留一个轻量入口，便于快速回到常用内容。' />
          {data.recentCollections.length === 0 ? (
            <SurfaceCard className='p-5'>
              <p className='text-sm text-slate-500'>
                暂无试卷，请先在语料录入或集合管理中创建。
              </p>
            </SurfaceCard>
          ) : (
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {data.recentCollections.map(collection => (
                <Link
                  key={collection.id}
                  href={`/manage/collection/${collection.id}`}
                  className='group rounded-[18px] bg-white p-5 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='truncate text-base font-semibold tracking-tight text-slate-900'>
                        {collection.title}
                      </p>
                      <p className='mt-2 text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase'>
                        {collection.collectionType}
                      </p>
                    </div>
                    <span className='shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700'>
                      {collection._count.materials} 条
                    </span>
                  </div>
                  <div className='mt-5 flex items-center justify-between text-sm text-slate-500'>
                    <span>最近整理</span>
                    <span className='font-semibold text-slate-900 transition group-hover:translate-x-0.5'>
                      查看 →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
