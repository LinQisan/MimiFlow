export const RELATION_TYPE_OPTIONS = [
  ['compound', '合'],
  ['related', '関'],
  ['synonym', '類'],
  ['antonym', '反'],
  ['collocation', '搭配'],
  ['transitivity_pair', '自他'],
  ['derived', '派生'],
] as const

export type VocabularyRelationType = typeof RELATION_TYPE_OPTIONS[number][0]

type RelationMetadata = {
  type: VocabularyRelationType
  targetText: string
  marker?: string | null
  pattern?: string | null
}

export function relationUsesPattern(type: VocabularyRelationType) {
  return type === 'compound' || type === 'derived' || type === 'collocation'
}

// Persist only metadata authored for this relation type; related hints are derived.
export function normalizeRelationMetadata<T extends RelationMetadata>(relation: T): T {
  return {
    ...relation,
    marker: relation.type === 'related' ? relation.marker?.trim() || null : null,
    pattern: relationUsesPattern(relation.type) ? relation.pattern?.trim() || null : null,
  }
}

// Reading mode omits patterns that only spell out this headword substitution.
// Keep the stored pattern intact, and preserve anything we cannot prove redundant.
export function relationReadingPattern(relation: RelationMetadata, sourceWord = '') {
  if (!relationUsesPattern(relation.type)) return ''
  const pattern = relation.pattern?.trim() || ''
  const comparable = (value: string) => value.normalize('NFKC').replace(/\s+/gu, '')
  const word = comparable(relation.targetText)
  const normalizedPattern = comparable(pattern)
  if (normalizedPattern === word) return ''
  const source = comparable(sourceWord)
  if (source && normalizedPattern.includes('~') && normalizedPattern.replaceAll('~', source) === word) return ''
  return pattern
}

type VocabularyRelationDisplayGroupKey =
  | 'derived-compound'
  | 'related-synonym'
  | 'antonym'
  | 'collocation'
  | 'transitivity-pair'

const RELATION_DISPLAY_GROUPS: Record<
  VocabularyRelationDisplayGroupKey,
  { label: string; types: VocabularyRelationType[] }
> = {
  'derived-compound': { label: '派生・複合', types: ['derived', 'compound'] },
  'related-synonym': { label: '近义与相关', types: ['related', 'synonym'] },
  antonym: { label: '反義語', types: ['antonym'] },
  collocation: { label: '搭配', types: ['collocation'] },
  'transitivity-pair': { label: '自他', types: ['transitivity_pair'] },
}

const relationDisplayGroupKey = new Map(
  Object.entries(RELATION_DISPLAY_GROUPS).flatMap(([key, group]) =>
    group.types.map(type => [type, key as VocabularyRelationDisplayGroupKey]),
  ),
)

export function groupVocabularyRelationsForDisplay<
  T extends { type: VocabularyRelationType },
>(relations: T[]) {
  const groups = new Map<
    VocabularyRelationDisplayGroupKey,
    { key: VocabularyRelationDisplayGroupKey; label: string; items: T[] }
  >()

  for (const relation of relations) {
    const key =
      relationDisplayGroupKey.get(relation.type) ||
      ('related-synonym' as VocabularyRelationDisplayGroupKey)
    const group = groups.get(key)
    if (group) {
      group.items.push(relation)
      continue
    }
    groups.set(key, {
      key,
      label: RELATION_DISPLAY_GROUPS[key].label,
      items: [relation],
    })
  }

  return [...groups.values()]
}
