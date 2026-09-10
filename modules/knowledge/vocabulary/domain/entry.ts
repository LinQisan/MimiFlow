export { RELATION_TYPE_OPTIONS } from './relations.ts'

export const VOCABULARY_POS_OPTIONS = [
  ['noun', '名詞'],
  ['verb', '動詞'],
  ['i_adjective', 'イ形容詞'],
  ['na_adjective', 'ナ形容詞'],
  ['adverb', '副詞'],
  ['adnominal', '連体詞'],
  ['other', '其他'],
] as const

export const TRANSITIVITY_OPTIONS = [
  ['intransitive', '自動詞'],
  ['transitive', '他動詞'],
  ['both', '自他'],
] as const

export const EXPRESSION_TYPE_OPTIONS = [
  ['collocation', '搭配'],
  ['compound', '复合词'],
  ['idiom', '惯用表达'],
] as const

export const USAGE_NOTE_TYPE_OPTIONS = [
  ['usage', '一般'],
  ['register', '语域'],
  ['restriction', '使用限制'],
  ['grammar', '语法'],
  ['nuance', '语感'],
  ['warning', '警告'],
] as const

export type VocabularyEntryDraft = {
  vocabularyId: string
  word: string
  reading: string
  etymologies?: string[]
  grammarPartOfSpeech: 'noun' | 'verb' | 'i_adjective' | 'na_adjective' | 'adverb' | 'adnominal' | 'other'
  transitivity?: 'intransitive' | 'transitive' | 'both' | null
  conjugationType?: string | null
  tags: string[]
  senses: Array<{
    id: string
    definitions: Array<{ id: string; language: string; text: string }>
    examples: Array<{
      id: string
      text: string
      translation?: string | null
      source: string
      sourceUrl: string
      posTags?: string[]
    }>
    patterns: Array<{ id: string; text: string; meaning?: string | null }>
    expressions: Array<{ id: string; type: 'collocation' | 'compound' | 'idiom'; text: string; reading?: string | null; meaning?: string | null }>
    relations: Array<{ id: string; type: 'compound' | 'synonym' | 'antonym' | 'related' | 'collocation' | 'transitivity_pair' | 'derived'; targetVocabularyId?: string | null; targetText: string; targetReading?: string | null; marker?: string | null; pattern?: string | null }>
    notes: Array<{ id: string; type: 'usage' | 'register' | 'restriction' | 'grammar' | 'nuance' | 'warning'; text: string }>
  }>
  relations: Array<{ id: string; type: 'compound' | 'synonym' | 'antonym' | 'related' | 'collocation' | 'transitivity_pair' | 'derived'; targetVocabularyId?: string | null; targetText: string; targetReading?: string | null; marker?: string | null; pattern?: string | null }>
}

export function inferStructuredPartOfSpeech(partsOfSpeech: string[]) {
  const value = partsOfSpeech.join(' ').normalize('NFKC')
  if (/イ形容|い形容/u.test(value)) return 'i_adjective' as const
  if (/ナ形容|な形容|形容動詞/u.test(value)) return 'na_adjective' as const
  if (/動詞/u.test(value)) return 'verb' as const
  if (/副詞/u.test(value)) return 'adverb' as const
  if (/連体詞/u.test(value)) return 'adnominal' as const
  if (/名詞/u.test(value)) return 'noun' as const
  return 'other' as const
}

export function structuredPartOfSpeechLabel(value: string) {
  return VOCABULARY_POS_OPTIONS.find(option => option[0] === value)?.[1] || '其他'
}
