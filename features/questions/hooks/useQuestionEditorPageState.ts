'use client'

import { useCallback, useReducer, type SetStateAction } from 'react'
import type { ParsedQuizDraft } from '@/modules/import/types'

type LessonEditorPageState = {
  isDirty: boolean
  listeningSectionNumber: string
  showBulkImport: boolean
  bulkText: string
  bulkParsed: ParsedQuizDraft[]
  quickOptionInputs: Record<string, string>
}

type LessonEditorAction = {
  [Key in keyof LessonEditorPageState]: {
    key: Key
    value: SetStateAction<LessonEditorPageState[Key]>
  }
}[keyof LessonEditorPageState]

function lessonEditorReducer(
  state: LessonEditorPageState,
  action: LessonEditorAction,
) {
  const current = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value
  return { ...state, [action.key]: next }
}

export function useLessonQuestionPageState(initialSectionNumber: string) {
  const [state, dispatch] = useReducer(lessonEditorReducer, {
    isDirty: false,
    listeningSectionNumber: initialSectionNumber,
    showBulkImport: false,
    bulkText: '',
    bulkParsed: [],
    quickOptionInputs: {},
  })
  const setter = useCallback(
    <Key extends keyof LessonEditorPageState>(key: Key) =>
      (value: SetStateAction<LessonEditorPageState[Key]>) =>
        dispatch({ key, value } as LessonEditorAction),
    [],
  )

  return {
    ...state,
    setIsDirty: setter('isDirty'),
    setListeningSectionNumber: setter('listeningSectionNumber'),
    setShowBulkImport: setter('showBulkImport'),
    setBulkText: setter('bulkText'),
    setBulkParsed: setter('bulkParsed'),
    setQuickOptionInputs: setter('quickOptionInputs'),
  }
}

export function useQuizMetadataState(initialTitle: string) {
  const [title, setTitle] = useReducer(
    (current: string, value: SetStateAction<string>) =>
      typeof value === 'function' ? value(current) : value,
    initialTitle,
  )
  return { title, setTitle }
}
