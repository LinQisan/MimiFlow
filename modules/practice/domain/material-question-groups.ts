export type MaterialQuestionGroup<T> = {
  materialId: string
  questions: T[]
}

export function groupQuestionsByMaterial<T extends { id: string }>(
  questions: T[],
  getMaterialId: (question: T) => string | null | undefined,
) {
  const groups = new Map<string, MaterialQuestionGroup<T>>()

  questions.forEach(question => {
    const materialId = getMaterialId(question) || `question:${question.id}`
    const group = groups.get(materialId) || { materialId, questions: [] }
    group.questions.push(question)
    groups.set(materialId, group)
  })

  return Array.from(groups.values())
}
