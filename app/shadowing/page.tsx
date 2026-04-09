import Link from 'next/link'
import { StudyTimeKind } from '@prisma/client'

import { listListeningMaterialsForShadowing } from '@/lib/repositories/materials.repo'
import prisma from '@/lib/prisma'

type ShadowingRow = Awaited<
  ReturnType<typeof listListeningMaterialsForShadowing>
>[number]

function formatPlaytimeCompact(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const day = Math.floor(safe / 86400)
  const hour = Math.floor((safe % 86400) / 3600)
  const minute = Math.floor((safe % 3600) / 60)
  if (day > 0) return hour > 0 ? `${day}天${hour}小时` : `${day}天`
  if (hour > 0) return minute > 0 ? `${hour}小时${minute}分` : `${hour}小时`
  return `${Math.max(1, minute)}分钟`
}

function formatTotalSpeakingTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const day = Math.floor(safe / 86400)
  const hour = Math.floor((safe % 86400) / 3600)
  const minute = Math.floor((safe % 3600) / 60)
  if (day > 0) return `${day}天 ${hour}小时`
  if (hour > 0) return `${hour}小时 ${Math.max(1, minute)}分钟`
  return `${Math.max(1, minute)}分钟`
}

function sortByOrderAndTitle<T extends { sortOrder: number; title: string }>(
  a: T,
  b: T,
) {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN')
}

const materialTitleCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
})

function sortMaterial(a: ShadowingRow, b: ShadowingRow) {
  const byTitle = materialTitleCollator.compare(a.title, b.title)
  if (byTitle !== 0) return byTitle
  return a.id.localeCompare(b.id, 'zh-CN')
}

function MaterialCard({
  item,
  totalSeconds,
}: {
  item: ShadowingRow
  totalSeconds: number
}) {
  const chapterLabel = (item.chapterName || '').trim() || '未设置章节'
  return (
    <Link
      href={`/shadowing/${item.id}`}
      className='group block rounded-2xl border border-slate-200 bg-slate-100 p-5 transition-colors hover:border-slate-300 hover:bg-slate-50'>
      <div className='flex items-center gap-3'>
        <span className='inline-flex shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700'>
          {chapterLabel}
        </span>
        <h3 className='line-clamp-2 text-base font-bold leading-snug text-slate-800 md:text-lg'>
          {item.title}
        </h3>
      </div>
      {totalSeconds > 0 && (
        <p className='mt-3 text-xs font-semibold text-slate-500'>
          累计收听 {formatPlaytimeCompact(totalSeconds)}
        </p>
      )}
    </Link>
  )
}

function ChapterScrollItem({
  chapterTitle,
  rows,
  playtimeByMaterialId,
}: {
  chapterTitle: string
  rows: ShadowingRow[]
  playtimeByMaterialId: Record<string, number>
}) {
  return (
    <section className='rounded-2xl border border-slate-200 bg-white p-3 shadow-sm'>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <h3 className='line-clamp-1 text-sm font-semibold text-slate-700'>
          {chapterTitle}
        </h3>
        <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500'>
          {rows.length} 条
        </span>
      </div>
      <div className='space-y-2'>
        {rows.map(item => (
          <Link
            key={item.id}
            href={`/shadowing/${item.id}`}
            className='group grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition-colors hover:border-blue-200 hover:bg-blue-50/60'>
            <span className='inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700'>
              {(item.chapterName || '').trim() || chapterTitle}
            </span>
            <span className='line-clamp-1 font-medium text-slate-700 group-hover:text-blue-700'>
              {item.title}
            </span>
            <span className='shrink-0 text-[11px] font-semibold text-slate-500'>
              {formatPlaytimeCompact(
                playtimeByMaterialId[item.materialId] || 0,
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default async function ShadowingListPage() {
  const [rows, collections] = await Promise.all([
    listListeningMaterialsForShadowing(),
    prisma.collection.findMany({
      where: {
        collectionType: { in: ['BOOK', 'CHAPTER'] as const },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        collectionType: true,
        parentId: true,
        sortOrder: true,
      },
    }),
  ])
  const [studySummary, studyDays] = await Promise.all([
    prisma.studyTimeDaily.aggregate({
      where: {
        kind: StudyTimeKind.LESSON_SPEAKING,
      },
      _sum: {
        seconds: true,
      },
    }),
    prisma.studyTimeDaily.count({
      where: {
        kind: StudyTimeKind.LESSON_SPEAKING,
        seconds: { gt: 0 },
      },
    }),
  ])
  const totalSpeakingSeconds = studySummary._sum.seconds || 0

  let stats: Array<{ materialId: string; totalSeconds: number }> = []
  try {
    stats = await prisma.materialPlaytimeStat.findMany({
      where: {
        profileId: 'default',
        materialId: { in: rows.map(item => item.materialId) },
      },
      select: {
        materialId: true,
        totalSeconds: true,
      },
    })
  } catch {
    stats = []
  }
  const playtimeByMaterialId = stats.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.materialId] = item.totalSeconds
      return acc
    },
    {},
  )

  const books = collections
    .filter(item => item.collectionType === 'BOOK')
    .sort(sortByOrderAndTitle)
  const chapters = collections
    .filter(item => item.collectionType === 'CHAPTER')
    .sort(sortByOrderAndTitle)

  const materialsByChapter = rows.reduce<Record<string, ShadowingRow[]>>(
    (acc, item) => {
      if (!item.chapterId) return acc
      if (!acc[item.chapterId]) acc[item.chapterId] = []
      acc[item.chapterId].push(item)
      return acc
    },
    {},
  )

  Object.values(materialsByChapter).forEach(group => group.sort(sortMaterial))

  const unclassifiedRows = rows
    .filter(item => !item.chapterId)
    .sort(sortMaterial)

  return (
    <main className='min-h-screen bg-[#f6f7f9] px-4 py-6 md:px-8 md:py-8'>
      <div className='mx-auto max-w-[1500px]'>
        <header className='mb-6'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h1 className='flex items-center gap-3 text-2xl font-bold text-slate-800 md:text-3xl'>
                <span className='h-8 w-1.5 rounded-full bg-blue-600' />
                跟读材料
              </h1>
              <p className='mt-2 text-sm text-slate-500'>
                按书名和章节浏览已归类材料，点击即可进入跟读。
              </p>
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <span className='inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800'>
                  总收听时长 {formatTotalSpeakingTime(totalSpeakingSeconds)}
                </span>
                <span className='inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800'>
                  学习天数 {studyDays} 天
                </span>
              </div>
            </div>
            <Link
              href='/manage/shadowing'
              className='inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100'>
              进入编辑模式
            </Link>
          </div>
        </header>

        {rows.length === 0 ? (
          <div className='border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500'>
            暂无跟读材料，请先在上传中心导入。
          </div>
        ) : (
          <div className='space-y-8'>
            <div className='grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
              {books.map(book => {
                const bookChapters = chapters.filter(
                  item => item.parentId === book.id,
                )
                const visibleChapters = bookChapters.filter(
                  chapter => (materialsByChapter[chapter.id] || []).length > 0,
                )

                if (visibleChapters.length === 0) return null
                const totalMaterials = visibleChapters.reduce(
                  (sum, chapter) =>
                    sum + (materialsByChapter[chapter.id] || []).length,
                  0,
                )
                return (
                  <article
                    key={book.id}
                    className='relative mx-auto flex h-140 w-full max-w-90 flex-col overflow-hidden rounded-3xl border border-slate-300 bg-linear-to-b from-white via-slate-50 to-slate-100 shadow-[0_20px_40px_-28px_rgba(15,23,42,0.5)]'>
                    <header className='space-y-2 border-b border-slate-200 bg-white/90 px-4 py-3'>
                      <h2 className='line-clamp-2 text-base font-bold leading-snug text-slate-800 md:text-lg'>
                        {book.title}
                      </h2>
                      <span className='inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
                        共 {totalMaterials} 条
                      </span>
                    </header>

                    <div className='custom-scrollbar flex-1 space-y-3 overflow-y-auto p-3'>
                      {visibleChapters.map(chapter => (
                        <ChapterScrollItem
                          key={chapter.id}
                          chapterTitle={chapter.title}
                          rows={materialsByChapter[chapter.id] || []}
                          playtimeByMaterialId={playtimeByMaterialId}
                        />
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>

            {unclassifiedRows.length > 0 ? (
              <section className='rounded-3xl border border-slate-200 bg-[#f3f4f6] p-6 md:p-8'>
                <div className='mb-3 flex items-center justify-between gap-2'>
                  <h2 className='text-lg font-semibold text-slate-800'>
                    未归类材料
                  </h2>
                  <span className='text-sm text-slate-500'>
                    {unclassifiedRows.length} 条
                  </span>
                </div>
                <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5'>
                  {unclassifiedRows.map(item => (
                    <MaterialCard
                      key={item.id}
                      item={item}
                      totalSeconds={playtimeByMaterialId[item.materialId] || 0}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </main>
  )
}
