import { splitJapaneseEtymologies } from '../../modules/language/domain/etymology.ts'
import { parseJsonStringList } from '../text/jsonList'
import { sanitizePronunciations } from '../text/pronunciation'

export type VocabularyMeta = {
  etymologies?: string[]
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  wordAudio?: string | null
}

type VocabularyMetaRow = {
  word?: string | null
  etymologies?: string | null
  pronunciations?: string | null
  partsOfSpeech?: string | null
  meanings?: string | null
  wordAudio?: string | null
}

export const toVocabularyMeta = (row: VocabularyMetaRow): VocabularyMeta => ({
  ...splitJapaneseEtymologies(row.word || '', sanitizePronunciations(row.word || '', parseJsonStringList(row.pronunciations)), parseJsonStringList(row.etymologies)),
  partsOfSpeech: parseJsonStringList(row.partsOfSpeech),
  meanings: parseJsonStringList(row.meanings),
  wordAudio: row.wordAudio || null,
})
