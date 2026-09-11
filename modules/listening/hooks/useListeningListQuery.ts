'use client'

import { useDeferredValue, useMemo } from 'react'
import {
  filterListeningRows,
  sortListeningRows,
  type CollectionNode,
  type ShadowingRow,
} from '../domain/listening-list'

type QueryInput = {
  rows: ShadowingRow[]
  collections: CollectionNode[]
  search: string
  statusFilter: string
  materialTypeFilter: string
  bookFilter: string
  chapterFilter: string
  paperFilter: string
  workspace: 'mixed' | 'listening' | 'shadowing'
  managePage: number
}

export function useListeningListQuery(input: QueryInput) {
  const deferredSearch = useDeferredValue(input.search)
  const roots = useMemo(
    () => sortCollections(input.collections, 'LIBRARY_ROOT'),
    [input.collections],
  )
  const books = useMemo(
    () => sortCollections(input.collections, 'BOOK'),
    [input.collections],
  )
  const chapters = useMemo(
    () => sortCollections(input.collections, 'CHAPTER'),
    [input.collections],
  )
  const papers = useMemo(
    () => sortCollections(input.collections, 'PAPER'),
    [input.collections],
  )
  const collectionById = useMemo(
    () =>
      input.collections.reduce<Record<string, CollectionNode>>((index, item) => {
        index[item.id] = item
        return index
      }, {}),
    [input.collections],
  )
  const chapterOptions = useMemo(
    () =>
      chapters.map(chapter => {
        const book = chapter.parentId ? collectionById[chapter.parentId] : undefined
        const root = book?.parentId ? collectionById[book.parentId] : undefined
        return {
          id: chapter.id,
          label: [root?.title, book?.title, chapter.title].filter(Boolean).join(' / '),
        }
      }),
    [chapters, collectionById],
  )
  const filteredChapterOptions = useMemo(
    () =>
      input.bookFilter === 'all'
        ? chapterOptions
        : chapterOptions.filter(option =>
            collectionById[option.id]?.parentId ===
            input.bookFilter,
          ),
    [chapterOptions, collectionById, input.bookFilter],
  )
  const filteredRows = useMemo(
    () =>
      filterListeningRows({
        rows: input.rows,
        search: deferredSearch,
        statusFilter: input.statusFilter,
        materialTypeFilter: input.materialTypeFilter,
        bookFilter: input.bookFilter,
        chapterFilter: input.chapterFilter,
        paperFilter: input.paperFilter,
        workspace: input.workspace,
      }),
    [
      deferredSearch,
      input.bookFilter,
      input.chapterFilter,
      input.materialTypeFilter,
      input.paperFilter,
      input.rows,
      input.statusFilter,
      input.workspace,
    ],
  )
  const sortedRows = useMemo(() => sortListeningRows(filteredRows), [filteredRows])
  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const normalizedPage = Math.min(input.managePage, totalPages)
  const visibleManageRows = useMemo(
    () => sortedRows.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize),
    [normalizedPage, sortedRows],
  )
  const counts = useMemo(
    () =>
      input.rows.reduce(
        (summary, item) => {
          if (!item.isClassified) summary.unclassified += 1
          if (item.materialType === 'LISTENING') summary.listening += 1
          if (item.materialType === 'SPEAKING') summary.speaking += 1
          if (item.needsQuestion) summary.needsQuestion += 1
          if (item.needsSection) summary.needsSection += 1
          return summary
        },
        {
          unclassified: 0,
          listening: 0,
          speaking: 0,
          needsQuestion: 0,
          needsSection: 0,
        },
      ),
    [input.rows],
  )

  return {
    roots,
    books,
    chapters,
    papers,
    chapterOptions,
    filteredChapterOptions,
    filteredRows,
    sortedRows,
    visibleManageRows,
    totalPages,
    normalizedPage,
    counts,
  }
}

function sortCollections(
  collections: CollectionNode[],
  type: CollectionNode['collectionType'],
) {
  return collections
    .filter(item => item.collectionType === type)
    .sort((left, right) =>
      left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'zh-CN'),
    )
}
