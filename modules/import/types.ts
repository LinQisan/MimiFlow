import type { CollectionType, MaterialType } from '@prisma/client'
import type { NewsColumn, NewsEdition, NewsSource, NewsType } from '@/modules/reading/domain/news-metadata'

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
  language?: string
  examLevel?: string
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
  questionType: string
  correctAnswer: string
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
    | 'GRAMMAR_SELECTION'
    | 'WORD_DISTINCTION'
    | 'SYNONYM_REPLACEMENT'
    | 'TOEIC_INCOMPLETE_SENTENCES'
  prompt: string
  contextSentence: string
  targetWord?: string
  sortingOrder?: number[]
  explanation: string
  options: QuestionOptionDraft[]
  sourceSerial?: number
}

export type UploadCenterTab = 'audio' | 'article' | 'quiz' | 'media'

export type ArticleFormState = {
  paperId: string
  title: string
  description: string
  content: string
  sourceKind: 'ARTICLE' | 'NEWS'
  publishedDate: string
  edition: NewsEdition
  newsSource: NewsSource
  newsType: NewsType
  newsSection: string
  newsColumn: NewsColumn
  newsTopic: string
}

export type QuizFormState = {
  collectionId: string
  questionType: string
  contextSentence: string
  targetWord: string
  sortingOrder: number[]
  prompt: string
  explanation: string
  options: QuestionOptionDraft[]
}
