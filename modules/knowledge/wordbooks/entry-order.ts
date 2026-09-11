import type { Prisma } from '@prisma/client'

// Imported entry order is authoritative; older books with no explicit order
// fall back to oldest-first vocabulary creation, matching /vocabulary.
export const WORDBOOK_ENTRY_ORDER = [
  { sortOrder: 'asc' },
  { vocabulary: { createdAt: 'asc' } },
  { vocabularyId: 'asc' },
] satisfies Prisma.WordbookVocabularyOrderByWithRelationInput[]

export type WordbookEntryMoveDirection = 'up' | 'down'

export function isWordbookEntryMoveDirection(
  value: string,
): value is WordbookEntryMoveDirection {
  return value === 'up' || value === 'down'
}

/** Move one entry by one authored-order slot without mutating the input. */
export function moveWordbookEntry(
  vocabularyIds: string[],
  vocabularyId: string,
  direction: WordbookEntryMoveDirection,
) {
  const sourceIndex = vocabularyIds.indexOf(vocabularyId)
  const targetIndex = sourceIndex + (direction === 'up' ? -1 : 1)
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= vocabularyIds.length
  ) {
    return null
  }
  const next = [...vocabularyIds]
  const source = next[sourceIndex]
  next[sourceIndex] = next[targetIndex]
  next[targetIndex] = source
  return next
}

/** Keep an imported batch in source order, including reused vocabulary IDs. */
export function planImportedWordbookOrder(
  vocabularyIds: string[],
  existing: Array<{ vocabularyId: string; sortOrder: number }>,
) {
  const ids = [...new Set(vocabularyIds)]
  const incoming = new Set(ids)
  const start = existing.reduce((max, entry) =>
    incoming.has(entry.vocabularyId) ? max : Math.max(max, entry.sortOrder), 0) + 1
  return ids.map((vocabularyId, index) => ({ vocabularyId, sortOrder: start + index }))
}
