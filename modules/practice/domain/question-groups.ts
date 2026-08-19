export type GroupableQuestion = {
  id: string
  lessonId?: string | null
}

export type PracticeQuestionGroup<TQuestion extends GroupableQuestion> = {
  key: string
  startIndex: number
  endIndex: number
  questions: TQuestion[]
}

export function buildPracticeQuestionGroups<TQuestion extends GroupableQuestion>(
  questions: TQuestion[],
) {
  const groups: PracticeQuestionGroup<TQuestion>[] = []

  questions.forEach((question, index) => {
    const previous = groups[groups.length - 1]
    if (
      question.lessonId &&
      previous?.questions[0]?.lessonId === question.lessonId
    ) {
      previous.questions.push(question)
      previous.endIndex = index
      return
    }

    groups.push({
      key: question.lessonId
        ? `listening:${question.lessonId}`
        : `question:${question.id}`,
      startIndex: index,
      endIndex: index,
      questions: [question],
    })
  })

  return groups
}

export function findPracticeQuestionGroupIndex<
  TQuestion extends GroupableQuestion,
>(groups: PracticeQuestionGroup<TQuestion>[], questionIndex: number) {
  const index = groups.findIndex(
    group => questionIndex >= group.startIndex && questionIndex <= group.endIndex,
  )
  return index >= 0 ? index : 0
}
