// app/vocabulary/VocabularyTabs.tsx
'use client'

import VocabularyJsonEditor from '@/modules/knowledge/vocabulary/components/VocabularyJsonEditor'
import { buildVocabularySentenceGroups } from '@/modules/knowledge/vocabulary/domain/sentence-groups'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useDialog } from '@/context/DialogContext'
import WordPronunciation from '@/modules/knowledge/vocabulary/components/WordPronunciation'
import ToggleSwitch from '@/components/ToggleSwitch'
import {
  useShowPronunciation,
} from '@/modules/language/hooks/usePronunciationPrefs'
import { hasJapanese } from '@/modules/language/domain/text'
import { inferContextualPos } from '@/utils/language/posTagger'
import { formatVocabularySentenceSource } from '@/utils/vocabulary/sourceDisplay'
import { Rating } from 'ts-fsrs'

import VocabularyFilterSelect from '@/modules/knowledge/vocabulary/components/VocabularyFilterSelect'
import WordbookFilterSelect from '@/modules/knowledge/vocabulary/components/WordbookFilterSelect'
import VocabularyPageToolbar from '@/modules/knowledge/vocabulary/components/VocabularyPageToolbar'
import ControlDropdown from '@/modules/knowledge/vocabulary/components/ControlDropdown'
import VocabularySentenceText from '@/modules/knowledge/vocabulary/components/VocabularySentenceText'
import {
  FlashCardNavigation,
  MemoryRatingControls,
} from '@/modules/knowledge/vocabulary/components/MemoryCardControls'
import {
  LANGUAGE_NAMES,
  buildFlashVocabularyList,
  buildInflectionFamilyMap,
  filterAndSortVocabulary,
  firstSentencePosTag,
  getPrimaryPronunciation,
  getVocabularyMatchVariants,
  getVocabularyDisplayPronunciations,
  getVocabularyPosOptions,
  normalizeLanguageCode,
  resolveInconsistentMemoryRating,
  splitListInput,
  supportsPronunciationByLanguage,
} from '@/modules/knowledge/vocabulary/domain/workbench'
import { listWordbooks } from '@/modules/knowledge/vocabulary/domain/wordbook-list'
import type {
  FolderItem,
  SentenceItem,
  VocabularyRelationItem,
  VocabularyWordbookMembership,
  VocabItem,
} from '@/modules/knowledge/vocabulary/types'
import {
  hydrateVocabularyPayload,
  type SerializedVocabulary,
} from '@/modules/knowledge/vocabulary/domain/payload'
import { useVocabularyWorkspaceState } from '@/modules/knowledge/vocabulary/hooks/useVocabularyWorkspaceState'
import {
  addVocabularySentence,
  searchSentencesForWord,
  updateVocabularyTags,
} from '@/modules/knowledge/vocabulary/actions'
import { addVocabulariesToWordbook } from '@/modules/knowledge/wordbooks/actions'
import { rateVocabularyMemory } from '@/modules/review/actions/memory'
import { detectJapaneseInflection } from '@/utils/vocabulary/japaneseInflection'
import { prefersAuthoredVocabularyPronunciation } from '@/utils/vocabulary/sourcePriority'
import PronunciationSourceSelector from '@/components/ui/PronunciationSourceSelector'
import { useVocabularyPronunciation } from '@/modules/knowledge/vocabulary/hooks/useVocabularyPronunciation'
import {
  PRONUNCIATION_VERSION,
  type VocabularyPronunciationData,
} from '@/modules/knowledge/vocabulary/domain/pronunciation'
import WordbookMembershipLinks from '@/modules/knowledge/vocabulary/components/WordbookMembershipLinks'
import {
  InlineItemActions,
  InlineEditableSelect,
  InlineEditableText,
  moveInlineItem,
  reorderInlineItems,
  VocabularyInlineEditToolbar,
  VocabularyDefinitions,
  VocabularyRelationDetails,
  VocabularySenseDetails,
  makeVocabularyClientId,
  useVocabularyInlineEditor,
} from '@/modules/knowledge/vocabulary/components/VocabularyEntryEditor'
import {
  TRANSITIVITY_OPTIONS,
  VOCABULARY_POS_OPTIONS,
} from '@/modules/knowledge/vocabulary/domain/entry'
import { buildVocabularyViewHref } from '@/modules/knowledge/vocabulary/domain/navigation'

const SentenceSearchPanel = dynamic(
  () => import('@/modules/knowledge/vocabulary/components/SentenceSearchPanel'),
)

const NadeshikoSearchPanel = dynamic(
  () =>
    import('@/modules/knowledge/vocabulary/nadeshiko/components/NadeshikoSearchPanel'),
)

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

function VocabularyReadingAudioButtons({
  audios,
  onPlay,
  compact = false,
}: {
  audios?: Array<{ reading: string; audioFile: string }>
  onPlay: (audioFile: string) => void
  compact?: boolean
}) {
  if (!audios?.length) return null
  const showReading = audios.length > 1

  return (
    <div
      className={compact ? 'flex max-w-44 flex-wrap justify-end gap-1' : 'flex flex-wrap justify-center gap-2'}
      aria-label={showReading ? '分别播放读音' : '播放发音'}
    >
      {audios.map(audio => (
        <button
          key={`${audio.reading}-${audio.audioFile}`}
          type='button'
          className={`inline-flex shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-stone-100 hover:text-slate-950 active:bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:active:bg-slate-700 ${
            compact ? 'h-8' : 'h-10'
          } ${showReading ? 'gap-1.5 px-3 text-sm font-medium font-word-ja' : compact ? 'w-8' : 'w-10'}`}
          aria-label={`播放读音 ${audio.reading}`}
          title={`播放读音 ${audio.reading}`}
          onClick={event => {
            event.stopPropagation()
            onPlay(audio.audioFile)
          }}
        >
          <SpeakerIcon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
          {showReading ? <span lang='ja'>{audio.reading}</span> : null}
        </button>
      ))}
    </div>
  )
}

function VocabularyRelationsSection({
  vocabulary,
  showPronunciation,
  className = '',
  editing = false,
  onChange,
  onAdd,
}: {
  vocabulary: VocabItem
  showPronunciation: boolean
  className?: string
  editing?: boolean
  onChange?: (relations: VocabularyRelationItem[]) => void
  onAdd?: (type: VocabularyRelationItem['type']) => void
}) {
  const seen = new Set<string>()
  const relations = (vocabulary.senses || []).flatMap(sense => sense.relations).filter(relation => {
    if (seen.has(relation.id)) return false
    seen.add(relation.id)
    return true
  })

  if (relations.length === 0 && !editing) return null

  return (
    <section
      aria-label='関連語彙'
      className={`vocab-flat-section ${className} border-t border-slate-200 pt-5`}>
      <h4 className='mb-3 text-[11px] font-semibold tracking-[0.08em] text-slate-400'>
        関連語彙
      </h4>
      <VocabularyRelationDetails
        relations={relations}
        sourceWord={vocabulary.word}
        showPronunciation={showPronunciation}
        editing={editing}
        onChange={onChange}
        onAdd={onAdd}
      />
    </section>
  )
}

export default function VocabularyTabs({
  canEdit,
  groupedData,
  groupedTotals,
  folders,
  initialFolderFilter = 'all',
  initialGroupFilter,
  initialPosFilter = 'all',
  initialTagFilter = 'all',
  initialQuery,
  availablePosFilters,
  availableTagFilters,
  initialFocusId,
  initialFocusGroup,
  initialViewMode = 'list',
  totalCount,
  currentPage,
  pageSize = 30,
}: {
  canEdit: boolean
  groupedData: Record<string, SerializedVocabulary[]>
  groupedTotals: Record<string, number>
  folders: FolderItem[]
  initialFolderFilter?: string
  initialGroupFilter?: string
  initialPosFilter?: string
  initialTagFilter?: string
  initialQuery?: string
  availablePosFilters: string[]
  availableTagFilters: Array<{ name: string; count: number }>
  initialFocusId?: string
  initialFocusGroup?: string
  initialViewMode?: 'list' | 'card'
  totalCount: number
  currentPage: number
  pageSize?: number
}) {
  const dialog = useDialog()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeFocusParam = searchParams.get('focus')?.trim() || ''
  const hydratedGroupedData = useMemo(
    () => hydrateVocabularyPayload(groupedData, folders),
    [folders, groupedData],
  )
  const workspace = useVocabularyWorkspaceState({
    groupedData: hydratedGroupedData,
    folders,
    initialFolderFilter,
    initialGroupFilter,
    initialPosFilter,
    initialTagFilter,
    initialViewMode,
    initialFocusId,
  })
  const {
    activeTab,
    setActiveTab,
    localData,
    setLocalData,
    viewMode,
    setViewMode,
    currentIndex,
    setCurrentIndex,
    memoryMode,
    setMemoryMode,
    randomOrder,
    setRandomOrder,
    shuffleSeed,
    setShuffleSeed,
    memoryNowMs,
    setMemoryNowMs,
    isSubmittingRating,
    setIsSubmittingRating,
    memoryReveal,
    setMemoryReveal,
    pendingMemoryRating,
    setPendingMemoryRating,
    isEditMode,
    setIsEditMode,
    selectedVocabIds,
    setSelectedVocabIds,
    bulkTagsInput,
    setBulkTagsInput,
    bulkTagPanelOpen,
    setBulkTagPanelOpen,
    isSelectAllChecked,
    setIsSelectAllChecked,
    bulkWordbookId,
    setBulkWordbookId,
    isBulkAddingToWordbook,
    setIsBulkAddingToWordbook,
    sortMode,
    setSortMode,
    selectedPosFilter,
    setSelectedPosFilter,
    selectedTagFilter,
    setSelectedTagFilter,
    selectedFolderFilter,
    setSelectedFolderFilter,
    selectedGroupFilter,
    setSelectedGroupFilter,
    folderList,
    setFolderList,
    expandedInflectionIds,
    setExpandedInflectionIds,
    dragOffsetX,
    setDragOffsetX,
    cardTransitionState,
    setCardTransitionState,
    cardTransitionDirection,
    setCardTransitionDirection,
    searchingId,
    setSearchingId,
    isSearchingMore,
    setIsSearchingMore,
    searchResults,
    setSearchResults,
  } = workspace
  const shuffleSeedRef = useRef(1)
  const [queryInput, setQueryInput] = useState(initialQuery || '')
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const appliedFocusIdRef = useRef<string | null>(null)
  const appliedEditFocusRef = useRef<string | null>(null)
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
  const audioRequestIdRef = useRef(0)
  const previousActiveTabRef = useRef(activeTab)
  const isDataMountedRef = useRef(false)
  const previousGroupedDataRef = useRef(groupedData)
  const previousPageRef = useRef(currentPage)
  const previousFoldersRef = useRef(folders)
  const previousFolderFilterRef = useRef(initialFolderFilter)
  const previousGroupFilterRef = useRef(initialGroupFilter)
  const previousPosFilterRef = useRef(initialPosFilter)
  const previousTagFilterRef = useRef(initialTagFilter)
  const pendingCardPageRef = useRef<{
    page: number
    targetIndex: number
  } | null>(null)
  const [isCardPagePending, startCardPageTransition] = useTransition()

  const flatFolders = useMemo(() => listWordbooks(folderList), [folderList])
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

  const effectiveGroupFilter =
    selectedGroupFilter || initialGroupFilter || activeTab
  const effectiveGroupTotal = effectiveGroupFilter
    ? groupedTotals[effectiveGroupFilter] || 0
    : totalCount
  const effectiveGroupTotalPages = useMemo(() => {
    const groupCount = effectiveGroupFilter
      ? groupedTotals[effectiveGroupFilter] || 0
      : totalCount
    return Math.max(1, Math.ceil(groupCount / pageSize))
  }, [effectiveGroupFilter, groupedTotals, pageSize, totalCount])

  const buildVocabularySearchParams = useCallback(
    (overrides: {
      page?: string
      wordbook?: string
      group?: string | null
      pos?: string
      tag?: string
      query?: string | null
    }) => {
      const params = new URLSearchParams()
      params.set('page', overrides.page || '1')
      params.set('wordbook', overrides.wordbook || selectedFolderFilter)
      const nextGroup =
        overrides.group === undefined ? effectiveGroupFilter : overrides.group
      if (nextGroup) params.set('group', nextGroup)
      const nextPos =
        overrides.pos === undefined ? selectedPosFilter : overrides.pos
      if (nextPos && nextPos !== 'all') params.set('pos', nextPos)
      const nextTag =
        overrides.tag === undefined ? selectedTagFilter : overrides.tag
      if (nextTag && nextTag !== 'all') params.set('tag', nextTag)
      const currentQuery =
        new URL(window.location.href).searchParams.get('q') || ''
      const nextQuery =
        overrides.query === undefined ? currentQuery : overrides.query
      if (nextQuery) params.set('q', nextQuery)
      return params
    },
    [
      effectiveGroupFilter,
      selectedFolderFilter,
      selectedPosFilter,
      selectedTagFilter,
    ],
  )
  // Scoped word search: debounce typing into a server-side ?q= navigation
  // (the list is server-paginated, so filtering must happen in Prisma).
  // Skips while the input already matches the URL (e.g. right after the
  // navigation below commits) to avoid push loops.
  useEffect(() => {
    const committed = new URL(window.location.href).searchParams.get('q') || ''
    if (queryInput.trim() === committed) return
    const timer = window.setTimeout(() => {
      const params = buildVocabularySearchParams({
        page: '1',
        query: queryInput.trim() || null,
      })
      router.push(`${pathname}?${params.toString()}`)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [queryInput, buildVocabularySearchParams, pathname, router])

  const setVocabularyViewMode = (nextMode: 'list' | 'flashcard') => {
    const href = buildVocabularyViewHref(
      window.location.href,
      nextMode === 'flashcard' ? 'card' : 'list',
    )
    router.push(href)
  }

  const openVocabularyCard = (vocabularyId: string) => {
    const href = buildVocabularyViewHref(
      window.location.href,
      'card',
      vocabularyId,
    )
    router.push(href)
  }

  useEffect(() => {
    setViewMode(searchParams.get('view') === 'card' ? 'flashcard' : 'list')
  }, [searchParams, setViewMode])

  const reportAudioPlaybackError = useCallback(
    (error: unknown, userInitiated: boolean) => {
      const errorName =
        error && typeof error === 'object' && 'name' in error
          ? String(error.name)
          : ''

      if (errorName === 'AbortError') return

      if (errorName === 'NotAllowedError') {
        if (userInitiated) {
          dialog.toast('浏览器阻止了播放，请再次点击发音按钮', { tone: 'info' })
        }
        return
      }

      if (errorName === 'NotSupportedError') {
        console.error('当前音频格式或来源不受支持:', error)
        if (userInitiated) {
          dialog.toast('当前音频无法播放，请检查音频文件', { tone: 'error' })
        }
        return
      }

      console.error('音频播放失败，请检查文件路径或浏览器权限:', error)
      if (userInitiated) {
        dialog.toast('音频播放失败，请稍后重试', { tone: 'error' })
      }
    },
    [dialog],
  )

  const startAudioPlayback = useCallback(
    (
      audio: HTMLAudioElement,
      requestId: number,
      start = 0,
      end = 0,
      userInitiated = true,
    ) => {
      if (requestId !== audioRequestIdRef.current) return

      const current = audioRef.current
      if (current && current !== audio) {
        current.ontimeupdate = null
        current.pause()
      }
      if (requestId !== audioRequestIdRef.current) return

      audioRef.current = audio
      audio.preload = 'auto'
      audio.setAttribute('playsinline', '')

      if (start > 0) {
        const setStartTime = () => {
          try {
            audio.currentTime = start
          } catch (error) {
            const errorName =
              error && typeof error === 'object' && 'name' in error
                ? String(error.name)
                : ''
            if (errorName !== 'InvalidStateError') {
              reportAudioPlaybackError(error, false)
            }
          }
        }
        if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
          audio.addEventListener(
            'loadedmetadata',
            () => {
              if (requestId !== audioRequestIdRef.current) return
              setStartTime()
            },
            { once: true },
          )
        } else {
          setStartTime()
        }
      }

      if (end > start) {
        audio.ontimeupdate = () => {
          if (audio.currentTime < end) return
          audio.ontimeupdate = null
          audio.pause()
        }
      } else {
        audio.ontimeupdate = null
      }

      try {
        // Keep play() in the original click call stack. Deferring it through a
        // promise queue or loadedmetadata loses iOS Safari's user activation.
        const playback = audio.play()
        void playback.catch(error =>
          reportAudioPlaybackError(error, userInitiated),
        )
      } catch (error) {
        reportAudioPlaybackError(error, userInitiated)
      }
    },
    [reportAudioPlaybackError],
  )

  const playAudio = (
    audioData: {
      audioFile: string
      start: number
      end: number
    },
    userInitiated = true,
  ) => {
    if (!audioData?.audioFile) return

    try {
      const requestId = ++audioRequestIdRef.current
      const audio = new Audio(audioData.audioFile)
      audio.preload = 'auto'
      audio.setAttribute('playsinline', '')
      const start = Math.max(0, audioData.start || 0)
      const end = Math.max(start, audioData.end || 0)
      startAudioPlayback(audio, requestId, start, end, userInitiated)
    } catch (e) {
      reportAudioPlaybackError(e, userInitiated)
    }
  }

  const playAudioFile = useCallback(
    (audioFile?: string | null, userInitiated = true) => {
      if (!audioFile) return

      try {
        const requestId = ++audioRequestIdRef.current
        const audio = new Audio(audioFile)
        audio.preload = 'auto'
        audio.setAttribute('playsinline', '')
        startAudioPlayback(audio, requestId, 0, 0, userInitiated)
      } catch (error) {
        reportAudioPlaybackError(error, userInitiated)
      }
    },
    [reportAudioPlaybackError, startAudioPlayback],
  )

  const handleSearchSentences = async (
    id: string,
    word: string,
    partsOfSpeech: string[],
    matchVariants: string[],
  ) => {
    if (searchResults[id]) {
      setSearchingId(searchingId === id ? null : id)
      return
    }
    setIsSearchingMore(true)
    setSearchingId(id)
    const res = await searchSentencesForWord(word, partsOfSpeech, matchVariants)
    if (res.success)
      setSearchResults(prev => ({ ...prev, [id]: res.data || [] }))
    if (!res.success) setSearchResults(prev => ({ ...prev, [id]: [] }))
    setIsSearchingMore(false)
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

    const targetFolder = folders.find(f => f.id === bulkWordbookId)
    const newMembership: VocabularyWordbookMembership = {
      id: bulkWordbookId,
      name: targetFolder?.name || '',
      pathLabel: folderPathLabelMap[bulkWordbookId] || (targetFolder ? `${targetFolder.seriesName} / ${targetFolder.name}` : ''),
      jlpt: null,
    }
    setLocalData(
      prev =>
        Object.fromEntries(
          Object.entries(prev).map(([group, items]) => [
            group,
            items.map(item =>
              selectedVocabIds.has(item.id)
                ? {
                    ...item,
                    wordbooks: [
                      ...(item.wordbooks || []).filter(w => w.id !== bulkWordbookId),
                      newMembership,
                    ],
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
    senseId: string,
  ) => {
    setLocalData(prev => ({
      ...prev,
      [lang]: prev[lang].map((item: VocabItem) =>
        item.id === id
          ? {
              ...item,
              sentences: [
                ...item.sentences,
                { ...newSentenceObj, senseId },
              ],
            }
          : item,
      ),
    }))
    setSearchingId(null)
    await addVocabularySentence(id, newSentenceObj, senseId)
  }

  const currentList = useMemo<VocabItem[]>(
    () => localData[activeTab] || [],
    [activeTab, localData],
  )
  const inflectionByWordId = useMemo(() => {
    return buildInflectionFamilyMap(localData)
  }, [localData])
  const activeTabLanguageCode = normalizeLanguageCode(activeTab)
  const isJapaneseVocabularyGroup =
    activeTabLanguageCode === 'ja' || /日语|日本語/.test(activeTab)
  const posFilterOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...availablePosFilters,
          ...getVocabularyPosOptions(currentList),
        ]),
      ).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
    [availablePosFilters, currentList],
  )
  const visibleList = useMemo(() => {
    return filterAndSortVocabulary(
      currentList,
      selectedPosFilter,
      sortMode,
    )
  }, [currentList, selectedPosFilter, sortMode])
  const handleBatchResolved = useCallback(
    (data: {
      vocabularies: Record<string, VocabularyPronunciationData>
      sentences: Record<string, VocabularyPronunciationData>
    }) => {
      const vocabEntries = Object.entries(data.vocabularies || {})
      const sentEntries = Object.entries(data.sentences || {})
      if (vocabEntries.length === 0 && sentEntries.length === 0) return

      const vocabMap = new Map(vocabEntries)
      const sentMap = new Map(sentEntries)

      setLocalData(prev => {
        const updated: Record<string, VocabItem[]> = {}
        for (const [key, list] of Object.entries(prev)) {
          updated[key] = list.map(item => {
            let nextItem = item
            if (vocabMap.has(item.id)) {
              nextItem = {
                ...nextItem,
                pronunciationData: vocabMap.get(item.id) || null,
                pronunciationVersion: PRONUNCIATION_VERSION,
              }
            }

            const patchSentence = (sentence: SentenceItem) => {
              if (!sentence.id || !sentMap.has(sentence.id)) return sentence
              return {
                ...sentence,
                pronunciationData: sentMap.get(sentence.id) || null,
                pronunciationVersion: PRONUNCIATION_VERSION,
              }
            }
            const patchSentenceList = (sentences: SentenceItem[]) => {
              const patched = sentences.map(patchSentence)
              return patched.some(
                (sentence, index) => sentence !== sentences[index],
              )
                ? patched
                : sentences
            }

            if (item.sentences) {
              const sentences = patchSentenceList(item.sentences)
              if (sentences !== item.sentences) {
                nextItem = {
                  ...nextItem,
                  sentences,
                }
              }
            }
            if (item.wordbookSources) {
              const wordbookSources = item.wordbookSources.map(source => {
                const sentences = patchSentenceList(source.sentences)
                return sentences === source.sentences
                  ? source
                  : { ...source, sentences }
              })
              if (
                wordbookSources.some(
                  (source, index) => source !== item.wordbookSources?.[index],
                )
              ) {
                nextItem = {
                  ...nextItem,
                  wordbookSources,
                }
              }
            }
            if (item.senses) {
              const senses = item.senses.map(sense => {
                const examples = patchSentenceList(sense.examples)
                return examples === sense.examples
                  ? sense
                  : { ...sense, examples }
              })
              if (
                senses.some((sense, index) => sense !== item.senses?.[index])
              ) {
                nextItem = {
                  ...nextItem,
                  senses,
                }
              }
            }
            if (nextItem !== item) {
              return nextItem
            }
            return nextItem
          })
        }
        return updated
      })
    },
    [setLocalData],
  )
  const {
    hasJapaneseTexts,
    pronunciationSource,
    setPronunciationSource,
    sudachiAvailable,
    sudachiLexicon,
  } = useVocabularyPronunciation(visibleList, isJapaneseVocabularyGroup, {
    onBatchResolved: handleBatchResolved,
  })
  const flashList = useMemo(() => {
    return buildFlashVocabularyList(
      visibleList,
      memoryMode,
      memoryNowMs,
      randomOrder,
      shuffleSeed,
    )
  }, [visibleList, memoryMode, memoryNowMs, randomOrder, shuffleSeed])
  const currentFlashVocabBase = flashList[currentIndex] || null
  const inlineEditor = useVocabularyInlineEditor({
    vocabulary: currentFlashVocabBase,
    enabled: canEdit && isEditMode && viewMode === 'flashcard',
    onSaved: savedVocabulary => {
      setLocalData(previous => ({
        ...previous,
        [activeTab]: previous[activeTab].map(item =>
          item.id === savedVocabulary.id
            ? {
                ...savedVocabulary,
                readingAudios:
                  savedVocabulary.readingAudios ?? item.readingAudios,
              }
            : item,
        ),
      }))
      setIsEditMode(false)
      dialog.toast('词条已保存', { tone: 'success' })
      router.refresh()
    },
  })
  const currentFlashVocab = inlineEditor.previewVocabulary
  const editFocusRequest =
    searchParams.get('edit') === '1' ? activeFocusParam : ''
  useEffect(() => {
    if (!editFocusRequest || !canEdit) {
      appliedEditFocusRef.current = null
      return
    }
    if (
      appliedEditFocusRef.current === editFocusRequest ||
      viewMode !== 'flashcard' ||
      !initialFocusId ||
      currentFlashVocabBase?.id !== initialFocusId
    )
      return
    appliedEditFocusRef.current = editFocusRequest
    setIsEditMode(true)
  }, [
    canEdit,
    editFocusRequest,
    initialFocusId,
    currentFlashVocabBase?.id,
    viewMode,
    setIsEditMode,
  ])

  const allExistingGroups = useMemo(() => {
    return Object.keys(groupedTotals).filter(
      name => (groupedTotals[name] || 0) > 0,
    )
  }, [groupedTotals])
  const currentGroupCountMap = useMemo(() => groupedTotals, [groupedTotals])

  useEffect(() => {
    if (viewMode !== 'flashcard' || !currentFlashVocabBase) return
    const url = new URL(
      buildVocabularyViewHref(
        window.location.href,
        'card',
        currentFlashVocabBase.id,
      ),
      window.location.origin,
    )
    url.searchParams.set('page', String(currentPage))
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    )
  }, [currentFlashVocabBase, currentPage, viewMode])

  useEffect(() => {
    if (viewMode !== 'flashcard') return
    const current = flashList[currentIndex]
    if (!current?.wordAudio) return
    if (lastAutoPlayedWordIdRef.current === current.id) return
    lastAutoPlayedWordIdRef.current = current.id
    playAudioFile(current.wordAudio, false)
  }, [viewMode, currentIndex, flashList, playAudioFile])

  useEffect(() => {
    if (!isEditMode) {
      setBulkTagPanelOpen(false)
    }
  }, [isEditMode, setBulkTagPanelOpen])

  useEffect(() => {
    if (previousActiveTabRef.current === activeTab) return
    previousActiveTabRef.current = activeTab
    setCurrentIndex(0)
  }, [activeTab, setCurrentIndex])

  useEffect(() => {
    if (!isDataMountedRef.current) {
      isDataMountedRef.current = true
      return
    }
    if (
      previousGroupedDataRef.current === groupedData &&
      previousPageRef.current === currentPage
    ) {
      return
    }
    previousGroupedDataRef.current = groupedData
    previousPageRef.current = currentPage

    setLocalData(hydratedGroupedData)
    const pendingCardPage = pendingCardPageRef.current
    if (pendingCardPage?.page === currentPage) {
      setCurrentIndex(pendingCardPage.targetIndex)
      pendingCardPageRef.current = null
    }
    const groups = Object.keys(hydratedGroupedData)
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
    hydratedGroupedData,
    currentPage,
    initialGroupFilter,
    activeTab,
    setActiveTab,
    setCurrentIndex,
    setLocalData,
  ])

  useEffect(() => {
    if (previousFoldersRef.current === folders) return
    previousFoldersRef.current = folders
    setFolderList(folders)
  }, [folders, setFolderList])

  useEffect(() => {
    if (bulkWordbookId === 'none') return
    if (folderList.some(item => item.id === bulkWordbookId)) return
    setBulkWordbookId('none')
  }, [bulkWordbookId, folderList, setBulkWordbookId])

  useEffect(() => {
    if (previousFolderFilterRef.current === initialFolderFilter) return
    previousFolderFilterRef.current = initialFolderFilter
    setSelectedFolderFilter(initialFolderFilter || 'all')
  }, [initialFolderFilter, setSelectedFolderFilter])

  useEffect(() => {
    if (previousGroupFilterRef.current === initialGroupFilter) return
    previousGroupFilterRef.current = initialGroupFilter
    setSelectedGroupFilter(initialGroupFilter || '')
  }, [initialGroupFilter, setSelectedGroupFilter])

  useEffect(() => {
    if (previousPosFilterRef.current === initialPosFilter) return
    previousPosFilterRef.current = initialPosFilter
    setSelectedPosFilter(initialPosFilter || 'all')
  }, [initialPosFilter, setSelectedPosFilter])

  useEffect(() => {
    if (previousTagFilterRef.current === initialTagFilter) return
    previousTagFilterRef.current = initialTagFilter
    setSelectedTagFilter(initialTagFilter || 'all')
  }, [initialTagFilter, setSelectedTagFilter])

  useEffect(() => {
    if (!initialFocusId || !activeFocusParam) {
      appliedFocusIdRef.current = null
      return
    }
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
    if (activeTab !== preferredGroup) {
      setActiveTab(preferredGroup)
      return
    }
    const nextIndex = flashList.findIndex(item => item.id === initialFocusId)
    if (nextIndex >= 0) {
      setCurrentIndex(nextIndex)
      setViewMode(initialViewMode === 'card' ? 'flashcard' : 'list')
      appliedFocusIdRef.current = initialFocusId
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document
            .getElementById(`vocabulary-${initialFocusId}`)
            ?.scrollIntoView({ block: 'center' })
        })
      })
    }
  }, [
    initialFocusId,
    activeFocusParam,
    initialFocusGroup,
    initialViewMode,
    localData,
    activeTab,
    flashList,
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
  }, [visibleList, selectedVocabIds, isSelectAllChecked, setIsSelectAllChecked])

  const pushVocabularyGroup = (languageGroup: string | null) => {
    const params = buildVocabularySearchParams({
      page: '1',
      group: languageGroup,
    })
    if (viewMode === 'flashcard') params.set('view', 'card')
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
      if (audioRef.current) audioRef.current.pause()
    }
  }, [])

  const pronunciationSourceForVocab = (vocab: VocabItem) => {
    // Card/list detail ("默认" mode): Materialized Sudachi data or runtime Sudachi wins whenever ready.
    // The authored-reading preference below only applies as a fallback when
    // Sudachi is unavailable or the user explicitly chose "我的".
    if (
      pronunciationSource === 'sudachi' &&
      (Boolean(vocab.pronunciationData) || sudachiAvailable) &&
      hasJapanese(vocab.word)
    ) {
      return 'sudachi' as const
    }

    const authoredPronunciation = getPrimaryPronunciation(vocab)
    const wordbookPathLabels = (vocab.wordbooks || []).map(
      wordbook => wordbook.pathLabel,
    )

    if (
      authoredPronunciation &&
      prefersAuthoredVocabularyPronunciation(wordbookPathLabels)
    ) {
      return 'personal' as const
    }

    return hasJapanese(vocab.word) ? pronunciationSource : ('personal' as const)
  }

  const shouldShowPronunciationForVocab = (vocab: VocabItem) => {
    const shouldShowPronunciation =
      memoryMode && viewMode === 'flashcard' ? memoryReveal : showPronunciation
    if (!shouldShowPronunciation) return false
    if (
      pronunciationSourceForVocab(vocab) === 'sudachi' &&
      hasJapanese(vocab.word)
    ) {
      return (
        (Boolean(vocab.pronunciationData) || sudachiAvailable) &&
        hasJapanese(vocab.word)
      )
    }
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
        className={`flex flex-wrap items-center gap-1.5 ${
          centered ? 'justify-center' : 'justify-start'
        }`}>
        {posList.map(pos => (
          <span
            key={`${vocab.id}-pos-display-${pos}`}
            className='inline-flex items-center text-[11px] font-medium tracking-wide text-slate-500'>
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
    const resolvedPronunciationSource = pronunciationSourceForVocab(vocab)
    return (
      <VocabularySentenceText
        text={sentence.text}
        word={vocab.word}
        pronunciation={targetPron}
        matchVariants={getVocabularyMatchVariants(vocab)}
        partsOfSpeech={vocab.partsOfSpeech}
        highlightClass='rounded-md bg-stone-100 px-1 text-slate-950'
        pronunciationSource={resolvedPronunciationSource}
        pronunciationData={sentence.pronunciationData}
        sudachiLexicon={sudachiLexicon}
        showPronunciation={
          hasJapanese(vocab.word) &&
          shouldShowPronunciationForVocab(vocab) &&
          (resolvedPronunciationSource === 'sudachi' || Boolean(targetPron))
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
    const savedTags = (sentence.posTags || [])
      .map(tag => tag.trim())
      .filter(Boolean)
    if (savedTags.length > 0) return savedTags
    const inferredTag = firstSentencePosTag(
      sentencePosTags(vocab, sentence.text),
    )
    return inferredTag ? [inferredTag] : []
  }

  const renderSentenceMetaRow = (vocab: VocabItem, sentence: SentenceItem) => {
    const sourceText = formatVocabularySentenceSource(sentence)
    const sourceIsCoveredByWordbookHeading =
      !isEditMode && sentence.sourceUrl?.startsWith('/vocabulary/wordbooks/')
    const hasSource = !!sourceText.trim() && !sourceIsCoveredByWordbookHeading
    const sentencePos = sentencePosTagsFromItem(vocab, sentence).join(' · ')
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
      'inline-flex min-h-5 items-center text-[11px] font-medium leading-5 text-slate-400 dark:text-indigo-200/75'
    const divider = (
      <span className='inline-flex h-5 items-center text-[12px] leading-5 text-slate-300 dark:text-indigo-200/45'>
        ｜
      </span>
    )

    return (
      <div className='vocab-sentence-meta mt-2 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1'>
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

  const updateInlineSentence = (
    senseIndex: number,
    sentenceId: string,
    patch: {
      text?: string
      translation?: string | null
      source?: string
      sourceUrl?: string
    },
  ) => {
    inlineEditor.updateSense(senseIndex, current => ({
      ...current,
      examples: current.examples.map(example =>
        example.id === sentenceId ? { ...example, ...patch } : example,
      ),
    }))
  }

  const addInlineSentence = (senseIndex: number) => {
    inlineEditor.updateSense(senseIndex, current => ({
      ...current,
      examples: [
        ...current.examples,
        {
          id: makeVocabularyClientId('inline-example'),
          text: '',
          translation: '',
          source: '手动录入',
          sourceUrl: '#',
        },
      ],
    }))
  }

  const addInlineSentenceFromSearch = (
    senseIndex: number,
    sentence: SentenceItem,
  ) => {
    inlineEditor.updateSense(senseIndex, current => ({
      ...current,
      examples: [
        ...current.examples,
        {
          id: sentence.id || makeVocabularyClientId('inline-example'),
          text: sentence.text,
          translation: sentence.translation || '',
          source: sentence.source || '手动录入',
          sourceUrl: sentence.sourceUrl || '#',
        },
      ],
    }))
    setSearchingId(null)
  }

  const removeInlineSentence = (senseIndex: number, sentenceId: string) => {
    inlineEditor.updateSense(senseIndex, current => ({
      ...current,
      examples: current.examples.filter(example => example.id !== sentenceId),
    }))
  }

  const moveInlineSentence = (
    senseIndex: number,
    sentenceId: string,
    delta: number,
  ) => {
    inlineEditor.updateSense(senseIndex, current => ({
      ...current,
      examples: moveInlineItem(current.examples, sentenceId, delta),
    }))
  }

  const reorderInlineSentence = (
    senseIndex: number,
    sourceId: string,
    targetId: string,
  ) => {
    inlineEditor.updateSense(senseIndex, current => ({
      ...current,
      examples: reorderInlineItems(current.examples, sourceId, targetId),
    }))
  }

  const runCardTransition = useCallback(
    (targetIndex: number, direction: 'next' | 'prev') => {
      if (targetIndex < 0 || targetIndex >= flashList.length) return
      if (targetIndex === currentIndex) return
      if (cardTransitionState !== 'idle') return

      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
      if (transitionRafRef.current)
        cancelAnimationFrame(transitionRafRef.current)

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
    },
    [
      cardTransitionState,
      currentIndex,
      flashList.length,
      setCardTransitionDirection,
      setCardTransitionState,
      setCurrentIndex,
    ],
  )

  const navigateCardPage = useCallback(
    (nextPage: number, targetIndex: number) => {
      const params = buildVocabularySearchParams({ page: String(nextPage) })
      params.set('view', 'card')
      pendingCardPageRef.current = { page: nextPage, targetIndex }
      startCardPageTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false })
      })
    },
    [buildVocabularySearchParams, pathname, router, startCardPageTransition],
  )

  const goPrevCard = useCallback(() => {
    if (isEditMode) {
      if (!inlineEditor.discard()) return
      setIsEditMode(false)
    }
    if (currentIndex > 0) {
      runCardTransition(currentIndex - 1, 'prev')
      return
    }
    if (currentPage > 1) navigateCardPage(currentPage - 1, pageSize - 1)
  }, [
    currentIndex,
    currentPage,
    inlineEditor,
    isEditMode,
    navigateCardPage,
    pageSize,
    runCardTransition,
    setIsEditMode,
  ])

  const goNextCard = useCallback(() => {
    if (isEditMode) {
      if (!inlineEditor.discard()) return
      setIsEditMode(false)
    }
    if (currentIndex < flashList.length - 1) {
      runCardTransition(currentIndex + 1, 'next')
      return
    }
    if (currentPage < effectiveGroupTotalPages) {
      navigateCardPage(currentPage + 1, 0)
    }
  }, [
    currentIndex,
    currentPage,
    effectiveGroupTotalPages,
    flashList.length,
    inlineEditor,
    isEditMode,
    navigateCardPage,
    runCardTransition,
    setIsEditMode,
  ])

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
    } else if (currentPage < effectiveGroupTotalPages) {
      navigateCardPage(currentPage + 1, 0)
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
    <div className='theme-page-vocab vocab-page-shell space-y-3'>
      <div className='vocab-toolbar-shell border-b border-slate-200'>
        <VocabularyPageToolbar
          canEdit={canEdit}
          languages={allExistingGroups.map(name => ({
            name,
            label: LANGUAGE_NAMES[name] || name,
            count: currentGroupCountMap[name] || 0,
          }))}
          activeLanguage={activeTab}
          viewMode={viewMode}
          editing={isEditMode}
          onLanguageChange={name => {
            if (isEditMode) {
              if (!inlineEditor.discard()) return
              setIsEditMode(false)
            }
            const shouldClearGroup = selectedGroupFilter === name
            setSelectedGroupFilter(shouldClearGroup ? '' : name)
            setActiveTab(name)
            pushVocabularyGroup(shouldClearGroup ? null : name)
            setCurrentIndex(0)
          }}
          onViewChange={nextMode => {
            if (isEditMode) {
              if (!inlineEditor.discard()) return
              setIsEditMode(false)
            }
            setVocabularyViewMode(nextMode)
            if (nextMode === 'flashcard') {
              requestAnimationFrame(() => window.scrollTo({ top: 0 }))
            }
          }}
          onEditingChange={() => {
            if (
              isEditMode &&
              viewMode === 'flashcard' &&
              !inlineEditor.discard()
            )
              return
            setIsEditMode(prev => !prev)
          }}
        />
        {viewMode !== 'flashcard' ? (
          <div className='px-4 py-4'>
            <div className='grid grid-cols-2 items-end gap-3 lg:grid-cols-[minmax(14rem,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.6fr)]'>
              <div className='col-span-2 min-w-0 lg:col-span-1'>
                <span className='mb-1.5 block text-xs font-medium text-slate-500'>
                  搜索词汇
                </span>
                <div className='relative'>
                  <svg
                    aria-hidden='true'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='2'
                    className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400'>
                    <circle cx='11' cy='11' r='6.5' />
                    <path d='m16 16 4 4' />
                  </svg>
                  <input
                    type='text'
                    enterKeyHint='search'
                    value={queryInput}
                    onChange={event => setQueryInput(event.currentTarget.value)}
                    onKeyDown={event => {
                      if (event.key !== 'Enter') return
                      const params = buildVocabularySearchParams({
                        page: '1',
                        query: queryInput.trim() || null,
                      })
                      router.push(`${pathname}?${params.toString()}`)
                    }}
                    placeholder='搜索单词、读音、释义'
                    aria-label='在词库中搜索'
                    className='ui-input h-10 !w-full !rounded-lg !pl-9 !pr-8 !text-base md:!text-sm'
                  />
                  {queryInput ? (
                    <button
                      type='button'
                      aria-label='清除搜索'
                      onClick={() => setQueryInput('')}
                      className='absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700'>
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
              <VocabularyFilterSelect
                label='排序'
                value={sortMode}
                onChange={value => setSortMode(value as typeof sortMode)}
                options={[
                  { value: 'recent', label: '收录顺序' },
                  { value: 'word', label: '词汇 A-Z' },
                  { value: 'pos', label: '按词性' },
                ]}
              />
              <VocabularyFilterSelect
                label='词性'
                value={selectedPosFilter}
                onChange={value => {
                  setSelectedPosFilter(value)
                  const params = buildVocabularySearchParams({
                    page: '1',
                    pos: value,
                  })
                  router.push(`${pathname}?${params.toString()}`)
                }}
                options={[
                  { value: 'all', label: '全部词性' },
                  ...posFilterOptions.map(pos => ({
                    value: pos,
                    label: pos,
                  })),
                ]}
              />
              <VocabularyFilterSelect
                label='标签'
                ariaLabel='按标签筛选'
                value={selectedTagFilter}
                onChange={value => {
                  setSelectedTagFilter(value)
                  const params = buildVocabularySearchParams({
                    page: '1',
                    tag: value,
                  })
                  router.push(`${pathname}?${params.toString()}`)
                }}
                options={[
                  { value: 'all', label: '全部标签' },
                  ...availableTagFilters.map(tag => ({
                    value: tag.name,
                    label: `#${tag.name}`,
                    count: tag.count,
                  })),
                ]}
              />
              <WordbookFilterSelect
                wordbooks={folderList}
                value={selectedFolderFilter}
                onChange={value => {
                  setSelectedFolderFilter(value)
                  const params = buildVocabularySearchParams({
                    page: '1',
                    wordbook: value,
                  })
                  router.push(`${pathname}?${params.toString()}`)
                }}
              />
              {sortMode !== 'recent' ||
              selectedPosFilter !== 'all' ||
              selectedTagFilter !== 'all' ||
              selectedFolderFilter !== 'all' ||
              queryInput.trim() !== '' ? (
                <button
                  type='button'
                  onClick={() => {
                    setSortMode('recent')
                    setSelectedPosFilter('all')
                    setSelectedTagFilter('all')
                    setSelectedFolderFilter('all')
                    setQueryInput('')
                    const params = buildVocabularySearchParams({
                      page: '1',
                      wordbook: 'all',
                      pos: 'all',
                      tag: 'all',
                      query: null,
                    })
                    router.push(`${pathname}?${params.toString()}`)
                  }}
                  className='justify-self-start text-xs font-medium text-slate-500 underline underline-offset-4 hover:text-slate-900'>
                  重置
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className='vocab-utilitybar flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-slate-200 py-2'>
          <div className='vocab-secondary-prefs flex flex-wrap items-center gap-x-4 gap-y-1'>
            {!(viewMode === 'flashcard' && memoryMode) ? (
              <div
                role='group'
                aria-label='显示设置'
                className='vocab-display-prefs flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1'>
                <ToggleSwitch
                  label='注音'
                  checked={showPronunciation}
                  onChange={setShowPronunciation}
                />
                {showPronunciation && hasJapaneseTexts ? (
                  <PronunciationSourceSelector
                    value={pronunciationSource}
                    onChange={setPronunciationSource}
                    sudachiAvailable={
                      sudachiAvailable ||
                      visibleList.some(v => Boolean(v.pronunciationData))
                    }
                  />
                ) : null}
              </div>
            ) : null}
            {viewMode === 'flashcard' ? (
              <div
                role='group'
                aria-label='学习方式'
                className='vocab-study-prefs flex items-center gap-2'>
                <button
                  type='button'
                  onClick={() => {
                    if (isEditMode) {
                      if (!inlineEditor.discard()) return
                      setIsEditMode(false)
                    }
                    setMemoryMode(prev => !prev)
                    setMemoryNowMs(prev => prev + 1)
                    setCurrentIndex(0)
                  }}
                  className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                    memoryMode
                      ? 'text-slate-950 underline decoration-slate-400 underline-offset-4'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}>
                  记忆
                </button>
                <button
                  type='button'
                  onClick={() => {
                    if (isEditMode) {
                      if (!inlineEditor.discard()) return
                      setIsEditMode(false)
                    }
                    setRandomOrder(prev => !prev)
                    bumpShuffleSeed()
                    setCurrentIndex(0)
                  }}
                  className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                    randomOrder
                      ? 'text-slate-950 underline decoration-slate-400 underline-offset-4'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}>
                  随机
                </button>
              </div>
            ) : null}
          </div>
          {viewMode !== 'flashcard' ? (
            <div className='flex flex-wrap items-center gap-2'>
              <span className='ui-meta tabular-nums'>
                共 {effectiveGroupTotal} 条 · {currentPage}/
                {effectiveGroupTotalPages}
              </span>
              {effectiveGroupTotalPages > 1 ? (
                <span className='flex items-center gap-0.5'>
                  <button
                    type='button'
                    aria-label='上一页'
                    onClick={() => {
                      if (currentPage <= 1) return
                      const params = buildVocabularySearchParams({
                        page: String(currentPage - 1),
                      })
                      router.push(`${pathname}?${params.toString()}`)
                    }}
                    disabled={currentPage <= 1}
                    className='inline-flex size-10 items-center justify-center rounded-md text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40'>
                    ‹
                  </button>
                  <button
                    type='button'
                    aria-label='下一页'
                    onClick={() => {
                      if (currentPage >= effectiveGroupTotalPages) return
                      const params = buildVocabularySearchParams({
                        page: String(currentPage + 1),
                      })
                      router.push(`${pathname}?${params.toString()}`)
                    }}
                    disabled={currentPage >= effectiveGroupTotalPages}
                    className='inline-flex size-10 items-center justify-center rounded-md text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40'>
                    ›
                  </button>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {isEditMode && viewMode !== 'flashcard' && (
          <div className='flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3'>
            <label className='flex items-center gap-2 cursor-pointer'>
              <input
                type='checkbox'
                checked={isSelectAllChecked}
                onChange={e => {
                  setIsSelectAllChecked(e.target.checked)
                  if (e.target.checked) {
                    const allIds = new Set(visibleList.map(item => item.id))
                    setSelectedVocabIds(allIds)
                  } else {
                    setSelectedVocabIds(new Set())
                  }
                }}
                className='h-4 w-4 cursor-pointer rounded border-gray-300 accent-slate-900'
              />
              <span className='text-xs font-medium text-slate-700'>全选</span>
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
                      selectedLabel: folder.pathLabel,
                      depth: folder.depth,
                      count: folder.totalCount,
                    })),
                  ]}
                />
                <button
                  type='button'
                  onClick={() => void handleBulkAddToWordbook()}
                  disabled={isBulkAddingToWordbook || bulkWordbookId === 'none'}
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
        {isEditMode && bulkTagPanelOpen && (
          <div className='m-3 rounded-lg border border-slate-200 bg-slate-50 p-4'>
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
                onChange={event => setBulkTagsInput(event.currentTarget.value)}
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
      </div>

      {/* 列表模式：仅显示单词和基础操作 */}
      {viewMode === 'list' && (
        <div className='grid min-h-[40vh] grid-cols-1 border-t border-slate-200'>
          {visibleList.map((vocab, idx) => {
            const displayPronunciations = vocab.pronunciations || []

            return (
              <div
                key={vocab.id}
                id={`vocabulary-${vocab.id}`}
                onClick={() => {
                  if (isEditMode) return
                  const nextIndex = flashList.findIndex(
                    item => item.id === vocab.id,
                  )
                  setCurrentIndex(nextIndex >= 0 ? nextIndex : idx)
                  openVocabularyCard(vocab.id)
                }}
                className={`scroll-mt-24 border-b border-slate-200 px-4 py-2 transition-colors [contain-intrinsic-size:76px] [content-visibility:auto] hover:bg-[#efeee9] ${
                  Boolean(activeFocusParam) && vocab.id === initialFocusId
                    ? 'bg-amber-50 ring-1 ring-inset ring-amber-300'
                    : isEditMode
                      ? 'bg-[#efeee9]'
                      : 'bg-transparent'
                }`}>
                <div className='flex items-center gap-3 sm:gap-4'>
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
                  <div className='grid min-w-0 flex-1 grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[10.5rem_minmax(0,1fr)]'>
                    <div className='min-w-0 truncate'>
                      <WordPronunciation
                        word={vocab.word}
                        etymologies={vocab.etymologies}
                        pronunciation={getPrimaryPronunciation(vocab)}
                        pronunciations={displayPronunciations}
                        pronunciationData={vocab.pronunciationData}
                        showPronunciation={shouldShowPronunciationForVocab(
                          vocab,
                        )}
                        pronunciationSource={pronunciationSourceForVocab(vocab)}
                        sudachiLexicon={sudachiLexicon}
                        wordClassName='text-lg font-bold leading-snug tracking-tight text-slate-900'
                        hintClassName='text-[10px] font-semibold text-slate-500'
                      />
                    </div>
                    {(vocab.meanings || []).length > 0 ? (
                      <p className='truncate text-sm text-slate-600'>
                        {(vocab.meanings || []).slice(0, 2).join('；')}
                      </p>
                    ) : null}
                  </div>
                  {(vocab.wordbooks || []).length > 0 ? (
                    <div className='hidden min-w-0 max-w-60 shrink-0 sm:block md:max-w-80'>
                      <WordbookMembershipLinks
                        wordbooks={vocab.wordbooks!}
                        variant='compact'
                        pathSeparator=' · '
                        className='justify-end'
                      />
                    </div>
                  ) : null}
                  {vocab.readingAudios?.length ? (
                    <VocabularyReadingAudioButtons
                      audios={vocab.readingAudios}
                      onPlay={playAudioFile}
                      compact
                    />
                  ) : vocab.wordAudio ? (
                    <button
                      type='button'
                      onClick={event => {
                        event.stopPropagation()
                        playAudioFile(vocab.wordAudio)
                      }}
                      aria-label={`播放 ${vocab.word} 的发音`}
                      title='播放发音'
                      className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-stone-100 hover:text-slate-950'>
                      <SpeakerIcon className='h-4 w-4' />
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
          {visibleList.length === 0 && (
            <div className='col-span-full border-b border-slate-200 py-12 text-center'>
              <p className='text-sm font-medium text-slate-500'>
                {queryInput.trim()
                  ? `没有找到“${queryInput.trim()}”`
                  : '当前筛选条件下没有词条'}
              </p>
              {queryInput.trim() ? (
                <button
                  type='button'
                  onClick={() => setQueryInput('')}
                  className='ui-btn ui-btn-sm mt-4'>
                  清除搜索
                </button>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* 沉浸模式：详细例句与背诵 */}
      {viewMode === 'flashcard' && currentFlashVocab && (
        <div>
          <div className='vocab-card-shell relative mx-auto w-full max-w-6xl'>
            {isEditMode ? (
              <VocabularyInlineEditToolbar
                dirty={inlineEditor.dirty}
                saving={inlineEditor.saving}
                error={inlineEditor.error}
                onCancel={() => {
                  if (!inlineEditor.discard()) return
                  setIsEditMode(false)
                }}
                onSave={() => void inlineEditor.save()}
              />
            ) : null}
            {!memoryMode && (
              <FlashCardNavigation
                currentIndex={currentIndex}
                total={flashList.length}
                currentPosition={
                  (currentPage - 1) * pageSize + currentIndex + 1
                }
                overallTotal={effectiveGroupTotal}
                canPrevious={currentIndex > 0 || currentPage > 1}
                canNext={
                  currentIndex < flashList.length - 1 ||
                  currentPage < effectiveGroupTotalPages
                }
                transitioning={
                  cardTransitionState !== 'idle' || isCardPagePending
                }
                onPrevious={goPrevCard}
                onNext={goNextCard}
              />
            )}
            <div
              onPointerDown={handleFlashCardPointerDown}
              onPointerMove={handleFlashCardPointerMove}
              onPointerUp={handleFlashCardPointerEnd}
              onPointerCancel={handleFlashCardPointerCancel}
              className={`vocab-card-swipe relative flex min-h-[400px] w-full flex-col px-0 pb-3 pt-0 transition-[transform,opacity] duration-220 ease-out md:min-h-[460px] md:px-3 md:pb-4 md:pt-8 ${
                isEditMode ? '' : 'touch-pan-y'
              }`}
              style={{
                transform: isEditMode
                  ? undefined
                  : `translateX(${dragOffsetX + cardTransitionOffset}px)`,
                opacity: isEditMode ? 1 : cardTransitionOpacity,
              }}>
              {isEditMode ? (
                <VocabularyJsonEditor
                  value={inlineEditor.jsonText}
                  onChange={inlineEditor.setJsonText}
                  disabled={inlineEditor.saving}
                />
              ) : (
                <>
                  <div className='vocab-card-layout'>
                    <aside className='vocab-card-summary' aria-label='单词摘要'>
                      <div className='vocab-card-summary-inner mt-0 mb-1 pb-0 pt-0 text-center md:mb-5 md:pb-2'>
                        <InlineEditableText
                          editing={isEditMode}
                          value={currentFlashVocab.word}
                          display={
                            <WordPronunciation
                              word={currentFlashVocab.word}
                              etymologies={currentFlashVocab.etymologies}
                              pronunciation={getPrimaryPronunciation(
                                currentFlashVocab,
                              )}
                              pronunciations={
                                currentFlashVocab.pronunciations || []
                              }
                              pronunciationData={
                                currentFlashVocab.pronunciationData
                              }
                              showPronunciation={
                                !isEditMode &&
                                shouldShowPronunciationForVocab(
                                  currentFlashVocab,
                                )
                              }
                              pronunciationSource={pronunciationSourceForVocab(
                                currentFlashVocab,
                              )}
                              sudachiLexicon={sudachiLexicon}
                              variantGroupClassName='justify-center'
                              wordClassName='text-3xl font-semibold tracking-[0.02em] text-slate-950 md:text-4xl'
                              hintClassName='mt-1 text-sm font-medium tracking-wide text-slate-500 md:mt-2 md:text-base'
                            />
                          }
                          displayTag='div'
                          ariaLabel='单词'
                          className='mx-auto w-fit'
                          inputClassName='mx-auto max-w-full text-center text-3xl font-semibold tracking-[0.02em] text-slate-950 md:text-4xl'
                          onChange={value =>
                            inlineEditor.setDraft(previous =>
                              previous
                                ? { ...previous, word: value }
                                : previous,
                            )
                          }
                        />
                        <WordbookMembershipLinks
                          wordbooks={currentFlashVocab.wordbooks || []}
                          variant='detail'
                          align='center'
                          className='vocab-card-memberships'
                        />
                        {isEditMode ? (
                          <InlineEditableText
                            editing
                            value={inlineEditor.draft?.pronunciations[0] || ''}
                            display={
                              <span className='text-sm font-medium tracking-wide text-slate-500'>
                                {inlineEditor.draft?.pronunciations[0] || '添加读音'}
                              </span>
                            }
                            placeholder='いぞん'
                            ariaLabel='读音'
                            className='mx-auto mt-1 w-fit text-sm font-medium tracking-wide text-slate-500'
                            inputClassName='mx-auto max-w-36 text-center text-sm text-slate-500'
                            onChange={value =>
                              inlineEditor.setDraft(previous =>
                                previous
                                  ? {
                                      ...previous,
                                      pronunciations: value
                                        ? [value, ...previous.pronunciations.slice(1)]
                                        : previous.pronunciations.slice(1),
                                    }
                                  : previous,
                              )
                            }
                          />
                        ) : null}
                        <div className='vocab-card-meta mt-2 flex flex-wrap items-center justify-center gap-2 md:flex-col md:items-center md:gap-0'>
                          <VocabularyReadingAudioButtons
                            audios={currentFlashVocab.readingAudios}
                            onPlay={playAudioFile}
                          />
                          {!currentFlashVocab.readingAudios?.length && currentFlashVocab.wordAudio && (
                            <button
                              type='button'
                              onClick={event => {
                                event.stopPropagation()
                                playAudioFile(currentFlashVocab.wordAudio)
                              }}
                              aria-label={`播放 ${currentFlashVocab.word} 的发音`}
                              title='播放原始录音'
                              className='order-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-stone-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400'>
                              <SpeakerIcon />
                            </button>
                          )}
                          {(currentFlashVocab.tags?.length || 0) > 0 ||
                          isEditMode ? (
                            <div
                              className='order-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 md:order-2 md:mt-2'
                              aria-label='标签'>
                              <span className='text-[10px] font-semibold tracking-[0.08em] text-slate-400'>
                                标签
                              </span>
                              {isEditMode ? (
                                <InlineEditableText
                                  editing
                                  value={(currentFlashVocab.tags || []).join(
                                    '\n',
                                  )}
                                  display={
                                    <span className='text-xs font-medium text-slate-600'>
                                      {(currentFlashVocab.tags || []).length > 0
                                        ? currentFlashVocab.tags
                                            ?.map(tag => `#${tag}`)
                                            .join('　')
                                        : '+ 添加标签'}
                                    </span>
                                  }
                                  placeholder='高频、书面语、易错'
                                  ariaLabel='学习标签'
                                  className='max-w-full text-xs font-medium text-slate-600'
                                  inputClassName='min-w-48 text-center text-xs'
                                  multiline
                                  onChange={value =>
                                    inlineEditor.setDraft(previous =>
                                      previous
                                        ? {
                                            ...previous,
                                            tags: splitListInput(value),
                                          }
                                        : previous,
                                    )
                                  }
                                />
                              ) : (
                                currentFlashVocab.tags?.map(tag => (
                                  <span
                                    key={`${currentFlashVocab.id}-flash-tag-${tag}`}
                                    className='text-xs font-medium text-slate-600'>
                                    #{tag}
                                  </span>
                                ))
                              )}
                            </div>
                          ) : null}
                          {isEditMode ? (
                            <div className='order-2 flex items-center md:order-3 md:mt-2'>
                              <InlineEditableSelect
                                editing
                                value={
                                  inlineEditor.draft?.grammarPartOfSpeech ||
                                  'other'
                                }
                                display={
                                  VOCABULARY_POS_OPTIONS.find(
                                    option =>
                                      option[0] ===
                                      inlineEditor.draft?.grammarPartOfSpeech,
                                  )?.[1] ||
                                  currentFlashVocab.partsOfSpeech?.[0] ||
                                  '其他'
                                }
                                options={VOCABULARY_POS_OPTIONS.map(
                                  ([value, label]) => ({ value, label }),
                                )}
                                ariaLabel='词性'
                                onChange={value =>
                                  inlineEditor.setDraft(previous =>
                                    previous
                                      ? {
                                          ...previous,
                                          grammarPartOfSpeech:
                                            value as typeof previous.grammarPartOfSpeech,
                                          transitivity:
                                            value === 'verb'
                                              ? previous.transitivity
                                              : null,
                                          conjugationType:
                                            value === 'verb'
                                              ? previous.conjugationType
                                              : '',
                                        }
                                      : previous,
                                  )
                                }
                              />
                            </div>
                          ) : (
                            <div className='order-2 md:order-3 md:mt-2'>
                              {renderWordPosLine(currentFlashVocab, true)}
                            </div>
                          )}
                        </div>
                        {isEditMode &&
                        inlineEditor.draft?.grammarPartOfSpeech === 'verb' ? (
                          <div className='vocab-card-verb-meta mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-400'>
                            <span>更多</span>
                            <InlineEditableSelect
                              editing
                              value={inlineEditor.draft.transitivity || ''}
                              display={
                                TRANSITIVITY_OPTIONS.find(
                                  option =>
                                    option[0] ===
                                    inlineEditor.draft?.transitivity,
                                )?.[1] || '自他动词未设置'
                              }
                              options={[
                                { value: '', label: '未设置' },
                                ...TRANSITIVITY_OPTIONS.map(
                                  ([value, label]) => ({ value, label }),
                                ),
                              ]}
                              ariaLabel='动词属性'
                              onChange={value =>
                                inlineEditor.setDraft(previous =>
                                  previous
                                    ? {
                                        ...previous,
                                        transitivity:
                                          value === ''
                                            ? null
                                            : (value as typeof previous.transitivity),
                                      }
                                    : previous,
                                )
                              }
                            />
                            <InlineEditableText
                              editing
                              value={inlineEditor.draft.conjugationType || ''}
                              display={
                                <span className='text-[11px] text-slate-500'>
                                  {inlineEditor.draft.conjugationType ||
                                    '活用类型'}
                                </span>
                              }
                              placeholder='五段、上一段…'
                              ariaLabel='活用类型'
                              className='w-fit text-[11px] text-slate-500'
                              inputClassName='w-28 text-[11px] text-slate-500'
                              onChange={value =>
                                inlineEditor.setDraft(previous =>
                                  previous
                                    ? { ...previous, conjugationType: value }
                                    : previous,
                                )
                              }
                            />
                          </div>
                        ) : null}
                        {(() => {
                          if (
                            !shouldShowPronunciationForVocab(currentFlashVocab)
                          )
                            return null
                          const primaryPronunciation =
                            getPrimaryPronunciation(currentFlashVocab)
                          const authoredPronunciations =
                            getVocabularyDisplayPronunciations(
                              currentFlashVocab.word,
                              currentFlashVocab.pronunciations || [],
                            )
                          const variants = getVocabularyMatchVariants(
                            currentFlashVocab,
                          )
                            .filter(
                              variant =>
                                !authoredPronunciations.includes(variant) &&
                                variant !== primaryPronunciation &&
                                variant !== currentFlashVocab.word,
                            )
                            .slice(0, 4)
                          if (variants.length === 0) return null
                          return (
                            <div className='vocab-card-variants mt-3 flex flex-wrap items-center justify-center gap-1.5'>
                              <span className='text-[11px] font-semibold text-slate-400'>
                                匹配词形
                              </span>
                              {variants.map(variant => (
                                <span
                                  key={`${currentFlashVocab.id}-flash-variant-${variant}`}
                                  className='ui-tag ui-tag-info h-6 px-3 text-xs font-bold'>
                                  {variant}
                                </span>
                              ))}
                            </div>
                          )
                        })()}
                        {(() => {
                          const family = inflectionByWordId.get(
                            currentFlashVocab.id,
                          )
                          if (!family) return null
                          const expanded =
                            !!expandedInflectionIds[currentFlashVocab.id]
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
                                覆盖 {family.coveredVariants}/
                                {family.totalVariants}
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
                      </div>
                    </aside>

                    <div className='vocab-card-content'>
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
                          const separatedSources =
                            currentVocab.wordbookSources || []
                          const contentSources = separatedSources.filter(
                            source =>
                              source.meanings.length > 0 ||
                              source.sentences.length > 0,
                          )
                          if (
                            separatedSources.length > 1 &&
                            contentSources.length > 0
                          ) {
                            return (
                              <div className='vocab-source-list min-h-0 flex-1 space-y-10'>
                                {contentSources.map(source => {
                                  const canEditSource =
                                    source.recordIds.includes(currentVocab.id)
                                  return (
                                    <section
                                      key={`${currentVocab.id}-source-${source.id}`}
                                      className='vocab-source-block py-2'>
                                      <div>
                                        {source.meanings.length > 0 ? (
                                          <ol className='space-y-3'>
                                            {source.meanings.map(
                                              (meaning, index) => (
                                                <li
                                                  key={`${source.id}-meaning-${meaning}`}
                                                  className='min-w-0'>
                                                  <div>
                                                    <VocabularyDefinitions
                                                      definitions={
                                                        currentVocab.senses?.[
                                                          index
                                                        ]?.definitions || [
                                                          {
                                                            id: `${source.id}-definition-${index}`,
                                                            language: 'zh',
                                                            text: meaning,
                                                          },
                                                        ]
                                                      }
                                                      editing={
                                                        isEditMode &&
                                                        canEditSource
                                                      }
                                                      onChange={definitions =>
                                                        inlineEditor.updateSense(
                                                          index,
                                                          current => ({
                                                            ...current,
                                                            definitions,
                                                          }),
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                </li>
                                              ),
                                            )}
                                          </ol>
                                        ) : null}
                                        {source.sentences.length > 0 ||
                                        (isEditMode && canEditSource) ? (
                                          <section
                                            className='vocab-example-section vocab-source-examples vocab-flat-section mt-7 sm:ml-9'
                                            aria-label='例文'>
                                            <h4 className='vocab-example-heading sr-only'>
                                              例文
                                            </h4>
                                            <div className='vocab-example-list space-y-5'>
                                              {source.sentences.map(
                                                (sentence, index) => (
                                                  <div
                                                    key={`${source.id}-sentence-${index}`}
                                                    className='vocab-example-row group relative leading-relaxed text-slate-700'>
                                                    <InlineEditableText
                                                      editing={
                                                        isEditMode &&
                                                        canEditSource
                                                      }
                                                      value={sentence.text}
                                                      display={renderSentenceWithPronunciation(
                                                        sentence,
                                                        currentVocab,
                                                      )}
                                                      placeholder='例句日文'
                                                      ariaLabel={`例句日文 ${index + 1}`}
                                                      displayTag='div'
                                                      multiline
                                                      className='font-reading-body-ja text-base leading-8'
                                                      onChange={value =>
                                                        updateInlineSentence(
                                                          index,
                                                          sentence.id || '',
                                                          { text: value },
                                                        )
                                                      }
                                                    />
                                                    {(isEditMode &&
                                                      canEditSource) ||
                                                    sentence.translation ? (
                                                      <InlineEditableText
                                                        editing={
                                                          isEditMode &&
                                                          canEditSource
                                                        }
                                                        value={
                                                          sentence.translation ||
                                                          ''
                                                        }
                                                        display={
                                                          sentence.translation ? (
                                                            <p className='mt-1 text-[14px] leading-7 text-slate-500'>
                                                              {
                                                                sentence.translation
                                                              }
                                                            </p>
                                                          ) : undefined
                                                        }
                                                        placeholder='添加中文翻译'
                                                        ariaLabel={`例句中文 ${index + 1}`}
                                                        displayTag='div'
                                                        multiline
                                                        className='mt-1 text-[14px] leading-7 text-slate-500'
                                                        onChange={value =>
                                                          updateInlineSentence(
                                                            index,
                                                            sentence.id || '',
                                                            {
                                                              translation:
                                                                value,
                                                            },
                                                          )
                                                        }
                                                      />
                                                    ) : null}
                                                    <div className='mt-1.5'>
                                                      {renderSentenceMetaRow(
                                                        currentVocab,
                                                        sentence,
                                                      )}
                                                    </div>
                                                    {isEditMode &&
                                                    canEditSource ? (
                                                      <InlineItemActions
                                                        onMoveUp={() =>
                                                          moveInlineSentence(
                                                            index,
                                                            sentence.id || '',
                                                            -1,
                                                          )
                                                        }
                                                        onMoveDown={() =>
                                                          moveInlineSentence(
                                                            index,
                                                            sentence.id || '',
                                                            1,
                                                          )
                                                        }
                                                        onDelete={() =>
                                                          removeInlineSentence(
                                                            index,
                                                            sentence.id || '',
                                                          )
                                                        }
                                                        canMoveUp={index > 0}
                                                        canMoveDown={
                                                          index <
                                                          source.sentences
                                                            .length -
                                                            1
                                                        }
                                                      />
                                                    ) : null}
                                                  </div>
                                                ),
                                              )}
                                              {isEditMode && canEditSource ? (
                                                <button
                                                  type='button'
                                                  onClick={() =>
                                                    addInlineSentence(0)
                                                  }
                                                  className='inline-flex min-h-7 items-center text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-700'>
                                                  + 添加例句
                                                </button>
                                              ) : null}
                                            </div>
                                          </section>
                                        ) : null}
                                        {source.meanings.map((_, index) =>
                                          canEditSource &&
                                          currentVocab.senses?.[index] ? (
                                            <VocabularySenseDetails
                                              key={`${source.id}-sense-details-${index}`}
                                              sense={currentVocab.senses[index]}
                                              sourceWord={currentVocab.word}
                                              showPronunciation={shouldShowPronunciationForVocab(
                                                currentVocab,
                                              )}
                                              showRelations={false}
                                              editing={isEditMode}
                                              onChange={sense =>
                                                inlineEditor.updateSense(
                                                  index,
                                                  current => ({
                                                    ...current,
                                                    patterns: sense.patterns,
                                                    expressions: sense.expressions,
                                                    relations: sense.relations,
                                                    notes: sense.notes,
                                                  }),
                                                )
                                              }
                                            />
                                          ) : null,
                                        )}
                                      </div>
                                    </section>
                                  )
                                })}
                              </div>
                            )
                          }
                          const { groups: sentenceGroups, unmatchedEntries } =
                            buildVocabularySentenceGroups(currentVocab)
                          const hasMeanings = sentenceGroups.length > 0
                          return (
                            <div className='min-h-0 flex-1'>
                              {hasMeanings && (
                                <section className='min-h-0' aria-label='词义'>
                                  <div className='space-y-5'>
                                    {sentenceGroups.map(
                                      (
                                        { meaning, entries: matchedSentences },
                                        meaningIdx,
                                      ) => {
                                        return (
                                          <div
                                            key={`${currentVocab.id}-meaning-drop-${meaning}-${meaningIdx}`}
                                            className='vocab-meaning-block w-full py-5 text-left transition-colors'>
                                            <div className='min-w-0'>
                                              <VocabularyDefinitions
                                                definitions={
                                                  currentVocab.senses?.[
                                                    meaningIdx
                                                  ]?.definitions || []
                                                }
                                                editing={isEditMode}
                                                onChange={definitions =>
                                                  inlineEditor.updateSense(
                                                    meaningIdx,
                                                    current => ({
                                                      ...current,
                                                      definitions,
                                                    }),
                                                  )
                                                }
                                              />
                                              {(matchedSentences.length > 0 ||
                                                isEditMode) && (
                                                <section
                                                  className='vocab-example-section vocab-sense-examples vocab-flat-section mt-6'
                                                  aria-label='例文'>
                                                  <h4 className='vocab-example-heading sr-only'>
                                                    例文
                                                  </h4>
                                                  <div className='vocab-example-list space-y-5'>
                                                    {matchedSentences.length ===
                                                    0 ? (
                                                      <p className='text-xs text-slate-400'>
                                                        暂无例句
                                                      </p>
                                                    ) : (
                                                      matchedSentences.map(
                                                        ({ sent }, sentIdx) => {
                                                          const sentenceId =
                                                            sent.id ||
                                                            `${currentVocab.id}-meaning-${meaningIdx}-sent-${sentIdx}`
                                                          return (
                                                            <div
                                                              key={sentenceId}
                                                              draggable={
                                                                isEditMode
                                                              }
                                                              onDragStart={event => {
                                                                if (!isEditMode)
                                                                  return
                                                                event.dataTransfer.setData(
                                                                  'text/plain',
                                                                  sentenceId,
                                                                )
                                                                event.dataTransfer.effectAllowed =
                                                                  'move'
                                                              }}
                                                              onDragOver={event => {
                                                                if (!isEditMode)
                                                                  return
                                                                event.preventDefault()
                                                                event.dataTransfer.dropEffect =
                                                                  'move'
                                                              }}
                                                              onDrop={event => {
                                                                if (!isEditMode)
                                                                  return
                                                                event.preventDefault()
                                                                const sourceId =
                                                                  event.dataTransfer.getData(
                                                                    'text/plain',
                                                                  )
                                                                if (sourceId) {
                                                                  reorderInlineSentence(
                                                                    meaningIdx,
                                                                    sourceId,
                                                                    sentenceId,
                                                                  )
                                                                }
                                                              }}
                                                              className='vocab-example-row group relative flex items-start text-sm leading-relaxed text-slate-800'>
                                                              <div className='min-w-0 flex-1'>
                                                                <InlineEditableText
                                                                  editing={
                                                                    isEditMode
                                                                  }
                                                                  value={
                                                                    sent.text
                                                                  }
                                                                  display={renderSentenceWithPronunciation(
                                                                    sent,
                                                                    currentVocab,
                                                                  )}
                                                                  placeholder='例句日文'
                                                                  ariaLabel={`例句日文 ${sentIdx + 1}`}
                                                                  displayTag='div'
                                                                  multiline
                                                                  className='font-reading-body-ja cursor-text select-text text-base leading-8 text-slate-800'
                                                                  onChange={value =>
                                                                    updateInlineSentence(
                                                                      meaningIdx,
                                                                      sentenceId,
                                                                      {
                                                                        text: value,
                                                                      },
                                                                    )
                                                                  }
                                                                />
                                                                {isEditMode ||
                                                                sent.translation ? (
                                                                  <InlineEditableText
                                                                    editing={
                                                                      isEditMode
                                                                    }
                                                                    value={
                                                                      sent.translation ||
                                                                      ''
                                                                    }
                                                                    display={
                                                                      sent.translation ? (
                                                                        <p className='text-[14px] leading-7 text-slate-500 dark:text-indigo-200/70'>
                                                                          {
                                                                            sent.translation
                                                                          }
                                                                        </p>
                                                                      ) : undefined
                                                                    }
                                                                    placeholder='添加中文翻译'
                                                                    ariaLabel={`例句中文 ${sentIdx + 1}`}
                                                                    displayTag='div'
                                                                    multiline
                                                                    className='mt-1 text-[14px] leading-7 text-slate-500'
                                                                    onChange={value =>
                                                                      updateInlineSentence(
                                                                        meaningIdx,
                                                                        sentenceId,
                                                                        {
                                                                          translation:
                                                                            value,
                                                                        },
                                                                      )
                                                                    }
                                                                  />
                                                                ) : null}
                                                                <div className='mt-2'>
                                                                  {renderSentenceMetaRow(
                                                                    currentVocab,
                                                                    sent,
                                                                  )}
                                                                </div>
                                                              </div>
                                                              {isEditMode ? (
                                                                <InlineItemActions
                                                                  onMoveUp={() =>
                                                                    moveInlineSentence(
                                                                      meaningIdx,
                                                                      sentenceId,
                                                                      -1,
                                                                    )
                                                                  }
                                                                  onMoveDown={() =>
                                                                    moveInlineSentence(
                                                                      meaningIdx,
                                                                      sentenceId,
                                                                      1,
                                                                    )
                                                                  }
                                                                  onDelete={() =>
                                                                    removeInlineSentence(
                                                                      meaningIdx,
                                                                      sentenceId,
                                                                    )
                                                                  }
                                                                  canMoveUp={
                                                                    sentIdx > 0
                                                                  }
                                                                  canMoveDown={
                                                                    sentIdx <
                                                                    matchedSentences.length -
                                                                      1
                                                                  }
                                                                />
                                                              ) : null}
                                                            </div>
                                                          )
                                                        },
                                                      )
                                                    )}
                                                    {isEditMode ? (
                                                      <button
                                                        type='button'
                                                        onClick={() =>
                                                          addInlineSentence(
                                                            meaningIdx,
                                                          )
                                                        }
                                                        className='inline-flex min-h-7 items-center text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-700'>
                                                        + 添加例句
                                                      </button>
                                                    ) : null}
                                                  </div>
                                                </section>
                                              )}
                                              {currentVocab.senses?.[
                                                meaningIdx
                                              ] ? (
                                                <VocabularySenseDetails
                                                  sense={
                                                    currentVocab.senses[
                                                      meaningIdx
                                                    ]
                                                  }
                                                  sourceWord={currentVocab.word}
                                                  showPronunciation={shouldShowPronunciationForVocab(
                                                    currentVocab,
                                                  )}
                                                  showRelations={false}
                                                  editing={isEditMode}
                                                  onChange={sense =>
                                                    inlineEditor.updateSense(
                                                      meaningIdx,
                                                      current => ({
                                                        ...current,
                                                        patterns:
                                                          sense.patterns,
                                                        expressions:
                                                          sense.expressions,
                                                        relations:
                                                          sense.relations,
                                                        notes: sense.notes,
                                                      }),
                                                    )
                                                  }
                                                />
                                              ) : null}
                                            </div>
                                          </div>
                                        )
                                      },
                                    )}
                                  </div>
                                </section>
                              )}

                              {unmatchedEntries.length > 0 && (
                                <section
                                  className={`vocab-example-section vocab-flat-section ${hasMeanings ? 'mt-7' : ''} min-h-0`}
                                  aria-label='例句'>
                                  <div className='vocab-unmatched-list vocab-flat-section border-l border-slate-300 pl-5'>
                                    <h4 className='vocab-example-heading sr-only'>
                                      例文
                                    </h4>
                                    <div className='vocab-example-list divide-y divide-slate-200'>
                                      {unmatchedEntries.map(
                                        ({ sent: sentObj }, index) => {
                                          const sentenceId =
                                            sentObj.id ||
                                            `${currentVocab.id}-unmatched-${index}`
                                          return (
                                            <div
                                              key={sentenceId}
                                              draggable={isEditMode}
                                              onDragStart={event => {
                                                if (!isEditMode) return
                                                event.dataTransfer.setData(
                                                  'text/plain',
                                                  sentenceId,
                                                )
                                                event.dataTransfer.effectAllowed =
                                                  'move'
                                              }}
                                              onDragOver={event => {
                                                if (!isEditMode) return
                                                event.preventDefault()
                                                event.dataTransfer.dropEffect =
                                                  'move'
                                              }}
                                              onDrop={event => {
                                                if (!isEditMode) return
                                                event.preventDefault()
                                                const sourceId =
                                                  event.dataTransfer.getData(
                                                    'text/plain',
                                                  )
                                                if (sourceId) {
                                                  reorderInlineSentence(
                                                    0,
                                                    sourceId,
                                                    sentenceId,
                                                  )
                                                }
                                              }}
                                              className='vocab-example-row group relative w-full py-5 text-left'>
                                              <InlineEditableText
                                                editing={isEditMode}
                                                value={sentObj.text}
                                                display={renderSentenceWithPronunciation(
                                                  sentObj,
                                                  currentVocab,
                                                )}
                                                placeholder='例句日文'
                                                ariaLabel={`例句日文 ${index + 1}`}
                                                displayTag='div'
                                                multiline
                                                className='font-reading-body-ja cursor-text select-text text-base leading-8 text-slate-800 sm:text-[17px]'
                                                onChange={value =>
                                                  updateInlineSentence(
                                                    0,
                                                    sentenceId,
                                                    {
                                                      text: value,
                                                    },
                                                  )
                                                }
                                              />
                                              {isEditMode ||
                                              sentObj.translation ? (
                                                <InlineEditableText
                                                  editing={isEditMode}
                                                  value={
                                                    sentObj.translation || ''
                                                  }
                                                  display={
                                                    sentObj.translation ? (
                                                      <p className='text-[14px] leading-7 text-slate-500 dark:text-indigo-200/70'>
                                                        {sentObj.translation}
                                                      </p>
                                                    ) : undefined
                                                  }
                                                  placeholder='添加中文翻译'
                                                  ariaLabel={`例句中文 ${index + 1}`}
                                                  displayTag='div'
                                                  multiline
                                                  className='mt-1 text-[14px] leading-7 text-slate-500'
                                                  onChange={value =>
                                                    updateInlineSentence(
                                                      0,
                                                      sentenceId,
                                                      {
                                                        translation: value,
                                                      },
                                                    )
                                                  }
                                                />
                                              ) : null}
                                              <div className='mt-2'>
                                                {renderSentenceMetaRow(
                                                  currentVocab,
                                                  sentObj,
                                                )}
                                              </div>
                                              {isEditMode ? (
                                                <InlineItemActions
                                                  onMoveUp={() =>
                                                    moveInlineSentence(
                                                      0,
                                                      sentenceId,
                                                      -1,
                                                    )
                                                  }
                                                  onMoveDown={() =>
                                                    moveInlineSentence(
                                                      0,
                                                      sentenceId,
                                                      1,
                                                    )
                                                  }
                                                  onDelete={() =>
                                                    removeInlineSentence(
                                                      0,
                                                      sentenceId,
                                                    )
                                                  }
                                                  canMoveUp={index > 0}
                                                  canMoveDown={
                                                    index <
                                                    unmatchedEntries.length - 1
                                                  }
                                                />
                                              ) : null}
                                            </div>
                                          )
                                        },
                                      )}
                                    </div>
                                  </div>
                                </section>
                              )}
                            </div>
                          )
                        })()}

                        <NadeshikoSearchPanel
                          key={currentFlashVocab.id}
                          vocabulary={currentFlashVocab}
                          editing={isEditMode}
                        />
                        <SentenceSearchPanel
                          vocabulary={currentFlashVocab}
                          searching={searchingId === currentFlashVocab.id}
                          loading={isSearchingMore}
                          results={searchResults[currentFlashVocab.id] || []}
                          onToggleSearch={() =>
                            handleSearchSentences(
                              currentFlashVocab.id,
                              currentFlashVocab.word,
                              currentFlashVocab.partsOfSpeech || [],
                              getVocabularyMatchVariants(currentFlashVocab),
                            )
                          }
                          onAdd={(sentence, senseId) =>
                            isEditMode
                              ? addInlineSentenceFromSearch(
                                  currentFlashVocab.senses?.findIndex(
                                    sense => sense.id === senseId,
                                  ) ?? 0,
                                  sentence,
                                )
                              : void handleAddSentence(
                                  activeTab,
                                  currentFlashVocab.id,
                                  sentence,
                                  senseId,
                                )
                          }
                        />
                        <VocabularyRelationsSection
                          vocabulary={currentFlashVocab}
                          showPronunciation={shouldShowPronunciationForVocab(
                            currentFlashVocab,
                          )}
                          className='mt-6'
                          editing={isEditMode}
                          onChange={inlineEditor.updateRelations}
                          onAdd={inlineEditor.addRelation}
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
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
