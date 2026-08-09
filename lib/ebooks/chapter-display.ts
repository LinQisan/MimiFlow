export type EbookChapter = {
  id: string
  title: string
  text: string
  href: string
}

const normalize = (value: string) =>
  value.normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase()

const isLikelySectionHeading = (line: string, bookTitle: string) => {
  const normalizedLine = normalize(line)
  return Boolean(
    normalizedLine &&
      !normalizedLine.startsWith(bookTitle) &&
      line.length <= 20 &&
      !/[、。！？!?]/.test(line) &&
      !/^[「『（(]|[」』）)]$/.test(line),
  )
}

const isDisposableFrontMatter = (chapter: EbookChapter, bookTitle: string) => {
  const title = normalize(chapter.title)
  const text = normalize(chapter.text)
  if (!text) return true
  if (/^(cover|表紙|封面)$/.test(title) && text.length < 300) return true
  return title === normalize(bookTitle) && text.length < 120
}

export function prepareEbookChapters(
  chapters: EbookChapter[],
  bookTitle: string,
): EbookChapter[] {
  const readable = chapters.filter(
    chapter => !isDisposableFrontMatter(chapter, bookTitle),
  )
  const normalizedBookTitle = normalize(bookTitle)
  const withBaseTitle = readable.map((chapter, index) => {
    const originalTitle = normalize(chapter.title)
    if (originalTitle && originalTitle !== normalizedBookTitle) {
      return { chapter, baseTitle: chapter.title }
    }
    const candidate = chapter.text
      .split(/\n+/)
      .map(line => line.trim())
      .find(line => isLikelySectionHeading(line, normalizedBookTitle))
    return {
      chapter,
      baseTitle: candidate || `章节 ${String(index + 1).padStart(2, '0')}`,
    }
  })
  const titleCounts = withBaseTitle.reduce<Map<string, number>>((counts, item) => {
    const key = normalize(item.baseTitle)
    counts.set(key, (counts.get(key) || 0) + 1)
    return counts
  }, new Map())
  const occurrences = new Map<string, number>()

  return withBaseTitle.map(({ chapter, baseTitle }) => {
    const key = normalize(baseTitle)
    const occurrence = (occurrences.get(key) || 0) + 1
    occurrences.set(key, occurrence)

    const isDuplicate = (titleCounts.get(key) || 0) > 1
    const title = isDuplicate ? `${baseTitle} · ${occurrence}` : baseTitle

    return { ...chapter, title }
  })
}

export function removeRepeatedEbookHeadings(
  paragraphs: string[],
  bookTitle: string,
  chapterTitle: string,
) {
  const next = [...paragraphs]
  const normalizedBookTitle = normalize(bookTitle)
  const normalizedChapterTitle = normalize(chapterTitle)

  while (next.length > 1) {
    const first = normalize(next[0])
    const repeatsBookTitle =
      normalizedBookTitle.length >= 3 && first.startsWith(normalizedBookTitle)
    const repeatsChapterTitle =
      normalizedChapterTitle.length >= 1 && first === normalizedChapterTitle
    if (!repeatsBookTitle && !repeatsChapterTitle) break
    next.shift()
  }

  return next
}
