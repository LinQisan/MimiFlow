import Link from 'next/link'

import UploadCenterUI from '@/features/import/ui/UploadCenterUI'
import EpubImportForm from '@/features/reading/ui/EpubImportForm'
import { getUploadPageSeedData } from '@/lib/repositories/manage'
import type { UploadCenterTab } from '@/modules/import/types'
import type { MaterialType } from '#prisma-client'
import AnkiImportPanel from './AnkiImportPanel'

const importGroups = [
  {
    label: '练习内容',
    items: [
      ['listening', '听力材料', 'MP3 与字幕'],
      ['speaking', '跟读材料', 'MP3 与字幕'],
      ['reading', '阅读文章', '正文与表格'],
      ['questions', '练习题', '单题或批量'],
    ],
  },
  {
    label: '学习资料',
    items: [
      ['subtitles', '影视字幕', 'ASS 字幕'],
      ['ebook', '电子书', '正文或 EPUB'],
      ['anki', '词汇卡片', 'Anki 牌组'],
    ],
  },
] as const

const importTypeValues = importGroups.flatMap(group =>
  group.items.map(([value]) => value),
)
type ImportType = (typeof importTypeValues)[number]

const uploadTabs: Partial<Record<ImportType, UploadCenterTab>> = {
  listening: 'audio',
  speaking: 'audio',
  reading: 'article',
  questions: 'quiz',
  subtitles: 'media',
}

const importMaterialTypes: Partial<Record<ImportType, MaterialType>> = {
  listening: 'LISTENING',
  speaking: 'SPEAKING',
  reading: 'READING',
  questions: 'VOCAB_GRAMMAR',
  subtitles: 'MEDIA_SUBTITLE',
  ebook: 'READING',
}

function isImportType(value: string | undefined): value is ImportType {
  return importTypeValues.some(item => item === value)
}

export default async function UnifiedImportPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type } = await searchParams
  const importType: ImportType = isImportType(type) ? type : 'listening'
  const needsCollections = importType !== 'anki'
  const needsLessons = ['listening', 'speaking', 'subtitles'].includes(importType)
  const { dbLevels, dbCollections } = needsCollections
    ? await getUploadPageSeedData({
        includeLessons: needsLessons,
        materialType: importMaterialTypes[importType],
      })
    : { dbLevels: [], dbCollections: [] }

  return (
    <main className='manage-upload-surface min-h-screen bg-[#f6f5f1] pb-16 font-sans text-slate-900'>
      <h1 className='sr-only'>内容导入</h1>
      <div className='mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10 lg:py-11'>
        <aside className='min-w-0 lg:sticky lg:top-24 lg:self-start'>
          <nav
            aria-label='导入类型'
            className='overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_12px_36px_-32px_rgba(15,23,42,0.5)] lg:overflow-visible lg:p-4'>
            <div className='flex gap-5 lg:block lg:space-y-6'>
              {importGroups.map(group => (
                <section key={group.label} className='shrink-0'>
                  <h2 className='mb-2 px-2 text-[11px] font-bold tracking-[0.08em] text-slate-400'>
                    {group.label}
                  </h2>
                  <div className='flex gap-1 lg:flex-col'>
                    {group.items.map(([value, label]) => {
                      const active = importType === value
                      return (
                        <Link
                          key={value}
                          href={`/manage/import?type=${value}`}
                          aria-current={active ? 'page' : undefined}
                          className={`flex min-w-max items-center rounded-xl px-3 py-2.5 text-sm transition-colors lg:min-w-0 ${
                            active
                              ? 'bg-slate-950 font-semibold text-white'
                              : 'font-semibold text-slate-600 hover:bg-white hover:text-slate-900'
                          }`}>
                          <span>{label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </nav>
        </aside>

        <section className='min-w-0'>
          {importType === 'ebook' ? (
            <EpubImportForm collections={dbCollections} />
          ) : importType === 'anki' ? (
            <AnkiImportPanel />
          ) : (
            <UploadCenterUI
              key={importType}
              dbLevels={dbLevels}
              dbCollections={dbCollections}
              initialTab={uploadTabs[importType]}
              initialMaterialType={importMaterialTypes[importType]}
            />
          )}
        </section>
      </div>
    </main>
  )
}
