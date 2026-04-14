import { parseJsonStringList } from '../text/jsonList'
import { sanitizePronunciations } from '../text/pronunciation'

export type VocabularyMeta = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

type VocabularyMetaRow = {
  word?: string | null
  pronunciations?: string | null
  partsOfSpeech?: string | null
  meanings?: string | null
}

export const toVocabularyMeta = (row: VocabularyMetaRow): VocabularyMeta => ({
  pronunciations: sanitizePronunciations(
    row.word || '',
    parseJsonStringList(row.pronunciations),
  ),
  partsOfSpeech: parseJsonStringList(row.partsOfSpeech),
  meanings: parseJsonStringList(row.meanings),
})
