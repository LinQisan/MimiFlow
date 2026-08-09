'use client'

import { useCallback, useReducer, type SetStateAction } from 'react'

import {
  deriveAudioOnlyFlags,
  type BaseEditableQuestion,
} from '../domain/editor'

type QuestionListState<Question extends BaseEditableQuestion> = {
  questions: Question[]
  editingQuestionId: string | null
  isSaving: boolean
  audioOnlyFlags: Record<string, boolean>
  showAddMenu: boolean
}

type Action<Question extends BaseEditableQuestion> = {
  [Key in keyof QuestionListState<Question>]: {
    key: Key
    value: SetStateAction<QuestionListState<Question>[Key]>
  }
}[keyof QuestionListState<Question>]

function reducer<Question extends BaseEditableQuestion>(
  state: QuestionListState<Question>,
  action: Action<Question>,
) {
  const current = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value
  return { ...state, [action.key]: next }
}

export function useQuestionListEditorState<Question extends BaseEditableQuestion>(
  questions: Question[],
) {
  const [state, dispatch] = useReducer(reducer<Question>, {
    questions,
    editingQuestionId: null,
    isSaving: false,
    audioOnlyFlags: deriveAudioOnlyFlags(questions),
    showAddMenu: false,
  })
  const setter = useCallback(
    <Key extends keyof QuestionListState<Question>>(key: Key) =>
      (value: SetStateAction<QuestionListState<Question>[Key]>) =>
        dispatch({ key, value } as Action<Question>),
    [],
  )
  return {
    ...state,
    setQuestions: setter('questions'),
    setEditingQuestionId: setter('editingQuestionId'),
    setIsSaving: setter('isSaving'),
    setAudioOnlyFlags: setter('audioOnlyFlags'),
    setShowAddMenu: setter('showAddMenu'),
  }
}
