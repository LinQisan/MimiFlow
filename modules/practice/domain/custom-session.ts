export type RandomPracticeScope = 'unattempted' | 'attempted' | 'all'

type PracticeFilterCollection = {
  language: string | null
  level: string | null
}

export function buildRandomPracticeFilterOptions(
  collections: PracticeFilterCollection[],
) {
  const normalized = collections.map(item => ({
    language: (item.language || '').trim(),
    level: (item.level || '').trim(),
  }))
  const languages = Array.from(
    new Set(normalized.map(item => item.language).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))
  const levels = Array.from(
    new Set(normalized.map(item => item.level).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b))
  const levelsByLanguage = Object.fromEntries(
    languages.map(language => [
      language,
      Array.from(
        new Set(
          normalized
            .filter(item => item.language === language)
            .map(item => item.level)
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    ]),
  )

  return { languages, levels, levelsByLanguage }
}

export function buildPracticeTitle(
  requestedCount: number,
  sourceCollections: string[] = [],
  filters?: {
    language?: string
    level?: string
    scope?: RandomPracticeScope
  },
): string {
  const core = `随机练习 · ${requestedCount} 题`

  const filterParts: string[] = []
  if (filters?.scope === 'unattempted') filterParts.push('未做题')
  if (filters?.scope === 'attempted') filterParts.push('已做题')
  if (filters?.language) filterParts.push(`语言=${filters.language}`)
  if (filters?.level) filterParts.push(`等级=${filters.level}`)
  const coreWithFilter =
    filterParts.length > 0 ? `${core}（${filterParts.join('，')}）` : core

  if (sourceCollections.length === 0) return coreWithFilter
  const preview = sourceCollections.slice(0, 3).join(' / ')
  const suffix =
    sourceCollections.length > 3
      ? `${preview} 等 ${sourceCollections.length} 套`
      : preview
  return `${coreWithFilter} · ${suffix}`
}
