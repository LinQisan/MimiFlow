import Link from 'next/link'
import { StudyTimeKind } from '@prisma/client'

import {
  listListeningLessonsForShadowing,
  listListeningMaterialsForShadowing,
} from '@/lib/repositories/materials'
import prisma from '@/lib/prisma'

type ShadowingRow = Awaited<
  ReturnType<typeof listListeningMaterialsForShadowing>
>[number]

function formatPlaytimeCompact(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const day = Math.floor(safe / 86400)
  const hour = Math.floor((safe % 86400) / 3600)
  const minute = Math.floor((safe % 3600) / 60)
  const sec = safe % 60
  if (day > 0) return hour > 0 ? `${day}天${hour}小时` : `${day}天`
  if (hour > 0) return minute > 0 ? `${hour}小时${minute}分` : `${hour}小时`
  if (minute > 0) return `${minute}分钟`
  return `${sec}秒`
}

function formatTotalSpeakingTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const day = Math.floor(safe / 86400)
  const hour = Math.floor((safe % 86400) / 3600)
  const minute = Math.floor((safe % 3600) / 60)
  const sec = safe % 60
  if (day > 0) return `${day}天 ${hour}小时`
  if (hour > 0) return `${hour}小时 ${minute}分钟`
  if (minute > 0) return `${minute}分钟`
  return `${sec}秒`
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
  const chapterA = (a.chapterName || '').trim() || '未设置章节'
  const chapterB = (b.chapterName || '').trim() || '未设置章节'
  const byChapter = materialTitleCollator.compare(chapterA, chapterB)
  if (byChapter !== 0) return byChapter
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
      className='group block rounded-[18px] bg-white p-5 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.35)]'>
      <div className='flex items-center gap-3'>
        <span className='inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
          {chapterLabel}
        </span>
        <h3 className='line-clamp-2 text-base font-semibold leading-snug tracking-tight text-slate-900 md:text-lg'>
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
    <section className='rounded-[18px] bg-white p-4 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <h3 className='line-clamp-1 text-sm font-semibold tracking-tight text-slate-900'>
          {chapterTitle}
        </h3>
        <span className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
          {rows.length} 条
        </span>
      </div>
      <div className='space-y-2'>
        {rows.map(item => (
          <Link
            key={item.id}
            href={`/shadowing/${item.id}`}
            className='group grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition hover:bg-white hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.25)]'>
            <span className='inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
              {(item.chapterName || '').trim() || chapterTitle}
            </span>
            <span className='line-clamp-1 font-medium text-slate-700 group-hover:text-slate-900'>
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

function buildSectionData(
  rows: ShadowingRow[],
  collections: Array<{
    id: string
    title: string
    collectionType: 'BOOK' | 'CHAPTER'
    parentId: string | null
    sortOrder: number
  }>,
) {
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

  const unclassifiedRows = rows.filter(item => !item.chapterId).sort(sortMaterial)

  return { books, chapters, materialsByChapter, unclassifiedRows }
}

function isBookOrChapterCollection(
  value: string,
): value is 'BOOK' | 'CHAPTER' {
  return value === 'BOOK' || value === 'CHAPTER'
}

function MaterialSection({
  title,
  subtitle,
  rows,
  collections,
  playtimeByMaterialId,
  emptyText,
}: {
  title: string
  subtitle: string
  rows: ShadowingRow[]
  collections: Array<{
    id: string
    title: string
    collectionType: 'BOOK' | 'CHAPTER'
    parentId: string | null
    sortOrder: number
  }>
  playtimeByMaterialId: Record<string, number>
  emptyText: string
}) {
  const { books, chapters, materialsByChapter, unclassifiedRows } = buildSectionData(
    rows,
    collections,
  )

  return (
    <section className='space-y-5 rounded-[20px] bg-white p-5 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:p-6'>
      <header className='flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight text-slate-900'>
            {title}
          </h2>
          <p className='mt-1 text-sm text-slate-500'>{subtitle}</p>
        </div>
        <span className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600'>
          共 {rows.length} 条
        </span>
      </header>

      {rows.length === 0 ? (
        <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500'>
          {emptyText}
        </div>
      ) : (
        <div className='space-y-8'>
          <div className='grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {books.map(book => {
              const bookChapters = chapters.filter(item => item.parentId === book.id)
              const visibleChapters = bookChapters.filter(
                chapter => (materialsByChapter[chapter.id] || []).length > 0,
              )

              if (visibleChapters.length === 0) return null
              const totalMaterials = visibleChapters.reduce(
                (sum, chapter) => sum + (materialsByChapter[chapter.id] || []).length,
                0,
              )

              return (
                <article
                  key={book.id}
                  className='relative mx-auto flex h-140 w-full max-w-90 flex-col overflow-hidden rounded-3xl bg-white shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
                  <header className='space-y-2 border-b border-slate-200 bg-white px-4 py-3'>
                    <h3 className='line-clamp-2 text-base font-semibold leading-snug tracking-tight text-slate-900 md:text-lg'>
                      {book.title}
                    </h3>
                    <span className='inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
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
            <section className='rounded-[20px] bg-slate-50 p-6 md:p-8'>
              <div className='mb-3 flex items-center justify-between gap-2'>
                <h3 className='text-lg font-semibold tracking-tight text-slate-900'>
                  未归类材料
                </h3>
                <span className='text-sm text-slate-500'>{unclassifiedRows.length} 条</span>
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
    </section>
  )
}

function ListeningPaperSection({
  rows,
  playtimeByMaterialId,
}: {
  rows: ShadowingRow[]
  playtimeByMaterialId: Record<string, number>
}) {
  const groups = rows.reduce<
    Array<{ key: string; paperTitle: string; items: ShadowingRow[] }>
  >((acc, row) => {
    const paperTitle = (row.hierarchyPath[1] || row.pathLabel || '未归类卷子').trim()
    const key = row.bookId || `paper:${paperTitle}`
    const current = acc.find(item => item.key === key)
    if (current) {
      current.items.push(row)
    } else {
      acc.push({ key, paperTitle, items: [row] })
    }
    return acc
  }, [])

  groups.forEach(group => group.items.sort(sortMaterial))
  groups.sort((a, b) => materialTitleCollator.compare(a.paperTitle, b.paperTitle))

  return (
    <section className='space-y-5 rounded-[20px] bg-white p-5 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] md:p-6'>
      <header className='flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight text-slate-900'>
            听力材料
          </h2>
          <p className='mt-1 text-sm text-slate-500'>
            听力材料（LISTENING），按卷子分类展示。
          </p>
        </div>
        <span className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600'>
          共 {rows.length} 条
        </span>
      </header>

      {rows.length === 0 ? (
        <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500'>
          暂无听力材料。
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          {groups.map(group => (
            <article
              key={group.key}
              className='relative mx-auto flex h-140 w-full max-w-90 flex-col overflow-hidden rounded-3xl bg-white shadow-[0_1px_5px_-4px_rgba(15,23,42,0.45),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)]'>
              <header className='space-y-2 border-b border-slate-200 bg-white px-4 py-3'>
                <h3 className='line-clamp-2 text-base font-semibold leading-snug tracking-tight text-slate-900 md:text-lg'>
                  {group.paperTitle}
                </h3>
                <span className='inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
                  共 {group.items.length} 条
                </span>
              </header>

              <div className='custom-scrollbar flex-1 space-y-2 overflow-y-auto p-3'>
                {group.items.map(item => (
                  <Link
                    key={item.id}
                    href={`/shadowing/${item.id}`}
                    className='group grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition hover:bg-white hover:shadow-[0_8px_24px_-18px_rgba(15,23,42,0.25)]'>
                    <span className='inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                      {(item.chapterName || '').trim() || '未设置章节'}
                    </span>
                    <span className='line-clamp-1 font-medium text-slate-700 group-hover:text-slate-900'>
                      {item.title}
                    </span>
                    <span className='shrink-0 text-[11px] font-semibold text-slate-500'>
                      {formatPlaytimeCompact(playtimeByMaterialId[item.materialId] || 0)}
                    </span>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default async function ShadowingListPage() {
  const [speakingRows, listeningRows, collections] = await Promise.all([
    listListeningMaterialsForShadowing(),
    listListeningLessonsForShadowing(),
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
        materialId: {
          in: [...speakingRows, ...listeningRows].map(item => item.materialId),
        },
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
  const sectionCollections = collections
    .filter(item => isBookOrChapterCollection(item.collectionType))
    .map(item => ({
      id: item.id,
      title: item.title,
      collectionType: item.collectionType as 'BOOK' | 'CHAPTER',
      parentId: item.parentId,
      sortOrder: item.sortOrder,
    }))

  return (
    <main className='min-h-screen bg-white px-4 py-6 md:px-8 md:py-8'>
      <div className='mx-auto max-w-[1500px]'>
        <header className='mb-6'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <h1 className='flex items-center gap-3 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl'>
                <Link
                  href='/'
                  className='inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900'
                  aria-label='返回主页'>
                  <svg
                    className='h-4 w-4'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M15 19l-7-7 7-7'
                    />
                  </svg>
                </Link>
                跟读与听力
              </h1>
              <p className='mt-2 text-sm text-slate-500'>
                分区浏览跟读与听力材料，点击后进入 AudioPlayer 跟读练习。
              </p>
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <span className='inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700'>
                  总收听时长 {formatTotalSpeakingTime(totalSpeakingSeconds)}
                </span>
                <span className='inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700'>
                  学习天数 {studyDays} 天
                </span>
              </div>
            </div>
            <Link
              href='/manage/shadowing'
              className='ui-btn ui-btn-sm'>
              进入编辑模式
            </Link>
          </div>
        </header>

        <div className='space-y-6'>
          <MaterialSection
            title='跟读材料'
            subtitle='口语跟读材料（SPEAKING）'
            rows={speakingRows}
            collections={sectionCollections}
            playtimeByMaterialId={playtimeByMaterialId}
            emptyText='暂无跟读材料，请先在上传中心导入。'
          />
          <ListeningPaperSection
            rows={listeningRows}
            playtimeByMaterialId={playtimeByMaterialId}
          />
        </div>
      </div>
    </main>
  )
}
