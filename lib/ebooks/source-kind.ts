const EBOOK_SOURCE_KINDS = ['EPUB', 'PASTED_BOOK'] as const

type EbookSourceKind = (typeof EBOOK_SOURCE_KINDS)[number]

export function isEbookSourceKind(value: string | null | undefined) {
  return EBOOK_SOURCE_KINDS.includes(value as EbookSourceKind)
}

export function getEbookSourceLabel(value: string | null | undefined) {
  if (value === 'EPUB') return 'EPUB'
  return '专业书籍'
}
