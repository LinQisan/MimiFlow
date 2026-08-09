import {
  buildSurfaceAliasMapForText,
} from '@/utils/vocabulary/japaneseInflection'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

export type DialogueRow = {
  id: number
  stableId: string
  start: number
  end: number
  text: string
  note: string
  favorite: boolean
}

export function sentenceMeaningNotes(
  sentence: string,
  vocabularyMetaMap: Record<string, VocabularyMeta>,
) {
  const aliasMap = buildSurfaceAliasMapForText(
    sentence,
    Object.keys(vocabularyMetaMap),
  )
  const bestByBase = new Map<string, { word: string; meaning: string }>()
  Object.entries(aliasMap).forEach(([surface, base]) => {
    const meaning = vocabularyMetaMap[base]?.meanings?.[0] || ''
    if (!meaning.trim()) return
    const existing = bestByBase.get(base)
    if (!existing || surface.length > existing.word.length) {
      bestByBase.set(base, { word: surface, meaning })
    }
  })
  return Array.from(bestByBase.values())
    .sort((left, right) => right.word.length - left.word.length)
    .slice(0, 6)
}

export function resequenceRows(rows: DialogueRow[]) {
  const idMap = new Map<number, number>()
  const nextRows = rows.map((row, index) => {
    const nextId = index + 1
    idMap.set(row.id, nextId)
    return { ...row, id: nextId }
  })
  return { rows: nextRows, idMap }
}

export function remapKeyedState<T>(
  source: Record<number, T>,
  idMap: Map<number, number>,
) {
  return Object.entries(source).reduce<Record<number, T>>((acc, [key, value]) => {
    const nextId = idMap.get(Number(key))
    if (nextId != null) acc[nextId] = value
    return acc
  }, {})
}

export function filterSubtitleRows(input: {
  rows: DialogueRow[]
  favoriteOnly: boolean
  keyword: string
}) {
  const keyword = input.keyword.trim().toLowerCase()
  return input.rows.filter(row => {
    if (input.favoriteOnly && !row.favorite) return false
    return (
      !keyword ||
      [row.text, row.note, String(row.id)].some(value =>
        value.toLowerCase().includes(keyword),
      )
    )
  })
}
