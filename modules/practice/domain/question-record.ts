import { MaterialType, QuestionType } from '@prisma/client'

const QUESTION_TYPE_VALUES = new Set<string>(Object.values(QuestionType))

export const toSafeQuestionType = (
  value: string | null | undefined,
  fallback: QuestionType,
) =>
  value && QUESTION_TYPE_VALUES.has(value) ? (value as QuestionType) : fallback

export const normalizeQuestionTypeForMaterial = (
  materialType: MaterialType,
  questionType: QuestionType,
): QuestionType => {
  if (
    materialType === MaterialType.VOCAB_GRAMMAR &&
    (questionType === QuestionType.FILL_BLANK ||
      questionType === QuestionType.READING_COMPREHENSION)
  ) {
    return QuestionType.GRAMMAR
  }
  return questionType
}

export const toQuestionRecordPayload = (
  prompt: string | null,
  context: string | null,
  targetWord: string | null,
  explanation: string | null,
) => ({
  prompt,
  contextSentence: context,
  targetWord,
  explanation,
})

export const toQuestionOptionsAndAnswer = (
  options: Array<{ text: string; isCorrect: boolean }>,
) => {
  const rows = options.map((option, index) => ({
    id: `opt_${index + 1}`,
    text: option.text,
  }))
  const answer = rows
    .filter((_, index) => options[index]?.isCorrect)
    .map(item => item.id)
  return {
    options: rows,
    answer: answer.length > 0 ? answer : [rows[0]?.id || 'opt_1'],
  }
}
