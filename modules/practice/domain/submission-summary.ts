type SubmissionOption = {
  id: string
  isCorrect?: boolean
}

type SubmissionQuestion = {
  id: string
  questionType?: string | null
  prompt?: string | null
  correctOrder?: string[]
  options?: SubmissionOption[]
}

import { evaluateSortingOrder } from '../../questions/domain/sorting.ts'
import { parseSortingPrompt } from './question-text.ts'

export const summarizePracticeSubmission = <
  TQuestion extends SubmissionQuestion,
>(
  questions: TQuestion[],
  answers: Record<string, string>,
  sortingOrders: Record<string, Array<string | null>> = {},
) => {
  const submittedQuestionIds: string[] = []
  const wrongIndexes: number[] = []
  let gradableCount = 0

  questions.forEach((question, index) => {
    const selectedId = answers[question.id]
    const isSorting = question.questionType === 'SORTING'
    const selectedOrder = sortingOrders[question.id]
    if (!selectedId && !selectedOrder) return

    submittedQuestionIds.push(question.id)
    if (isSorting) {
      gradableCount += 1
      try {
        const evaluation = evaluateSortingOrder({
          options: question.options || [],
          correctOrder: question.correctOrder,
          selectedOrder,
          starIndex: parseSortingPrompt(question.prompt || '').starIndex,
        })
        if (!evaluation.isCorrect) wrongIndexes.push(index)
      } catch {
        wrongIndexes.push(index)
      }
      return
    }
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
