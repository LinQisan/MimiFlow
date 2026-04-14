type ExamQuestionOptionView = {
  id: string
  text: string
  isCorrect: boolean
}

const NON_SHUFFLE_TYPES = new Set(['SORTING'])

function shuffleArray<T>(input: T[]): T[] {
  const copied = [...input]
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copied[i], copied[j]] = [copied[j], copied[i]]
  }
  return copied
}

export function reorderExamOptionsForSession(
  options: ExamQuestionOptionView[],
  questionType: string,
): ExamQuestionOptionView[] {
  if (options.length <= 1) return options
  if (NON_SHUFFLE_TYPES.has(questionType)) return options
  return shuffleArray(options)
}

