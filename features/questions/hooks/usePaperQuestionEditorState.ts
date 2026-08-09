'use client'

import { useCallback, useReducer, type SetStateAction } from 'react'

type State<Material> = {
  materials: Material[]
  savingId: string | null
  message: Record<string, string>
  openQuestionId: string | null
  questionQuery: string
  questionTypeFilter: string
  dirtyIds: Set<string>
}

type Action<Material> = {
  [Key in keyof State<Material>]: {
    key: Key
    value: SetStateAction<State<Material>[Key]>
  }
}[keyof State<Material>]

function reducer<Material>(state: State<Material>, action: Action<Material>) {
  const current = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value
  return { ...state, [action.key]: next }
}

export function usePaperQuestionEditorState<Material>(materials: Material[]) {
  const [state, dispatch] = useReducer(reducer<Material>, {
    materials,
    savingId: null,
    message: {},
    openQuestionId: null,
    questionQuery: '',
    questionTypeFilter: 'all',
    dirtyIds: new Set<string>(),
  })
  const setter = useCallback(
    <Key extends keyof State<Material>>(key: Key) =>
      (value: SetStateAction<State<Material>[Key]>) =>
        dispatch({ key, value } as Action<Material>),
    [],
  )
  return {
    ...state,
    setMaterials: setter('materials'),
    setSavingId: setter('savingId'),
    setMessage: setter('message'),
    setOpenQuestionId: setter('openQuestionId'),
    setQuestionQuery: setter('questionQuery'),
    setQuestionTypeFilter: setter('questionTypeFilter'),
    setDirtyIds: setter('dirtyIds'),
  }
}
