export type SortingOption = {
  id: string
}

export type SortingEvaluation = {
  selectedOptionId: string
  correctOptionId: string
  isCorrect: boolean
}

export function resolveCorrectOrderIds(
  options: SortingOption[],
  authoredOrder: unknown,
): string[] {
  if (!Array.isArray(authoredOrder) || authoredOrder.length !== options.length) {
    return []
  }

  const indexes = authoredOrder.map(Number)
  const expected = options.map((_, index) => index)
  const sorted = [...new Set(indexes)].sort((a, b) => a - b)
  if (
    sorted.length !== expected.length ||
    !sorted.every((index, position) => index === expected[position])
  ) {
    return []
  }

  return indexes.map(index => options[index]?.id || '').filter(Boolean)
}

export function isCompleteOptionIdOrder(
  order: unknown,
  options: SortingOption[],
): order is string[] {
  if (!Array.isArray(order) || order.length !== options.length) return false
  const optionIds = new Set(options.map(option => option.id))
  const orderIds = order.filter((value): value is string => typeof value === 'string')
  return (
    orderIds.length === options.length &&
    new Set(orderIds).size === options.length &&
    orderIds.every(id => optionIds.has(id))
  )
}

export function evaluateSortingOrder({
  options,
  correctOrder,
  selectedOrder,
  starIndex,
}: {
  options: SortingOption[]
  correctOrder: unknown
  selectedOrder: unknown
  starIndex: number
}): SortingEvaluation {
  if (
    !isCompleteOptionIdOrder(correctOrder, options) ||
    !isCompleteOptionIdOrder(selectedOrder, options) ||
    starIndex < 0 ||
    starIndex >= options.length
  ) {
    throw new Error('排序题作答数据无效')
  }

  const selectedOptionId = selectedOrder[starIndex]
  const correctOptionId = correctOrder[starIndex]
  return {
    selectedOptionId,
    correctOptionId,
    isCorrect: selectedOptionId === correctOptionId,
  }
}
