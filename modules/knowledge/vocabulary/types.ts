import type { VocabularyPronunciationData } from './domain/pronunciation'
import type { VocabularyReadingAudio } from './domain/reading-audio'

export type SentenceItem = {
  senseId?: string | null
  id?: string
  text: string
  source: string
  sourceUrl: string
  translation?: string | null
  audioFile?: string | null
  audioData?: AudioData | null
  sourceType?: string | null
  meaningIndex?: number | null
  posTags?: string[]
  pronunciationData?: VocabularyPronunciationData | null
  pronunciationVersion?: number | null
}

export type VocabularyGrammarPartOfSpeech =
  | 'noun'
  | 'verb'
  | 'i_adjective'
  | 'na_adjective'
  | 'adverb'
  | 'adnominal'
  | 'other'

export type VocabularyTransitivity =
  | 'intransitive'
  | 'transitive'
  | 'both'

export type VocabularyRelationItem = {
  id: string
  type:
    | 'compound'
    | 'synonym'
    | 'antonym'
    | 'related'
    | 'collocation'
    | 'transitivity_pair'
    | 'derived'
  targetVocabularyId?: string | null
  targetText: string
  targetReading?: string | null
  targetPartOfSpeech?: string | null
  marker?: string | null
  pattern?: string | null
}

export type VocabularySenseItem = {
  id: string
  order: number
  definitions: Array<{ id: string; language: string; text: string }>
  examples: SentenceItem[]
  patterns: Array<{ id: string; text: string; meaning?: string | null }>
  expressions: Array<{
    id: string
    type: 'collocation' | 'compound' | 'idiom'
    text: string
    reading?: string | null
    meaning?: string | null
  }>
  relations: VocabularyRelationItem[]
  notes: Array<{
    id: string
    type: 'usage' | 'register' | 'restriction' | 'grammar' | 'nuance' | 'warning'
    text: string
  }>
}

type AudioData = {
  audioFile: string
  start: number
  end: number
}

export type VocabularyWordbookMembership = {
  id: string
  name: string
  pathLabel: string
  jlpt?: string | null
}

type VocabularyWordbookSource = VocabularyWordbookMembership & {
  recordIds: string[]
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  sentences: SentenceItem[]
}

export type VocabItem = {
  id: string
  word: string
  languageCode?: string
  readingAudios?: VocabularyReadingAudio[]
  wordAudio?: string | null
  pronunciation?: string | null
  etymologies?: string[]
  pronunciations?: string[]
  pronunciationData?: VocabularyPronunciationData | null
  pronunciationVersion?: number | null
  partOfSpeech?: string | null
  partsOfSpeech?: string[]
  grammarPartOfSpeech?: VocabularyGrammarPartOfSpeech | null
  transitivity?: VocabularyTransitivity | null
  conjugationType?: string | null
  meanings?: string[]
  tags?: string[]
  createdAt: Date
  folderId?: string | null
  folderName?: string | null
  recordIds?: string[]
  wordbooks?: VocabularyWordbookMembership[]
  wordbookSources?: VocabularyWordbookSource[]
  sourceType?: string
  sentences: SentenceItem[]
  senses?: VocabularySenseItem[]
  relations?: VocabularyRelationItem[]
  review?: {
    id: string
    due: Date | string
    state: number
    stability: number
    difficulty: number
    elapsed_days: number
    scheduled_days: number
    reps: number
    lapses: number
    learning_steps: number
    last_review: Date | string | null
  } | null
}

export type FolderItem = {
  id: string
  name: string
  seriesId: string
  seriesName: string
  count?: number
}

export type InflectionVariant = {
  word: string
  sentenceHits: number
  sentenceTotal: number
}

export type InflectionFamily = {
  lemma: string
  totalVariants: number
  coveredVariants: number
  coverage: number
  variants: InflectionVariant[]
}
