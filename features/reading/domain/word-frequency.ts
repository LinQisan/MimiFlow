import type { WordFrequencyRow } from '../../../modules/language/domain/sudachi.ts'

const normalizeWord = (word: string) =>
  word.normalize('NFKC').trim().toLocaleLowerCase('ja')

export function filterReadingFrequencyRowsByWordbooks(
  rows: WordFrequencyRow[],
  selectedIds: ReadonlySet<string>,
  includeOutside: boolean,
  wordbooks: Array<{ id: string; matchedWords: string[] }>,
  outsideWords: string[],
) {
  if (selectedIds.size === 0 && !includeOutside) return rows
  const allowedWords = new Set(
    [
      ...wordbooks
        .filter(wordbook => selectedIds.has(wordbook.id))
        .flatMap(wordbook => wordbook.matchedWords),
      ...(includeOutside ? outsideWords : []),
    ].map(normalizeWord),
  )
  return rows.filter(row => allowedWords.has(normalizeWord(row.word)))
}
