export const MaterialType = {
  LISTENING: 'LISTENING',
  MEDIA_SUBTITLE: 'MEDIA_SUBTITLE',
  READING: 'READING',
  VOCAB_GRAMMAR: 'VOCAB_GRAMMAR',
  SPEAKING: 'SPEAKING',
} as const
export type MaterialType = (typeof MaterialType)[keyof typeof MaterialType]

export const CollectionType = {
  LIBRARY_ROOT: 'LIBRARY_ROOT',
  BOOK: 'BOOK',
  CHAPTER: 'CHAPTER',
  PAPER: 'PAPER',
  CUSTOM_GROUP: 'CUSTOM_GROUP',
} as const
export type CollectionType = (typeof CollectionType)[keyof typeof CollectionType]

export const SourceType = {
  AUDIO_DIALOGUE: 'AUDIO_DIALOGUE',
  MEDIA_SUBTITLE_LINE: 'MEDIA_SUBTITLE_LINE',
  ARTICLE_TEXT: 'ARTICLE_TEXT',
  QUIZ_QUESTION: 'QUIZ_QUESTION',
} as const
export type SourceType = (typeof SourceType)[keyof typeof SourceType]

export const StudyTimeKind = {
  LESSON_SPEAKING: 'LESSON_SPEAKING',
  ARTICLE_READING: 'ARTICLE_READING',
} as const
export type StudyTimeKind = (typeof StudyTimeKind)[keyof typeof StudyTimeKind]
