// app/vocabulary/VocabularyTabs.tsx
'use client'

import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useDialog } from '@/context/DialogContext'
import WordPronunciation from '@/components/vocabulary/WordPronunciation'
import InlineConfirmAction from '@/components/InlineConfirmAction'
import ToggleSwitch from '@/components/ToggleSwitch'
import {
  hasJapanese,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import {
  inferContextualPos,
  posBadgeClass,
  getPosOptions,
} from '@/utils/language/posTagger'
import { Rating } from 'ts-fsrs'
import ControlDropdown from '@/modules/knowledge/vocabulary/components/ControlDropdown'
import SentenceSearchPanel from '@/modules/knowledge/vocabulary/components/SentenceSearchPanel'
import SentenceEditControls from '@/modules/knowledge/vocabulary/components/SentenceEditControls'
import VocabularySentenceText from '@/modules/knowledge/vocabulary/components/VocabularySentenceText'
import {
  FlashCardNavigation,
  MemoryRatingControls,
} from '@/modules/knowledge/vocabulary/components/MemoryCardControls'
import {
  LANGUAGE_NAMES,
  buildFlashVocabularyList,
  buildFolderTree,
  buildInflectionFamilyMap,
  filterAndSortVocabulary,
  firstSentencePosTag,
  flattenFolderTree,
  getPrimaryPronunciation,
  getSentenceSourceDisplay,
  getVocabularyPosOptions,
  normalizeLanguageCode,
  resolveInconsistentMemoryRating,
  splitListInput,
  supportsPronunciationByLanguage,
} from '@/modules/knowledge/vocabulary/domain/workbench'
import type {
  FolderItem,
  SentenceItem,
  VocabItem,
} from '@/modules/knowledge/vocabulary/types'
import { useVocabularyWorkspaceState } from '@/modules/knowledge/vocabulary/hooks/useVocabularyWorkspaceState'
import { useVocabularyMutations } from '@/modules/knowledge/vocabulary/hooks/useVocabularyMutations'
import { detectJapaneseInflection } from '@/utils/vocabulary/japaneseInflection'

function SpeakerIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      aria-hidden='true'
      className={className}
      fill='none'
      stroke='currentColor'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeWidth={1.8}
      viewBox='0 0 24 24'>
      <path d='M11 5 6.5 8.5H3.75a.75.75 0 0 0-.75.75v5.5c0 .41.34.75.75.75H6.5L11 19V5Z' />
      <path d='M15 9.25a4 4 0 0 1 0 5.5' />
      <path d='M17.75 6.5a7.75 7.75 0 0 1 0 11' />
    </svg>
  )
}

function SentenceMoveHandle({
  vocabularyId,
  sentenceIndex,
  selected,
  onSelect,
}: {
  vocabularyId: string
  sentenceIndex: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type='button'
      draggable
      aria-label='移动例句到其他释义'
      aria-pressed={selected}
      title='拖到目标释义，或先点击再选择释义'
      onClick={event => {
        event.stopPropagation()
        onSelect()
      }}
      onDragStart={event => {
        event.stopPropagation()
        event.dataTransfer.setData(
          'application/json',
          JSON.stringify({ vocabId: vocabularyId, sentenceIndex }),
        )
        event.dataTransfer.effectAllowed = 'move'
      }}
      className={`mt-0.5 inline-flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-lg transition-colors active:cursor-grabbing ${
        selected
          ? 'bg-slate-200 text-slate-700'
          : 'text-slate-300 hover:bg-stone-100 hover:text-slate-600'
      }`}>
      <svg
        aria-hidden='true'
        className='h-4 w-4'
        fill='currentColor'
        viewBox='0 0 16 16'>
        <circle cx='5' cy='3' r='1.15' />
        <circle cx='11' cy='3' r='1.15' />
        <circle cx='5' cy='8' r='1.15' />
        <circle cx='11' cy='8' r='1.15' />
        <circle cx='5' cy='13' r='1.15' />
        <circle cx='11' cy='13' r='1.15' />
      </svg>
    </button>
  )
}

export default function VocabularyTabs({
  groupedData,
  groupedTotals,
  folders,
  initialFolderFilter = 'all',
  initialGroupFilter,
  initialFocusId,
  initialFocusGroup,
  totalCount,
  currentPage,
  pageSize = 48,
}: {
  groupedData: Record<string, VocabItem[]>
  groupedTotals: Record<string, number>
  folders: FolderItem[]
  initialFolderFilter?: string
  initialGroupFilter?: string
  initialFocusId?: string
  initialFocusGroup?: string
  totalCount: number
  currentPage: number
  pageSize?: number
}) {
  const dialog = useDialog()
  const router = useRouter()
  const pathname = usePathname()
  const {
    deleteVocabulary,
    searchSentencesForWord,
    addVocabularySentence,
    updateVocabularyPronunciationById,
    assignVocabularySentenceMeaning,
    clearVocabularySentenceMeaning,
    deleteVocabularySentence,
    updateVocabularyPartsOfSpeechById,
    updateVocabularySentencePosTags,
    updateVocabularyTags,
    addVocabulariesToWordbook,
    rateVocabularyMemory,
  } = useVocabularyMutations()
  const workspace = useVocabularyWorkspaceState({
    groupedData,
    folders,
    initialFolderFilter,
    initialGroupFilter,
  })
  const {
    activeTab, setActiveTab, localData, setLocalData, viewMode, setViewMode,
    currentIndex, setCurrentIndex, memoryMode, setMemoryMode, randomOrder,
    setRandomOrder, shuffleSeed, setShuffleSeed, memoryNowMs, setMemoryNowMs,
    isSubmittingRating, setIsSubmittingRating, memoryReveal, setMemoryReveal,
    pendingMemoryRating, setPendingMemoryRating, isEditMode, setIsEditMode,
    selectedVocabIds, setSelectedVocabIds, bulkTagsInput, setBulkTagsInput,
    bulkTagPanelOpen, setBulkTagPanelOpen, activeTagEditorId,
    setActiveTagEditorId, tagDraft, setTagDraft, isSavingTags,
    setIsSavingTags, isSelectAllChecked, setIsSelectAllChecked,
    bulkWordbookId, setBulkWordbookId, isBulkAddingToWordbook,
    setIsBulkAddingToWordbook, sortMode, setSortMode, selectedPosFilter,
    setSelectedPosFilter, selectedFolderFilter, setSelectedFolderFilter,
    selectedGroupFilter, setSelectedGroupFilter, folderList, setFolderList,
    activePronEditId, setActivePronEditId, pronInput, setPronInput, activeFolderEditId,
    setActiveFolderEditId, expandedInflectionIds, setExpandedInflectionIds,
    dragOffsetX, setDragOffsetX, cardTransitionState, setCardTransitionState,
    cardTransitionDirection, setCardTransitionDirection, searchingId,
    setSearchingId, isSearchingMore, setIsSearchingMore, searchResults,
    setSearchResults, pendingSentenceIndex, setPendingSentenceIndex,
  } = workspace
  const shuffleSeedRef = useRef(1)
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const appliedFocusIdRef = useRef<string | null>(null)
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transitionRafRef = useRef<number | null>(null)
  const swipeStateRef = useRef<{
    active: boolean
    dragging: boolean
    pointerId: number | null
    startX: number
    startY: number
    deltaX: number
  }>({
    active: false,
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
  })

  const lastAutoPlayedWordIdRef = useRef<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  const folderTree = useMemo(() => buildFolderTree(folderList), [folderList])
  const flatFolders = useMemo(() => flattenFolderTree(folderTree), [folderTree])
  const folderPathLabelMap = useMemo(
    () =>
      flatFolders.reduce<Record<string, string>>((acc, folder) => {
        acc[folder.id] = folder.pathLabel
        return acc
      }, {}),
    [flatFolders],
  )
  const bumpShuffleSeed = () => {
    shuffleSeedRef.current += 1
    setShuffleSeed(shuffleSeedRef.current)
  }

  const effectiveGroupFilter = selectedGroupFilter || initialGroupFilter || activeTab
  const effectiveGroupTotalPages = useMemo(() => {
    const groupCount = effectiveGroupFilter
      ? groupedTotals[effectiveGroupFilter] || 0
      : totalCount
    return Math.max(1, Math.ceil(groupCount / pageSize))
  }, [effectiveGroupFilter, groupedTotals, pageSize, totalCount])

  const buildVocabularySearchParams = (overrides: {
    page?: string
    wordbook?: string
    group?: string | null
  }) => {
    const params = new URLSearchParams()
    params.set('page', overrides.page || '1')
    params.set('wordbook', overrides.wordbook || selectedFolderFilter)
    const nextGroup =
      overrides.group === undefined ? effectiveGroupFilter : overrides.group
    if (nextGroup) params.set('group', nextGroup)
    return params
  }

  // 🌟 修复后的音频播放逻辑
  const playAudio = (audioData: {
    audioFile: string
    start: number
    end: number
  }) => {
    if (!audioData?.audioFile) return

    try {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.ontimeupdate = null
      }

      const audio = new Audio(audioData.audioFile)
      audioRef.current = audio
      const start = Math.max(0, audioData.start || 0)
      const end = Math.max(start, audioData.end || 0)
      if (end > start) {
        audio.ontimeupdate = () => {
          if (audio.currentTime >= end) {
            audio.pause()
            audio.ontimeupdate = null
          }
        }
      }

      const startPlayback = () => {
        audio.currentTime = start
        const playPromise = audio.play()
        playPromise?.catch(error => {
          console.error('音频播放失败，请检查文件路径或浏览器权限:', error)
        })
      }
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        startPlayback()
      } else {
        audio.addEventListener('loadedmetadata', startPlayback, { once: true })
      }
    } catch (e) {
      console.error('音频初始化失败:', e)
    }
  }

  const playAudioFile = (audioFile?: string | null) => {
    if (!audioFile) return

    try {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.ontimeupdate = null
      }

      const audio = new Audio(audioFile)
      audioRef.current = audio
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('音频播放失败，请检查文件路径或浏览器权限:', error)
        })
      }
    } catch (error) {
      console.error('音频初始化失败:', error)
    }
  }

  const handleDelete = async (group: string, id: string) => {
    const prevData = localData
    setLocalData(prev => ({
      ...prev,
      [group]: prev[group].filter((item: VocabItem) => item.id !== id),
    }))
    const result = await deleteVocabulary(id)
    if (!result.success) {
      setLocalData(prevData)
      dialog.toast(result.message || '删除失败', { tone: 'error' })
      return
    }
    dialog.toast('删除成功', { tone: 'success' })
  }

  const handleSearchSentences = async (id: string, word: string) => {
    if (searchResults[id]) {
      setSearchingId(searchingId === id ? null : id)
      return
    }
    setIsSearchingMore(true)
    setSearchingId(id)
    const res = await searchSentencesForWord(word)
    if (res.success)
      setSearchResults(prev => ({ ...prev, [id]: res.data || [] }))
    if (!res.success) setSearchResults(prev => ({ ...prev, [id]: [] }))
    setIsSearchingMore(false)
  }

  const handleOpenPronEditor = (vocab: VocabItem) => {
    setActiveFolderEditId(null)
    setActivePronEditId(vocab.id)
    setPronInput(getPrimaryPronunciation(vocab))
  }

  const handleSavePronunciation = async (vocab: VocabItem) => {
    const nextPron = pronInput.trim()
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item =>
        item.id === vocab.id
          ? {
              ...item,
              pronunciation: nextPron,
              pronunciations: nextPron ? [nextPron] : [],
            }
          : item,
      ),
    }))
    await updateVocabularyPronunciationById(vocab.id, nextPron)
    setActivePronEditId(null)
  }

  const handleToggleWordPos = async (vocab: VocabItem, pos: string) => {
    const current = (vocab.partsOfSpeech || [])
      .map(item => item.trim())
      .filter(Boolean)
    const nextPos = current.includes(pos)
      ? current.filter(item => item !== pos)
      : [...current, pos]
    const prevData = localData
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item =>
        item.id === vocab.id
          ? {
              ...item,
              partOfSpeech: nextPos[0] || null,
              partsOfSpeech: nextPos,
            }
          : item,
      ),
    }))
    const result = await updateVocabularyPartsOfSpeechById(vocab.id, nextPos)
    if (!result.success) {
      setLocalData(prevData)
      await dialog.alert(result.message || '词性保存失败')
    }
  }

  const openTagEditor = (vocab: VocabItem) => {
    setActivePronEditId(null)
    setActiveFolderEditId(null)
    setActiveTagEditorId(vocab.id)
    setTagDraft((vocab.tags || []).join('\n'))
  }

  const closeTagEditor = () => {
    setActiveTagEditorId(null)
    setTagDraft('')
    setIsSavingTags(false)
  }

  const handleSaveTagsForVocab = async (vocab: VocabItem) => {
    const newTags = splitListInput(tagDraft)
    const prevData = localData

    setIsSavingTags(true)
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item =>
        item.id === vocab.id
          ? {
              ...item,
              tags: newTags,
            }
          : item,
      ),
    }))

    const result = await updateVocabularyTags(vocab.id, newTags)
    if (!result.success) {
      setLocalData(prevData)
      setIsSavingTags(false)
      dialog.toast(result.message || '标签保存失败', { tone: 'error' })
      return
    }

    dialog.toast('标签已更新', { tone: 'success' })
    closeTagEditor()
  }

  const handleBulkEditTagsInline = async () => {
    const selectedCount = selectedVocabIds.size
    if (selectedCount === 0) {
      dialog.toast('请先选择单词', { tone: 'error' })
      return
    }

    const newTags = splitListInput(bulkTagsInput)
    if (newTags.length === 0) {
      dialog.toast('请输入至少一个标签', { tone: 'error' })
      return
    }

    const selectedIds = Array.from(selectedVocabIds)

    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item =>
        selectedIds.includes(item.id)
          ? {
              ...item,
              tags: newTags,
            }
          : item,
      ),
    }))

    for (const vocabId of selectedIds) {
      const result = await updateVocabularyTags(vocabId, newTags)
      if (!result.success) {
        console.error(`更新标签失败: ${vocabId}`)
      }
    }

    setSelectedVocabIds(new Set())
    setIsSelectAllChecked(false)
    setBulkTagsInput('')
    setBulkTagPanelOpen(false)
    dialog.toast(`已为 ${selectedCount} 个单词添加标签`, { tone: 'success' })
  }

  const handleBulkAddToWordbook = async () => {
    const selectedIds = Array.from(selectedVocabIds)
    if (selectedIds.length === 0) {
      dialog.toast('请先选择单词', { tone: 'error' })
      return
    }
    if (bulkWordbookId === 'none') {
      dialog.toast('请先选择目标单词书', { tone: 'error' })
      return
    }

    setIsBulkAddingToWordbook(true)
    const result = await addVocabulariesToWordbook(selectedIds, bulkWordbookId)
    setIsBulkAddingToWordbook(false)
    if (!result.success) {
      dialog.toast(result.message || '批量加入失败', { tone: 'error' })
      return
    }

    const nextFolderName = folderPathLabelMap[bulkWordbookId] || null
    setLocalData(prev =>
      Object.fromEntries(
        Object.entries(prev).map(([group, items]) => [
          group,
          items.map(item =>
            selectedVocabIds.has(item.id)
              ? {
                  ...item,
                  folderId: bulkWordbookId,
                  folderName: nextFolderName,
                }
              : item,
          ),
        ]),
      ) as Record<string, VocabItem[]>,
    )

    dialog.toast(
      `已加入单词书：新增 ${result.added || 0}，跳过 ${result.skipped || 0}`,
      { tone: 'success' },
    )
  }

  const handleAddSentence = async (
    lang: string,
    id: string,
    newSentenceObj: SentenceItem,
  ) => {
    setLocalData(prev => ({
      ...prev,
      [lang]: prev[lang].map((item: VocabItem) =>
        item.id === id
          ? { ...item, sentences: [...item.sentences, newSentenceObj] }
          : item,
      ),
    }))
    setSearchingId(null)
    await addVocabularySentence(id, newSentenceObj)
  }

  const handleAssignSentenceMeaning = async (
    vocabId: string,
    sentenceIndex: number,
    meaningIndex: number,
  ) => {
    const vocab = localData[activeTab]?.find(item => item.id === vocabId)
    const sentence = vocab?.sentences[sentenceIndex]
    if (!sentence) return

    const prevData = localData
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item => {
        if (item.id !== vocabId) return item
        const nextSentences = item.sentences.map((sent, idx) =>
          idx === sentenceIndex ? { ...sent, meaningIndex } : sent,
        )
        return { ...item, sentences: nextSentences }
      }),
    }))

    const result = await assignVocabularySentenceMeaning(
      vocabId,
      sentence.text,
      meaningIndex,
    )
    if (!result.success) {
      setLocalData(prevData)
      await dialog.alert(result.message || '保存失败，请重试', {
        title: '保存失败',
      })
    }
  }

  const handleClearSentenceMeaning = async (
    vocabId: string,
    sentenceIndex: number,
  ) => {
    const vocab = localData[activeTab]?.find(item => item.id === vocabId)
    const sentence = vocab?.sentences[sentenceIndex]
    if (!sentence) return
    const prevData = localData
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item => {
        if (item.id !== vocabId) return item
        return {
          ...item,
          sentences: item.sentences.map((sent, idx) =>
            idx === sentenceIndex ? { ...sent, meaningIndex: null } : sent,
          ),
        }
      }),
    }))
    const result = await clearVocabularySentenceMeaning(vocabId, sentence.text)
    if (!result.success) {
      setLocalData(prevData)
      await dialog.alert(result.message || '取消匹配失败')
    }
  }

  const handleDeleteSentence = async (
    vocabId: string,
    sentenceIndex: number,
  ) => {
    const vocab = localData[activeTab]?.find(item => item.id === vocabId)
    const sentence = vocab?.sentences[sentenceIndex]
    if (!sentence) return

    const confirmed = await dialog.confirm('确定删除这条例句吗？', {
      title: '删除例句',
      confirmText: '删除',
      danger: true,
    })
    if (!confirmed) return

    const prevData = localData
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item => {
        if (item.id !== vocabId) return item
        return {
          ...item,
          sentences: item.sentences.filter((_, idx) => idx !== sentenceIndex),
        }
      }),
    }))
    setPendingSentenceIndex(prev =>
      prev === sentenceIndex ? null : prev != null && prev > sentenceIndex ? prev - 1 : prev,
    )

    const result = await deleteVocabularySentence(vocabId, sentence.text)
    if (!result.success) {
      setLocalData(prevData)
      await dialog.alert(result.message || '删除例句失败')
      return
    }
    dialog.toast('例句已删除', { tone: 'success' })
  }

  const currentList = useMemo<VocabItem[]>(
    () => localData[activeTab] || [],
    [activeTab, localData],
  )
  const inflectionByWordId = useMemo(() => {
    return buildInflectionFamilyMap(localData)
  }, [localData])
  const activeTabLanguageCode = normalizeLanguageCode(activeTab)
  const posFilterOptions = useMemo(
    () =>
      getVocabularyPosOptions(currentList),
    [currentList],
  )
  const visibleList = useMemo(() => {
    return filterAndSortVocabulary(
      currentList,
      selectedPosFilter,
      'all',
      sortMode,
    )
  }, [currentList, selectedPosFilter, sortMode])
  const flashList = useMemo(() => {
    return buildFlashVocabularyList(
      visibleList,
      memoryMode,
      memoryNowMs,
      randomOrder,
      shuffleSeed,
    )
  }, [visibleList, memoryMode, memoryNowMs, randomOrder, shuffleSeed])
  const currentFlashVocab = flashList[currentIndex] || null
  const allExistingGroups = useMemo(() => {
    return Object.keys(groupedTotals).filter(
      name => (groupedTotals[name] || 0) > 0,
    )
  }, [groupedTotals])
  const currentGroupCountMap = useMemo(() => groupedTotals, [groupedTotals])

  useEffect(() => {
    if (viewMode !== 'flashcard') return
    const current = flashList[currentIndex]
    if (!current?.wordAudio) return
    if (lastAutoPlayedWordIdRef.current === current.id) return
    lastAutoPlayedWordIdRef.current = current.id
    playAudioFile(current.wordAudio)
  }, [viewMode, currentIndex, flashList])

  // 点击外部关闭移动菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setActivePronEditId(null)
      setActiveFolderEditId(null)
      setActiveTagEditorId(null)
    }
    if (
      activePronEditId ||
      activeFolderEditId ||
      activeTagEditorId
    ) {
      window.addEventListener('click', handleClickOutside)
    }
    return () => window.removeEventListener('click', handleClickOutside)
  }, [
    activePronEditId,
    activeFolderEditId,
    activeTagEditorId,
    setActivePronEditId,
    setActiveFolderEditId,
    setActiveTagEditorId,
  ])

  useEffect(() => {
    setPendingSentenceIndex(null)
  }, [activeTab, currentIndex, viewMode, setPendingSentenceIndex])

  useEffect(() => {
    if (!isEditMode) {
      setActivePronEditId(null)
      setActiveFolderEditId(null)
      setActiveTagEditorId(null)
      setBulkTagPanelOpen(false)
      setPendingSentenceIndex(null)
    }
  }, [
    isEditMode,
    setActivePronEditId,
    setActiveFolderEditId,
    setActiveTagEditorId,
    setBulkTagPanelOpen,
    setPendingSentenceIndex,
  ])

  useEffect(() => {
    setSelectedPosFilter('all')
    setCurrentIndex(0)
  }, [activeTab, setCurrentIndex, setSelectedPosFilter])

  useEffect(() => {
    setLocalData(groupedData)
    const groups = Object.keys(groupedData)
    if (groups.length === 0) {
      if (initialGroupFilter && activeTab !== initialGroupFilter) {
        setActiveTab(initialGroupFilter)
      } else if (!initialGroupFilter && activeTab !== '未分类') {
        setActiveTab('未分类')
      }
      return
    }
    if (initialGroupFilter && groups.includes(initialGroupFilter)) {
      if (activeTab !== initialGroupFilter) setActiveTab(initialGroupFilter)
      return
    }
    if (!groups.includes(activeTab)) setActiveTab(groups[0])
  }, [
    groupedData,
    initialGroupFilter,
    activeTab,
    setActiveTab,
    setLocalData,
  ])

  useEffect(() => {
    setFolderList(folders)
  }, [folders, setFolderList])

  useEffect(() => {
    if (bulkWordbookId === 'none') return
    if (folderList.some(item => item.id === bulkWordbookId)) return
    setBulkWordbookId('none')
  }, [bulkWordbookId, folderList, setBulkWordbookId])

  useEffect(() => {
    setSelectedFolderFilter(initialFolderFilter || 'all')
  }, [initialFolderFilter, setSelectedFolderFilter])

  useEffect(() => {
    setSelectedGroupFilter(initialGroupFilter || '')
  }, [initialGroupFilter, setSelectedGroupFilter])

  useEffect(() => {
    if (!initialFocusId) return
    if (appliedFocusIdRef.current === initialFocusId) return
    const allGroups = Object.keys(localData)
    if (allGroups.length === 0) return
    const preferredGroup =
      initialFocusGroup && localData[initialFocusGroup]
        ? initialFocusGroup
        : allGroups.find(group =>
            (localData[group] || []).some(item => item.id === initialFocusId),
          )
    if (!preferredGroup) return
    setActiveTab(preferredGroup)
    const nextVisible = localData[preferredGroup] || []
    const nextIndex = nextVisible.findIndex(item => item.id === initialFocusId)
    if (nextIndex >= 0) {
      setCurrentIndex(nextIndex)
      setViewMode('flashcard')
      appliedFocusIdRef.current = initialFocusId
    }
  }, [
    initialFocusId,
    initialFocusGroup,
    localData,
    setActiveTab,
    setCurrentIndex,
    setViewMode,
  ])

  useEffect(() => {
    const visibleIds = visibleList.map(item => item.id)
    if (visibleIds.length === 0) {
      if (isSelectAllChecked) setIsSelectAllChecked(false)
      return
    }
    const allChecked = visibleIds.every(id => selectedVocabIds.has(id))
    if (allChecked !== isSelectAllChecked) setIsSelectAllChecked(allChecked)
  }, [
    visibleList,
    selectedVocabIds,
    isSelectAllChecked,
    setIsSelectAllChecked,
  ])

  const pushVocabularyGroup = (languageGroup: string | null) => {
    const params = buildVocabularySearchParams({
      page: '1',
      group: languageGroup,
    })
    router.push(`${pathname}?${params.toString()}`)
  }

  useEffect(() => {
    if (currentIndex >= flashList.length) {
      setCurrentIndex(Math.max(0, flashList.length - 1))
    }
  }, [currentIndex, flashList.length, setCurrentIndex])

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
      if (transitionRafRef.current)
        cancelAnimationFrame(transitionRafRef.current)
    }
  }, [])

  const shouldShowPronunciationForVocab = (vocab: VocabItem) => {
    const shouldShowPronunciation =
      memoryMode && viewMode === 'flashcard' ? memoryReveal : showPronunciation
    if (!shouldShowPronunciation) return false
    const hasPronunciation = !!getPrimaryPronunciation(vocab)
    if (!hasPronunciation) return false
    if (hasJapanese(vocab.word)) return true
    const languageCode =
      activeTabLanguageCode !== 'other'
        ? activeTabLanguageCode
        : normalizeLanguageCode(vocab.languageCode || '')
    return supportsPronunciationByLanguage(languageCode)
  }

  const renderWordPosLine = (vocab: VocabItem, centered = false) => {
    const posList = (vocab.partsOfSpeech || [])
      .map(item => item.trim())
      .filter(Boolean)

    if (posList.length === 0) return null

    return (
      <div
        className={`mt-2 flex flex-wrap gap-1.5 ${
          centered ? 'justify-center' : 'justify-start'
        }`}>
        {posList.map(pos => (
          <span
            key={`${vocab.id}-pos-display-${pos}`}
            className='inline-flex items-center rounded-full border border-slate-200/90 bg-gradient-to-b from-white to-slate-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'>
            {pos}
          </span>
        ))}
      </div>
    )
  }
  const toggleInflectionExpand = (wordId: string) => {
    setExpandedInflectionIds(prev => ({
      ...prev,
      [wordId]: !prev[wordId],
    }))
  }

  const renderSentenceWithPronunciation = (
    sentence: SentenceItem,
    vocab: VocabItem,
  ) => {
    const targetPron = getPrimaryPronunciation(vocab)
    return (
      <VocabularySentenceText
        text={sentence.text}
        word={vocab.word}
        pronunciation={targetPron}
        highlightClass='rounded-md bg-stone-100 px-1 text-slate-950'
        showPronunciation={
          hasJapanese(vocab.word) &&
          shouldShowPronunciationForVocab(vocab) &&
          Boolean(targetPron)
        }
      />
    )
  }

  const canPlaySentenceAudio = (sentence: SentenceItem) => {
    if (sentence.audioFile) return true
    return Boolean(sentence.audioData?.audioFile)
  }

  const sentencePosTags = (vocab: VocabItem, sentenceText: string) =>
    inferContextualPos(vocab.word, sentenceText, vocab.partsOfSpeech || [])

  const sentencePosTagsFromItem = (
    vocab: VocabItem,
    sentence: SentenceItem,
  ) => {
    const savedTag = firstSentencePosTag(sentence.posTags)
    if (savedTag) return [savedTag]
    const inferredTag = firstSentencePosTag(
      sentencePosTags(vocab, sentence.text),
    )
    return inferredTag ? [inferredTag] : []
  }

  const renderSentenceMetaRow = (vocab: VocabItem, sentence: SentenceItem) => {
    const sourceText = getSentenceSourceDisplay(sentence)
    const hasSource = !!sourceText.trim()
    const sentencePos = sentencePosTagsFromItem(vocab, sentence)[0]
    const inflectionFamily = inflectionByWordId.get(vocab.id)
    const matchedInflection = inflectionFamily
      ? [...inflectionFamily.variants]
          .sort((left, right) => right.word.length - left.word.length)
          .find(variant => sentence.text.includes(variant.word))?.word || ''
      : ''
    const detectedInflection = !matchedInflection
      ? detectJapaneseInflection({
          word: vocab.word,
          sentenceText: sentence.text,
          partsOfSpeech: vocab.partsOfSpeech,
        })
      : null
    const inflectionLabel =
      inflectionFamily &&
      matchedInflection &&
      matchedInflection !== inflectionFamily.lemma
        ? `词形 ${matchedInflection} → ${inflectionFamily.lemma}`
        : detectedInflection
          ? `词形 ${detectedInflection.surface} → ${detectedInflection.lemma}`
          : ''
    const hasInflection = !!inflectionLabel
    const canPlay = canPlaySentenceAudio(sentence)
    const sourceClass =
      'inline-flex h-5 items-center text-[12px] font-medium leading-5 text-slate-400 dark:text-indigo-200/75'
    const divider = (
      <span className='inline-flex h-5 items-center text-[12px] leading-5 text-slate-300 dark:text-indigo-200/45'>
        ｜
      </span>
    )

    return (
      <div className='mt-2 flex h-5 items-center gap-2'>
        {hasSource &&
          (sentence.sourceUrl && sentence.sourceUrl !== '#' ? (
            <Link
              href={sentence.sourceUrl}
              onClick={event => event.stopPropagation()}
              className={`${sourceClass} underline-offset-2 hover:text-slate-600 dark:hover:text-indigo-100 hover:underline`}>
              {sourceText}
            </Link>
          ) : (
            <span className={sourceClass}>{sourceText}</span>
          ))}
        {sentencePos && (
          <>
            {hasSource && divider}
            <span className='inline-flex h-5 items-center text-[12px] font-medium leading-5 text-slate-400 dark:text-indigo-200/75'>
              {sentencePos}
            </span>
          </>
        )}
        {hasInflection && (
          <>
            {(hasSource || sentencePos) && divider}
            <span className='inline-flex h-5 items-center text-[12px] font-medium leading-5 text-slate-400 dark:text-indigo-200/75'>
              {inflectionLabel}
            </span>
          </>
        )}
        {canPlay && (
          <>
            {(hasSource || sentencePos || hasInflection) && divider}
            <button
              type='button'
              aria-label='播放例句音频'
              title='播放例句音频'
              onClick={event => {
                event.stopPropagation()
                if (sentence.audioFile) {
                  playAudioFile(sentence.audioFile)
                  return
                }
                if (sentence.audioData) playAudio(sentence.audioData)
              }}
              className='inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-stone-100 hover:text-slate-700'>
              <SpeakerIcon className='h-4 w-4' />
            </button>
          </>
        )}
      </div>
    )
  }

  const renderSentenceTranslation = (sentence: SentenceItem) => {
    if (!sentence.translation) return null
    return (
      <p className='mt-1.5 text-[14px] leading-relaxed text-slate-500 dark:text-indigo-200/70'>
        {sentence.translation}
      </p>
    )
  }

  const handleToggleSentencePosTag = async (
    vocabId: string,
    sentenceIndex: number,
    pos: string,
  ) => {
    const vocab = localData[activeTab]?.find(item => item.id === vocabId)
    const sentence = vocab?.sentences[sentenceIndex]
    if (!sentence) return
    const currentTag = sentencePosTagsFromItem(vocab, sentence)[0] || ''
    const nextTags = currentTag === pos ? [] : [pos]
    const prevData = localData
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item => {
        if (item.id !== vocabId) return item
        const mergedWordPos =
          nextTags.length > 0
            ? Array.from(new Set([...(item.partsOfSpeech || []), ...nextTags]))
            : item.partsOfSpeech || []
        return {
          ...item,
          partOfSpeech: mergedWordPos[0] || null,
          partsOfSpeech: mergedWordPos,
          sentences: item.sentences.map((sent, idx) =>
            idx === sentenceIndex ? { ...sent, posTags: nextTags } : sent,
          ),
        }
      }),
    }))
    const result = await updateVocabularySentencePosTags(
      vocabId,
      sentence.text,
      nextTags,
    )
    if (!result.success) {
      setLocalData(prevData)
      await dialog.alert(result.message || '句子词性更新失败')
    }
  }

  const runCardTransition = useCallback((
    targetIndex: number,
    direction: 'next' | 'prev',
  ) => {
    if (targetIndex < 0 || targetIndex >= flashList.length) return
    if (targetIndex === currentIndex) return
    if (cardTransitionState !== 'idle') return

    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
    if (transitionRafRef.current) cancelAnimationFrame(transitionRafRef.current)

    setCardTransitionDirection(direction)
    setCardTransitionState('leaving')

    transitionTimerRef.current = setTimeout(() => {
      setCurrentIndex(targetIndex)
      setCardTransitionState('entering')
      transitionRafRef.current = requestAnimationFrame(() => {
        transitionRafRef.current = requestAnimationFrame(() => {
          setCardTransitionState('idle')
        })
      })
    }, 150)
  }, [
    cardTransitionState,
    currentIndex,
    flashList.length,
    setCardTransitionDirection,
    setCardTransitionState,
    setCurrentIndex,
  ])

  const goPrevCard = useCallback(() => {
    runCardTransition(currentIndex - 1, 'prev')
  }, [currentIndex, runCardTransition])

  const goNextCard = useCallback(() => {
    runCardTransition(currentIndex + 1, 'next')
  }, [currentIndex, runCardTransition])

  const applyReviewToLocalItem = (
    vocabId: string,
    review: {
      due: Date
      state: number
      stability: number
      difficulty: number
      elapsed_days: number
      scheduled_days: number
      reps: number
      lapses: number
      learning_steps: number
      last_review: Date | null
    },
  ) => {
    setLocalData(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(group => {
        next[group] = next[group].map(item =>
          item.id === vocabId
            ? {
                ...item,
                review: {
                  id: item.review?.id || `local-${vocabId}`,
                  ...review,
                },
              }
            : item,
        )
      })
      return next
    })
  }

  const handleRateCurrentVocabulary = async (rating: Rating) => {
    if (!currentFlashVocab || isSubmittingRating) return
    setIsSubmittingRating(true)
    const result = await rateVocabularyMemory(currentFlashVocab.id, rating)
    if (!result.success || !result.review) {
      setIsSubmittingRating(false)
      await dialog.alert(result.message || '评分失败')
      return
    }
    applyReviewToLocalItem(currentFlashVocab.id, result.review)
    if (currentIndex < flashList.length - 1) {
      runCardTransition(currentIndex + 1, 'next')
    } else {
      setCurrentIndex(0)
      dialog.toast('本轮背诵完成，已按记忆算法更新复习时间', {
        tone: 'success',
      })
    }
    setPendingMemoryRating(null)
    setMemoryReveal(false)
    setTimeout(() => setIsSubmittingRating(false), 180)
  }

  const handleMemoryRateTap = async (rating: Rating) => {
    if (!memoryMode) {
      await handleRateCurrentVocabulary(rating)
      return
    }
    if (!memoryReveal) {
      setPendingMemoryRating(rating)
      setMemoryReveal(true)
      return
    }
    const first = pendingMemoryRating ?? rating
    const finalRating = resolveInconsistentMemoryRating(first, rating)
    if (first !== rating) {
      const mismatch =
        first < rating
          ? '二次评分更高，系统按稳健策略仅上调一级'
          : '二次评分更低，系统按修正后低分计入'
      dialog.toast(`两次评分不一致：${mismatch}`, { tone: 'error' })
    }
    await handleRateCurrentVocabulary(finalRating)
  }

  useEffect(() => {
    setPendingMemoryRating(null)
    setMemoryReveal(false)
  }, [
    currentFlashVocab?.id,
    memoryMode,
    setMemoryReveal,
    setPendingMemoryRating,
  ])

  useEffect(() => {
    if (!memoryMode) return
    setMemoryNowMs(Date.now())
  }, [memoryMode, currentFlashVocab?.id, localData, setMemoryNowMs])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }
      if (viewMode === 'flashcard' && flashList.length > 0) {
        if (e.key === 'ArrowLeft') goPrevCard()
        if (e.key === 'ArrowRight') goNextCard()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goNextCard, goPrevCard, viewMode, flashList.length])

  if (allExistingGroups.length === 0)
    return <div className='text-center py-20 text-gray-500'>生词本空空如也</div>

  const canStartSwipeFromTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    const block = target.closest(
      'button,input,textarea,select,a,[role="button"],[data-no-swipe="true"]',
    )
    return !block
  }

  const handleFlashCardPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (isEditMode || flashList.length <= 1) return
    if (event.pointerType === 'mouse') return
    if (cardTransitionState !== 'idle') return
    if (!canStartSwipeFromTarget(event.target)) return
    swipeStateRef.current = {
      active: true,
      dragging: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
    }
  }

  const handleFlashCardPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const state = swipeStateRef.current
    if (!state.active || state.pointerId !== event.pointerId) return
    const deltaX = event.clientX - state.startX
    const deltaY = event.clientY - state.startY

    if (!state.dragging) {
      const horizontalDistance = Math.abs(deltaX)
      const verticalDistance = Math.abs(deltaY)
      if (verticalDistance > 10 && verticalDistance >= horizontalDistance) {
        swipeStateRef.current = {
          active: false,
          dragging: false,
          pointerId: null,
          startX: 0,
          startY: 0,
          deltaX: 0,
        }
        return
      }
      if (
        horizontalDistance < 14 ||
        horizontalDistance <= verticalDistance * 1.25
      ) {
        return
      }
      state.dragging = true
      event.currentTarget.setPointerCapture(event.pointerId)
      window.getSelection()?.removeAllRanges()
    }

    event.preventDefault()
    state.deltaX = deltaX
    setDragOffsetX(Math.max(-88, Math.min(88, deltaX)))
  }

  const handleFlashCardPointerEnd = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const state = swipeStateRef.current
    if (!state.active || state.pointerId !== event.pointerId) return
    const threshold = 70
    if (state.dragging && state.deltaX > threshold) goPrevCard()
    if (state.dragging && state.deltaX < -threshold) goNextCard()
    swipeStateRef.current = {
      active: false,
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      deltaX: 0,
    }
    setDragOffsetX(0)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // no-op
    }
  }

  const handleFlashCardPointerCancel = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const state = swipeStateRef.current
    if (state.pointerId !== event.pointerId) return
    swipeStateRef.current = {
      active: false,
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      deltaX: 0,
    }
    setDragOffsetX(0)
  }

  const cardTransitionOffset =
    cardTransitionState === 'leaving'
      ? cardTransitionDirection === 'next'
        ? -28
        : 28
      : cardTransitionState === 'entering'
        ? cardTransitionDirection === 'next'
          ? 28
          : -28
        : 0
  const cardTransitionOpacity = cardTransitionState === 'idle' ? 1 : 0.14

  return (
    <div className='theme-page-vocab space-y-3'>
      <div className='pb-2'>
        <div className='flex flex-col gap-3'>
          {viewMode !== 'flashcard' && allExistingGroups.length > 1 ? (
            <div className='flex w-full flex-wrap items-center gap-2 border-b border-slate-100 pb-3'>
              {allExistingGroups.map(name => (
                <button
                  key={name}
                  onClick={() => {
                    const shouldClearGroup = selectedGroupFilter === name
                    setSelectedGroupFilter(shouldClearGroup ? '' : name)
                    setActiveTab(name)
                    pushVocabularyGroup(shouldClearGroup ? null : name)
                    setCurrentIndex(0)
                    setViewMode('list')
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors ${
                    activeTab === name
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}>
                  {LANGUAGE_NAMES[name] || name}
                  <span className='ml-1 opacity-75'>
                    ({currentGroupCountMap[name] || 0})
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className='space-y-3'>
            <div className='mx-auto flex w-full max-w-4xl flex-wrap items-center gap-2 rounded-xl bg-stone-100/80 p-1.5'>
              <div className='flex flex-wrap items-center gap-2'>
                {isEditMode && (
                  <div className='flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2'>
                    <label className='flex items-center gap-2 cursor-pointer'>
                      <input
                        type='checkbox'
                        checked={isSelectAllChecked}
                        onChange={e => {
                          setIsSelectAllChecked(e.target.checked)
                          if (e.target.checked) {
                            const allIds = new Set(
                              visibleList.map(item => item.id),
                            )
                            setSelectedVocabIds(allIds)
                          } else {
                            setSelectedVocabIds(new Set())
                          }
                        }}
                        className='h-4 w-4 cursor-pointer rounded border-gray-300 accent-slate-900'
                      />
                      <span className='text-xs font-medium text-slate-700'>
                        全选
                      </span>
                    </label>
                    {selectedVocabIds.size > 0 && (
                      <>
                        <span className='h-4 border-l border-slate-200' />
                        <span className='text-xs font-medium text-slate-700'>
                          已选 {selectedVocabIds.size}/{visibleList.length} 个
                        </span>
                        <ControlDropdown
                          ariaLabel='批量加入单词书'
                          value={bulkWordbookId}
                          onChange={setBulkWordbookId}
                          className='w-full sm:w-56'
                          options={[
                            { value: 'none', label: '选择目标单词书' },
                            ...flatFolders.map(folder => ({
                              value: folder.id,
                              label: folder.pathLabel,
                            })),
                          ]}
                        />
                        <button
                          type='button'
                          onClick={() => void handleBulkAddToWordbook()}
                          disabled={
                            isBulkAddingToWordbook || bulkWordbookId === 'none'
                          }
                          className='rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50'>
                          {isBulkAddingToWordbook ? '加入中...' : '加入单词书'}
                        </button>
                        <button
                          type='button'
                          onClick={() => setBulkTagPanelOpen(prev => !prev)}
                          className={`rounded-md px-2.5 py-1 text-xs font-bold transition-all ${
                            bulkTagPanelOpen
                              ? 'bg-slate-900 text-white shadow-md'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}>
                          {bulkTagPanelOpen ? '收起标签面板' : '批量添加标签'}
                        </button>
                        <button
                          type='button'
                          onClick={() => {
                            setSelectedVocabIds(new Set())
                            setIsSelectAllChecked(false)
                          }}
                          className='rounded-md px-2 py-1 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100'>
                          清空选择
                        </button>
                      </>
                    )}
                  </div>
                )}
                {!(viewMode === 'flashcard' && memoryMode) && (
                  <ToggleSwitch
                    label='注音'
                    checked={showPronunciation}
                    onChange={setShowPronunciation}
                  />
                )}
                {viewMode === 'flashcard' ? (
                  <>
                    <span className='hidden h-5 w-px bg-stone-200 sm:block' />
                    <button
                      type='button'
                      onClick={() => {
                        setMemoryMode(prev => !prev)
                        setMemoryNowMs(prev => prev + 1)
                        setCurrentIndex(0)
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        memoryMode
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'text-slate-500 hover:bg-white/70 hover:text-slate-900'
                      }`}>
                      记忆
                    </button>
                    <button
                      type='button'
                      onClick={() => {
                        setRandomOrder(prev => !prev)
                        bumpShuffleSeed()
                        setCurrentIndex(0)
                      }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                        randomOrder
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'text-slate-500 hover:bg-white/70 hover:text-slate-900'
                      }`}>
                      随机
                    </button>
                  </>
                ) : null}
              </div>
              <div className='ml-auto flex items-center gap-1'>
                <div className='flex items-center gap-1 rounded-lg bg-white/70 p-1'>
                  <button
                    type='button'
                    onClick={() => setViewMode('list')}
                    className={`rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${
                      viewMode === 'list'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}>
                    列表
                  </button>
                  <button
                    type='button'
                    onClick={() => {
                      setViewMode('flashcard')
                      setCurrentIndex(0)
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${
                      viewMode === 'flashcard'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}>
                    闪卡
                  </button>
                </div>
                <button
                  type='button'
                  onClick={() => setIsEditMode(prev => !prev)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    isEditMode
                      ? 'bg-white text-rose-700 shadow-sm'
                      : 'text-slate-500 hover:bg-white/70 hover:text-slate-900'
                  }`}>
                  {isEditMode ? '退出编辑' : '管理'}
                </button>
              </div>
            </div>

            {isEditMode && bulkTagPanelOpen && (
              <div className='rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm'>
                <div className='flex flex-col gap-3'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700'>
                      已选 {selectedVocabIds.size} 个单词
                    </span>
                    <span className='text-xs text-slate-500'>
                      支持换行、逗号、分号分隔
                    </span>
                  </div>

                  <textarea
                    value={bulkTagsInput}
                    onChange={event =>
                      setBulkTagsInput(event.currentTarget.value)
                    }
                    rows={3}
                    placeholder='例如：N1重点\n抽象表达\n易混'
                    className='w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-inner outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100'
                  />

                  {splitListInput(bulkTagsInput).length > 0 && (
                    <div className='flex flex-wrap gap-1.5'>
                      {splitListInput(bulkTagsInput).map(tag => (
                        <span
                          key={`bulk-draft-tag-${tag}`}
                          className='inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700'>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className='flex flex-wrap items-center justify-end gap-2'>
                    <button
                      type='button'
                      onClick={() => {
                        setBulkTagsInput('')
                        setBulkTagPanelOpen(false)
                      }}
                      className='rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50'>
                      取消
                    </button>
                    <button
                      type='button'
                      onClick={() => void handleBulkEditTagsInline()}
                      className='rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800'>
                      保存批量标签
                    </button>
                  </div>
                </div>
              </div>
            )}

            {viewMode !== 'flashcard' ? (
              <div className='space-y-2'>
                <div className='grid grid-cols-1 gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]'>
                  <ControlDropdown
                    ariaLabel='排序'
                    value={sortMode}
                    onChange={value => setSortMode(value as typeof sortMode)}
                    className='w-full'
                    options={[
                      { value: 'recent', label: '最新收录' },
                      { value: 'word', label: '词汇 A-Z' },
                      { value: 'pos', label: '按词性' },
                    ]}
                  />
                  <ControlDropdown
                    ariaLabel='按词性筛选'
                    value={selectedPosFilter}
                    onChange={setSelectedPosFilter}
                    className='w-full'
                    options={[
                      { value: 'all', label: '全部词性' },
                      ...posFilterOptions.map(pos => ({
                        value: pos,
                        label: pos,
                      })),
                    ]}
                  />
                  <ControlDropdown
                    ariaLabel='单词书筛选'
                    value={selectedFolderFilter}
                    onChange={value => {
                      setSelectedFolderFilter(value)
                      const params = buildVocabularySearchParams({
                        page: '1',
                        wordbook: value,
                      })
                      router.push(`${pathname}?${params.toString()}`)
                    }}
                    className='w-full'
                    options={[
                      { value: 'all', label: '全部单词书' },
                      { value: 'none', label: '未加入单词书' },
                      ...flatFolders.map(folder => ({
                        value: folder.id,
                        label: folder.pathLabel,
                      })),
                    ]}
                  />
                  {(sortMode !== 'recent' ||
                    selectedPosFilter !== 'all' ||
                    selectedFolderFilter !== 'all') ? (
                    <button
                      type='button'
                      onClick={() => {
                        setSortMode('recent')
                        setSelectedPosFilter('all')
                        setSelectedFolderFilter('all')
                        const params = buildVocabularySearchParams({
                          page: '1',
                          wordbook: 'all',
                        })
                        router.push(`${pathname}?${params.toString()}`)
                      }}
                      className='ui-btn ui-btn-sm h-10 px-3 text-xs'>
                      重置
                    </button>
                  ) : null}
                </div>

                <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600'>
                  <span>
                    本页 {visibleList.length} 条 · 第 {currentPage}/{effectiveGroupTotalPages}{' '}
                    页
                  </span>
                  {effectiveGroupTotalPages > 1 ? (
                    <div className='flex items-center gap-2'>
                    <button
                      type='button'
                      onClick={() => {
                        if (currentPage <= 1) return
                        const params = buildVocabularySearchParams({
                          page: String(currentPage - 1),
                        })
                        router.push(`${pathname}?${params.toString()}`)
                      }}
                      disabled={currentPage <= 1}
                      className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
                      上一页
                    </button>
                    <button
                      type='button'
                      onClick={() => {
                        if (currentPage >= effectiveGroupTotalPages) return
                        const params = buildVocabularySearchParams({
                          page: String(currentPage + 1),
                        })
                        router.push(`${pathname}?${params.toString()}`)
                      }}
                      disabled={currentPage >= effectiveGroupTotalPages}
                      className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
                      下一页
                    </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 列表模式：仅显示单词和基础操作 */}
      {viewMode === 'list' && (
        <div className='grid min-h-[40vh] grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 md:grid-cols-2'>
          {visibleList.map((vocab, idx) => {
            const displayPronunciations = vocab.pronunciations || []

            return (
              <div
                key={vocab.id}
                onClick={() => {
                  if (isEditMode) return
                  const nextIndex = flashList.findIndex(
                    item => item.id === vocab.id,
                  )
                  setCurrentIndex(nextIndex >= 0 ? nextIndex : idx)
                  setViewMode('flashcard')
                }}
                className={`px-3 py-2.5 transition-colors hover:bg-slate-50 ${
                  isEditMode ? 'bg-slate-50/20' : 'bg-white'
                }`}>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex min-w-0 items-center gap-3'>
                    {isEditMode && (
                      <input
                        type='checkbox'
                        checked={selectedVocabIds.has(vocab.id)}
                        onClick={event => event.stopPropagation()}
                        onChange={event => {
                          const checked = event.target.checked
                          setSelectedVocabIds(prev => {
                            const next = new Set(prev)
                            if (checked) next.add(vocab.id)
                            else next.delete(vocab.id)
                            return next
                          })
                        }}
                        className='h-4 w-4 shrink-0 rounded border-gray-300 accent-slate-900'
                      />
                    )}
                    <div className='min-w-0'>
                      <WordPronunciation
                        word={vocab.word}
                        pronunciation={getPrimaryPronunciation(vocab)}
                        pronunciations={displayPronunciations}
                        showPronunciation={shouldShowPronunciationForVocab(vocab)}
                        wordClassName='text-[22px] font-black tracking-tight text-slate-900 md:text-[24px]'
                        hintClassName='text-[10px] font-semibold text-slate-500'
                      />
                      {(vocab.meanings || []).length > 0 ? (
                        <p className='mt-0.5 line-clamp-1 text-xs text-slate-500'>
                          {(vocab.meanings || []).slice(0, 2).join('；')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {vocab.wordAudio && (
                    <button
                      type='button'
                      onClick={event => {
                        event.stopPropagation()
                        playAudioFile(vocab.wordAudio)
                      }}
                      aria-label={`播放 ${vocab.word} 的发音`}
                      title='播放发音'
                      className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-stone-100 hover:text-slate-950'>
                      <SpeakerIcon className='h-[18px] w-[18px]' />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {visibleList.length === 0 && (
            <div className='col-span-full bg-white py-12 text-center text-sm font-medium text-slate-500'>
              当前筛选条件下没有词条
            </div>
          )}
        </div>
      )}

      {/* 沉浸模式：详细例句与背诵 */}
      {viewMode === 'flashcard' && currentFlashVocab && (
        <div>
          <div className='relative mx-auto w-full max-w-4xl'>
            <div
              onPointerDown={handleFlashCardPointerDown}
              onPointerMove={handleFlashCardPointerMove}
              onPointerUp={handleFlashCardPointerEnd}
              onPointerCancel={handleFlashCardPointerCancel}
              className='relative flex min-h-[460px] w-full touch-pan-y flex-col px-1 pb-4 pt-12 transition-[transform,opacity] duration-220 ease-out sm:py-4 md:px-3 md:py-6'
              style={{
                transform: `translateX(${dragOffsetX + cardTransitionOffset}px)`,
                opacity: cardTransitionOpacity,
              }}>
            <div className='mb-3 flex items-center justify-end'>
              {isEditMode && (
                <div className='relative flex gap-2.5'>
                  <div className='relative'>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        const current = currentFlashVocab
                        if (!current) return
                        if (activePronEditId === current.id) {
                          setActivePronEditId(null)
                          return
                        }
                        setActiveFolderEditId(null)
                        handleOpenPronEditor(current)
                      }}
                      className={`ui-btn ui-btn-sm px-3 text-xs font-bold transition-colors ${
                        activePronEditId === currentFlashVocab.id
                          ? 'bg-slate-100 text-slate-800'
                          : 'bg-white text-slate-400 hover:text-slate-700'
                      }`}>
                      注音
                    </button>
                    {activePronEditId === currentFlashVocab.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className='absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm text-left'>
                        <div className='px-1 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400'>
                          编辑注音/音标
                        </div>
                        <input
                          autoFocus
                          value={pronInput}
                          onChange={e => setPronInput(e.currentTarget.value)}
                          placeholder='例如：言:い い 訳:わけ / にん げん（或 にん|げん） / ˈlæŋɡwɪdʒ'
                          className='w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100'
                        />
                        <p className='mt-1 px-1 text-[10px] text-slate-400'>
                          多个读音可用空格或 | 分隔。
                        </p>
                        <div className='mt-2 flex justify-end'>
                          <button
                            onClick={() =>
                              handleSavePronunciation(currentFlashVocab)
                            }
                            className='ui-btn ui-btn-sm bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800'>
                            保存
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <InlineConfirmAction
                    message='删除后不可恢复，确认删除吗？'
                    onConfirm={() =>
                      handleDelete(activeTab, currentFlashVocab.id)
                    }
                    triggerLabel='删除'
                    confirmLabel='确认删除'
                    pendingLabel='删除中...'
                    triggerClassName='text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-xl transition-colors'
                  />
                </div>
              )}
            </div>

            <div className='mb-4 pb-4 pt-1 text-center'>
              <WordPronunciation
                word={currentFlashVocab.word}
                pronunciation={getPrimaryPronunciation(currentFlashVocab)}
                pronunciations={currentFlashVocab.pronunciations || []}
                showPronunciation={shouldShowPronunciationForVocab(
                  currentFlashVocab,
                )}
                wordClassName='text-5xl font-semibold tracking-[0.04em] text-slate-950 md:text-6xl'
                hintClassName='mt-2 text-sm font-medium tracking-wide text-slate-500 md:text-base'
              />
              {currentFlashVocab.wordAudio && (
                <div className='mt-3 flex justify-center'>
                  <button
                    type='button'
                    onClick={event => {
                      event.stopPropagation()
                      playAudioFile(currentFlashVocab.wordAudio)
                    }}
                    aria-label={`播放 ${currentFlashVocab.word} 的发音`}
                    title='播放发音'
                    className='inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-slate-600 transition hover:bg-stone-200 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400'>
                    <SpeakerIcon />
                  </button>
                </div>
              )}
              {currentFlashVocab.tags && currentFlashVocab.tags.length > 0 && (
                <div className='mt-3 flex flex-wrap items-center justify-center gap-1.5'>
                  {currentFlashVocab.tags.slice(0, 2).map(tag => (
                    <span
                      key={`${currentFlashVocab.id}-flash-tag-${tag}`}
                      className='ui-tag ui-tag-muted h-6 px-2.5 text-[11px]'>
                      #{tag}
                    </span>
                  ))}
                  {currentFlashVocab.tags.length > 2 && (
                    <span className='ui-tag ui-tag-muted h-6 px-2 text-[11px]'>
                      +{currentFlashVocab.tags.length - 2}
                    </span>
                  )}
                </div>
              )}

              {!isEditMode && renderWordPosLine(currentFlashVocab, true)}

              {isEditMode && (
                <div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
                  <button
                    type='button'
                    onClick={event => {
                      event.stopPropagation()
                      if (activeTagEditorId === currentFlashVocab.id) {
                        closeTagEditor()
                        return
                      }
                      openTagEditor(currentFlashVocab)
                    }}
                    className={`ui-btn ui-btn-sm inline-flex items-center px-3 py-1.5 text-xs font-bold transition-all ${
                      activeTagEditorId === currentFlashVocab.id
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-800'
                    }`}>
                    {activeTagEditorId === currentFlashVocab.id
                      ? '收起标签'
                      : '添加标签'}
                  </button>
                </div>
              )}

              {isEditMode && activeTagEditorId === currentFlashVocab.id && (
                <div
                  onClick={event => event.stopPropagation()}
                  className='mx-auto mt-3 max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-left'>
                  <div className='flex flex-col gap-3'>
                    <div className='flex items-center justify-between gap-2'>
                      <div>
                        <p className='text-sm font-bold text-slate-800'>
                          编辑标签
                        </p>
                        <p className='text-[11px] text-slate-500'>
                          支持换行、逗号、分号分隔
                        </p>
                      </div>
                      {(currentFlashVocab.tags || []).length > 0 && (
                        <span className='ui-tag ui-tag-muted h-6 px-2 text-[10px] font-bold'>
                          当前 {currentFlashVocab.tags?.length || 0} 个
                        </span>
                      )}
                    </div>

                    <textarea
                      value={tagDraft}
                      onChange={event => setTagDraft(event.currentTarget.value)}
                      rows={3}
                      placeholder='例如：高频 / 书面语 / 易错'
                      className='w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100'
                    />

                    {splitListInput(tagDraft).length > 0 && (
                      <div className='flex flex-wrap gap-1.5'>
                        {splitListInput(tagDraft).map(tag => (
                          <span
                            key={`${currentFlashVocab.id}-flash-draft-${tag}`}
                            className='ui-tag ui-tag-info h-6 px-2.5 text-[11px]'>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className='flex justify-end gap-2'>
                      <button
                        type='button'
                        onClick={closeTagEditor}
                        className='ui-btn ui-btn-sm border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50'>
                        取消
                      </button>
                      <button
                        type='button'
                        disabled={isSavingTags}
                        onClick={() =>
                          void handleSaveTagsForVocab(currentFlashVocab)
                        }
                        className='ui-btn ui-btn-sm bg-slate-900 px-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'>
                        {isSavingTags ? '保存中...' : '保存标签'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {shouldShowPronunciationForVocab(currentFlashVocab) &&
                currentFlashVocab.pronunciations &&
                currentFlashVocab.pronunciations.filter(Boolean).length > 1 && (
                  <div className='mt-3 flex flex-wrap items-center justify-center gap-1.5'>
                    {currentFlashVocab.pronunciations.slice(1, 3).map(pron => (
                      <span
                        key={`${currentFlashVocab.id}-flash-pron-${pron}`}
                        className='ui-tag ui-tag-info h-6 px-3 text-xs font-bold'>
                        {pron}
                      </span>
                    ))}
                    {currentFlashVocab.pronunciations.filter(Boolean).length >
                      3 && (
                      <span className='ui-tag ui-tag-muted h-6 px-2.5 text-xs font-bold'>
                        +
                        {currentFlashVocab.pronunciations.filter(Boolean)
                          .length - 3}
                      </span>
                    )}
                  </div>
                )}
              {(() => {
                const family = inflectionByWordId.get(currentFlashVocab.id)
                if (!family) return null
                const expanded = !!expandedInflectionIds[currentFlashVocab.id]
                return (
                  <div className='mt-3 flex flex-col items-center gap-2'>
                    <button
                      type='button'
                      onClick={() =>
                        toggleInflectionExpand(currentFlashVocab.id)
                      }
                      className='ui-tag ui-tag-muted h-6 gap-2 px-3 text-xs font-semibold'>
                      原形 {family.lemma}
                      <span className='text-slate-400'>·</span>
                      覆盖 {family.coveredVariants}/{family.totalVariants}
                      <span className='text-slate-400'>
                        ({family.coverage}%)
                      </span>
                    </button>
                    {expanded && (
                      <div className='w-full rounded-xl border border-slate-200 bg-slate-50/80 p-2.5'>
                        <div className='flex flex-wrap items-center justify-center gap-1.5'>
                          {family.variants.map(variant => (
                            <span
                              key={`${currentFlashVocab.id}-family-${variant.word}`}
                              className='ui-tag ui-tag-muted h-6 gap-1 px-2 text-[11px] font-semibold'>
                              <span>{variant.word}</span>
                              <span className='text-slate-400'>
                                {variant.sentenceHits}/
                                {Math.max(variant.sentenceTotal, 1)}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
              {isEditMode && (
                <div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
                  {(currentFlashVocab?.partsOfSpeech || []).map(pos => (
                    <button
                      key={`${currentFlashVocab.id}-flash-pos-${pos}`}
                      type='button'
                      onClick={() => {
                        if (!isEditMode) return
                        void handleToggleWordPos(currentFlashVocab, pos)
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${posBadgeClass(pos)} ${
                        isEditMode ? 'hover:brightness-95' : ''
                      }`}>
                      {pos}
                    </button>
                  ))}
                  {isEditMode &&
                    getPosOptions(
                      currentFlashVocab.word,
                      currentFlashVocab.sentences[0]?.text || '',
                    )
                      .filter(
                        option =>
                          !(currentFlashVocab.partsOfSpeech || []).includes(
                            option,
                          ),
                      )
                      .slice(0, 6)
                      .map(option => (
                        <button
                          key={`${currentFlashVocab.id}-flash-pos-add-${option}`}
                          type='button'
                          onClick={() =>
                            void handleToggleWordPos(currentFlashVocab, option)
                          }
                          className='rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50'>
                          {option}
                        </button>
                      ))}
                </div>
              )}
            </div>

            {memoryMode && !memoryReveal && (
              <div className='mt-3 pt-4 text-center text-sm font-semibold text-slate-500'>
                先点一次评分查看完整内容，再点一次评分进入下一张。
              </div>
            )}

            <div
              className={
                memoryMode && !memoryReveal
                  ? 'pointer-events-none select-none opacity-0 h-0 overflow-hidden'
                  : ''
              }>
              {(() => {
                const currentVocab = currentFlashVocab
                const hasMeanings =
                  !!currentVocab.meanings && currentVocab.meanings.length > 0
                const unmatchedEntries = currentVocab.sentences
                  .map((sent, idx) => ({ sent, idx }))
                  .filter(
                    ({ sent }) =>
                      typeof sent.meaningIndex !== 'number' ||
                      sent.meaningIndex < 0,
                  )
                return (
                  <div className='min-h-0 flex-1 space-y-6 pt-2'>
                    {hasMeanings && (
                      <div className='min-h-0'>
                        <div className='max-h-[36vh] overflow-auto pr-1'>
                          {currentVocab.meanings!.map((meaning, meaningIdx) => {
                            const matchedSentences = currentVocab.sentences
                              .map((sent, idx) => ({ sent, idx }))
                              .filter(
                                ({ sent }) => sent.meaningIndex === meaningIdx,
                              )
                            return (
                              <div
                                role='button'
                                tabIndex={0}
                                key={`${currentVocab.id}-meaning-drop-${meaning}-${meaningIdx}`}
                                onClick={() => {
                                  if (
                                    !isEditMode ||
                                    pendingSentenceIndex === null
                                  )
                                    return
                                  handleAssignSentenceMeaning(
                                    currentVocab.id,
                                    pendingSentenceIndex,
                                    meaningIdx,
                                  )
                                  setPendingSentenceIndex(null)
                                }}
                                onKeyDown={event => {
                                  if (
                                    event.key !== 'Enter' &&
                                    event.key !== ' '
                                  ) {
                                    return
                                  }
                                  event.preventDefault()
                                  if (
                                    !isEditMode ||
                                    pendingSentenceIndex === null
                                  ) {
                                    return
                                  }
                                  handleAssignSentenceMeaning(
                                    currentVocab.id,
                                    pendingSentenceIndex,
                                    meaningIdx,
                                  )
                                  setPendingSentenceIndex(null)
                                }}
                                onDragOver={event => {
                                  event.preventDefault()
                                  event.dataTransfer.dropEffect = 'move'
                                }}
                                onDrop={event => {
                                  event.preventDefault()
                                  try {
                                    const payload = JSON.parse(
                                      event.dataTransfer.getData(
                                        'application/json',
                                      ),
                                    ) as {
                                      vocabId?: string
                                      sentenceIndex?: number
                                    }
                                    if (
                                      payload.vocabId !== currentVocab.id ||
                                      typeof payload.sentenceIndex !== 'number'
                                    ) {
                                      return
                                    }
                                    handleAssignSentenceMeaning(
                                      payload.vocabId,
                                      payload.sentenceIndex,
                                      meaningIdx,
                                    )
                                    setPendingSentenceIndex(null)
                                  } catch {
                                    return
                                  }
                                }}
                                className={`w-full px-1 py-3 text-left transition-colors ${
                                  pendingSentenceIndex !== null
                                    ? 'bg-slate-50'
                                    : 'hover:bg-slate-50/70'
                                }`}>
                                <div className='flex items-start gap-2.5'>
                                  <span className='pt-px text-sm font-semibold text-slate-400'>
                                    {meaningIdx + 1}.
                                  </span>
                                  <div className='min-w-0'>
                                    <div className='text-base font-semibold text-slate-700'>
                                      {meaning}
                                    </div>
                                    <div className='mt-2 space-y-2'>
                                      {matchedSentences.length === 0 ? (
                                        isEditMode ? (
                                          <div className='rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600'>
                                            {pendingSentenceIndex === null
                                              ? '拖拽句子到这里'
                                              : '点击以匹配已选句子'}
                                          </div>
                                        ) : null
                                      ) : (
                                        matchedSentences.map(
                                          ({ sent, idx }, sentIdx) => (
                                            <div
                                              key={`${currentVocab.id}-meaning-${meaningIdx}-sent-${sentIdx}`}
                                              className='flex items-start gap-2 pt-1 text-xs font-medium leading-relaxed text-gray-800'>
                                              {isEditMode && hasMeanings ? (
                                                <SentenceMoveHandle
                                                  vocabularyId={currentVocab.id}
                                                  sentenceIndex={idx}
                                                  selected={
                                                    pendingSentenceIndex === idx
                                                  }
                                                  onSelect={() =>
                                                    setPendingSentenceIndex(
                                                      prev =>
                                                        prev === idx ? null : idx,
                                                    )
                                                  }
                                                />
                                              ) : null}
                                              <div className='min-w-0 flex-1'>
                                                <div className='cursor-text select-text text-[14px] leading-relaxed text-slate-700'>
                                                {renderSentenceWithPronunciation(
                                                  sent,
                                                  currentVocab,
                                                )}
                                                </div>
                                                {renderSentenceTranslation(sent)}
                                                {isEditMode && (
                                                  <div className='mt-2 flex flex-wrap gap-1.5'>
                                                  {getPosOptions(
                                                    currentVocab.word,
                                                    sent.text,
                                                  ).map(option => {
                                                    const active =
                                                      sentencePosTagsFromItem(
                                                        currentVocab,
                                                        sent,
                                                      ).includes(option)
                                                    return (
                                                      <button
                                                        key={`${currentVocab.id}-meaning-${meaningIdx}-sent-${sentIdx}-pos-option-${option}`}
                                                        type='button'
                                                        onClick={event => {
                                                          event.stopPropagation()
                                                          handleToggleSentencePosTag(
                                                            currentVocab.id,
                                                            idx,
                                                            option,
                                                          )
                                                        }}
                                                        className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                                          active
                                                            ? 'border-slate-200 bg-slate-100 text-slate-800'
                                                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                                        }`}>
                                                        {option}
                                                      </button>
                                                    )
                                                  })}
                                                  </div>
                                                )}
                                                <div className='mt-2'>
                                                  {renderSentenceMetaRow(
                                                    currentVocab,
                                                    sent,
                                                  )}
                                                  {isEditMode && (
                                                    <div className='mt-2 flex flex-wrap items-center gap-2'>
                                                    <button
                                                      type='button'
                                                      onClick={event => {
                                                        event.stopPropagation()
                                                        handleClearSentenceMeaning(
                                                          currentVocab.id,
                                                          idx,
                                                        )
                                                      }}
                                                      className='text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-100'>
                                                      取消匹配
                                                    </button>
                                                    <button
                                                      type='button'
                                                      onClick={event => {
                                                        event.stopPropagation()
                                                        void handleDeleteSentence(
                                                          currentVocab.id,
                                                          idx,
                                                        )
                                                      }}
                                                      className='text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg hover:bg-rose-100'>
                                                      删除例句
                                                    </button>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          ),
                                        )
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {unmatchedEntries.length > 0 && (
                      <div className='min-h-0'>
                        <div className='max-h-[42vh] overflow-auto pr-1'>
                          {unmatchedEntries.map(({ sent: sentObj, idx: i }) => (
                            <div
                              key={`${currentVocab.id}-sentence-${i}`}
                              className={`relative w-full px-1 py-3 text-left transition-colors ${
                                pendingSentenceIndex === i
                                  ? 'bg-slate-100/70'
                                  : 'bg-transparent'
                              }`}>
                              <div className='flex items-start gap-2'>
                                {isEditMode && hasMeanings ? (
                                  <SentenceMoveHandle
                                    vocabularyId={currentVocab.id}
                                    sentenceIndex={i}
                                    selected={pendingSentenceIndex === i}
                                    onSelect={() =>
                                      setPendingSentenceIndex(prev =>
                                        prev === i ? null : i,
                                      )
                                    }
                                  />
                                ) : null}
                                <div className='min-w-0 flex-1'>
                                  {isEditMode &&
                                  hasMeanings &&
                                  pendingSentenceIndex === i ? (
                                    <div className='mb-2 text-[11px] font-medium text-slate-500'>
                                      已选择，请点击目标释义
                                    </div>
                                  ) : null}
                                  <div className='cursor-text select-text text-lg font-medium leading-relaxed text-gray-700'>
                                    {renderSentenceWithPronunciation(
                                      sentObj,
                                      currentVocab,
                                    )}
                                  </div>
                                  {renderSentenceTranslation(sentObj)}
                                  {renderSentenceMetaRow(currentVocab, sentObj)}
                                  {isEditMode && (
                                    <SentenceEditControls
                                      word={currentVocab.word}
                                      sentence={sentObj.text}
                                      activePartsOfSpeech={sentencePosTagsFromItem(
                                        currentVocab,
                                        sentObj,
                                      )}
                                      onTogglePartOfSpeech={option =>
                                        handleToggleSentencePosTag(
                                          currentVocab.id,
                                          i,
                                          option,
                                        )
                                      }
                                      onDelete={() =>
                                        void handleDeleteSentence(
                                          currentVocab.id,
                                          i,
                                        )
                                      }
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              <SentenceSearchPanel
                vocabulary={currentFlashVocab}
                searching={searchingId === currentFlashVocab.id}
                loading={isSearchingMore}
                results={searchResults[currentFlashVocab.id] || []}
                onToggleSearch={() =>
                  handleSearchSentences(
                    currentFlashVocab.id,
                    currentFlashVocab.word,
                  )
                }
                onAdd={sentence =>
                  handleAddSentence(
                    activeTab,
                    currentFlashVocab.id,
                    sentence,
                  )
                }
              />
            </div>

            {memoryMode && (
              <MemoryRatingControls
                pendingRating={pendingMemoryRating}
                isSubmitting={isSubmittingRating}
                onRate={rating => void handleMemoryRateTap(rating)}
              />
            )}
            </div>

            {!memoryMode && (
              <FlashCardNavigation
                currentIndex={currentIndex}
                total={flashList.length}
                transitioning={cardTransitionState !== 'idle'}
                onPrevious={goPrevCard}
                onNext={goNextCard}
              />
            )}
          </div>

          {allExistingGroups.length > 1 ? (
          <div className='mt-6 flex w-full flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500'>
            <div className='flex items-center p-1.5 bg-gray-100/90 backdrop-blur-xl border border-gray-200/50 rounded-2xl shadow-sm overflow-x-auto max-w-full scrollbar-hide'>
              {allExistingGroups.map(name => {
                const isActive =
                  activeTab === name || selectedGroupFilter === name
                return (
                  <button
                    key={name}
                    onClick={() => {
                      const shouldClearGroup = selectedGroupFilter === name
                      setSelectedGroupFilter(shouldClearGroup ? '' : name)
                      setActiveTab(name)
                      pushVocabularyGroup(shouldClearGroup ? null : name)
                      setCurrentIndex(0)
                    }}
                    className={`relative flex items-center justify-center gap-1.5 px-5 py-2.5 min-w-[5rem] rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-black/5'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200/50'
                    }`}>
                    {LANGUAGE_NAMES[name] || name}
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded-md transition-colors ${
                        isActive
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-gray-200/80 text-gray-400'
                      }`}>
                      {currentGroupCountMap[name] || 0}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
