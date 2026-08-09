'use client'

import { useActionState } from 'react'
import {
  batchAssignShadowingMaterials,
  createShadowingBook,
  createShadowingChapter,
} from '@/features/listening/actions'

const initialState = { success: false, message: '' }

export function useListeningListMutations() {
  const [bookState, createBookAction, creatingBook] = useActionState(
    async (_previous: typeof initialState, formData: FormData) =>
      createShadowingBook(formData),
    initialState,
  )
  const [chapterState, createChapterAction, creatingChapter] = useActionState(
    async (_previous: typeof initialState, formData: FormData) =>
      createShadowingChapter(formData),
    initialState,
  )
  const [batchState, batchAction, batching] = useActionState(
    async (_previous: typeof initialState, formData: FormData) =>
      batchAssignShadowingMaterials(formData),
    initialState,
  )

  return {
    bookState,
    createBookAction,
    creatingBook,
    chapterState,
    createChapterAction,
    creatingChapter,
    batchState,
    batchAction,
    batching,
  }
}
