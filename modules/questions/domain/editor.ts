import type { QuestionType } from '@prisma/client'

import { getQuestionTypeLabel } from '@/utils/questions/typeLabels'
export {
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
} from '@/utils/questions/editorOptions'

export type EditableQuestionOption = {
  id: string
  text: string
  imageUrl?: string | null
  isCorrect: boolean
}

let optionIdSequence = 0

export function createQuestionOption(idPrefix: string): EditableQuestionOption {
  optionIdSequence += 1
  return {
    id: `${idPrefix}_${Date.now()}_${optionIdSequence}`,
    text: '',
    isCorrect: false,
  }
}

export type BaseEditableQuestion = {
  id: string
  questionType: QuestionType | string
  contextSentence: string
  targetWord?: string | null
  prompt?: string | null
  explanation?: string | null
  options: EditableQuestionOption[]
}

const TYPE_COLOR: Record<string, string> = {
  PRONUNCIATION: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  SYNONYM_REPLACEMENT: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100',
  FILL_BLANK: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  GRAMMAR: 'bg-sky-50 text-sky-700 border-sky-100',
  GRAMMAR_SELECTION: 'bg-blue-50 text-blue-700 border-blue-100',
  WORD_DISTINCTION: 'bg-teal-50 text-teal-700 border-teal-100',
  SORTING: 'bg-orange-50 text-orange-700 border-orange-100',
  READING_COMPREHENSION: 'bg-purple-50 text-purple-700 border-purple-100',
  LISTENING: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  TOEIC_PHOTOGRAPH: 'bg-blue-50 text-blue-700 border-blue-100',
  TOEIC_QUESTION_RESPONSE: 'bg-blue-50 text-blue-700 border-blue-100',
  TOEIC_CONVERSATIONS: 'bg-blue-50 text-blue-700 border-blue-100',
  TOEIC_TALKS: 'bg-blue-50 text-blue-700 border-blue-100',
  TOEIC_INCOMPLETE_SENTENCES: 'bg-blue-50 text-blue-700 border-blue-100',
  TOEIC_TEXT_COMPLETION: 'bg-blue-50 text-blue-700 border-blue-100',
  TOEIC_READING_COMPREHENSION: 'bg-blue-50 text-blue-700 border-blue-100',
}

export function getQuestionEditorTypeConfig(type: string) {
  return {
    label: getQuestionTypeLabel(type),
    color: TYPE_COLOR[type] || 'bg-gray-50 text-gray-700 border-gray-100',
  }
}

export function updateQuestionField<
  Question extends BaseEditableQuestion,
  Key extends keyof Question,
>(questions: Question[], id: string, field: Key, value: Question[Key]) {
  return questions.map(question =>
    question.id === id ? { ...question, [field]: value } : question,
  )
}

export function updateQuestionOption<Question extends BaseEditableQuestion>(
  questions: Question[],
  questionId: string,
  optionIndex: number,
  field: 'text' | 'isCorrect',
  value: string | boolean,
) {
  return questions.map(question => {
    if (question.id !== questionId) return question
    return {
      ...question,
      options: question.options.map((option, index) => {
        if (field === 'isCorrect') {
          return { ...option, isCorrect: index === optionIndex }
        }
        return index === optionIndex
          ? { ...option, text: String(value) }
          : option
      }),
    }
  })
}

export function createDefaultQuestionOptions(
  idPrefix: string,
  labels: readonly string[],
): EditableQuestionOption[] {
  return labels.map((text, index) => ({
    id: `${idPrefix}_${index + 1}`,
    text,
    isCorrect: index === 0,
  }))
}

export function getDefaultQuestionPrompt(type: QuestionType | string) {
  const prompts: Partial<Record<QuestionType, string>> = {
    PRONUNCIATION: '划线部分的读音是？',
    SYNONYM_REPLACEMENT: '与划线部分意思最相近的是？',
    WORD_DISTINCTION: '请选择符合该词用法的句子',
    GRAMMAR: '请选择最符合语法规则的答案',
    GRAMMAR_SELECTION: '请选择最符合语法规则的答案',
    SORTING: '请将下列选项排序，选出星号(★)处的词。',
    LISTENING: '',
    TOEIC_PHOTOGRAPH: '',
    TOEIC_QUESTION_RESPONSE: '',
    TOEIC_CONVERSATIONS: '',
    TOEIC_TALKS: '',
    TOEIC_INCOMPLETE_SENTENCES: 'Choose the best answer to complete the sentence.',
    TOEIC_TEXT_COMPLETION: 'Choose the best answer to complete the text.',
    TOEIC_READING_COMPREHENSION: 'Choose the best answer.',
  }
  return prompts[type as QuestionType] ?? '请选择正确的答案'
}

export function deriveAudioOnlyFlags(questions: BaseEditableQuestion[]) {
  return questions.reduce<Record<string, boolean>>((acc, question) => {
    if (
      (question.questionType === 'LISTENING' ||
        question.questionType === 'TOEIC_PHOTOGRAPH' ||
        question.questionType === 'TOEIC_QUESTION_RESPONSE' ||
        question.questionType === 'TOEIC_CONVERSATIONS' ||
        question.questionType === 'TOEIC_TALKS') &&
      question.options.every(
        option => !option.text.trim() && !option.imageUrl,
      )
    ) {
      acc[question.id] = true
    }
    return acc
  }, {})
}
