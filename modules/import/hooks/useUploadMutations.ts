'use client'

import { useCallback } from 'react'

import {
  listPublicAudioFiles,
  uploadAssAndSaveData,
} from '@/modules/import/actions'
import {
  createArticle,
  createCategory,
  createQuizQuestion,
} from '@/modules/content/actions/materials'

export function useUploadFormMutations() {
  return {
    listPublicAudioFiles: useCallback(() => listPublicAudioFiles(), []),
    uploadAssAndSaveData: useCallback(
      (formData: FormData) => uploadAssAndSaveData(formData),
      [],
    ),
  }
}

export function useUploadCenterMutations() {
  return {
    createArticle: useCallback(
      (payload: Parameters<typeof createArticle>[0]) => createArticle(payload),
      [],
    ),
    createQuizQuestion: useCallback(
      (payload: Parameters<typeof createQuizQuestion>[0]) =>
        createQuizQuestion(payload),
      [],
    ),
    createCategory: useCallback(
      (payload: Parameters<typeof createCategory>[0]) => createCategory(payload),
      [],
    ),
  }
}
