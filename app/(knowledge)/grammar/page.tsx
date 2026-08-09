import prisma from '@/lib/prisma'
import PageHeader from '@/components/layout/PageHeader'

export const revalidate = 0

export default async function GrammarPage() {
  const grammars = await prisma.grammar.findMany({
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
    })

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4'>
        <PageHeader
          title='语法库'
          description='按接续、意思和例句浏览语法。'
          meta={<span>共 {grammars.length} 条</span>}
        />

        <section>
          <div className='flex items-center justify-between gap-3'>
            <h2 className='text-lg font-black text-slate-900'>语法展示</h2>
          </div>
          {grammars.length === 0 ? (
            <p className='mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500'>
              暂无语法内容。
            </p>
          ) : (
            <div className='mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3'>
              {grammars.map(item => (
                <article
                  key={item.id}
                  className='border-t border-slate-200 py-4'>
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
                    <div className='mt-3 border-l-2 border-slate-200 pl-3 text-sm'>
                      <p className='mb-1.5 text-[11px] font-bold tracking-wide text-slate-500'>
                        接续与意思
                      </p>
                      <div className='space-y-1.5'>
                        {item.constructions.slice(0, 3).map((construction, index) => (
                          <div
                            key={construction.id}
                            className='border-t border-slate-200 py-2 first:border-t-0'>
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
                                    className='border-l border-slate-200 py-1 pl-2'>
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
