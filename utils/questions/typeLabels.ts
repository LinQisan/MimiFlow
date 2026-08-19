import type { QuestionType } from '@prisma/client'

const QUESTION_TYPE_DISPLAY: Record<
  QuestionType,
  { label: string; description: string }
> = {
  LISTENING: { label: '聴解', description: '听力理解' },
  TOEIC_PHOTOGRAPH: { label: 'Part 1 · Photographs', description: 'Photographs' },
  TOEIC_QUESTION_RESPONSE: {
    label: 'Part 2 · Question-Response',
    description: 'Question-Response',
  },
  TOEIC_CONVERSATIONS: {
    label: 'Part 3 · Conversations',
    description: 'Conversations',
  },
  TOEIC_TALKS: { label: 'Part 4 · Talks', description: 'Talks' },
  TOEIC_INCOMPLETE_SENTENCES: {
    label: 'Part 5 · Incomplete Sentences',
    description: 'Incomplete Sentences',
  },
  TOEIC_TEXT_COMPLETION: {
    label: 'Part 6 · Text Completion',
    description: 'Text Completion',
  },
  TOEIC_READING_COMPREHENSION: {
    label: 'Part 7 · Reading Comprehension',
    description: 'Reading Comprehension',
  },
  PRONUNCIATION: { label: '漢字読み', description: '汉字读音' },
  SYNONYM_REPLACEMENT: {
    label: '言い換え類義',
    description: '近义表达',
  },
  WORD_DISTINCTION: { label: '用法', description: '词语用法' },
  GRAMMAR: {
    label: '文脈規定',
    description: '根据语境选词或判断语法形式',
  },
  GRAMMAR_SELECTION: {
    label: '文の文法1',
    description: '文法形式の判断',
  },
  FILL_BLANK: { label: '文章の文法', description: '篇章语法' },
  SORTING: {
    label: '文の文法2',
    description: '句子组合排序',
  },
  READING_COMPREHENSION: { label: '内容理解', description: '文章内容理解' },
  READING_SHORT: { label: '内容理解（短文）', description: '短文阅读' },
  READING_MEDIUM: { label: '内容理解（中文）', description: '中文阅读' },
  READING_LONG: { label: '内容理解（長文）', description: '长文阅读' },
  READING_INTEGRATED: { label: '統合理解', description: '多文本综合理解' },
  READING_ARGUMENT: { label: '主張理解（長文）', description: '长文主张理解' },
  READING_INFORMATION: { label: '情報検索', description: '信息检索' },
  TRANSLATION: { label: '翻訳', description: '翻译' },
}

export const getQuestionTypeDisplay = (questionType: string) =>
  QUESTION_TYPE_DISPLAY[questionType as QuestionType] || {
    label: questionType || '問題',
    description: '其他题型',
  }

export const getQuestionTypeLabel = (questionType: string) =>
  getQuestionTypeDisplay(questionType).label
