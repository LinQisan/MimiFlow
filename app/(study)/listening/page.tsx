// Listening library route.
// Library entry cards render client-side from plain row data so the server
// does not serialize hidden row trees into the RSC stream on every request.
import { listListeningMaterialsForShadowing } from '@/lib/repositories/materials'
import { getListeningLibrarySource } from '@/features/listening/server/library-service'
import ListeningViewSwitcher, {
  type ListeningLibraryEntry,
} from '@/features/listening/ui/ListeningViewSwitcher'
import LibraryEntryContent, {
  type LibraryEntryRow,
} from '@/features/listening/ui/LibraryEntryCards'

export const revalidate = 60

type ShadowingRow = Awaited<
  ReturnType<typeof listListeningMaterialsForShadowing>
>[number]

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

function toEntryRow(
  item: ShadowingRow,
  playtimeByMaterialId: Record<string, number>,
): LibraryEntryRow {
  return {
    id: item.id,
    title: item.title,
    materialId: item.materialId,
    totalSeconds: playtimeByMaterialId[item.materialId] || 0,
    chapterLabel: (item.chapterName || '').trim() || undefined,
  }
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
    const sourceChapters = chapters
      .filter(chapter => chapter.parentId === book.id)
      .map(chapter => ({
        id: chapter.id,
        title: chapter.title,
        sourceRows: materialsByChapter[chapter.id] || [],
      }))
      .filter(chapter => chapter.sourceRows.length > 0)
    if (sourceChapters.length === 0) return []
    const sourceRows = sourceChapters.flatMap(chapter => chapter.sourceRows)
    const visibleChapters = sourceChapters.map(chapter => ({
      id: chapter.id,
      title: chapter.title,
      rows: chapter.sourceRows.map(item => toEntryRow(item, playtimeByMaterialId)),
    }))
    const languages = entryLanguages(sourceRows, book.title)
    return [{
      id: `shadowing-book:${book.id}`,
      kind: 'shadowing' as const,
      title: book.title,
      searchText: [book.title, ...languages, ...visibleChapters.map(chapter => chapter.title), ...sourceRows.map(rowSearchText)].join(' '),
      languages,
      itemCount: sourceRows.length,
      content: (
        <LibraryEntryContent
          data={{ variant: 'book', title: book.title, chapters: visibleChapters }}
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
      <LibraryEntryContent
        data={{ variant: 'material', row: toEntryRow(item, playtimeByMaterialId) }}
      />
    ),
  }))
  return [...bookEntries, ...unclassifiedEntries]
}

type ListeningPaperSectionGroup = {
  key: string
  title: string
  items: LibraryEntryRow[]
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
      const row = toEntryRow(item, playtimeByMaterialId)
      if (current) current.items.push(row)
      else acc.push({ key, title, items: [row] })
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
        <LibraryEntryContent
          data={{ variant: 'paper', title: group.paperTitle, sections }}
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
