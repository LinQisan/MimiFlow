// Listening library route.
import Link from 'next/link'
import { listListeningMaterialsForShadowing } from '@/lib/repositories/materials'
import { getListeningLibrarySource } from '@/features/listening/server/library-service'
import ListeningViewSwitcher, {
  type ListeningLibraryEntry,
} from '@/features/listening/ui/ListeningViewSwitcher'
import DeferredDetails from '@/features/listening/ui/DeferredDetails'

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
      className='group block rounded-xl border border-slate-200 bg-white px-4 py-4 transition hover:border-slate-300 hover:shadow-[0_12px_30px_-28px_rgba(15,23,42,0.5)]'>
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
    <DeferredDetails
      className='group/chapter overflow-hidden rounded-xl border border-slate-200 bg-white transition open:border-slate-300'
      summary={
        <summary className='flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 marker:content-none'>
        <h3 className='line-clamp-1 text-sm font-semibold tracking-tight text-slate-900'>
          {chapterTitle}
        </h3>
        <span className='flex shrink-0 items-center gap-2'>
          <span className='rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600'>{rows.length} 条</span>
          <span
            aria-hidden
            className='inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-slate-400 transition-transform group-open/chapter:rotate-180'>
            ⌄
          </span>
        </span>
        </summary>
      }>
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
    </DeferredDetails>
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

function MaterialBookCard({
  title,
  chapters,
  playtimeByMaterialId,
}: {
  title: string
  chapters: Array<{ id: string; title: string; rows: ShadowingRow[] }>
  playtimeByMaterialId: Record<string, number>
}) {
  const totalMaterials = chapters.reduce((sum, chapter) => sum + chapter.rows.length, 0)
  return (
    <DeferredDetails
      className='group w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_10px_30px_-28px_rgba(15,23,42,0.45)] transition open:border-slate-300 open:shadow-[0_18px_42px_-30px_rgba(15,23,42,0.4)]'
      summary={
        <summary className='flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none md:px-6'>
        <div className='min-w-0'>
          <h3 className='text-base font-semibold leading-snug tracking-tight text-slate-900 md:text-lg'>{title}</h3>
          <p className='mt-1 text-xs text-slate-400'>{chapters.length} 个章节</p>
        </div>
        <span className='flex shrink-0 items-center gap-2'>
          <span className='rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600'>{totalMaterials} 条</span>
          <span aria-hidden className='inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-400 transition-transform group-open:rotate-180'>⌄</span>
        </span>
        </summary>
      }>
      <div className='space-y-2 border-t border-slate-100 bg-slate-50/60 p-3 md:p-4'>
        {chapters.map(chapter => (
          <ChapterScrollItem
            key={chapter.id}
            chapterTitle={chapter.title}
            rows={chapter.rows}
            playtimeByMaterialId={playtimeByMaterialId}
          />
        ))}
      </div>
    </DeferredDetails>
  )
}

function rowSearchText(row: ShadowingRow) {
  return [
    row.title,
    row.chapterName,
    row.pathLabel,
    row.language,
    row.difficulty,
    row.source,
    ...row.tags,
  ].join(' ')
}

function materialLanguageLabel(value: string, context: string) {
  const normalized = value.trim().normalize('NFKC').toLowerCase()
  if (['ja', 'jp', 'japanese', '日语', '日語', '日本語'].includes(normalized)) return '日语'
  if (['en', 'eng', 'english', '英语', '英語'].includes(normalized)) return '英语'
  if (['zh', 'cn', 'chinese', '中文', '汉语', '漢語'].includes(normalized)) return '中文'
  if (normalized) return value.trim()

  const evidence = context.normalize('NFKC')
  if (/english|英语|英語|新概念/i.test(evidence)) return '英语'
  if (/japanese|日语|日語|日本語|jlpt|(^|\W)n[1-5](\W|$)|シャドーイング|面接編|天声人语|[ぁ-んァ-ヶ]/i.test(evidence)) return '日语'
  if (/chinese|中文|汉语|漢語/i.test(evidence)) return '中文'
  return '未设置'
}

function entryLanguages(rows: ShadowingRow[], context: string) {
  return Array.from(
    new Set(rows.map(row => materialLanguageLabel(row.language, `${context} ${rowSearchText(row)}`))),
  ).sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function buildShadowingEntries(
  rows: ShadowingRow[],
  collections: Array<{
    id: string
    title: string
    collectionType: 'BOOK' | 'CHAPTER'
    parentId: string | null
    sortOrder: number
  }>,
  playtimeByMaterialId: Record<string, number>,
): ListeningLibraryEntry[] {
  const { books, chapters, materialsByChapter, unclassifiedRows } = buildSectionData(rows, collections)
  const bookEntries = books.flatMap(book => {
    const visibleChapters = chapters
      .filter(chapter => chapter.parentId === book.id)
      .map(chapter => ({
        id: chapter.id,
        title: chapter.title,
        rows: materialsByChapter[chapter.id] || [],
      }))
      .filter(chapter => chapter.rows.length > 0)
    if (visibleChapters.length === 0) return []
    const bookRows = visibleChapters.flatMap(chapter => chapter.rows)
    const languages = entryLanguages(bookRows, book.title)
    return [{
      id: `shadowing-book:${book.id}`,
      kind: 'shadowing' as const,
      title: book.title,
      searchText: [book.title, ...languages, ...visibleChapters.map(chapter => chapter.title), ...bookRows.map(rowSearchText)].join(' '),
      languages,
      itemCount: bookRows.length,
      content: (
        <MaterialBookCard
          title={book.title}
          chapters={visibleChapters}
          playtimeByMaterialId={playtimeByMaterialId}
        />
      ),
    }]
  })
  const unclassifiedEntries = unclassifiedRows.map(item => ({
    id: `shadowing-material:${item.id}`,
    kind: 'shadowing' as const,
    title: item.title,
    searchText: `${rowSearchText(item)} ${materialLanguageLabel(item.language, rowSearchText(item))}`,
    languages: [materialLanguageLabel(item.language, rowSearchText(item))],
    itemCount: 1,
    content: (
      <MaterialCard
        item={item}
        totalSeconds={playtimeByMaterialId[item.materialId] || 0}
      />
    ),
  }))
  return [...bookEntries, ...unclassifiedEntries]
}

type ListeningPaperSectionGroup = {
  key: string
  title: string
  items: ShadowingRow[]
}

function ListeningPaperCard({
  title,
  items,
  sections,
  playtimeByMaterialId,
}: {
  title: string
  items: ShadowingRow[]
  sections: ListeningPaperSectionGroup[]
  playtimeByMaterialId: Record<string, number>
}) {
  return (
    <DeferredDetails
      className='group w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_10px_30px_-28px_rgba(15,23,42,0.45)] transition open:border-slate-300 open:shadow-[0_18px_42px_-30px_rgba(15,23,42,0.4)]'
      summary={
        <summary className='flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none md:px-6'>
        <div className='min-w-0'>
          <h3 className='text-base font-semibold leading-snug tracking-tight text-slate-900 md:text-lg'>{title}</h3>
          <p className='mt-1 text-xs text-slate-400'>{sections.length} 个問題</p>
        </div>
        <span className='flex shrink-0 items-center gap-2'>
          <span className='rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600'>{items.length} 条</span>
          <span aria-hidden className='inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-400 transition-transform group-open:rotate-180'>⌄</span>
        </span>
        </summary>
      }>
      <div className='space-y-2 border-t border-slate-100 bg-slate-50/60 p-3 md:p-4'>
        {sections.map(section => (
          <DeferredDetails
            key={section.key}
            className='group/section overflow-hidden rounded-xl border border-slate-200 bg-white transition open:border-slate-300'
            summary={<summary className='flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 marker:content-none'>
              <span className='text-sm font-semibold text-slate-900'>{section.title}</span>
              <span className='flex items-center gap-2'>
                <span className='rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600'>{section.items.length} 条</span>
                <span aria-hidden className='inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-slate-400 transition-transform group-open/section:rotate-180'>⌄</span>
              </span>
            </summary>}>
            <div className='max-h-[min(28rem,70vh)] overflow-y-auto border-t border-slate-100 px-3'>
              {section.items.map((item, index) => (
                <Link
                  key={item.id}
                  href={`/listening/${item.id}`}
                  className='group/item grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-slate-100 py-3 text-sm last:border-b-0 hover:bg-slate-50'>
                  <span className='text-xs font-semibold tabular-nums text-slate-400'>{String(index + 1).padStart(2, '0')}</span>
                  <span className='line-clamp-1 font-medium text-slate-700 group-hover/item:text-slate-900'>{item.title}</span>
                  <PlaytimeLabel seconds={playtimeByMaterialId[item.materialId] || 0} />
                </Link>
              ))}
            </div>
          </DeferredDetails>
        ))}
      </div>
    </DeferredDetails>
  )
}

function buildListeningPaperEntries(
  rows: ShadowingRow[],
  playtimeByMaterialId: Record<string, number>,
): ListeningLibraryEntry[] {
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
  return groups.map(group => {
    const sections = group.items.reduce<ListeningPaperSectionGroup[]>((acc, item) => {
      const sectionNumber = item.listeningSectionNumber
      const key = sectionNumber ? `section:${sectionNumber}` : 'section:other'
      const title = sectionNumber ? `問題${sectionNumber}` : '其他材料'
      const current = acc.find(section => section.key === key)
      if (current) current.items.push(item)
      else acc.push({ key, title, items: [item] })
      return acc
    }, [])
    sections.sort((a, b) => compareNaturalText(a.title, b.title))
    return {
      id: `exam-paper:${group.key}`,
      kind: 'exam' as const,
      title: group.paperTitle,
      searchText: [group.paperTitle, ...entryLanguages(group.items, group.paperTitle), ...sections.map(section => section.title), ...group.items.map(rowSearchText)].join(' '),
      languages: entryLanguages(group.items, group.paperTitle),
      itemCount: group.items.length,
      content: (
        <ListeningPaperCard
          title={group.paperTitle}
          items={group.items}
          sections={sections}
          playtimeByMaterialId={playtimeByMaterialId}
        />
      ),
    }
  })
}

export default async function ShadowingListPage() {
  const {
    speakingRows,
    listeningRows,
    collections,
    summary: { totalSeconds: totalSpeakingSeconds, studyDays },
    playtimeByMaterialId,
  } = await getListeningLibrarySource()
  const sectionCollections = collections
    .filter(item => isBookOrChapterCollection(item.collectionType))
    .map(item => ({
      id: item.id,
      title: item.title,
      collectionType: item.collectionType as 'BOOK' | 'CHAPTER',
      parentId: item.parentId,
      sortOrder: item.sortOrder,
    }))
  const libraryEntries = [
    ...buildShadowingEntries(
      speakingRows,
      sectionCollections,
      playtimeByMaterialId,
    ),
    ...buildListeningPaperEntries(listeningRows, playtimeByMaterialId),
  ]

  return (
    <main className='min-h-screen bg-slate-50 px-4 pb-6 pt-0 md:!pt-0 md:px-8 md:pb-8'>
      <div className='mx-auto max-w-7xl'>
        <header>
          <dl className='grid grid-cols-2 border-b border-slate-200 py-4 md:grid-cols-4'>
            <div className='border-r border-slate-200 pr-4'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>跟读材料</dt>
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{speakingRows.length}</dd>
            </div>
            <div className='pl-4 md:border-r md:border-slate-200 md:pr-4'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>试卷听力</dt>
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{listeningRows.length}</dd>
            </div>
            <div className='mt-4 border-r border-slate-200 pr-4 md:mt-0 md:pl-4'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>累计收听</dt>
              <dd className='mt-1 text-sm font-semibold text-slate-950 md:text-base'>{formatTotalSpeakingTime(totalSpeakingSeconds)}</dd>
            </div>
            <div className='mt-4 pl-4 md:mt-0'>
              <dt className='text-[11px] font-bold tracking-[0.08em] text-slate-400'>学习天数</dt>
              <dd className='mt-1 text-xl font-semibold tabular-nums text-slate-950'>{studyDays}</dd>
            </div>
          </dl>

        </header>

        <ListeningViewSwitcher entries={libraryEntries} />
      </div>
    </main>
  )
}
