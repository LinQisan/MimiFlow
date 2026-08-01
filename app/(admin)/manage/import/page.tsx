// Unified content import route.
import Link from 'next/link'
import UploadCenterUI from '@/app/(admin)/upload/UploadCenterUI'
import EpubImportForm from '@/app/(library)/reading/import/EpubImportForm'
import { getUploadPageSeedData } from '@/lib/repositories/manage'
import type { UploadCenterTab } from '@/modules/import/types'
import AnkiImportPanel from './AnkiImportPanel'

const importGroups = [
  {
    label: '练习内容',
    items: [
      ['listening', '听力材料'],
      ['speaking', '跟读材料'],
      ['reading', '阅读文章'],
      ['questions', '练习题'],
    ],
  },
  {
    label: '学习资料',
    items: [
      ['subtitles', '影视字幕'],
      ['ebook', '电子书'],
      ['anki', '词汇卡片'],
    ],
  },
] as const

const importTypeValues = [
  'listening',
  'speaking',
  'reading',
  'questions',
  'subtitles',
  'ebook',
  'anki',
] as const

const uploadTabs: Record<string, UploadCenterTab> = {
  listening: 'audio',
  speaking: 'timed-audio',
  reading: 'article',
  questions: 'quiz',
  subtitles: 'media',
}

export default async function UnifiedImportPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type } = await searchParams
  const importType = importTypeValues.includes(
    type as (typeof importTypeValues)[number],
  )
    ? type!
    : 'listening'
  const { dbLevels, dbCollections } = await getUploadPageSeedData()

  return (
    <main className='manage-upload-surface min-h-screen bg-slate-50 px-3 py-4 md:px-6 md:py-6'>
      <div className='mx-auto max-w-6xl space-y-5'>
        <header className='border-b border-slate-200 pb-4'>
          <h1 className='text-2xl font-black tracking-tight text-slate-900 md:text-3xl'>
            内容导入
          </h1>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-slate-500'>
            一次处理一种内容。先选择类型，再按页面提示准备必要信息。
          </p>
          <nav
            aria-label='导入类型'
            className='mt-4 grid gap-3 md:grid-cols-2 md:gap-4'>
            {importGroups.map(group => (
              <div key={group.label} className='min-w-0'>
                <p className='mb-2 text-xs font-bold text-slate-400'>
                  {group.label}
                </p>
                <div className='flex gap-2 overflow-x-auto pb-1'>
                  {group.items.map(([value, label]) => (
                    <Link
                      key={value}
                      href={`/manage/import?type=${value}`}
                      aria-current={importType === value ? 'page' : undefined}
                      className={`inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-semibold transition-colors ${
                        importType === value
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </header>
        {importType === 'ebook' ? (
          <section className='rounded-2xl border border-slate-200 bg-white p-4 md:p-6'>
            <EpubImportForm collections={dbCollections} />
          </section>
        ) : importType === 'anki' ? (
          <AnkiImportPanel />
        ) : (
          <UploadCenterUI
            key={importType}
            dbLevels={dbLevels}
            dbCollections={dbCollections}
            initialTab={uploadTabs[importType]}
          />
        )}
      </div>
    </main>
  )
}
