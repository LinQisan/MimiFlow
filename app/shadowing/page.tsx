import Link from 'next/link'

import { listListeningMaterialsForShadowing } from '@/lib/repositories/materials.repo'
import prisma from '@/lib/prisma'

type ShadowingRow = Awaited<
  ReturnType<typeof listListeningMaterialsForShadowing>
>[number]

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

function MaterialCard({ item }: { item: ShadowingRow }) {
  return (
    <Link
      href={`/shadowing/${item.id}`}
      className='group block rounded-2xl border border-slate-200 bg-slate-100 p-5 transition-colors hover:border-slate-300 hover:bg-slate-50'>
      <div className='flex items-start justify-between gap-3'>
        <h3 className='mt-2 line-clamp-2 text-base font-bold leading-snug text-slate-800 md:text-lg'>
          {item.title}
        </h3>
      </div>
    </Link>
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
          <div className='space-y-6'>
            {books.map(book => {
              const bookChapters = chapters.filter(
                item => item.parentId === book.id,
              )
              const visibleChapters = bookChapters.filter(
                chapter => (materialsByChapter[chapter.id] || []).length > 0,
              )

              if (visibleChapters.length === 0) return null

              return (
                <section
                  key={book.id}
                  className='rounded-3xl border border-slate-200 bg-[#f3f4f6] p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05)] md:p-8'>
                  <h2 className='text-xl font-semibold text-slate-800 md:text-2xl'>
                    {book.title}
                  </h2>
                  <div className='mt-4 inline-flex rounded-full bg-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-500'>
                    共{' '}
                    {visibleChapters.reduce(
                      (sum, chapter) =>
                        sum + (materialsByChapter[chapter.id] || []).length,
                      0,
                    )}{' '}
                    条
                  </div>
                  <div className='my-6 border-t border-slate-200' />
                  <div className='space-y-5'>
                    {visibleChapters.map(chapter => {
                      const chapterRows = materialsByChapter[chapter.id] || []
                      return (
                        <div key={chapter.id}>
                          <div className='mb-3 flex items-center justify-between gap-2 px-1'>
                            <h3 className='text-base font-semibold text-slate-700'>
                              {chapter.title}
                            </h3>
                            <span className='text-sm font-medium text-slate-500'>
                              {chapterRows.length} 条
                            </span>
                          </div>
                          <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5'>
                            {chapterRows.map(item => (
                              <MaterialCard key={item.id} item={item} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}

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
                    <MaterialCard key={item.id} item={item} />
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
