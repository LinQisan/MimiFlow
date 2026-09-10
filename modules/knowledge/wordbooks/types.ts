export type WordbookVocabularyItem = {
  id: string
  jlpt: string | null
  word: string
  wordAudio?: string | null
  etymologies?: string[]
  pronunciations: string[]
  meanings: string[]
  entryNumber?: string | null
  section?: string | null
  page?: string | null
  partsOfSpeech: string[]
  tags: string[]
  sentences?: Array<{
    text: string
    translation?: string | null
    audioFile?: string | null
    source?: string
    sourceUrl?: string
  }>
}
