import Link from 'next/link'
import { listReadingMaterials } from '@/lib/repositories/materials'
import DeleteEbookButton from './DeleteEbookButton'

export const revalidate = 0

export default async function EbooksPage() {
  const materials = await listReadingMaterials()
  const ebooks = materials.filter(item => item.sourceKind === 'EPUB')

  return (
    <main className='min-h-screen bg-[#f5f1e8] px-4 py-6 text-slate-900 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl space-y-5'>
        <header className='border-b border-amber-900/15 pb-5'>
          <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-[0.24em] text-amber-900/50'>
                Ebooks
              </p>
              <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl'>
                电子书
              </h1>
              <p className='mt-2 text-sm text-amber-950/65'>
                书架中只展示 EPUB，试卷阅读仍保留在阅读列表。
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Link
                href='/'
                className='rounded-2xl border border-amber-900/20 bg-white/70 px-4 py-3 text-sm font-bold text-amber-950 shadow-sm transition-colors hover:bg-white'>
                返回主页
              </Link>
              <Link
                href='/ebooks/import'
                className='rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800'>
                导入 EPUB
              </Link>
              <Link
                href='/articles'
                className='rounded-2xl border border-amber-900/20 bg-white/70 px-4 py-3 text-sm font-bold text-amber-950 shadow-sm transition-colors hover:bg-white'>
                阅读列表
              </Link>
            </div>
          </div>
        </header>

        <section className='rounded-[1.75rem] border border-amber-900/15 bg-[#ede3cf] p-4 shadow-[inset_0_1px_rgba(255,255,255,0.6),0_22px_70px_rgba(92,64,31,0.12)] md:p-6'>
          {ebooks.length === 0 ? (
            <p className='rounded-2xl border border-dashed border-amber-900/25 bg-white/60 p-6 text-center text-sm text-amber-950/60'>
              暂无电子书。
            </p>
          ) : (
            <div className='rounded-2xl border border-amber-950/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.34),rgba(255,255,255,0)_22%),repeating-linear-gradient(180deg,transparent_0,transparent_13.25rem,rgba(96,55,19,0.28)_13.25rem,rgba(96,55,19,0.28)_13.55rem,rgba(255,255,255,0.38)_13.55rem,rgba(255,255,255,0.38)_13.85rem)] px-3 pb-8 pt-5 shadow-inner'>
              <div className='grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
                {ebooks.map((item, index) => {
                  const palette = [
                    'from-slate-800 to-slate-950',
                    'from-emerald-800 to-slate-950',
                    'from-rose-800 to-slate-950',
                    'from-indigo-800 to-slate-950',
                    'from-amber-800 to-stone-950',
                  ][index % 5]
                  return (
                    <article key={item.id} className='group relative'>
                      <Link
                        href={`/ebooks/${encodeURIComponent(item.id)}`}
                        className={`flex h-48 flex-col justify-between rounded-r-xl rounded-l-sm bg-linear-to-br ${palette} p-4 text-white shadow-[8px_10px_18px_rgba(41,24,8,0.22)] ring-1 ring-black/10 transition duration-200 hover:-translate-y-1 hover:shadow-[10px_16px_24px_rgba(41,24,8,0.28)]`}>
                        <span className='absolute inset-y-0 left-2 w-px bg-white/15' />
                        <span className='absolute inset-y-0 left-4 w-px bg-black/20' />
                        <div>
                          <p className='text-[10px] font-black uppercase tracking-[0.22em] text-white/50'>
                            EPUB
                          </p>
                          <h2 className='mt-3 line-clamp-4 text-base font-black leading-snug'>
                            {item.title}
                          </h2>
                        </div>
                        <div className='space-y-1 text-xs text-white/62'>
                          <p className='truncate'>{item.author || '未知作者'}</p>
                          <p>{Math.max(1, item.chapterCount || 1)} 页</p>
                        </div>
                      </Link>
                      <div className='mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-950/10 bg-white/72 px-2 py-2 shadow-sm'>
                        <p className='min-w-0 truncate text-xs font-bold text-amber-950/70'>
                          {item.description || '电子书'}
                        </p>
                        <DeleteEbookButton id={item.id} title={item.title} />
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
