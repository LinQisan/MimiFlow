import Link from 'next/link'
import EpubImportForm from './EpubImportForm'
import { getUploadPageSeedData } from '@/lib/repositories/manage'

export const revalidate = 0

export default async function EpubImportPage() {
  const { dbCollections } = await getUploadPageSeedData()

  return (
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-4xl space-y-4'>
        <header className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-[0.24em] text-slate-500'>
                EPUB
              </p>
              <h1 className='mt-2 text-3xl font-black tracking-tight text-slate-900 md:text-4xl'>
                导入电子书
              </h1>
              <p className='mt-2 max-w-2xl text-sm leading-6 text-slate-600'>
                上传 EPUB 后会自动拆成阅读页面，保存为阅读材料，可在详情页开启划词、注音与注释。
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Link
                href='/'
                className='inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50'>
                返回主页
              </Link>
              <Link
                href='/ebooks'
                className='inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800'>
                返回电子书
              </Link>
            </div>
          </div>
        </header>

        <section className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
          <EpubImportForm collections={dbCollections} />
        </section>
      </div>
    </main>
  )
}
