export const MIN_QUESTION_OPTION_COUNT = 2

export function removeQuestionOptionAt<
  Option extends { isCorrect: boolean },
>(options: Option[], optionIndex: number): Option[] {
  if (
    options.length <= MIN_QUESTION_OPTION_COUNT ||
    optionIndex < 0 ||
    optionIndex >= options.length
  ) {
    return options
  }

  const removedWasCorrect = options[optionIndex]?.isCorrect
  const next = options.filter((_, index) => index !== optionIndex)
  if (!removedWasCorrect || next.some(option => option.isCorrect)) return next

  return next.map((option, index) =>
    index === 0 ? { ...option, isCorrect: true } : option,
  )
}
