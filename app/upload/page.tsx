// app/admin/upload/page.tsx
import Link from 'next/link'
import UploadCenterUI from './UploadCenterUI'
import { getUploadPageSeedData } from '@/lib/repositories/manage'

export default async function UnifiedUploadPage() {
  const { dbLevels, dbCollections } = await getUploadPageSeedData()

  return (
    <div className='manage-upload-surface min-h-screen bg-slate-50 px-3 py-4 md:px-6 md:py-6'>
      <div className='mx-auto max-w-7xl space-y-5'>
        <header className='rounded-[1.75rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:px-6'>
          <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
            <div>
              <Link
                href='/'
                className='inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 transition hover:text-slate-900'
                aria-label='返回首页'
                title='返回首页'>
                <span>MimiFlow</span>
                <svg className='h-3.5 w-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 19l-7-7 7-7'
                  />
                </svg>
              </Link>
              <h1 className='mt-2 text-2xl font-black tracking-tight text-slate-900 md:text-3xl'>
                上传中心
              </h1>
              <p className='mt-2 max-w-2xl text-sm leading-6 text-slate-500'>
                统一完成听力、阅读和题库内容录入，保持和首页一致的黑白工作台风格。
              </p>
            </div>
            <Link href='/' className='ui-btn ui-btn-primary'>
              返回首页
            </Link>
          </div>
        </header>
        <UploadCenterUI dbLevels={dbLevels} dbCollections={dbCollections} />
      </div>
    </div>
  )
}
