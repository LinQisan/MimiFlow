export type SentenceItem = {
  text: string
  source: string
  sourceUrl: string
  translation?: string | null
  audioFile?: string | null
  meaningIndex?: number | null
  posTags?: string[]
}

export type AudioData = {
  audioFile: string
  start: number
  end: number
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
  sourceType: string
  sentences: SentenceItem[]
  audioData: AudioData | null
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
