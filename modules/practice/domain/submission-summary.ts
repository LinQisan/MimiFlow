type SubmissionOption = {
  id: string
  isCorrect?: boolean
}

type SubmissionQuestion = {
  id: string
  options?: SubmissionOption[]
}

export const summarizePracticeSubmission = <
  TQuestion extends SubmissionQuestion,
>(
  questions: TQuestion[],
  answers: Record<string, string>,
) => {
  const submittedQuestionIds: string[] = []
  const wrongIndexes: number[] = []
  let gradableCount = 0

  questions.forEach((question, index) => {
    const selectedId = answers[question.id]
    if (!selectedId) return

    submittedQuestionIds.push(question.id)
    const correctId = question.options?.find(option => option.isCorrect)?.id
    if (!correctId) return

    gradableCount += 1
    if (selectedId !== correctId) wrongIndexes.push(index)
  })

  return {
    submittedQuestionIds,
    submittedCount: submittedQuestionIds.length,
    gradableCount,
    wrongIndexes,
    wrongCount: wrongIndexes.length,
    correctCount: gradableCount - wrongIndexes.length,
    unansweredCount: Math.max(
      0,
      questions.length - submittedQuestionIds.length,
    ),
  }
}
