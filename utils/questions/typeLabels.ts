import type { QuestionType } from '@prisma/client'

export const QUESTION_TYPE_DISPLAY: Record<
  QuestionType,
  { label: string; description: string }
> = {
  LISTENING: { label: '聴解', description: '听力理解' },
  PRONUNCIATION: { label: '漢字読み', description: '汉字读音' },
  SYNONYM_REPLACEMENT: {
    label: '言い換え類義',
    description: '近义表达',
  },
  WORD_DISTINCTION: { label: '用法', description: '词语用法' },
  GRAMMAR: {
    label: '文脈規定／文法形式の判断',
    description: '根据语境选词或判断语法形式',
  },
  FILL_BLANK: { label: '文章の文法', description: '篇章语法' },
  SORTING: {
    label: '文の文法2（文の組み立て）',
    description: '句子组合排序',
  },
  READING_COMPREHENSION: { label: '内容理解', description: '文章内容理解' },
  TRANSLATION: { label: '翻訳', description: '翻译' },
}

export const getQuestionTypeDisplay = (questionType: string) =>
  QUESTION_TYPE_DISPLAY[questionType as QuestionType] || {
    label: questionType || '問題',
    description: '其他题型',
  }

export const getQuestionTypeLabel = (questionType: string) =>
  getQuestionTypeDisplay(questionType).label
