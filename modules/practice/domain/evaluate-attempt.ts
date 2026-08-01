export type EvaluatableOption = {
  id: string
  isCorrect: boolean
}

export function evaluateSelectedOption(
  options: EvaluatableOption[],
  selectedOptionId: string,
) {
  const selected = options.find(option => option.id === selectedOptionId)
  if (!selected) throw new Error('所选答案无效')

  return {
    selectedOptionId,
    correctOptionId: options.find(option => option.isCorrect)?.id || null,
    isCorrect: selected.isCorrect,
  }
}
