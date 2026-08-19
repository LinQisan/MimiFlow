import type { ParsedQuizDraft } from '../types'

export type ImportQuestionType = ParsedQuizDraft['questionType']

export const IMPORT_QUESTION_TYPES: ReadonlyArray<{
  value: ImportQuestionType
  number: number
  label: string
}> = [
  { value: 'PRONUNCIATION', number: 1, label: '漢字読み' },
  { value: 'GRAMMAR', number: 2, label: '文脈規定' },
  { value: 'SYNONYM_REPLACEMENT', number: 3, label: '言い換え類義' },
  { value: 'WORD_DISTINCTION', number: 4, label: '用法' },
  { value: 'GRAMMAR_SELECTION', number: 5, label: '文の文法1' },
  { value: 'SORTING', number: 6, label: '文の文法2' },
]

export const getImportQuestionTypeLabel = (value: ImportQuestionType) => {
  const type = IMPORT_QUESTION_TYPES.find(item => item.value === value)
  return type ? `問題 ${type.number}｜${type.label}` : value
}
