export const TOEIC_PARTS = [
  {
    part: 1,
    slug: 'toeic-part-1',
    title: 'Photographs',
    questionType: 'TOEIC_PHOTOGRAPH',
    materialType: 'LISTENING',
    uploadTab: 'audio',
  },
  {
    part: 2,
    slug: 'toeic-part-2',
    title: 'Question-Response',
    questionType: 'TOEIC_QUESTION_RESPONSE',
    materialType: 'LISTENING',
    uploadTab: 'audio',
  },
  {
    part: 3,
    slug: 'toeic-part-3',
    title: 'Conversations',
    questionType: 'TOEIC_CONVERSATIONS',
    materialType: 'LISTENING',
    uploadTab: 'audio',
  },
  {
    part: 4,
    slug: 'toeic-part-4',
    title: 'Talks',
    questionType: 'TOEIC_TALKS',
    materialType: 'LISTENING',
    uploadTab: 'audio',
  },
  {
    part: 5,
    slug: 'toeic-part-5',
    title: 'Incomplete Sentences',
    questionType: 'TOEIC_INCOMPLETE_SENTENCES',
    materialType: 'VOCAB_GRAMMAR',
    uploadTab: 'quiz',
  },
  {
    part: 6,
    slug: 'toeic-part-6',
    title: 'Text Completion',
    questionType: 'TOEIC_TEXT_COMPLETION',
    materialType: 'READING',
    uploadTab: 'article',
  },
  {
    part: 7,
    slug: 'toeic-part-7',
    title: 'Reading Comprehension',
    questionType: 'TOEIC_READING_COMPREHENSION',
    materialType: 'READING',
    uploadTab: 'article',
  },
] as const

export type ToeicPart = (typeof TOEIC_PARTS)[number]
export type ToeicQuestionType = ToeicPart['questionType']

export const getToeicPartBySlug = (slug: string) =>
  TOEIC_PARTS.find(item => item.slug === slug)

export const getToeicPartByQuestionType = (questionType: string) =>
  TOEIC_PARTS.find(item => item.questionType === questionType)

export const getToeicPartByNumber = (partNumber: number) =>
  TOEIC_PARTS.find(item => item.part === partNumber)
