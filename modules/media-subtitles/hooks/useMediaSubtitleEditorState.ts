'use client'

import { useCallback, useMemo, useReducer, type SetStateAction } from 'react'

import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import type { DialogueRow } from '../domain/editor'

type EditorState = {
  rows: DialogueRow[]
  showTimeline: boolean
  showFavoriteOnly: boolean
  pageSize: number
  currentPage: number
  searchKeyword: string
  currentSearchHitIndex: number
  expandedNoteRowId: number | null
  editingRowId: number | null
  copyFromId: number
  copyToId: number
  copyState: 'idle' | 'copied' | 'error'
  selectedRowIds: Set<number>
  lastSelectedRowId: number | null
  selectedCopyState: 'idle' | 'copied' | 'error'
  noteDraftById: Record<number, string>
  editDraftById: Record<number, { start: string; end: string; text: string }>
  lineMetaMessage: string
  localPronunciationMap: Record<string, string>
  localVocabularyMetaMap: Record<string, VocabularyMeta>
}

type EditorAction = {
  [Key in keyof EditorState]: {
    key: Key
    value: SetStateAction<EditorState[Key]>
  }
}[keyof EditorState]

function reducer(state: EditorState, action: EditorAction) {
  const current = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value
  return { ...state, [action.key]: next }
}

export function useMediaSubtitleEditorState(input: {
  initialDialogues: DialogueRow[]
  initialSearchKeyword: string
  initialPronunciationMap: Record<string, string>
  initialVocabularyMetaMap: Record<string, VocabularyMeta>
}) {
  const rows =
    input.initialDialogues.length > 0
      ? input.initialDialogues
      : [
          {
            id: 1,
            stableId: 'draft-1',
            start: 0,
            end: 1,
            text: '',
            note: '',
            favorite: false,
          },
        ]
  const [state, dispatch] = useReducer(reducer, {
    rows,
    showTimeline: false,
    showFavoriteOnly: false,
    pageSize: 40,
    currentPage: 1,
    searchKeyword: input.initialSearchKeyword,
    currentSearchHitIndex: 0,
    expandedNoteRowId: null,
    editingRowId: null,
    copyFromId: input.initialDialogues[0]?.id || 1,
    copyToId: input.initialDialogues.at(-1)?.id || 1,
    copyState: 'idle',
    selectedRowIds: new Set<number>(),
    lastSelectedRowId: null,
    selectedCopyState: 'idle',
    noteDraftById: input.initialDialogues.reduce<Record<number, string>>(
      (acc, row) => {
        acc[row.id] = row.note || ''
        return acc
      },
      {},
    ),
    editDraftById: {},
    lineMetaMessage: '',
    localPronunciationMap: input.initialPronunciationMap,
    localVocabularyMetaMap: input.initialVocabularyMetaMap,
  })
  const setter = useCallback(
    <Key extends keyof EditorState>(key: Key) =>
      (value: SetStateAction<EditorState[Key]>) =>
        dispatch({ key, value } as EditorAction),
    [],
  )
  const setters = useMemo(
    () => ({
      setRows: setter('rows'),
      setShowTimeline: setter('showTimeline'),
      setShowFavoriteOnly: setter('showFavoriteOnly'),
      setPageSize: setter('pageSize'),
      setCurrentPage: setter('currentPage'),
      setSearchKeyword: setter('searchKeyword'),
      setCurrentSearchHitIndex: setter('currentSearchHitIndex'),
      setExpandedNoteRowId: setter('expandedNoteRowId'),
      setEditingRowId: setter('editingRowId'),
      setCopyFromId: setter('copyFromId'),
      setCopyToId: setter('copyToId'),
      setCopyState: setter('copyState'),
      setSelectedRowIds: setter('selectedRowIds'),
      setLastSelectedRowId: setter('lastSelectedRowId'),
      setSelectedCopyState: setter('selectedCopyState'),
      setNoteDraftById: setter('noteDraftById'),
      setEditDraftById: setter('editDraftById'),
      setLineMetaMessage: setter('lineMetaMessage'),
      setLocalPronunciationMap: setter('localPronunciationMap'),
      setLocalVocabularyMetaMap: setter('localVocabularyMetaMap'),
    }),
    [setter],
  )
  return {
    ...state,
    ...setters,
  }
}
