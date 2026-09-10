'use client'

import { useCallback, useMemo, useReducer, type SetStateAction } from 'react'
import type { Rating } from 'ts-fsrs'

import type { FolderItem, SentenceItem, VocabItem } from '../types'
import { filterAndSortVocabulary } from '../domain/workbench'

type VocabularyWorkspaceState = {
  activeTab: string
  localData: Record<string, VocabItem[]>
  viewMode: 'list' | 'flashcard'
  currentIndex: number
  memoryMode: boolean
  randomOrder: boolean
  shuffleSeed: number
  memoryNowMs: number
  isSubmittingRating: boolean
  memoryReveal: boolean
  pendingMemoryRating: Rating | null
  isEditMode: boolean
  selectedVocabIds: Set<string>
  bulkTagsInput: string
  bulkTagPanelOpen: boolean
  isSelectAllChecked: boolean
  bulkWordbookId: string
  isBulkAddingToWordbook: boolean
  sortMode: 'recent' | 'word' | 'pos'
  selectedPosFilter: string
  selectedTagFilter: string
  selectedFolderFilter: string
  selectedGroupFilter: string
  folderList: FolderItem[]
  expandedInflectionIds: Record<string, boolean>
  dragOffsetX: number
  cardTransitionState: 'idle' | 'leaving' | 'entering'
  cardTransitionDirection: 'next' | 'prev'
  searchingId: string | null
  isSearchingMore: boolean
  searchResults: Record<string, SentenceItem[]>
}

type WorkspaceAction = {
  [Key in keyof VocabularyWorkspaceState]: {
    key: Key
    value: SetStateAction<VocabularyWorkspaceState[Key]>
  }
}[keyof VocabularyWorkspaceState]

function reducer(state: VocabularyWorkspaceState, action: WorkspaceAction) {
  const current = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value
  if (Object.is(current, next)) {
    return state
  }
  return { ...state, [action.key]: next }
}

export function useVocabularyWorkspaceState(input: {
  groupedData: Record<string, VocabItem[]>
  folders: FolderItem[]
  initialFolderFilter: string
  initialGroupFilter?: string
  initialPosFilter?: string
  initialTagFilter?: string
  initialViewMode?: 'list' | 'card'
  initialFocusId?: string
}) {
  const groupNames = Object.keys(input.groupedData)
  const focusGroup = input.initialFocusId
    ? groupNames.find(group =>
        input.groupedData[group]?.some(item => item.id === input.initialFocusId),
      )
    : undefined
  const initialActiveTab =
    input.initialGroupFilter || focusGroup || groupNames[0] || '未分类'
  const initialItems = filterAndSortVocabulary(
    input.groupedData[initialActiveTab] || [],
    input.initialPosFilter || 'all',
    'all',
    'recent',
  )
  const initialFocusIndex = input.initialFocusId
    ? initialItems.findIndex(item => item.id === input.initialFocusId)
    : -1
  const [state, dispatch] = useReducer(reducer, {
    activeTab: initialActiveTab,
    localData: input.groupedData,
    viewMode: input.initialViewMode === 'card' ? 'flashcard' : 'list',
    currentIndex: Math.max(0, initialFocusIndex),
    memoryMode: false,
    randomOrder: false,
    shuffleSeed: 1,
    memoryNowMs: 0,
    isSubmittingRating: false,
    memoryReveal: false,
    pendingMemoryRating: null,
    isEditMode: false,
    selectedVocabIds: new Set<string>(),
    bulkTagsInput: '',
    bulkTagPanelOpen: false,
    isSelectAllChecked: false,
    bulkWordbookId: 'none',
    isBulkAddingToWordbook: false,
    sortMode: 'recent',
    selectedPosFilter: input.initialPosFilter || 'all',
    selectedTagFilter: input.initialTagFilter || 'all',
    selectedFolderFilter: input.initialFolderFilter,
    selectedGroupFilter: input.initialGroupFilter || '',
    folderList: input.folders,
    expandedInflectionIds: {},
    dragOffsetX: 0,
    cardTransitionState: 'idle',
    cardTransitionDirection: 'next',
    searchingId: null,
    isSearchingMore: false,
    searchResults: {},
  })
  const setter = useCallback(
    <Key extends keyof VocabularyWorkspaceState>(key: Key) =>
      (value: SetStateAction<VocabularyWorkspaceState[Key]>) =>
        dispatch({ key, value } as WorkspaceAction),
    [],
  )
  const setters = useMemo(
    () => ({
      setActiveTab: setter('activeTab'),
      setLocalData: setter('localData'),
      setViewMode: setter('viewMode'),
      setCurrentIndex: setter('currentIndex'),
      setMemoryMode: setter('memoryMode'),
      setRandomOrder: setter('randomOrder'),
      setShuffleSeed: setter('shuffleSeed'),
      setMemoryNowMs: setter('memoryNowMs'),
      setIsSubmittingRating: setter('isSubmittingRating'),
      setMemoryReveal: setter('memoryReveal'),
      setPendingMemoryRating: setter('pendingMemoryRating'),
      setIsEditMode: setter('isEditMode'),
      setSelectedVocabIds: setter('selectedVocabIds'),
      setBulkTagsInput: setter('bulkTagsInput'),
      setBulkTagPanelOpen: setter('bulkTagPanelOpen'),
      setIsSelectAllChecked: setter('isSelectAllChecked'),
      setBulkWordbookId: setter('bulkWordbookId'),
      setIsBulkAddingToWordbook: setter('isBulkAddingToWordbook'),
      setSortMode: setter('sortMode'),
      setSelectedPosFilter: setter('selectedPosFilter'),
      setSelectedTagFilter: setter('selectedTagFilter'),
      setSelectedFolderFilter: setter('selectedFolderFilter'),
      setSelectedGroupFilter: setter('selectedGroupFilter'),
      setFolderList: setter('folderList'),
      setExpandedInflectionIds: setter('expandedInflectionIds'),
      setDragOffsetX: setter('dragOffsetX'),
      setCardTransitionState: setter('cardTransitionState'),
      setCardTransitionDirection: setter('cardTransitionDirection'),
      setSearchingId: setter('searchingId'),
      setIsSearchingMore: setter('isSearchingMore'),
      setSearchResults: setter('searchResults'),
    }),
    [setter],
  )

  return {
    ...state,
    ...setters,
  }
}
