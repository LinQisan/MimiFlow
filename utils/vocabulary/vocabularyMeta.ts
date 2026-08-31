import { parseJsonStringList } from '../text/jsonList'
import { sanitizePronunciations } from '../text/pronunciation'

export type VocabularyMeta = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  wordAudio?: string | null
}

type VocabularyMetaRow = {
  word?: string | null
  pronunciations?: string | null
  partsOfSpeech?: string | null
  meanings?: string | null
  wordAudio?: string | null
}

export const toVocabularyMeta = (row: VocabularyMetaRow): VocabularyMeta => ({
  pronunciations: sanitizePronunciations(
    row.word || '',
    parseJsonStringList(row.pronunciations),
  ),
  partsOfSpeech: parseJsonStringList(row.partsOfSpeech),
  meanings: parseJsonStringList(row.meanings),
  wordAudio: row.wordAudio || null,
})
