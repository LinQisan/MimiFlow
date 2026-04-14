import Link from 'next/link'

import { listReadingMaterials } from '@/lib/repositories/materials'

export const revalidate = 0

export default async function ArticlesPage() {
  const materials = await listReadingMaterials()

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-4'>
        <header className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>
                Articles
              </p>
              <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl'>
                阅读列表
              </h1>
              <p className='mt-2 max-w-2xl text-sm text-slate-600 md:text-base'>
                从这里进入阅读材料详情，继续复习已学文章。
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <div className='rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 shadow-sm'>
                <p className='text-[11px] font-semibold uppercase tracking-wider'>
                  材料数量
                </p>
                <p className='mt-1 text-2xl font-black'>{materials.length}</p>
              </div>
              <Link
                href='/'
                className='rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50'>
                返回首页
              </Link>
            </div>
          </div>
        </header>

        <section className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          {materials.length === 0 ? (
            <p className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500'>
              暂无阅读材料，请先前往管理端导入。
            </p>
          ) : (
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {materials.map(item => {
                const questionCount = item.questions.length
                return (
                  <Link
                    key={item.id}
                    href={`/articles/${encodeURIComponent(item.id)}`}
                    className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50'>
                    <div className='flex items-start justify-between gap-3'>
                      <div className='min-w-0'>
                        <h2 className='truncate text-base font-black text-slate-900'>
                          {item.title}
                        </h2>
                        <p className='mt-2 line-clamp-2 text-sm text-slate-600'>
                          {item.description || item.content || '暂无内容摘要'}
                        </p>
                      </div>
                      <span className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                        {questionCount} 题
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
