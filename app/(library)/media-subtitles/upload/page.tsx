import Link from 'next/link'

import UploadForm from '@/app/(admin)/upload/UploadForm'
import { getUploadPageSeedData } from '@/lib/repositories/manage'

export default async function MediaSubtitleUploadPage() {
  const { dbLevels, dbCollections } = await getUploadPageSeedData()

  return (
    <div className='manage-upload-surface min-h-screen bg-slate-50 px-3 py-4 md:px-6 md:py-6'>
      <div className='mx-auto max-w-7xl space-y-5'>
        <header className='rounded-[1.75rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:px-6'>
          <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
            <div>
              <Link
                href='/media-subtitles'
                className='inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 transition hover:text-slate-900'>
                <span>Media Subtitles</span>
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
                影视字幕上传
              </h1>
              <p className='mt-2 max-w-2xl text-sm leading-6 text-slate-500'>
                专用于电影 / 电视剧字幕导入。该页面固定按无音频字幕处理，并支持剧集季/集归档。
              </p>
            </div>
            <div className='flex gap-2'>
              <Link href='/media-subtitles' className='ui-btn'>
                返回影视字幕
              </Link>
              <Link href='/upload' className='ui-btn ui-btn-primary'>
                通用上传中心
              </Link>
            </div>
          </div>
        </header>

        <section className='grid gap-3 md:grid-cols-3'>
          <article className='border border-slate-200 bg-white p-4'>
            <h2 className='text-sm font-black text-slate-900'>电影字幕</h2>
            <p className='mt-1 text-xs leading-5 text-slate-600'>
              选择“电影”后，仅需填写电影名并上传 `.ass`。
            </p>
          </article>
          <article className='border border-slate-200 bg-white p-4'>
            <h2 className='text-sm font-black text-slate-900'>电视剧字幕</h2>
            <p className='mt-1 text-xs leading-5 text-slate-600'>
              选择“电视剧”后，必须填写剧名、季、集，便于后续按剧集管理。
            </p>
          </article>
          <article className='border border-slate-200 bg-white p-4'>
            <h2 className='text-sm font-black text-slate-900'>无音频模式</h2>
            <p className='mt-1 text-xs leading-5 text-slate-600'>
              专用页固定为仅字幕导入，来源会自动使用电影名/剧名。
            </p>
          </article>
        </section>

        <UploadForm
          levels={dbLevels}
          papers={dbCollections}
          variant='media-subtitle'
        />
      </div>
    </div>
  )
}
