import Link from 'next/link'
import prisma from '@/lib/prisma'

export const revalidate = 0

export default async function GrammarPage() {
  const [grammars, totalTags, totalClusters] = await Promise.all([
    prisma.grammar.findMany({
      orderBy: { createdAt: 'desc' },
      take: 120,
      include: {
        tags: { include: { tag: true } },
        clusters: { include: { cluster: true } },
        constructions: {
          orderBy: { sortOrder: 'asc' },
          include: {
            examples: {
              orderBy: { createdAt: 'asc' },
              take: 6,
              select: {
                id: true,
                source: true,
                sentenceText: true,
              },
            },
          },
        },
      },
    }),
    prisma.grammarTag.count(),
    prisma.grammarCluster.count(),
  ])

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-7xl space-y-4'>
        <header className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
            <div>
              <div className='flex items-center gap-2'>
                <Link
                  href='/'
                  className='inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50'
                  aria-label='返回首页'>
                  返回首页
                </Link>
              </div>
              <p className='mt-3 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>
                Grammar
              </p>
              <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl'>
                语法库
              </h1>
              <p className='mt-2 max-w-2xl text-sm text-slate-600 md:text-base'>
                聚焦接续与例句，快速浏览语法结构与用法场景。
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <div className='rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 shadow-sm'>
                <p className='text-[11px] font-semibold uppercase tracking-wider'>
                  语法条目
                </p>
                <p className='mt-1 text-2xl font-black'>{grammars.length}</p>
              </div>
              <div className='rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm'>
                <p className='text-[11px] font-semibold uppercase tracking-wider'>
                  标签
                </p>
                <p className='mt-1 text-2xl font-black'>{totalTags}</p>
              </div>
              <div className='rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm'>
                <p className='text-[11px] font-semibold uppercase tracking-wider'>
                  相似组
                </p>
                <p className='mt-1 text-2xl font-black'>{totalClusters}</p>
              </div>
              <Link
                href='/grammar/edit'
                className='rounded-2xl border border-slate-900 bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800'>
                进入编辑页
              </Link>
            </div>
          </div>
        </header>

        <section className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='text-lg font-black text-slate-900'>语法展示</h2>
            <span className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600'>
              共 {grammars.length} 条
            </span>
          </div>
          {grammars.length === 0 ? (
            <p className='mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500'>
              暂无语法，请先前往编辑页创建。
            </p>
          ) : (
            <div className='mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3'>
              {grammars.map(item => (
                <article
                  key={item.id}
                  className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
                  <div className='flex flex-wrap items-start justify-between gap-2'>
                    <h3 className='line-clamp-1 text-[15px] font-black leading-snug text-slate-900'>
                      {item.name}
                    </h3>
                    <span className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                      接续 {item.constructions.length}
                    </span>
                  </div>

                  <div className='mt-2 flex flex-wrap gap-1.5'>
                    {item.tags.length > 0 ? (
                      item.tags.slice(0, 4).map(tag => (
                        <span
                          key={`${item.id}-${tag.tagId}`}
                          className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600'>
                          #{tag.tag.name}
                        </span>
                      ))
                    ) : (
                      <span className='text-[11px] text-slate-400'>无标签</span>
                    )}
                    {item.tags.length > 4 ? (
                      <span className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500'>
                        +{item.tags.length - 4}
                      </span>
                    ) : null}
                  </div>

                  {item.clusters.length > 0 ? (
                    <div className='mt-2 flex flex-wrap gap-1.5'>
                      {item.clusters.map(cluster => (
                        <span
                          key={`${item.id}-${cluster.clusterId}`}
                          className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600'>
                          组: {cluster.cluster.title}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {item.constructions.length > 0 ? (
                    <div className='mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm'>
                      <p className='mb-1.5 text-[11px] font-bold tracking-wide text-slate-500'>
                        接续与意思
                      </p>
                      <div className='space-y-1.5'>
                        {item.constructions.slice(0, 3).map((construction, index) => (
                          <div
                            key={construction.id}
                            className='rounded-xl border border-slate-200 bg-white px-2.5 py-2'>
                            <div className='flex items-start gap-2'>
                              <span className='mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-200 px-1 text-[10px] font-bold text-slate-700'>
                                {index + 1}
                              </span>
                              <div className='min-w-0 flex-1'>
                                <p className='line-clamp-1 text-sm font-semibold text-slate-800'>
                                  {construction.connection}
                                </p>
                                <p className='line-clamp-2 text-xs text-slate-700'>
                                  {construction.meaning}
                                </p>
                              </div>
                            </div>
                            {construction.note ? (
                              <p className='mt-0.5 line-clamp-1 text-[11px] text-slate-500'>
                                备注：{construction.note}
                              </p>
                            ) : null}
                            {construction.examples.length > 0 ? (
                              <div className='mt-1 space-y-1'>
                                {construction.examples.slice(0, 2).map(example => (
                                  <div
                                    key={example.id}
                                    className='rounded-lg border border-slate-200 bg-slate-50 px-2 py-1'>
                                    <p className='line-clamp-2 text-xs text-slate-800'>
                                      {example.sentenceText}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                        {item.constructions.length > 3 ? (
                          <p className='text-[11px] font-semibold text-slate-500'>
                            还有 {item.constructions.length - 3} 条接续...
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
