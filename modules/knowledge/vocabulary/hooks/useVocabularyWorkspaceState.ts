'use client'

import { useCallback, useMemo, useReducer, type SetStateAction } from 'react'
import type { Rating } from 'ts-fsrs'

import type { FolderItem, SentenceItem, VocabItem } from '../types'

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
  activeTagEditorId: string | null
  tagDraft: string
  isSavingTags: boolean
  isSelectAllChecked: boolean
  bulkWordbookId: string
  isBulkAddingToWordbook: boolean
  sortMode: 'recent' | 'word' | 'pos'
  selectedPosFilter: string
  selectedFolderFilter: string
  selectedGroupFilter: string
  folderList: FolderItem[]
  selectedFolderManageId: string | null
  activePronEditId: string | null
  pronInput: string
  activeMeaningEditId: string | null
  meaningDraft: string
  isSavingMeanings: boolean
  activeFolderEditId: string | null
  expandedInflectionIds: Record<string, boolean>
  dragOffsetX: number
  cardTransitionState: 'idle' | 'leaving' | 'entering'
  cardTransitionDirection: 'next' | 'prev'
  searchingId: string | null
  isSearchingMore: boolean
  searchResults: Record<string, SentenceItem[]>
  pendingSentenceIndex: number | null
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
  return { ...state, [action.key]: next }
}

export function useVocabularyWorkspaceState(input: {
  groupedData: Record<string, VocabItem[]>
  folders: FolderItem[]
  initialFolderFilter: string
  initialGroupFilter?: string
}) {
  const [state, dispatch] = useReducer(reducer, {
    activeTab:
      input.initialGroupFilter || Object.keys(input.groupedData)[0] || '未分类',
    localData: input.groupedData,
    viewMode: 'list',
    currentIndex: 0,
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
    activeTagEditorId: null,
    tagDraft: '',
    isSavingTags: false,
    isSelectAllChecked: false,
    bulkWordbookId: 'none',
    isBulkAddingToWordbook: false,
    sortMode: 'recent',
    selectedPosFilter: 'all',
    selectedFolderFilter: input.initialFolderFilter,
    selectedGroupFilter: input.initialGroupFilter || '',
    folderList: input.folders,
    selectedFolderManageId: null,
    activePronEditId: null,
    pronInput: '',
    activeMeaningEditId: null,
    meaningDraft: '',
    isSavingMeanings: false,
    activeFolderEditId: null,
    expandedInflectionIds: {},
    dragOffsetX: 0,
    cardTransitionState: 'idle',
    cardTransitionDirection: 'next',
    searchingId: null,
    isSearchingMore: false,
    searchResults: {},
    pendingSentenceIndex: null,
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
      setActiveTagEditorId: setter('activeTagEditorId'),
      setTagDraft: setter('tagDraft'),
      setIsSavingTags: setter('isSavingTags'),
      setIsSelectAllChecked: setter('isSelectAllChecked'),
      setBulkWordbookId: setter('bulkWordbookId'),
      setIsBulkAddingToWordbook: setter('isBulkAddingToWordbook'),
      setSortMode: setter('sortMode'),
      setSelectedPosFilter: setter('selectedPosFilter'),
      setSelectedFolderFilter: setter('selectedFolderFilter'),
      setSelectedGroupFilter: setter('selectedGroupFilter'),
      setFolderList: setter('folderList'),
      setSelectedFolderManageId: setter('selectedFolderManageId'),
      setActivePronEditId: setter('activePronEditId'),
      setPronInput: setter('pronInput'),
      setActiveMeaningEditId: setter('activeMeaningEditId'),
      setMeaningDraft: setter('meaningDraft'),
      setIsSavingMeanings: setter('isSavingMeanings'),
      setActiveFolderEditId: setter('activeFolderEditId'),
      setExpandedInflectionIds: setter('expandedInflectionIds'),
      setDragOffsetX: setter('dragOffsetX'),
      setCardTransitionState: setter('cardTransitionState'),
      setCardTransitionDirection: setter('cardTransitionDirection'),
      setSearchingId: setter('searchingId'),
      setIsSearchingMore: setter('isSearchingMore'),
      setSearchResults: setter('searchResults'),
      setPendingSentenceIndex: setter('pendingSentenceIndex'),
    }),
    [setter],
  )

  return {
    ...state,
    ...setters,
  }
}
