export type CollectionNode = {
  id: string
  title: string
  collectionType:
    | 'LIBRARY_ROOT'
    | 'BOOK'
    | 'CHAPTER'
    | 'PAPER'
    | 'CUSTOM_GROUP'
  parentId: string | null
  sortOrder: number
  description: string | null
  language: string | null
  level: string | null
  _count: {
    materials: number
    children: number
  }
}

export type ShadowingRow = {
  id: string
  materialId: string
  materialType: 'SPEAKING' | 'LISTENING' | 'READING' | 'VOCAB_GRAMMAR'
  chapterName: string
  title: string
  audioFile: string
  description: string
  transcript: string
  source: string
  language: string
  difficulty: string
  tags: string[]
  tagsText: string
  dialogueCount: number
  questionCount: number
  listeningSectionNumber: number | null
  needsQuestion: boolean
  needsSection: boolean
  collectionId: string | null
  collectionType: CollectionNode['collectionType'] | null
  isExamMaterial: boolean
  rootId: string | null
  bookId: string | null
  chapterId: string | null
  hierarchyPath: string[]
  pathLabel: string
  isClassified: boolean
}

const collator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
})

export function filterListeningRows(input: {
  rows: ShadowingRow[]
  search: string
  statusFilter: string
  materialTypeFilter: string
  bookFilter: string
  chapterFilter: string
  paperFilter: string
  workspace: 'mixed' | 'listening' | 'shadowing'
}) {
  const keyword = input.search.trim().toLowerCase()
  return input.rows.filter(row => {
    if (input.workspace === 'listening' && row.materialType !== 'LISTENING') return false
    if (input.workspace === 'shadowing' && row.materialType !== 'SPEAKING') return false
    if (
      keyword &&
      !`${row.chapterName} ${row.title} ${row.audioFile} ${row.pathLabel}`
        .toLowerCase()
        .includes(keyword)
    ) return false
    if (
      input.statusFilter === 'ready' &&
      (!row.isClassified || row.needsQuestion || row.needsSection)
    ) return false
    if (input.statusFilter === 'unclassified' && row.isClassified) return false
    if (input.statusFilter === 'classified' && !row.isClassified) return false
    if (input.statusFilter === 'needsQuestion' && !row.needsQuestion) return false
    if (input.statusFilter === 'needsSection' && !row.needsSection) return false
    if (
      input.workspace === 'mixed' &&
      input.materialTypeFilter !== 'all' &&
      row.materialType !== input.materialTypeFilter
    ) return false
    if (
      input.workspace === 'shadowing' &&
      input.bookFilter !== 'all' &&
      row.bookId !== input.bookFilter
    ) return false
    if (
      input.workspace === 'shadowing' &&
      input.chapterFilter !== 'all' &&
      row.chapterId !== input.chapterFilter
    ) return false
    if (
      input.workspace === 'listening' &&
      input.paperFilter !== 'all' &&
      row.collectionId !== input.paperFilter
    ) return false
    return true
  })
}

export function sortListeningRows(rows: ShadowingRow[]) {
  return [...rows].sort((left, right) => {
    const byPath = collator.compare(left.pathLabel, right.pathLabel)
    if (byPath !== 0) return byPath
    const bySection =
      (left.listeningSectionNumber || Number.MAX_SAFE_INTEGER) -
      (right.listeningSectionNumber || Number.MAX_SAFE_INTEGER)
    if (bySection !== 0) return bySection
    const byTitle = collator.compare(left.title, right.title)
    return byTitle || collator.compare(left.id, right.id)
  })
}
