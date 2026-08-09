'use client'

import { updatePaperQuestion } from '@/features/practice/admin-actions'
import {
  updateLessonQuestions,
  updateQuizWithQuestions,
} from '@/modules/content/actions/materials'
import { updateSortOrder } from '@/modules/practice/actions/questions'

export function useQuestionEditorMutations() {
  return {
    updateLessonQuestions,
    updatePaperQuestion,
    updateQuizWithQuestions,
    updateSortOrder,
  }
}
