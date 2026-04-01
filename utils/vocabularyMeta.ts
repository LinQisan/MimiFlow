import { parseJsonStringList } from '@/utils/jsonList'

export type VocabularyMeta = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

type VocabularyMetaRow = {
  pronunciations?: string | null
  partsOfSpeech?: string | null
  meanings?: string | null
}

export const toVocabularyMeta = (row: VocabularyMetaRow): VocabularyMeta => ({
  pronunciations: parseJsonStringList(row.pronunciations),
  partsOfSpeech: parseJsonStringList(row.partsOfSpeech),
  meanings: parseJsonStringList(row.meanings),
})
