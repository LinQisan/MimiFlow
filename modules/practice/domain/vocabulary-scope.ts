/** Resolve real leaf lists without confusing a book (series) with a list. */
export function resolveVocabularyScopeIds(
  lists: ReadonlyArray<{ id: string; seriesId: string }>,
  mode: 'all' | 'series' | 'wordbook',
  id: string,
): string[] {
  if (mode === 'all') return []
  return lists.filter(list => mode === 'series' ? list.seriesId === id : list.id === id).map(list => list.id)
}

const normalize = (word: string) => word.normalize('NFKC').trim().toLocaleLowerCase('ja')

type ScopedWord = {
  word: string
  reading: string
  partOfSpeech: string
  wordbookIds: string[]
  isMastered: boolean
}
type ScopeEntry = Omit<ScopedWord, 'isMastered'> & { isMastered?: boolean }

/** The selected list entries define membership; corpus rows supply evidence. */
export function mergeVocabularyScope<T extends ScopedWord>(
  corpus: T[],
  entries: ScopeEntry[],
  createAbsent: (entry: ScopeEntry) => T,
  masteryOverrides: Record<string, boolean> = {},
): T[] {
  const corpusByWord = new Map(corpus.map(row => [normalize(row.word), row]))
  const result = new Map<string, T>()
  entries.forEach(entry => {
    const key = normalize(entry.word)
    const current = result.get(key) || corpusByWord.get(key) || createAbsent(entry)
    result.set(key, {
      ...current,
      reading: current.reading || entry.reading,
      partOfSpeech: current.partOfSpeech || entry.partOfSpeech,
      wordbookIds: [...new Set([...current.wordbookIds, ...entry.wordbookIds])],
      isMastered: masteryOverrides[key] ?? entry.isMastered ?? current.isMastered,
    })
  })
  return [...result.values()]
}
