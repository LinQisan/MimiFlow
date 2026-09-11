import type { FolderItem } from '../types'

export const listWordbooks = (wordbooks: FolderItem[]) =>
  wordbooks
    .slice()
    .sort(
      (left, right) =>
        left.seriesName.localeCompare(right.seriesName, 'zh-Hans-CN') ||
        left.name.localeCompare(right.name, 'zh-Hans-CN'),
    )
    .map(wordbook => ({
      ...wordbook,
      depth: 0,
      pathLabel: `${wordbook.seriesName} / ${wordbook.name}`,
      totalCount: wordbook.count || 0,
    }))

export const listWordbookFilterOptions = (wordbooks: FolderItem[]) => {
  const groups = new Map<
    string,
    { seriesName: string; wordbooks: ReturnType<typeof listWordbooks> }
  >()
  wordbooks.forEach(book => {
    const wordbook = { ...book, depth: 0, pathLabel: `${book.seriesName} / ${book.name}`, totalCount: book.count ?? 0 }
    const group = groups.get(wordbook.seriesId) || {
      seriesName: wordbook.seriesName,
      wordbooks: [],
    }
    group.wordbooks.push(wordbook)
    groups.set(wordbook.seriesId, group)
  })

  return [...groups.entries()].flatMap(([seriesId, group]) => [
    {
      value: `series:${seriesId}`,
      label: group.seriesName,
      selectedLabel: group.seriesName,
      depth: 0,
      meta: `${group.wordbooks.length} 个词表`,
    },
    ...group.wordbooks.map(wordbook => ({
      value: wordbook.id,
      label: wordbook.name,
      selectedLabel: wordbook.pathLabel,
      depth: 1,
      count: wordbook.totalCount,
    })),
  ])
}

export const getWordbookSeriesName = (pathLabel: string) =>
  pathLabel.split(' / ')[0]?.trim() || ''

export const parseWordbookFilter = (value: string) => {
  const normalized = value.trim().slice(0, 200) || 'all'
  if (normalized === 'all' || normalized === 'none') {
    return { kind: normalized } as const
  }
  if (normalized.startsWith('series:')) {
    return { kind: 'series', id: normalized.slice('series:'.length) } as const
  }
  return { kind: 'wordbook', id: normalized } as const
}

export const resolveWordbookFilterIds = (
  wordbooks: Array<{ id: string; pathLabel: string }>,
  value: string,
) => {
  const filter = parseWordbookFilter(value)
  if (filter.kind === 'all' || filter.kind === 'none') return new Set<string>()
  if (filter.kind === 'wordbook') return new Set([filter.id])
  return new Set(
    wordbooks
      .filter(wordbook => getWordbookSeriesName(wordbook.pathLabel) === filter.id)
      .map(wordbook => wordbook.id),
  )
}

// Input is already in the authored series/book order from the repository.
export const groupWordbooksForFilter = (wordbooks: FolderItem[]) => {
  const groups = new Map<string, { id: string; name: string; books: FolderItem[] }>()
  wordbooks.forEach(book => {
    const group = groups.get(book.seriesId) || { id: book.seriesId, name: book.seriesName, books: [] }
    group.books.push(book)
    groups.set(book.seriesId, group)
  })
  return [...groups.values()]
}
