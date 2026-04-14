import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

export type ExamQuestionOption = {
  id: string
  text: string
  isCorrect?: boolean
}

export type ExamQuestion = {
  id: string
  note?: string | null
  attempts?: {
    isCorrect: boolean
  }[]
  order?: number | null
  questionType?: string | null
  prompt?: string | null
  contextSentence?: string | null
  targetWord?: string | null
  options?: ExamQuestionOption[]
  passageId?: string | null
  lessonId?: string | null
  passage?: {
    id?: string
    content?: string | null
  } | null
  lesson?: {
    id?: string
    audioFile?: string | null
    dialogues?: {
      id: number
      text: string
      start: number
      end: number
      sequenceId?: number
    }[]
  } | null
}

export type OnSelectOption = (optionId: string) => void

export type ExamAnnotationSettings = {
  showPronunciation: boolean
  showMeaning: boolean
  pronunciationMap: Record<string, string>
  vocabularyMetaMap: Record<string, VocabularyMeta>
}
