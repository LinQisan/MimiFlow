'use client'

import {
  useCallback,
  useReducer,
  type SetStateAction,
} from 'react'

type ListeningListState = {
  search: string
  statusFilter:
    | 'all'
    | 'ready'
    | 'needsQuestion'
    | 'needsSection'
    | 'classified'
    | 'unclassified'
  materialTypeFilter: 'all' | 'SPEAKING' | 'LISTENING'
  bookFilter: string
  chapterFilter: string
  paperFilter: string
  openAssignMaterialId: string | null
  selectedMap: Record<string, boolean>
  batchChapterId: string
  managePage: number
}

type StateAction = {
  [Key in keyof ListeningListState]: {
    key: Key
    value: SetStateAction<ListeningListState[Key]>
  }
}[keyof ListeningListState]

function reducer(state: ListeningListState, action: StateAction) {
  const current = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value
  return { ...state, [action.key]: next }
}

export function useListeningListState() {
  const [state, dispatch] = useReducer(reducer, {
    search: '',
    statusFilter: 'all',
    materialTypeFilter: 'all',
    bookFilter: 'all',
    chapterFilter: 'all',
    paperFilter: 'all',
    openAssignMaterialId: null,
    selectedMap: {},
    batchChapterId: '',
    managePage: 1,
  })
  const setter = useCallback(
    <Key extends keyof ListeningListState>(key: Key) =>
      (value: SetStateAction<ListeningListState[Key]>) =>
        dispatch({ key, value } as StateAction),
    [],
  )
  return {
    ...state,
    setSearch: setter('search'),
    setStatusFilter: setter('statusFilter'),
    setMaterialTypeFilter: setter('materialTypeFilter'),
    setBookFilter: setter('bookFilter'),
    setChapterFilter: setter('chapterFilter'),
    setPaperFilter: setter('paperFilter'),
    setOpenAssignMaterialId: setter('openAssignMaterialId'),
    setSelectedMap: setter('selectedMap'),
    setBatchChapterId: setter('batchChapterId'),
    setManagePage: setter('managePage'),
  }
}
