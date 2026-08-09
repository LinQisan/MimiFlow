// Listening library route.
import Link from 'next/link'
import { StudyTimeKind } from '@prisma/client'

import {
  listListeningLessonsForShadowing,
  listListeningMaterialsForShadowing,
} from '@/lib/repositories/materials'
import prisma from '@/lib/prisma'
import PageHeader from '@/components/layout/PageHeader'

export const revalidate = 60

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

function PlaytimeLabel({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null
  return (
    <span className='shrink-0 text-[11px] font-semibold text-slate-500'>
      {formatPlaytimeCompact(seconds)}
    </span>
  )
}

function sortByOrderAndTitle<T extends { sortOrder: number; title: string }>(
  a: T,
  b: T,
) {
  return a.sortOrder - b.sortOrder || compareNaturalText(a.title, b.title)
}

function compareNaturalText(a: string, b: string) {
  const partsA = a.normalize('NFKC').toLowerCase().match(/\d+|\D+/g) || []
  const partsB = b.normalize('NFKC').toLowerCase().match(/\d+|\D+/g) || []
  const length = Math.max(partsA.length, partsB.length)

  for (let index = 0; index < length; index += 1) {
    const partA = partsA[index] || ''
    const partB = partsB[index] || ''
    if (partA === partB) continue
    const numericA = /^\d+$/.test(partA)
    const numericB = /^\d+$/.test(partB)
    if (numericA && numericB) {
      const difference = Number(partA) - Number(partB)
      if (difference !== 0) return difference
    }
    return partA < partB ? -1 : 1
  }
  return 0
}

function sortMaterial(a: ShadowingRow, b: ShadowingRow) {
  const chapterA = (a.chapterName || '').trim() || '未设置章节'
  const chapterB = (b.chapterName || '').trim() || '未设置章节'
  const byChapter = compareNaturalText(chapterA, chapterB)
  if (byChapter !== 0) return byChapter
  const byTitle = compareNaturalText(a.title, b.title)
  if (byTitle !== 0) return byTitle
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function MaterialCard({
  item,
  totalSeconds,
}: {
  item: ShadowingRow
  totalSeconds: number
}) {
  const chapterLabel = (item.chapterName || '').trim()
  const showChapter = chapterLabel && chapterLabel !== item.title.trim()
  return (
    <Link
      href={`/listening/${item.id}`}
      className='group block w-[16rem] shrink-0 border-b border-slate-200 bg-transparent px-1 py-4 transition hover:bg-slate-50 sm:w-auto sm:border-r sm:px-4 sm:last:border-r-0'>
      <h3 className='line-clamp-2 text-base font-semibold leading-snug tracking-tight text-slate-900'>
        {showChapter ? (
          <span className='text-slate-500'>{chapterLabel} · </span>
        ) : null}
        {item.title}
      </h3>
      {totalSeconds > 0 && (
        <p className='mt-3 text-xs font-semibold text-slate-500'>
          已听 {formatPlaytimeCompact(totalSeconds)}
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
    <details className='group/chapter border-y border-slate-200'>
      <summary className='flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 marker:content-none'>
        <h3 className='line-clamp-1 text-sm font-semibold tracking-tight text-slate-900'>
          {chapterTitle}
        </h3>
        <span className='flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500'>
          {rows.length} 条
          <span
            aria-hidden
            className='transition-transform group-open/chapter:rotate-180'>
            ⌄
          </span>
        </span>
      </summary>
      <div className='max-h-[min(28rem,70vh)] overflow-y-auto border-t border-slate-100 px-3'>
        {rows.map((item, index) => (
          <Link
            key={item.id}
            href={`/listening/${item.id}`}
            className='group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-100 py-3 text-sm last:border-b-0 hover:bg-slate-50'>
            <span className='text-xs font-semibold tabular-nums text-slate-400'>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className='line-clamp-1 font-medium text-slate-700 group-hover:text-slate-900'>
              {item.title}
            </span>
            <PlaytimeLabel
              seconds={playtimeByMaterialId[item.materialId] || 0}
            />
          </Link>
        ))}
      </div>
    </details>
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
  rows,
  collections,
  playtimeByMaterialId,
  emptyText,
}: {
  title: string
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
    <section className='space-y-4 border-t border-slate-200 pt-5'>
      <header className='flex items-end justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight text-slate-900'>
            {title}
          </h2>
          <p className='mt-1 text-xs text-slate-500'>
            先展开教材，再选择章节；长章节可在列表内滚动。
          </p>
        </div>
        <span className='shrink-0 text-xs font-semibold text-slate-500'>
          共 {rows.length} 条
        </span>
      </header>

      {rows.length === 0 ? (
        <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500'>
          {emptyText}
        </div>
      ) : (
        <div className='space-y-6'>
          <div className='divide-y divide-slate-200 border-y border-slate-200'>
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
                <details
                  key={book.id}
                  className='group w-full'>
                  <summary className='flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-1 py-3 marker:content-none md:px-3'>
                    <h3 className='min-w-0 text-base font-semibold leading-snug tracking-tight text-slate-900'>
                      {book.title}
                    </h3>
                    <span className='flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500'>
                      {totalMaterials} 条
                      <span aria-hidden className='transition-transform group-open:rotate-180'>⌄</span>
                    </span>
                  </summary>

                  <div className='grid gap-2 border-t border-slate-100 bg-slate-50/60 px-1 py-3 md:grid-cols-2 md:px-3'>
                    {visibleChapters.map(chapter => (
                      <ChapterScrollItem
                        key={chapter.id}
                        chapterTitle={chapter.title}
                        rows={materialsByChapter[chapter.id] || []}
                        playtimeByMaterialId={playtimeByMaterialId}
                      />
                    ))}
                  </div>
                </details>
              )
            })}
          </div>

          {unclassifiedRows.length > 0 ? (
            <section className='border-t border-slate-200 pt-5'>
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
  groups.sort((a, b) => compareNaturalText(a.paperTitle, b.paperTitle))

  return (
    <section className='space-y-4 border-t border-slate-200 pt-5'>
      <header className='flex items-end justify-between gap-3'>
        <div>
          <h2 className='text-xl font-semibold tracking-tight text-slate-900'>
            试卷听力
          </h2>
          <p className='mt-1 text-xs text-slate-500'>
            先展开试卷，再按問題浏览材料。
          </p>
        </div>
        <span className='shrink-0 text-xs font-semibold text-slate-500'>
          共 {rows.length} 条
        </span>
      </header>

      {rows.length === 0 ? (
        <div className='rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500'>
          暂无听力材料。
        </div>
      ) : (
        <div className='divide-y divide-slate-200 border-y border-slate-200'>
          {groups.map(group => {
            const sectionGroups = group.items.reduce<
              Array<{ key: string; title: string; items: ShadowingRow[] }>
            >((acc, item) => {
              const sectionNumber = item.listeningSectionNumber
              const key = sectionNumber ? `section:${sectionNumber}` : 'section:other'
              const title = sectionNumber ? `問題${sectionNumber}` : '其他材料'
              const current = acc.find(section => section.key === key)
              if (current) current.items.push(item)
              else acc.push({ key, title, items: [item] })
              return acc
            }, [])
            sectionGroups.sort((a, b) => compareNaturalText(a.title, b.title))

            return (
            <details key={group.key} className='group w-full'>
              <summary className='flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-1 py-3 marker:content-none md:px-3'>
                <h3 className='min-w-0 text-base font-semibold leading-snug tracking-tight text-slate-900'>
                  {group.paperTitle}
                </h3>
                <span className='flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500'>
                  {group.items.length} 条
                  <span aria-hidden className='transition-transform group-open:rotate-180'>⌄</span>
                </span>
              </summary>

              <div className='grid gap-2 border-t border-slate-100 bg-slate-50/60 px-1 py-3 md:grid-cols-2 md:px-3'>
                {sectionGroups.map(section => (
                  <details
                    key={section.key}
                    className='group/section rounded-lg border border-slate-200 bg-white'>
                    <summary className='flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 marker:content-none'>
                      <span className='text-sm font-semibold text-slate-900'>
                        {section.title}
                      </span>
                      <span className='flex items-center gap-2 text-xs font-semibold text-slate-500'>
                        {section.items.length} 条
                        <span
                          aria-hidden
                          className='transition-transform group-open/section:rotate-180'>
                          ⌄
                        </span>
                      </span>
                    </summary>
                    <div className='max-h-[min(28rem,70vh)] overflow-y-auto border-t border-slate-100 px-3'>
                      {section.items.map((item, index) => (
                        <Link
                          key={item.id}
                          href={`/listening/${item.id}`}
                          className='group/item grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-100 py-3 text-sm last:border-b-0 hover:bg-slate-50'>
                          <span className='text-xs font-semibold tabular-nums text-slate-400'>
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className='line-clamp-1 font-medium text-slate-700 group-hover/item:text-slate-900'>
                            {item.title}
                          </span>
                          <PlaytimeLabel
                            seconds={playtimeByMaterialId[item.materialId] || 0}
                          />
                        </Link>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
            )
          })}
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

  let stats: Array<{
    materialId: string
    totalSeconds: number
    lastPlayedAt: Date | null
  }> = []
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
        lastPlayedAt: true,
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
  const lastPlayedAtByMaterialId = stats.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.materialId] = item.lastPlayedAt?.getTime() || 0
      return acc
    },
    {},
  )
  const continueRows = [...speakingRows, ...listeningRows]
    .filter(item => (playtimeByMaterialId[item.materialId] || 0) > 0)
    .sort(
      (a, b) =>
        (lastPlayedAtByMaterialId[b.materialId] || 0) -
          (lastPlayedAtByMaterialId[a.materialId] || 0) ||
        (playtimeByMaterialId[b.materialId] || 0) -
          (playtimeByMaterialId[a.materialId] || 0),
    )
    .slice(0, 4)
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
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl'>
        <PageHeader
          title='听力与跟读'
          description='从最近内容继续，或浏览跟读教材和 JLPT 试卷。'
          meta={<>
            <span>跟读 {formatTotalSpeakingTime(totalSpeakingSeconds)}</span>
            <span>{studyDays} 天</span>
          </>}
        />

        <div className='space-y-7'>
          {continueRows.length > 0 ? (
            <section>
              <div className='mb-3 flex items-end justify-between gap-3'>
                <div>
                  <h2 className='text-xl font-black text-slate-900'>最近收听</h2>
                </div>
              </div>
              <div className='flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-4'>
                {continueRows.map(item => (
                  <MaterialCard
                    key={item.id}
                    item={item}
                    totalSeconds={playtimeByMaterialId[item.materialId] || 0}
                  />
                ))}
              </div>
            </section>
          ) : null}
          <MaterialSection
            title='跟读材料'
            rows={speakingRows}
            collections={sectionCollections}
            playtimeByMaterialId={playtimeByMaterialId}
            emptyText='暂无跟读材料。'
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
