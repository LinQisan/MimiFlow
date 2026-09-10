export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const

export type VocabularyJlptLevel = (typeof JLPT_LEVELS)[number]

// A word can belong to more than one level (e.g. listed in both an N2 and an
// N3 wordbook). Storage must keep every level; whenever the UI needs a single
// representative level it is derived here with a deterministic priority.
export const JLPT_PRIORITY = ['N1', 'N2', 'N3', 'N4', 'N5'] as const

const JLPT_LEVEL_SET = new Set<string>(JLPT_LEVELS)

export const normalizeVocabularyJlpt = (
  value: string | null | undefined,
): VocabularyJlptLevel | null => {
  const normalized = (value || '').normalize('NFKC').trim().toUpperCase()
  return JLPT_LEVEL_SET.has(normalized)
    ? (normalized as VocabularyJlptLevel)
    : null
}

export const inferVocabularyJlpt = (
  ...values: Array<string | null | undefined>
): VocabularyJlptLevel | null => {
  for (const value of values) {
    const match = (value || '').normalize('NFKC').toUpperCase().match(/(?:^|[^A-Z0-9])(N[1-5])(?:$|[^A-Z0-9])/)
    if (match) return match[1] as VocabularyJlptLevel
  }
  return null
}

export const isVocabularyStructureTag = (value: string) => {
  const normalized = value.normalize('NFKC').trim()
  return (
    normalizeVocabularyJlpt(normalized) !== null ||
    /^unit[\s_-]*0*\d+$/i.test(normalized)
  )
}

export const filterVocabularyTags = (values: string[]) =>
  Array.from(
    new Set(
      values
        .map(value => value.normalize('NFKC').trim())
        .filter(value => value && !isVocabularyStructureTag(value)),
    ),
  )

type JlptLevelInput =
  | Iterable<string | null | undefined>
  | string
  | null
  | undefined

const asJlptValues = (values: JlptLevelInput) =>
  typeof values === 'string' || values == null ? [values] : Array.from(values)

/**
 * Canonical multi-level JLPT normalization for the whole app.
 *
 * Accepts single values (`'N2'`), raw membership strings (`'["N2", "N3"]'`,
 * `'N2/N3'`), or arrays mixing both. Always returns every matched level
 * sorted by JLPT_PRIORITY (N1 first) with duplicates removed. Never drops
 * information: callers that need one level must use
 * `resolvePrimaryVocabularyJlpt` explicitly.
 */
export const normalizeVocabularyJlptLevels = (
  values: JlptLevelInput,
): VocabularyJlptLevel[] => {
  const levels = new Set<VocabularyJlptLevel>()
  asJlptValues(values).forEach(value => {
    ;(value || '')
      .normalize('NFKC')
      .toUpperCase()
      .replace(/[\[\]"']/gu, '')
      .split(/[\s,，、/／|]+/u)
      .map(item => item.trim())
      .filter(item => JLPT_LEVEL_SET.has(item))
      .forEach(item => levels.add(item as VocabularyJlptLevel))
  })
  return JLPT_PRIORITY.filter(level => levels.has(level))
}

export const mergeVocabularyJlptLevels = (...values: JlptLevelInput[]) =>
  normalizeVocabularyJlptLevels(values.flatMap(value => asJlptValues(value)))

/** Deterministic single representative level for UI display/highlight slots. */
export const resolvePrimaryVocabularyJlpt = (
  values: JlptLevelInput,
): VocabularyJlptLevel | null => normalizeVocabularyJlptLevels(values)[0] || null

/** Priority order index (N1 = 0). Unknown levels sort last. */
export const compareVocabularyJlptLevels = (
  left: string | null | undefined,
  right: string | null | undefined,
) => {
  const order = (value: string | null | undefined) => {
    const index = JLPT_PRIORITY.indexOf(
      normalizeVocabularyJlptLevels(value)[0] as (typeof JLPT_PRIORITY)[number],
    )
    return index < 0 ? JLPT_PRIORITY.length : index
  }
  return order(left) - order(right)
}
