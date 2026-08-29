export type SentenceItem = {
  text: string
  source: string
  sourceUrl: string
  translation?: string | null
  audioFile?: string | null
  audioData?: AudioData | null
  sourceType?: string | null
  meaningIndex?: number | null
  posTags?: string[]
}

type AudioData = {
  audioFile: string
  start: number
  end: number
}

type VocabularyWordbookMembership = {
  id: string
  name: string
  pathLabel: string
}

type VocabularyWordbookSource = VocabularyWordbookMembership & {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  sentences: SentenceItem[]
}

export type VocabItem = {
  id: string
  word: string
  languageCode?: string
  wordAudio?: string | null
  pronunciation?: string | null
  pronunciations?: string[]
  partOfSpeech?: string | null
  partsOfSpeech?: string[]
  meanings?: string[]
  tags?: string[]
  createdAt: Date
  folderId?: string | null
  folderName?: string | null
  recordIds?: string[]
  wordbooks?: VocabularyWordbookMembership[]
  wordbookSources?: VocabularyWordbookSource[]
  sourceType: string
  sentences: SentenceItem[]
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
  parentId: string | null
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
