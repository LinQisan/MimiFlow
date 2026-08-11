import type { CollectionType, MaterialType } from '@prisma/client'

export type UploadLevelLite = {
  id: string
  title: string
}

export type UploadCollectionLite = {
  id: string
  name: string
  parentId?: string | null
  sortOrder?: number
  collectionType?: CollectionType
  acceptedMaterialTypes?: MaterialType[]
  materialType?: MaterialType
  level: { title: string }
  lessons: {
    title: string
    audioFile: string
    chapterName: string
    materialType: MaterialType
  }[]
}

type QuestionOptionDraft = { text: string; isCorrect: boolean }

export type ArticlePreviewRow = {
  serial: string
  placeholderToken: string
  generatedPrompt: string
  isDuplicateToken: boolean
}

export type ArticleImportedQuestionDraft = {
  questionType: string
  prompt: string
  contextSentence: string
  explanation: string
  options: QuestionOptionDraft[]
  __previewSerial?: string
  __previewToken?: string
  __previewDuplicateToken?: boolean
}

export type ParsedQuizDraft = {
  questionType:
    | 'PRONUNCIATION'
    | 'SORTING'
    | 'GRAMMAR'
    | 'WORD_DISTINCTION'
    | 'SYNONYM_REPLACEMENT'
  prompt: string
  contextSentence: string
  targetWord?: string
  explanation: string
  options: QuestionOptionDraft[]
}

export type UploadCenterTab =
  | 'audio'
  | 'article'
  | 'quiz'
  | 'media'

export type ArticleFormState = {
  paperId: string
  title: string
  description: string
  content: string
}

export type QuizFormState = {
  collectionId: string
  questionType: string
  contextSentence: string
  targetWord: string
  prompt: string
  explanation: string
  options: QuestionOptionDraft[]
}
