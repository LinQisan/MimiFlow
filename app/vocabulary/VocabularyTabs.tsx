// app/vocabulary/VocabularyTabs.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  assignVocabularyFolder,
  createVocabularyFolder,
  deleteVocabulary,
  searchSentencesForWord,
  addVocabularySentence,
  moveVocabularyToGroup,
  moveVocabularyFolder,
  renameVocabularyFolder,
  renameVocabularyGroup,
  updateVocabularyPronunciationById,
  assignVocabularySentenceMeaning,
  clearVocabularySentenceMeaning,
  updateVocabularySentence,
  deleteVocabularySentence,
  updateVocabularyPartsOfSpeechById,
  updateVocabularySentencePosTags,
  updateVocabularyTags,
} from '@/app/actions/content'
import { rateVocabularyMemory } from '@/app/actions/fsrs'
import { useDialog } from '@/context/DialogContext'
import WordPronunciation from '@/components/WordPronunciation'
import InlineConfirmAction from '@/components/InlineConfirmAction'
import ToggleSwitch from '@/components/ToggleSwitch'
import {
  hasJapanese,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import { buildJapaneseRubyHtml } from '@/utils/japaneseRuby'
import {
  inferContextualPos,
  posBadgeClass,
  getPosOptions,
  posWordHighlightClass,
} from '@/utils/posTagger'
import { normalizeVocabularyHeadword } from '@/utils/vocabularyCanonical'
import { Rating } from 'ts-fsrs'

type SentenceItem = {
  text: string
  source: string
  sourceUrl: string
  translation?: string | null
  audioFile?: string | null
  meaningIndex?: number | null
  posTags?: string[]
}

type AudioData = {
  audioFile: string
  start: number
  end: number
}

type VocabItem = {
  id: string
  word: string
  languageCode?: string
  wordAudio?: string | null
  pronunciation?: string | null
  pronunciations?: string[]
  partOfSpeech?: string | null
  partsOfSpeech?: string[]
  meanings?: string[]
  tags?: string[]
  createdAt: Date
  folderId?: string | null
  folderName?: string | null
  sourceType: string
  sentences: SentenceItem[]
  audioData: AudioData | null
  review?: {
    id: string
    due: Date | string
    state: number
    stability: number
    difficulty: number
    elapsed_days: number
    scheduled_days: number
    reps: number
    lapses: number
    learning_steps: number
    last_review: Date | string | null
  } | null
}

type FolderItem = {
  id: string
  name: string
  parentId: string | null
}

type InflectionVariant = {
  word: string
  sentenceHits: number
  sentenceTotal: number
}

type InflectionFamily = {
  lemma: string
  totalVariants: number
  coveredVariants: number
  coverage: number
  variants: InflectionVariant[]
}

const LANG_NAMES: Record<string, string> = {
  ja: '日语',
  en: '英语',
  ko: '韩语',
  zh: '中文',
  other: '更多',
}

const splitListInput = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const firstSentencePosTag = (tags?: string[]) => {
  if (!Array.isArray(tags)) return ''
  const first = tags.map(item => item.trim()).find(Boolean)
  return first || ''
}

const getPrimaryPronunciation = (vocab: VocabItem) => {
  const fromList = (vocab.pronunciations || [])
    .map(item => item.trim())
    .find(Boolean)
  if (fromList) return fromList
  return (vocab.pronunciation || '').trim()
}

const normalizeLanguageCode = (value: string) => {
  const text = value.trim().toLowerCase()
  if (text === 'ja' || text.includes('日语') || text.includes('日本'))
    return 'ja'
  if (text === 'en' || text.includes('英语') || text.includes('english'))
    return 'en'
  if (text === 'ko' || text.includes('韩语') || text.includes('korean'))
    return 'ko'
  if (text === 'zh' || text.includes('中文') || text.includes('chinese'))
    return 'zh'
  return 'other'
}

const supportsPronunciationByLanguage = (languageCode?: string) =>
  languageCode === 'ja' || languageCode === 'en'

const stripLeadingIcons = (text: string) =>
  text.replace(/^[^\p{L}\p{N}\u4e00-\u9fa5ぁ-んァ-ヶ]+/u, '').trim()

const getSentenceSourceType = (sentence: SentenceItem) => {
  const sourceText = stripLeadingIcons(sentence.source || '')
  if (sourceText.includes('题目')) return '题目'
  if (sentence.sourceUrl.startsWith('/practice')) return '题目'
  if (sentence.sourceUrl.startsWith('/articles/')) return '文章'
  if (sentence.sourceUrl.startsWith('/shadowing/')) return '听力'
  if (sentence.sourceUrl.startsWith('/lessons/')) return '听力'
  if (sourceText.includes('阅读')) return '文章'
  if (sourceText.includes('听力')) return '听力'
  if (sourceText.includes('题')) return '题目'
  return ''
}

const getSentenceSourceDetail = (sentence: SentenceItem) => {
  const sourceText = stripLeadingIcons(sentence.source || '')
  const [_, ...rest] = sourceText.split(/[：:]/)
  const detail = rest.join('：').trim()
  if (!detail || detail === '未知来源') return ''
  return detail
}

const getSentenceSourceDisplay = (sentence: SentenceItem) => {
  const sourceType = getSentenceSourceType(sentence)
  const detail = getSentenceSourceDetail(sentence)
  if (!sourceType && !detail) return ''
  if (!sourceType) return detail
  if (!detail || detail === sourceType) return sourceType
  return `${sourceType} · ${detail}`
}

const detectInflectedSurface = (word: string, sentenceText: string) => {
  const cleanWord = word.trim()
  if (!cleanWord || !sentenceText) return ''
  if (!/[\u3040-\u30ff\u4e00-\u9fff]/.test(cleanWord)) return ''
  const escapedWord = escapeRegExp(cleanWord)
  const suffixes = [
    'しませんでした',
    'しなかった',
    'くなかった',
    'ませんでした',
    'ました',
    'ません',
    'なかった',
    'ている',
    'ていた',
    'られる',
    'かった',
    'します',
    'しない',
    'して',
    'した',
    'ない',
    'たい',
    'ます',
    'です',
    'だ',
    'た',
    'て',
    'な',
    'に',
    'く',
  ]
  for (const suffix of suffixes) {
    const regex = new RegExp(`${escapedWord}${escapeRegExp(suffix)}`)
    const matched = sentenceText.match(regex)?.[0] || ''
    if (matched && matched !== cleanWord) return matched
  }
  return ''
}

const dateToMs = (value?: Date | string | null) => {
  if (!value) return Number.NaN
  const ts = new Date(value).getTime()
  return Number.isFinite(ts) ? ts : Number.NaN
}

const seededShuffle = <T,>(list: T[], seed: number) => {
  const arr = [...list]
  let s = Math.max(1, seed % 2147483647)
  const next = () => {
    s = (s * 48271) % 2147483647
    return s / 2147483647
  }
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

const resolveInconsistentMemoryRating = (first: Rating, second: Rating) => {
  if (first === second) return first
  const diff = second - first

  // 二次评分更低：认为用户在看完整内容后修正了高估，直接采用更低分。
  if (diff < 0) return second

  // 二次评分更高：看完完整内容后信心上升，但为避免虚高，只上调一级。
  if (first === Rating.Again) return Rating.Hard
  if (first === Rating.Hard) return Rating.Good
  return Rating.Easy
}

type DropdownOption = {
  value: string
  label: string
}

type FolderTreeNode = FolderItem & {
  children: FolderTreeNode[]
}

const buildFolderTree = (folders: FolderItem[]) => {
  const nodeMap = new Map<string, FolderTreeNode>()
  folders.forEach(folder => nodeMap.set(folder.id, { ...folder, children: [] }))
  const roots: FolderTreeNode[] = []
  nodeMap.forEach(node => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

const flattenFolderTree = (
  nodes: FolderTreeNode[],
  depth = 0,
  acc: Array<FolderItem & { depth: number; pathLabel: string }> = [],
) => {
  nodes
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .forEach(node => {
      const prefix = depth > 0 ? `${'— '.repeat(depth)}` : ''
      acc.push({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        depth,
        pathLabel: `${prefix}${node.name}`,
      })
      flattenFolderTree(node.children, depth + 1, acc)
    })
  return acc
}

function ControlDropdown({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  ariaLabel: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find(option => option.value === value) || options[0]

  useEffect(() => {
    if (!open) return
    const handleOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return
      if (rootRef.current?.contains(event.target)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', handleOutside)
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [open])

  return (
    <div ref={rootRef} className={`relative min-w-[9.5rem] ${className}`}>
      <button
        type='button'
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
        className='flex h-10 w-full items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 px-3 text-sm font-semibold text-gray-700 shadow-sm outline-none transition-[background-color,border-color,color,box-shadow] hover:border-gray-300 hover:shadow focus-visible:border-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-100'>
        <span className='truncate'>{selected?.label || ''}</span>
        <span
          className={`ml-2 text-[11px] font-black text-gray-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}>
          ▾
        </span>
      </button>
      {open && (
        <div className='absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl'>
          <div className='max-h-56 overflow-auto p-1'>
            {options.map(option => {
              const active = option.value === value
              return (
                <button
                  key={`${ariaLabel}-${option.value}`}
                  type='button'
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function VocabularyTabs({
  groupedData,
  groupedTotals,
  folders,
  initialFolderFilter = 'all',
  initialFocusId,
  initialFocusGroup,
  totalCount,
  currentPage,
  totalPages,
}: {
  groupedData: Record<string, VocabItem[]>
  groupedTotals: Record<string, number>
  folders: FolderItem[]
  initialFolderFilter?: string
  initialFocusId?: string
  initialFocusGroup?: string
  totalCount: number
  currentPage: number
  totalPages: number
}) {
  const dialog = useDialog()
  const router = useRouter()
  const pathname = usePathname()
  const [activeTab, setActiveTab] = useState(
    Object.keys(groupedData)[0] || '未分类',
  )
  const [localData, setLocalData] = useState(groupedData)
  const [viewMode, setViewMode] = useState<'list' | 'flashcard'>('list')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [memoryMode, setMemoryMode] = useState(false)
  const [randomOrder, setRandomOrder] = useState(false)
  const [shuffleSeed, setShuffleSeed] = useState(1)
  const shuffleSeedRef = useRef(1)
  const [memoryNowMs, setMemoryNowMs] = useState(0)
  const [isSubmittingRating, setIsSubmittingRating] = useState(false)
  const [memoryReveal, setMemoryReveal] = useState(false)
  const [pendingMemoryRating, setPendingMemoryRating] = useState<Rating | null>(
    null,
  )
  const [isEditMode, setIsEditMode] = useState(false)
  const [selectedVocabIds, setSelectedVocabIds] = useState<Set<string>>(
    new Set(),
  )
  const [bulkTagsInput, setBulkTagsInput] = useState('')
  const [bulkTagPanelOpen, setBulkTagPanelOpen] = useState(false)
  const [activeTagEditorId, setActiveTagEditorId] = useState<string | null>(
    null,
  )
  const [tagDraft, setTagDraft] = useState('')
  const [isSavingTags, setIsSavingTags] = useState(false)
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false)
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const [sortMode, setSortMode] = useState<'recent' | 'word' | 'pos'>('recent')
  const [selectedPosFilter, setSelectedPosFilter] = useState('all')
  const [selectedFolderFilter, setSelectedFolderFilter] =
    useState(initialFolderFilter)
  const [folderList, setFolderList] = useState(folders)
  const [selectedFolderManageId, setSelectedFolderManageId] = useState<
    string | null
  >(null)

  // 🌟 轻量级分组移动控制
  const [activeMoveId, setActiveMoveId] = useState<string | null>(null)
  const [newGroupInput, setNewGroupInput] = useState('')
  const [activePronEditId, setActivePronEditId] = useState<string | null>(null)
  const [pronInput, setPronInput] = useState('')
  const [activeFolderEditId, setActiveFolderEditId] = useState<string | null>(
    null,
  )
  const [expandedInflectionIds, setExpandedInflectionIds] = useState<
    Record<string, boolean>
  >({})
  const [dragOffsetX, setDragOffsetX] = useState(0)
  const [cardTransitionState, setCardTransitionState] = useState<
    'idle' | 'leaving' | 'entering'
  >('idle')
  const [cardTransitionDirection, setCardTransitionDirection] = useState<
    'next' | 'prev'
  >('next')
  const appliedFocusIdRef = useRef<string | null>(null)
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transitionRafRef = useRef<number | null>(null)
  const swipeStateRef = useRef<{
    active: boolean
    pointerId: number | null
    startX: number
    deltaX: number
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    deltaX: 0,
  })

  const [searchingId, setSearchingId] = useState<string | null>(null)
  const [isSearchingMore, setIsSearchingMore] = useState(false)
  const [searchResults, setSearchResults] = useState<
    Record<string, SentenceItem[]>
  >({})
  const [pendingSentenceIndex, setPendingSentenceIndex] = useState<
    number | null
  >(null)
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
  const activeFolderContextId =
    selectedFolderFilter !== 'all' && selectedFolderFilter !== 'none'
      ? selectedFolderFilter
      : selectedFolderManageId
  const bumpShuffleSeed = () => {
    shuffleSeedRef.current += 1
    setShuffleSeed(shuffleSeedRef.current)
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

      // 设置起始时间并播放
      audio.currentTime = audioData.start || 0
      const playPromise = audio.play()

      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('音频播放失败，请检查文件路径或浏览器权限:', error)
        })
      }

      if (audioData.end) {
        audio.ontimeupdate = () => {
          if (audio.currentTime >= audioData.end) {
            audio.pause()
            audio.ontimeupdate = null
          }
        }
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

  const handleMoveGroup = async (
    vocabId: string,
    fromGroup: string,
    targetGroup: string,
  ) => {
    const target = targetGroup.trim()
    if (!target || target === fromGroup) {
      setActiveMoveId(null)
      return
    }

    setLocalData(prev => {
      const itemToMove = prev[fromGroup].find(
        (i: VocabItem) => i.id === vocabId,
      )
      if (!itemToMove) return prev
      const newData = { ...prev }
      newData[fromGroup] = newData[fromGroup].filter(
        (i: VocabItem) => i.id !== vocabId,
      )
      if (!newData[target]) newData[target] = []
      newData[target] = [itemToMove, ...newData[target]]
      return newData
    })
    if (viewMode === 'flashcard') {
      setCurrentIndex(prev =>
        Math.max(
          0,
          prev >= visibleList.length - 1 ? visibleList.length - 2 : prev,
        ),
      )
    }
    setActiveMoveId(null)
    setNewGroupInput('')
    await moveVocabularyToGroup(vocabId, target)
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

  const handleCreateFolder = async (parentId?: string | null) => {
    const nextName = await dialog.prompt('收藏夹名称', {
      title: parentId ? '新建子收藏夹' : '新建收藏夹',
      defaultValue: '',
      confirmText: '创建',
    })
    if (nextName == null) return
    const trimmed = nextName.trim()
    if (!trimmed) {
      dialog.toast('收藏夹名称不能为空', { tone: 'error' })
      return
    }
    const result = await createVocabularyFolder(trimmed, parentId || null)
    if (!result.success || !result.folder) {
      dialog.toast(result.message || '创建失败', { tone: 'error' })
      return
    }
    setFolderList(prev => [...prev, result.folder])
    setSelectedFolderManageId(result.folder.id)
    dialog.toast('收藏夹已创建', { tone: 'success' })
  }

  const handleRenameFolder = async (folderId: string) => {
    const target = folderList.find(item => item.id === folderId)
    if (!target) return
    const nextName = await dialog.prompt('新的收藏夹名称', {
      title: '重命名收藏夹',
      defaultValue: target.name,
      confirmText: '保存',
    })
    if (nextName == null) return
    const trimmed = nextName.trim()
    if (!trimmed) {
      dialog.toast('收藏夹名称不能为空', { tone: 'error' })
      return
    }
    const result = await renameVocabularyFolder(folderId, trimmed)
    if (!result.success || !result.folder) {
      dialog.toast(result.message || '重命名失败', { tone: 'error' })
      return
    }
    setFolderList(prev =>
      prev.map(item =>
        item.id === folderId ? { ...item, name: result.folder!.name } : item,
      ),
    )
    setLocalData(
      prev =>
        Object.fromEntries(
          Object.entries(prev).map(([group, items]) => [
            group,
            items.map(item =>
              item.folderId === folderId
                ? { ...item, folderName: result.folder!.name }
                : item,
            ),
          ]),
        ) as Record<string, VocabItem[]>,
    )
    dialog.toast('收藏夹名称已更新', { tone: 'success' })
  }

  const handleMoveFolder = async (folderId: string) => {
    const target = folderList.find(item => item.id === folderId)
    if (!target) return
    const options = [
      { id: 'root', label: '根目录（无上级）' },
      ...flatFolders
        .filter(item => item.id !== folderId)
        .map(item => ({
          id: item.id,
          label: item.pathLabel,
        })),
    ]
    const optionText = options
      .map((item, idx) => `${idx + 1}. ${item.label}`)
      .join('\n')
    const selected = await dialog.prompt(
      `输入目标序号，把「${target.name}」移动到：\n${optionText}`,
      {
        title: '移动收藏夹',
        defaultValue: '1',
        confirmText: '移动',
      },
    )
    if (selected == null) return
    const index = Number(selected.trim())
    if (!Number.isFinite(index) || index < 1 || index > options.length) {
      dialog.toast('请输入有效的序号', { tone: 'error' })
      return
    }
    const nextParentId =
      options[index - 1].id === 'root' ? null : options[index - 1].id
    const result = await moveVocabularyFolder(folderId, nextParentId)
    if (!result.success || !result.folder) {
      dialog.toast(result.message || '移动失败', { tone: 'error' })
      return
    }
    setFolderList(prev =>
      prev.map(item =>
        item.id === folderId ? { ...item, parentId: nextParentId } : item,
      ),
    )
    dialog.toast('收藏夹已移动', { tone: 'success' })
  }

  const handleRenameGroup = async () => {
    const currentGroup = activeTab.trim()
    if (!currentGroup) return
    const nextName = await dialog.prompt('新的分组名称', {
      title: `重命名分组：${currentGroup}`,
      defaultValue: currentGroup,
      confirmText: '保存',
    })
    if (nextName == null) return
    const trimmed = nextName.trim()
    if (!trimmed) {
      dialog.toast('分组名称不能为空', { tone: 'error' })
      return
    }
    const result = await renameVocabularyGroup(currentGroup, trimmed)
    if (!result.success) {
      dialog.toast(result.message || '分组重命名失败', { tone: 'error' })
      return
    }
    setLocalData(prev => {
      if (!prev[currentGroup] || currentGroup === trimmed) return prev
      const next = { ...prev }
      const moving = next[currentGroup]
      delete next[currentGroup]
      next[trimmed] = [...(next[trimmed] || []), ...moving]
      return next
    })
    setActiveTab(trimmed)
    router.refresh()
    dialog.toast(`分组已重命名（影响 ${result.changed || 0} 条）`, {
      tone: 'success',
    })
  }

  const handleAssignFolder = async (vocabId: string, folderId: string) => {
    const nextFolderId = folderId === 'none' ? null : folderId
    const nextFolderName =
      nextFolderId == null ? null : folderPathLabelMap[nextFolderId] || null
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item =>
        item.id === vocabId
          ? {
              ...item,
              folderId: nextFolderId,
              folderName: nextFolderName,
            }
          : item,
      ),
    }))
    const result = await assignVocabularyFolder(vocabId, nextFolderId)
    if (!result.success) {
      dialog.toast(result.message || '收藏夹设置失败', { tone: 'error' })
      return
    }
    dialog.toast(nextFolderId ? '已加入收藏夹' : '已移出收藏夹', {
      tone: 'success',
    })
  }

  const handleOpenPronEditor = (vocab: VocabItem) => {
    setActiveMoveId(null)
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
    setActiveMoveId(null)
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

    const prevData = localData
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

  const handleEditSentence = async (vocabId: string, sentenceIndex: number) => {
    const vocab = localData[activeTab]?.find(item => item.id === vocabId)
    const sentence = vocab?.sentences[sentenceIndex]
    if (!sentence) return
    const nextText = await dialog.prompt('编辑句子', {
      title: '编辑例句',
      defaultValue: sentence.text,
      confirmText: '保存',
    })
    if (nextText == null) return
    const trimmedText = nextText.trim()
    if (!trimmedText) {
      await dialog.alert('句子不能为空')
      return
    }
    const nextSource = await dialog.prompt('编辑来源', {
      title: '编辑来源',
      defaultValue: sentence.source,
      confirmText: '保存',
    })
    if (nextSource == null) return
    const nextSourceUrl = await dialog.prompt('编辑来源链接', {
      title: '编辑来源链接',
      defaultValue: sentence.sourceUrl,
      confirmText: '保存',
    })
    if (nextSourceUrl == null) return

    const prevData = localData
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item => {
        if (item.id !== vocabId) return item
        return {
          ...item,
          sentences: item.sentences.map((sent, idx) =>
            idx === sentenceIndex
              ? {
                  ...sent,
                  text: trimmedText,
                  source: nextSource.trim() || sentence.source,
                  sourceUrl: nextSourceUrl.trim() || '#',
                }
              : sent,
          ),
        }
      }),
    }))
    const result = await updateVocabularySentence(vocabId, sentence.text, {
      text: trimmedText,
      source: nextSource.trim() || sentence.source,
      sourceUrl: nextSourceUrl.trim() || '#',
    })
    if (!result.success) {
      setLocalData(prevData)
      await dialog.alert(result.message || '句子更新失败')
    }
  }

  const handleDeleteSentence = async (
    vocabId: string,
    sentenceIndex: number,
  ) => {
    const vocab = localData[activeTab]?.find(item => item.id === vocabId)
    const sentence = vocab?.sentences[sentenceIndex]
    if (!sentence) return
    const prevData = localData
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item =>
        item.id === vocabId
          ? {
              ...item,
              sentences: item.sentences.filter(
                (_, idx) => idx !== sentenceIndex,
              ),
            }
          : item,
      ),
    }))
    const result = await deleteVocabularySentence(vocabId, sentence.text)
    if (!result.success) {
      setLocalData(prevData)
      dialog.toast(result.message || '删除失败', { tone: 'error' })
      return
    }
    dialog.toast('例句已删除', { tone: 'success' })
  }

  const currentList: VocabItem[] = localData[activeTab] || []
  const inflectionByWordId = useMemo(() => {
    const allVocab = Object.values(localData).flat()
    const familyBuckets = new Map<string, VocabItem[]>()
    const isJaVerbOrAdj = (item: VocabItem) => {
      const tags = item.partsOfSpeech || []
      const hasTargetPos = tags.some(
        tag =>
          tag.includes('動詞') ||
          tag.includes('形容詞') ||
          tag.includes('形容動詞'),
      )
      if (!hasTargetPos) return false
      return /[\u3040-\u30ff\u4e00-\u9fff]/.test(item.word)
    }

    allVocab.forEach(item => {
      if (!isJaVerbOrAdj(item)) return
      const lemma = normalizeVocabularyHeadword(
        item.word,
        item.partsOfSpeech || [],
      )
      if (!lemma) return
      const list = familyBuckets.get(lemma) || []
      list.push(item)
      familyBuckets.set(lemma, list)
    })

    const byId = new Map<string, InflectionFamily>()
    familyBuckets.forEach((items, lemma) => {
      const uniqueWords = Array.from(
        new Set(items.map(item => item.word.trim()).filter(Boolean)),
      )
      if (uniqueWords.length <= 1) return
      const allSentences = items.flatMap(item => item.sentences || [])
      const variants: InflectionVariant[] = uniqueWords
        .map(word => {
          const regex = new RegExp(escapeRegExp(word), 'g')
          const sentenceHits = allSentences.filter(sent =>
            regex.test(sent.text),
          ).length
          return {
            word,
            sentenceHits,
            sentenceTotal: allSentences.length,
          }
        })
        .sort(
          (a, b) =>
            b.sentenceHits - a.sentenceHits ||
            a.word.localeCompare(b.word, 'ja'),
        )
      const coveredVariants = variants.filter(
        item => item.sentenceHits > 0,
      ).length
      const totalVariants = variants.length
      const coverage =
        totalVariants > 0
          ? Math.round((coveredVariants / totalVariants) * 100)
          : 0
      const payload: InflectionFamily = {
        lemma,
        totalVariants,
        coveredVariants,
        coverage,
        variants,
      }
      items.forEach(item => {
        byId.set(item.id, payload)
      })
    })
    return byId
  }, [localData])
  const activeTabLanguageCode = normalizeLanguageCode(activeTab)
  const posFilterOptions = useMemo(
    () =>
      Array.from(
        new Set(
          currentList.flatMap(item =>
            (item.partsOfSpeech || []).map(pos => pos.trim()).filter(Boolean),
          ),
        ),
      ).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    [currentList],
  )
  const visibleList = useMemo(() => {
    const filtered = currentList.filter(item => {
      const matchPos =
        selectedPosFilter === 'all' ||
        (item.partsOfSpeech || []).some(pos => pos === selectedPosFilter)
      const matchFolder =
        selectedFolderFilter === 'all' ||
        (selectedFolderFilter === 'none'
          ? !item.folderId
          : item.folderId === selectedFolderFilter)
      return matchPos && matchFolder
    })
    return [...filtered].sort((a, b) => {
      if (sortMode === 'word') {
        return a.word.localeCompare(b.word, 'ja')
      }
      if (sortMode === 'pos') {
        const aPos = (a.partsOfSpeech || [])[0] || ''
        const bPos = (b.partsOfSpeech || [])[0] || ''
        if (aPos === bPos) return b.createdAt.getTime() - a.createdAt.getTime()
        return aPos.localeCompare(bPos, 'zh-Hans-CN')
      }
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
  }, [currentList, selectedPosFilter, selectedFolderFilter, sortMode])
  const flashList = useMemo(() => {
    let list = [...visibleList]
    if (memoryMode) {
      const due: VocabItem[] = []
      const fresh: VocabItem[] = []
      const upcoming: VocabItem[] = []
      list.forEach(item => {
        const dueMs = dateToMs(item.review?.due || null)
        if (Number.isNaN(dueMs)) {
          fresh.push(item)
          return
        }
        if (dueMs <= memoryNowMs) {
          due.push(item)
          return
        }
        upcoming.push(item)
      })
      due.sort(
        (a, b) =>
          dateToMs(a.review?.due || null) - dateToMs(b.review?.due || null),
      )
      upcoming.sort(
        (a, b) =>
          dateToMs(a.review?.due || null) - dateToMs(b.review?.due || null),
      )
      list = [...due, ...fresh, ...upcoming]
    }
    if (randomOrder && list.length > 1) {
      list = seededShuffle(list, shuffleSeed)
    }
    return list
  }, [visibleList, memoryMode, memoryNowMs, randomOrder, shuffleSeed])
  const currentFlashVocab = flashList[currentIndex] || null
  const allExistingGroups = useMemo(() => {
    const totalGroups = Object.keys(groupedTotals).filter(
      name => (groupedTotals[name] || 0) > 0,
    )
    if (totalGroups.length > 0) return totalGroups
    return Object.keys(localData).filter(g => localData[g].length > 0)
  }, [groupedTotals, localData])

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
      setActiveMoveId(null)
      setActivePronEditId(null)
      setActiveFolderEditId(null)
      setActiveTagEditorId(null)
    }
    if (
      activeMoveId ||
      activePronEditId ||
      activeFolderEditId ||
      activeTagEditorId
    ) {
      window.addEventListener('click', handleClickOutside)
    }
    return () => window.removeEventListener('click', handleClickOutside)
  }, [activeMoveId, activePronEditId, activeFolderEditId, activeTagEditorId])

  useEffect(() => {
    setPendingSentenceIndex(null)
  }, [activeTab, currentIndex, viewMode])

  useEffect(() => {
    if (!isEditMode) {
      setActiveMoveId(null)
      setActivePronEditId(null)
      setActiveFolderEditId(null)
      setActiveTagEditorId(null)
      setBulkTagPanelOpen(false)
      setPendingSentenceIndex(null)
    }
  }, [isEditMode])

  useEffect(() => {
    setSelectedPosFilter('all')
    setCurrentIndex(0)
  }, [activeTab])

  useEffect(() => {
    setLocalData(groupedData)
    const groups = Object.keys(groupedData)
    if (groups.length === 0) {
      if (activeTab !== '未分类') setActiveTab('未分类')
      return
    }
    if (!groups.includes(activeTab)) setActiveTab(groups[0])
  }, [groupedData, activeTab])

  useEffect(() => {
    setFolderList(folders)
  }, [folders])

  useEffect(() => {
    if (!selectedFolderManageId) return
    if (folderList.some(item => item.id === selectedFolderManageId)) return
    setSelectedFolderManageId(null)
  }, [folderList, selectedFolderManageId])

  useEffect(() => {
    setSelectedFolderFilter(initialFolderFilter || 'all')
  }, [initialFolderFilter])

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
  }, [initialFocusId, initialFocusGroup, localData])

  useEffect(() => {
    if (currentIndex >= flashList.length) {
      setCurrentIndex(Math.max(0, flashList.length - 1))
    }
  }, [currentIndex, flashList.length])

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
    const escapedWord = vocab.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const wordRegex = new RegExp(escapedWord, 'g')
    const targetPron = getPrimaryPronunciation(vocab)
    const sentencePos = sentencePosTagsFromItem(vocab, sentence)[0] || ''
    const highlightClass = posWordHighlightClass(sentencePos)

    let html = sentence.text
    if (
      hasJapanese(vocab.word) &&
      shouldShowPronunciationForVocab(vocab) &&
      targetPron
    ) {
      const rubyHtml = buildJapaneseRubyHtml(vocab.word, targetPron, {
        rubyClassName: 'jp-ruby font-semibold text-slate-900',
        rtClassName: 'jp-ruby-rt text-[9px] font-semibold text-slate-500',
      })
      html = html.replace(
        wordRegex,
        `<span class="inline-block align-baseline rounded-sm px-1 py-0.5 ${highlightClass}">${rubyHtml}</span>`,
      )
    } else {
      html = html.replace(
        wordRegex,
        `<span class="rounded px-1 py-0.5 font-semibold ${highlightClass}">${vocab.word}</span>`,
      )
    }
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  }

  const canPlaySentenceAudio = (vocab: VocabItem, sentence: SentenceItem) => {
    if (sentence.audioFile) return true
    if (!vocab.audioData) return false
    return (
      sentence.sourceUrl.startsWith('/shadowing/') ||
      sentence.sourceUrl.startsWith('/lessons/') ||
      sentence.source.includes('听力')
    )
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
      ? inflectionFamily.variants.find(variant =>
          sentence.text.includes(variant.word),
        )?.word || (sentence.text.includes(vocab.word) ? vocab.word : '')
      : ''
    const fallbackInflectionSurface = !matchedInflection
      ? detectInflectedSurface(vocab.word, sentence.text)
      : ''
    const inflectionLabel = inflectionFamily
      ? matchedInflection && matchedInflection !== inflectionFamily.lemma
        ? `词形 ${matchedInflection} → ${inflectionFamily.lemma}`
        : `原形 ${inflectionFamily.lemma}`
      : fallbackInflectionSurface
        ? `词形 ${fallbackInflectionSurface} → ${vocab.word}`
        : ''
    const hasInflection = !!inflectionLabel
    const canPlay = canPlaySentenceAudio(vocab, sentence)
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
              onClick={event => {
                event.stopPropagation()
                if (sentence.audioFile) {
                  playAudioFile(sentence.audioFile)
                  return
                }
                const audioData = vocab.audioData
                if (audioData) playAudio(audioData)
              }}
              className='inline-flex h-5 items-center text-[12px] font-medium leading-5 text-slate-500 dark:text-indigo-200/85 underline-offset-2 hover:text-slate-700 dark:hover:text-indigo-100 hover:underline'>
              播放
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

  const runCardTransition = (
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
  }

  const goPrevCard = () => {
    runCardTransition(currentIndex - 1, 'prev')
  }

  const goNextCard = () => {
    runCardTransition(currentIndex + 1, 'next')
  }

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
  }, [currentFlashVocab?.id, memoryMode])

  useEffect(() => {
    if (!memoryMode) return
    setMemoryNowMs(Date.now())
  }, [memoryMode, currentFlashVocab?.id, localData])

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
    if (cardTransitionState !== 'idle') return
    if (!canStartSwipeFromTarget(event.target)) return
    swipeStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      deltaX: 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleFlashCardPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const state = swipeStateRef.current
    if (!state.active || state.pointerId !== event.pointerId) return
    const deltaX = event.clientX - state.startX
    state.deltaX = deltaX
    setDragOffsetX(Math.max(-88, Math.min(88, deltaX)))
  }

  const handleFlashCardPointerEnd = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const state = swipeStateRef.current
    if (!state.active || state.pointerId !== event.pointerId) return
    const threshold = 70
    if (state.deltaX > threshold) goPrevCard()
    if (state.deltaX < -threshold) goNextCard()
    swipeStateRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      deltaX: 0,
    }
    setDragOffsetX(0)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // no-op
    }
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
    <div className='theme-page-vocab max-w-7xl mx-auto'>
      {/* 头部导航 */}
      <div className={viewMode === 'flashcard' ? 'mb-3' : 'mb-6'}>
        {viewMode !== 'flashcard' && (
          <div className='flex w-full flex-wrap gap-2 overflow-x-auto border-b border-gray-200 pb-3 mb-3 scrollbar-hide'>
            {allExistingGroups.map(name => (
              <button
                key={name}
                onClick={() => {
                  setActiveTab(name)
                  setCurrentIndex(0)
                  setViewMode('list')
                }}
                className={`rounded-full font-bold whitespace-nowrap transition-colors px-4 py-2 ${
                  activeTab === name
                    ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                {LANG_NAMES[name] || name}
                <span className='ml-1 opacity-75'>
                  ({groupedTotals[name] || 0})
                </span>
              </button>
            ))}
            <button
              type='button'
              onClick={() => void handleRenameGroup()}
              className='ml-auto rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50'>
              重命名分组
            </button>
          </div>
        )}

        <div className={`space-y-2 pb-3 ${viewMode !== 'flashcard' ? 'border-b border-gray-200' : ''}`}>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <button
                onClick={() => setIsEditMode(prev => !prev)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  isEditMode
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}>
                {isEditMode ? '退出编辑' : '编辑'}
              </button>
              {isEditMode && (
                <div className='flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 border border-indigo-200'>
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
                      className='w-4 h-4 rounded border-gray-300 cursor-pointer accent-indigo-600'
                    />
                    <span className='text-xs text-indigo-700 font-medium'>
                      全选
                    </span>
                  </label>
                  {selectedVocabIds.size > 0 && (
                    <>
                      <span className='border-l border-indigo-200 h-4'></span>
                      <span className='text-xs text-indigo-700 font-medium'>
                        已选 {selectedVocabIds.size}/{visibleList.length} 个
                      </span>
                      <button
                        type='button'
                        onClick={() => setBulkTagPanelOpen(prev => !prev)}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                          bulkTagPanelOpen
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                            : 'border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
                        }`}>
                        {bulkTagPanelOpen ? '收起标签面板' : '批量添加标签'}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedVocabIds(new Set())
                          setIsSelectAllChecked(false)
                        }}
                        className='px-2 py-1 rounded-md text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors'>
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
            </div>
            <div className='flex items-center gap-2 rounded-lg bg-gray-100 p-1'>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${viewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                列表
              </button>
              <button
                onClick={() => {
                  setViewMode('flashcard')
                  setCurrentIndex(0)
                }}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${viewMode === 'flashcard' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
                闪卡
              </button>
            </div>
          </div>

          {isEditMode && bulkTagPanelOpen && (
            <div className='rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/70 p-4 shadow-sm'>
              <div className='flex flex-col gap-3'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-bold text-indigo-700'>
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
                  className='w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-inner outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100'
                />

                {splitListInput(bulkTagsInput).length > 0 && (
                  <div className='flex flex-wrap gap-1.5'>
                    {splitListInput(bulkTagsInput).map(tag => (
                      <span
                        key={`bulk-draft-tag-${tag}`}
                        className='inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700'>
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
                    className='rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700'>
                    保存批量标签
                  </button>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'flashcard' && (
            <div className='flex flex-wrap items-center gap-2 pt-1'>
              <button
                type='button'
                onClick={() => {
                  setMemoryMode(prev => !prev)
                  setMemoryNowMs(prev => prev + 1)
                  setCurrentIndex(0)
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                  memoryMode
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                记忆模式
              </button>
              <button
                type='button'
                onClick={() => {
                  setRandomOrder(prev => !prev)
                  bumpShuffleSeed()
                  setCurrentIndex(0)
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                  randomOrder
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                随机顺序
              </button>
              {randomOrder && (
                <button
                  type='button'
                  onClick={() => {
                    bumpShuffleSeed()
                    setCurrentIndex(0)
                  }}
                  className='rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50'>
                  重新打乱
                </button>
              )}
              {memoryMode && (
                <span className='ui-tag ui-tag-muted'>到期优先 + 新词优先</span>
              )}
            </div>
          )}

          {viewMode === 'list' && (
            <div className='space-y-2 pt-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-xs font-bold text-gray-500'>排序</span>
                {(
                  [
                    { value: 'recent', label: '最新' },
                    { value: 'word', label: '词汇 A-Z' },
                    { value: 'pos', label: '词性' },
                  ] as const
                ).map(item => (
                  <button
                    key={`sort-chip-${item.value}`}
                    type='button'
                    onClick={() => setSortMode(item.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                      sortMode === item.value
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}>
                    {item.label}
                  </button>
                ))}
              </div>

              <div className='grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr] sm:items-center'>
                <span className='text-xs font-bold text-gray-500'>词性</span>
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
              </div>

              <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                <ControlDropdown
                  ariaLabel='收藏夹筛选'
                  value={selectedFolderFilter}
                  onChange={value => {
                    setSelectedFolderFilter(value)
                    setSelectedFolderManageId(
                      value !== 'all' && value !== 'none' ? value : null,
                    )
                    const params = new URLSearchParams()
                    params.set('page', '1')
                    params.set('folder', value)
                    router.push(`${pathname}?${params.toString()}`)
                  }}
                  className='w-full'
                  options={[
                    { value: 'all', label: '全部收藏夹' },
                    { value: 'none', label: '未收藏' },
                    ...flatFolders.map(folder => ({
                      value: folder.id,
                      label: folder.pathLabel,
                    })),
                  ]}
                />
                <button
                  type='button'
                  onClick={() =>
                    void handleCreateFolder(activeFolderContextId || null)
                  }
                  className='h-10 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-100'>
                  {activeFolderContextId ? '新建子收藏夹' : '新建收藏夹'}
                </button>
              </div>

              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-xs font-bold text-gray-500'>
                  收藏夹管理
                </span>
                <ControlDropdown
                  ariaLabel='选择要管理的收藏夹'
                  value={activeFolderContextId || 'none'}
                  onChange={value =>
                    setSelectedFolderManageId(value === 'none' ? null : value)
                  }
                  className='w-full sm:max-w-sm'
                  options={[
                    { value: 'none', label: '未选择' },
                    ...flatFolders.map(folder => ({
                      value: folder.id,
                      label: folder.pathLabel,
                    })),
                  ]}
                />
                <button
                  type='button'
                  disabled={!activeFolderContextId}
                  onClick={() =>
                    activeFolderContextId &&
                    void handleCreateFolder(activeFolderContextId)
                  }
                  className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
                  新建子收藏夹
                </button>
                <button
                  type='button'
                  disabled={!activeFolderContextId}
                  onClick={() =>
                    activeFolderContextId &&
                    void handleRenameFolder(activeFolderContextId)
                  }
                  className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
                  重命名
                </button>
                <button
                  type='button'
                  disabled={!activeFolderContextId}
                  onClick={() =>
                    activeFolderContextId &&
                    void handleMoveFolder(activeFolderContextId)
                  }
                  className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
                  移动
                </button>
              </div>

              <div className='flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-2 text-xs text-gray-600'>
                <span>
                  本页 {visibleList.length} 条 · 第 {currentPage}/{totalPages}{' '}
                  页
                </span>
                <div className='flex items-center gap-2'>
                  <button
                    type='button'
                    onClick={() => {
                      if (currentPage <= 1) return
                      const params = new URLSearchParams()
                      params.set('page', String(currentPage - 1))
                      params.set('folder', selectedFolderFilter)
                      router.push(`${pathname}?${params.toString()}`)
                    }}
                    disabled={currentPage <= 1}
                    className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
                    上一页
                  </button>
                  <button
                    type='button'
                    onClick={() => {
                      if (currentPage >= totalPages) return
                      const params = new URLSearchParams()
                      params.set('page', String(currentPage + 1))
                      params.set('folder', selectedFolderFilter)
                      router.push(`${pathname}?${params.toString()}`)
                    }}
                    disabled={currentPage >= totalPages}
                    className='ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50'>
                    下一页
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 列表模式：仅显示单词和基础操作 */}
      {viewMode === 'list' && (
        <div className='grid min-h-[56vh] auto-rows-min content-start items-start grid-cols-1 gap-4 xl:grid-cols-2'>
          {visibleList.map((vocab, idx) => (
            <div
              key={vocab.id}
              onClick={() => {
                if (isEditMode) return // 编辑模式下不跳转
                const nextIndex = flashList.findIndex(
                  item => item.id === vocab.id,
                )
                setCurrentIndex(nextIndex >= 0 ? nextIndex : idx)
                setViewMode('flashcard')
              }}
              className={`relative rounded-2xl border border-gray-200/80 bg-white/95 p-4 shadow-sm transition-[background-color,border-color,color,box-shadow,transform] hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg ${
                isEditMode ? 'pr-36 border-indigo-200 bg-indigo-50/30' : ''
              }`}>
              {isEditMode && (
                <div className='absolute bottom-3 right-3'>
                  <input
                    type='checkbox'
                    checked={selectedVocabIds.has(vocab.id)}
                    onChange={e => {
                      e.stopPropagation()
                      const newSet = new Set(selectedVocabIds)
                      if (e.target.checked) {
                        newSet.add(vocab.id)
                        // 检查是否全选
                        if (newSet.size === visibleList.length) {
                          setIsSelectAllChecked(true)
                        }
                      } else {
                        newSet.delete(vocab.id)
                        setIsSelectAllChecked(false)
                      }
                      setSelectedVocabIds(newSet)
                    }}
                    className='w-5 h-5 rounded border-gray-300 cursor-pointer accent-indigo-600'
                  />
                </div>
              )}
              <div className='flex items-start gap-3'>
                <div className='min-w-0'>
                  <WordPronunciation
                    word={vocab.word}
                    pronunciation={getPrimaryPronunciation(vocab)}
                    pronunciations={vocab.pronunciations || []}
                    showPronunciation={shouldShowPronunciationForVocab(vocab)}
                    wordClassName='text-2xl font-black text-slate-800 tracking-tight'
                    hintClassName='text-xs font-bold text-gray-500 mt-1'
                  />
                  {vocab.wordAudio && (
                    <button
                      type='button'
                      onClick={event => {
                        event.stopPropagation()
                        playAudioFile(vocab.wordAudio)
                      }}
                      className='mt-1 inline-flex h-6 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700'>
                      发音
                    </button>
                  )}
                  {vocab.folderName && (
                    <div className='mt-1.5'>
                      <span className='inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700'>
                        收藏夹:{' '}
                        {vocab.folderId
                          ? folderPathLabelMap[vocab.folderId] ||
                            vocab.folderName
                          : vocab.folderName}
                      </span>
                    </div>
                  )}
                  {!isEditMode && renderWordPosLine(vocab)}

                  {vocab.tags && vocab.tags.length > 0 && (
                    <div className='mt-3 flex flex-wrap gap-1.5'>
                      {vocab.tags.slice(0, 6).map(tag => (
                        <span
                          key={`${vocab.id}-tag-${tag}`}
                          className='inline-flex items-center rounded-full border border-slate-200/90 bg-gradient-to-b from-white to-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {isEditMode && (
                    <div className='mt-3 flex flex-wrap items-center gap-2'>
                      <button
                        type='button'
                        onClick={event => {
                          event.stopPropagation()
                          if (activeTagEditorId === vocab.id) {
                            closeTagEditor()
                            return
                          }
                          openTagEditor(vocab)
                        }}
                        className={`inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                          activeTagEditorId === vocab.id
                            ? 'bg-slate-900 text-white shadow-md'
                            : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:text-indigo-700'
                        }`}>
                        {activeTagEditorId === vocab.id
                          ? '收起标签'
                          : '添加标签'}
                      </button>
                    </div>
                  )}
                  {vocab.meanings && vocab.meanings.length > 0 && (
                    <div className='mt-2 space-y-1'>
                      {vocab.meanings.slice(0, 2).map((meaning, meaningIdx) => (
                        <div
                          key={`${vocab.id}-list-meaning-${meaning}-${meaningIdx}`}
                          className='flex items-start gap-1.5 text-[11px] font-semibold text-emerald-700'>
                          <span className='mt-[1px] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-100 px-1 text-[10px] font-bold text-emerald-800'>
                            {meaningIdx + 1}
                          </span>
                          <span className='leading-4'>{meaning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isEditMode && (
                    <div className='mt-1.5 flex flex-wrap gap-1.5'>
                      {(vocab.partsOfSpeech || []).slice(0, 6).map(pos => (
                        <button
                          key={`${vocab.id}-list-pos-${pos}`}
                          type='button'
                          onClick={e => {
                            e.stopPropagation()
                            void handleToggleWordPos(vocab, pos)
                          }}
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-bold transition-colors ${posBadgeClass(pos)} hover:brightness-95`}>
                          {pos}
                        </button>
                      ))}
                      {getPosOptions(vocab.word, vocab.sentences[0]?.text || '')
                        .filter(
                          option =>
                            !(vocab.partsOfSpeech || []).includes(option),
                        )
                        .slice(0, 6)
                        .map(option => (
                          <button
                            key={`${vocab.id}-list-pos-add-${option}`}
                            type='button'
                            onClick={e => {
                              e.stopPropagation()
                              void handleToggleWordPos(vocab, option)
                            }}
                            className='rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600 transition-colors hover:bg-gray-50'>
                            {option}
                          </button>
                        ))}
                    </div>
                  )}
                  {vocab.pronunciations &&
                    vocab.pronunciations.filter(Boolean).length > 1 &&
                    shouldShowPronunciationForVocab(vocab) && (
                      <div className='mt-1.5 flex flex-wrap gap-1'>
                        {vocab.pronunciations.slice(1).map(pron => (
                          <span
                            key={`${vocab.id}-list-pron-${pron}`}
                            className='rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-500'>
                            {pron}
                          </span>
                        ))}
                      </div>
                    )}
                  {(() => {
                    const family = inflectionByWordId.get(vocab.id)
                    if (!family) return null
                    const expanded = !!expandedInflectionIds[vocab.id]
                    return (
                      <div className='mt-2'>
                        <button
                          type='button'
                          onClick={e => {
                            e.stopPropagation()
                            toggleInflectionExpand(vocab.id)
                          }}
                          className='inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-100'>
                          原形 {family.lemma}
                          <span className='text-slate-400'>·</span>
                          覆盖 {family.coveredVariants}/{family.totalVariants}
                        </button>
                        {expanded && (
                          <div className='mt-1.5 flex flex-wrap gap-1.5'>
                            {family.variants.map(variant => (
                              <span
                                key={`${vocab.id}-list-family-${variant.word}`}
                                className='inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500'>
                                <span>{variant.word}</span>
                                <span className='text-slate-400'>
                                  {variant.sentenceHits}/
                                  {Math.max(variant.sentenceTotal, 1)}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {isEditMode && activeTagEditorId === vocab.id && (
                <div
                  onClick={event => event.stopPropagation()}
                  className='mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-inner'>
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
                      {(vocab.tags || []).length > 0 && (
                        <span className='rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500'>
                          当前 {vocab.tags?.length || 0} 个
                        </span>
                      )}
                    </div>

                    <textarea
                      value={tagDraft}
                      onChange={event => setTagDraft(event.currentTarget.value)}
                      rows={3}
                      placeholder='例如：高频 / 书面语 / 易错'
                      className='w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100'
                    />

                    {splitListInput(tagDraft).length > 0 && (
                      <div className='flex flex-wrap gap-1.5'>
                        {splitListInput(tagDraft).map(tag => (
                          <span
                            key={`${vocab.id}-draft-${tag}`}
                            className='inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700'>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className='flex justify-end gap-2'>
                      <button
                        type='button'
                        onClick={closeTagEditor}
                        className='rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50'>
                        取消
                      </button>
                      <button
                        type='button'
                        disabled={isSavingTags}
                        onClick={() => void handleSaveTagsForVocab(vocab)}
                        className='rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60'>
                        {isSavingTags ? '保存中...' : '保存标签'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isEditMode && (
                <div className='absolute right-3 top-3 flex items-center gap-2'>
                  <div className='relative'>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        if (activePronEditId === vocab.id) {
                          setActivePronEditId(null)
                          return
                        }
                        handleOpenPronEditor(vocab)
                      }}
                      className={`p-2 rounded-lg transition-colors ${activePronEditId === vocab.id ? 'text-indigo-600 bg-indigo-50' : 'text-gray-300 hover:text-indigo-600'}`}>
                      注
                    </button>

                    {activePronEditId === vocab.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className='absolute right-0 bottom-full mb-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-30'>
                        <div className='text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider'>
                          编辑注音/音标
                        </div>
                        <input
                          autoFocus
                          value={pronInput}
                          onChange={e => setPronInput(e.currentTarget.value)}
                          placeholder='例如：言:い い 訳:わけ / にん げん（或 にん|げん） / ˈlæŋɡwɪdʒ'
                          className='w-full px-3 py-2 text-sm bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 text-gray-800'
                        />
                        <p className='mt-1 px-1 text-[10px] text-gray-400'>
                          日语支持「汉字:读音 + 原文段」（如 言:い い
                          訳:わけ），也兼容空格或 | 拆分（如 にん
                          げん）；外来语通常不需要拆分
                        </p>
                        <div className='mt-2 flex justify-end'>
                          <button
                            onClick={() => handleSavePronunciation(vocab)}
                            className='text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700'>
                            保存
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 🌟 简易移动分组弹出层 */}
                  <div className='relative'>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setActiveMoveId(null)
                        setActivePronEditId(null)
                        setActiveFolderEditId(
                          activeFolderEditId === vocab.id ? null : vocab.id,
                        )
                      }}
                      className={`p-2 rounded-lg transition-colors ${activeFolderEditId === vocab.id ? 'text-indigo-700 bg-indigo-50' : 'text-gray-300 hover:text-indigo-700'}`}>
                      夹
                    </button>
                    {activeFolderEditId === vocab.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className='absolute right-0 bottom-full mb-2 w-56 rounded-2xl border border-gray-100 bg-white p-2 shadow-2xl z-30'>
                        <div className='text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider'>
                          收藏夹
                        </div>
                        <div className='relative'>
                          <select
                            value={vocab.folderId || 'none'}
                            onChange={event => {
                              void handleAssignFolder(
                                vocab.id,
                                event.currentTarget.value,
                              )
                              setActiveFolderEditId(null)
                            }}
                            className='h-10 w-full appearance-none rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 px-3 pr-8 text-sm font-semibold text-gray-700 shadow-sm outline-none transition-[background-color,border-color,color,box-shadow] hover:border-gray-300 hover:shadow focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'>
                            <option value='none'>不收藏</option>
                            {flatFolders.map(folder => (
                              <option
                                key={`folder-option-${vocab.id}-${folder.id}`}
                                value={folder.id}>
                                {folder.pathLabel}
                              </option>
                            ))}
                          </select>
                          <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-gray-400'>
                            ▾
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className='relative'>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setActivePronEditId(null)
                        setActiveFolderEditId(null)
                        setActiveMoveId(
                          activeMoveId === vocab.id ? null : vocab.id,
                        )
                      }}
                      className={`p-2 rounded-lg transition-colors ${activeMoveId === vocab.id ? 'text-indigo-600 bg-indigo-50' : 'text-gray-300 hover:text-indigo-600'}`}>
                      <svg
                        className='w-5 h-5'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'>
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2}
                          d='M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4'
                        />
                      </svg>
                    </button>

                    {activeMoveId === vocab.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className='absolute right-0 bottom-full mb-2 w-48 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200'>
                        <div className='text-[10px] font-bold text-gray-400 px-3 py-1 uppercase tracking-wider'>
                          移动至
                        </div>
                        {allExistingGroups
                          .filter(g => g !== activeTab)
                          .map(g => (
                            <button
                              key={g}
                              onClick={() =>
                                handleMoveGroup(vocab.id, activeTab, g)
                              }
                              className='w-full text-left px-3 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors'>
                              {LANG_NAMES[g] || g}
                            </button>
                          ))}
                        <div className='mt-2 pt-2 border-t border-gray-50'>
                          <input
                            autoFocus
                            placeholder='新分组...'
                            className='w-full px-3 py-2 text-sm bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 mb-1'
                            value={newGroupInput}
                            onChange={e => setNewGroupInput(e.target.value)}
                            onKeyDown={e =>
                              e.key === 'Enter' &&
                              handleMoveGroup(
                                vocab.id,
                                activeTab,
                                newGroupInput,
                              )
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div onClick={e => e.stopPropagation()}>
                    <InlineConfirmAction
                      message='删除后不可恢复，确认删除吗？'
                      onConfirm={() => handleDelete(activeTab, vocab.id)}
                      triggerLabel='删'
                      confirmLabel='确认删除'
                      pendingLabel='删除中...'
                      triggerClassName='rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50'
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
          {visibleList.length === 0 && (
            <div className='col-span-full rounded-2xl border border-dashed border-gray-200 bg-white py-12 text-center text-sm font-medium text-gray-500'>
              当前筛选条件下没有词条
            </div>
          )}
        </div>
      )}

      {/* 沉浸模式：详细例句与背诵 */}
      {viewMode === 'flashcard' && currentFlashVocab && (
        <div className='animate-in fade-in zoom-in-95 duration-300'>
          <div
            onPointerDown={handleFlashCardPointerDown}
            onPointerMove={handleFlashCardPointerMove}
            onPointerUp={handleFlashCardPointerEnd}
            onPointerCancel={handleFlashCardPointerEnd}
            className='relative flex min-h-[calc(100vh-210px)] w-full flex-col rounded-[2rem] border border-gray-200 bg-white p-5 md:p-7 transition-[transform,opacity] duration-220 ease-out'
            style={{
              transform: `translateX(${dragOffsetX + cardTransitionOffset}px)`,
              opacity: cardTransitionOpacity,
            }}>
            <div className='mb-4 flex justify-end items-center'>
              {isEditMode && (
                <div className='flex gap-3 relative'>
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
                        setActiveMoveId(null)
                        setActiveFolderEditId(null)
                        handleOpenPronEditor(current)
                      }}
                      className={`text-xs font-bold px-4 py-2 rounded-xl transition-colors ${activePronEditId === currentFlashVocab.id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 bg-gray-50'}`}>
                      注音
                    </button>
                    {activePronEditId === currentFlashVocab.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className='absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-50 text-left'>
                        <div className='text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider'>
                          编辑注音/音标
                        </div>
                        <input
                          autoFocus
                          value={pronInput}
                          onChange={e => setPronInput(e.currentTarget.value)}
                          placeholder='例如：言:い い 訳:わけ / にん げん（或 にん|げん） / ˈlæŋɡwɪdʒ'
                          className='w-full px-3 py-2 text-sm bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 text-gray-800'
                        />
                        <p className='mt-1 px-1 text-[10px] text-gray-400'>
                          日语支持「汉字:读音 + 原文段」（如 言:い い
                          訳:わけ），也兼容空格或 | 拆分（如 にん
                          げん）；外来语通常不需要拆分
                        </p>
                        <div className='mt-2 flex justify-end'>
                          <button
                            onClick={() =>
                              handleSavePronunciation(currentFlashVocab)
                            }
                            className='text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700'>
                            保存
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* 🌟 修复：加上 relative 容器和气泡菜单 UI */}
                  <div className='relative'>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setActivePronEditId(null)
                        setActiveFolderEditId(null)
                        setActiveMoveId(
                          activeMoveId === currentFlashVocab.id
                            ? null
                            : currentFlashVocab.id,
                        )
                      }}
                      className={`text-xs font-bold px-4 py-2 rounded-xl transition-colors ${activeMoveId === currentFlashVocab.id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 bg-gray-50'}`}>
                      移动
                    </button>

                    {/* 闪卡模式的专属下拉菜单 */}
                    {activeMoveId === currentFlashVocab.id && (
                      <div
                        onClick={e => e.stopPropagation()}
                        className='absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200 text-left'>
                        <div className='text-[10px] font-bold text-gray-400 px-3 py-1 uppercase tracking-wider'>
                          移动至
                        </div>
                        {allExistingGroups
                          .filter(g => g !== activeTab)
                          .map(g => (
                            <button
                              key={g}
                              onClick={() =>
                                handleMoveGroup(
                                  currentFlashVocab.id,
                                  activeTab,
                                  g,
                                )
                              }
                              className='w-full text-left px-3 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors'>
                              {LANG_NAMES[g] || g}
                            </button>
                          ))}
                        <div className='mt-2 pt-2 border-t border-gray-50'>
                          <input
                            autoFocus
                            placeholder='新分组...'
                            className='w-full px-3 py-2 text-sm bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 mb-1 text-gray-800'
                            value={newGroupInput}
                            onChange={e => setNewGroupInput(e.target.value)}
                            onKeyDown={e =>
                              e.key === 'Enter' &&
                              handleMoveGroup(
                                currentFlashVocab.id,
                                activeTab,
                                newGroupInput,
                              )
                            }
                          />
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

            <div className='mb-3 pb-3 text-center'>
              <WordPronunciation
                word={currentFlashVocab.word}
                pronunciation={getPrimaryPronunciation(currentFlashVocab)}
                pronunciations={currentFlashVocab.pronunciations || []}
                showPronunciation={shouldShowPronunciationForVocab(
                  currentFlashVocab,
                )}
                wordClassName='text-4xl md:text-6xl font-black text-slate-800 mb-1'
                hintClassName='text-xs md:text-sm font-bold text-gray-500'
              />
              {currentFlashVocab.wordAudio && (
                <div className='mt-2'>
                  <button
                    type='button'
                    onClick={event => {
                      event.stopPropagation()
                      playAudioFile(currentFlashVocab.wordAudio)
                    }}
                    className='inline-flex h-8 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800'>
                    发音
                  </button>
                </div>
              )}
              {currentFlashVocab.folderName && (
                <div className='mt-3'>
                  <span className='inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600'>
                    收藏夹:{' '}
                    {currentFlashVocab.folderId
                      ? folderPathLabelMap[currentFlashVocab.folderId] ||
                        currentFlashVocab.folderName
                      : currentFlashVocab.folderName}
                  </span>
                </div>
              )}
              {currentFlashVocab.tags && currentFlashVocab.tags.length > 0 && (
                <div className='mt-2 flex flex-wrap items-center justify-center gap-1.5'>
                  {currentFlashVocab.tags.slice(0, 8).map(tag => (
                    <span
                      key={`${currentFlashVocab.id}-flash-tag-${tag}`}
                      className='inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600'>
                      #{tag}
                    </span>
                  ))}
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
                    className={`inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                      activeTagEditorId === currentFlashVocab.id
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:text-indigo-700'
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
                  className='mx-auto mt-3 max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-inner text-left'>
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
                        <span className='rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500'>
                          当前 {currentFlashVocab.tags?.length || 0} 个
                        </span>
                      )}
                    </div>

                    <textarea
                      value={tagDraft}
                      onChange={event => setTagDraft(event.currentTarget.value)}
                      rows={3}
                      placeholder='例如：高频 / 书面语 / 易错'
                      className='w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100'
                    />

                    {splitListInput(tagDraft).length > 0 && (
                      <div className='flex flex-wrap gap-1.5'>
                        {splitListInput(tagDraft).map(tag => (
                          <span
                            key={`${currentFlashVocab.id}-flash-draft-${tag}`}
                            className='inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700'>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className='flex justify-end gap-2'>
                      <button
                        type='button'
                        onClick={closeTagEditor}
                        className='rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50'>
                        取消
                      </button>
                      <button
                        type='button'
                        disabled={isSavingTags}
                        onClick={() =>
                          void handleSaveTagsForVocab(currentFlashVocab)
                        }
                        className='rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60'>
                        {isSavingTags ? '保存中...' : '保存标签'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {shouldShowPronunciationForVocab(currentFlashVocab) &&
                currentFlashVocab.pronunciations &&
                currentFlashVocab.pronunciations.filter(Boolean).length > 1 && (
                  <div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
                    {currentFlashVocab.pronunciations.slice(1).map(pron => (
                      <span
                        key={`${currentFlashVocab.id}-flash-pron-${pron}`}
                        className='rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600'>
                        {pron}
                      </span>
                    ))}
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
                      className='inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100'>
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
                              className='inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
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
                          className='rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50'>
                          {option}
                        </button>
                      ))}
                </div>
              )}
            </div>

            {memoryMode && !memoryReveal && (
              <div className='mt-3 border-t border-gray-100 pt-4 text-center text-sm font-semibold text-slate-500'>
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
                  <div className='flex-1 min-h-0 space-y-4 pt-2'>
                    {hasMeanings && (
                      <section className='min-h-0 border-t border-gray-100 pt-2'>
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
                                className={`w-full px-1 py-4 text-left transition-colors last:border-b-0 ${
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
                                              className='pt-1 text-xs font-medium leading-relaxed text-gray-800'>
                                              <div className='text-[14px] leading-relaxed text-slate-700'>
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
                                                            ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
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
                                                  </div>
                                                )}
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
                      </section>
                    )}

                    {unmatchedEntries.length > 0 && (
                      <section className='min-h-0 border-t border-gray-100 pt-2'>
                        <div className='max-h-[42vh] overflow-auto pr-1'>
                          {unmatchedEntries.map(({ sent: sentObj, idx: i }) => (
                            <div
                              role='button'
                              tabIndex={0}
                              key={`${currentVocab.id}-sentence-${i}`}
                              draggable
                              onClick={() =>
                                setPendingSentenceIndex(prev =>
                                  prev === i ? null : i,
                                )
                              }
                              onKeyDown={event => {
                                if (
                                  event.key !== 'Enter' &&
                                  event.key !== ' '
                                ) {
                                  return
                                }
                                event.preventDefault()
                                setPendingSentenceIndex(prev =>
                                  prev === i ? null : i,
                                )
                              }}
                              onDragStart={event => {
                                event.dataTransfer.setData(
                                  'application/json',
                                  JSON.stringify({
                                    vocabId: currentVocab.id,
                                    sentenceIndex: i,
                                  }),
                                )
                                event.dataTransfer.effectAllowed = 'move'
                              }}
                              className={`w-full text-left px-1 py-4 relative transition-colors last:border-b-0 ${
                                pendingSentenceIndex === i
                                  ? 'bg-slate-100/70'
                                  : 'bg-transparent'
                              }`}>
                              <div className='mb-2 flex flex-wrap items-center gap-2'>
                                {isEditMode && (
                                  <span className='text-[10px] font-bold uppercase tracking-wider text-gray-400'>
                                    可拖拽
                                  </span>
                                )}
                                {isEditMode && pendingSentenceIndex === i && (
                                  <span className='rounded-lg border border-slate-300 bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700'>
                                    已选中，点击右侧释义完成匹配
                                  </span>
                                )}
                              </div>
                              <div className='text-lg text-gray-700 leading-relaxed font-medium'>
                                {renderSentenceWithPronunciation(
                                  sentObj,
                                  currentVocab,
                                )}
                              </div>
                              {renderSentenceTranslation(sentObj)}
                              {renderSentenceMetaRow(currentVocab, sentObj)}
                              {isEditMode && (
                                <div className='mt-2 flex flex-wrap gap-1.5'>
                                  {getPosOptions(
                                    currentVocab.word,
                                    sentObj.text,
                                  ).map(option => {
                                    const active = sentencePosTagsFromItem(
                                      currentVocab,
                                      sentObj,
                                    ).includes(option)
                                    return (
                                      <button
                                        key={`${currentVocab.id}-sent-${i}-pos-option-${option}`}
                                        type='button'
                                        onClick={event => {
                                          event.stopPropagation()
                                          handleToggleSentencePosTag(
                                            currentVocab.id,
                                            i,
                                            option,
                                          )
                                        }}
                                        className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                          active
                                            ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                        }`}>
                                        {option}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )
              })()}

              <button
                onClick={() =>
                  handleSearchSentences(
                    currentFlashVocab.id,
                    currentFlashVocab.word,
                  )
                }
                className='w-full py-3 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-700'>
                {searchingId === currentFlashVocab.id ? '收起' : '更多例句'}
              </button>

              {/* 搜索结果 */}
              {searchingId === currentFlashVocab.id && (
                <div className='mt-4 space-y-3 max-h-60 overflow-y-auto pr-2'>
                  {isSearchingMore && (
                    <div className='py-3 text-sm text-slate-400'>
                      正在搜索例句...
                    </div>
                  )}
                  {!isSearchingMore &&
                    (searchResults[currentFlashVocab.id] || []).length ===
                      0 && (
                      <div className='py-3 text-sm text-slate-400'>
                        未找到可追加例句
                      </div>
                    )}
                  {(searchResults[currentFlashVocab.id] || []).map(
                    (sentObj, idx) => {
                      const isAdded = currentFlashVocab.sentences.some(
                        (s: SentenceItem) => s.text === sentObj.text,
                      )
                      return (
                        <div
                          key={`${currentFlashVocab.id}-search-sent-${sentObj.sourceUrl || 'unknown'}-${sentObj.text}-${idx}`}
                          className={`p-4 rounded-2xl border flex flex-col gap-3 transition-[background-color,border-color,color,opacity] ${isAdded ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                          <div className='text-[11px] text-slate-400 font-medium'>
                            {getSentenceSourceDisplay(sentObj)}
                          </div>
                          <div className='text-sm text-slate-700 font-medium'>
                            {sentObj.text}
                          </div>
                          {!isAdded && (
                            <button
                              onClick={() =>
                                handleAddSentence(
                                  activeTab,
                                  currentFlashVocab.id,
                                  sentObj,
                                )
                              }
                              className='self-end rounded-xl border border-slate-300 bg-slate-700 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800'>
                              追加例句
                            </button>
                          )}
                        </div>
                      )
                    },
                  )}
                </div>
              )}
            </div>

            {memoryMode && (
              <div
                className={`mt-auto grid grid-cols-2 gap-2 border-t border-gray-100 pt-4 md:grid-cols-4 ${
                  isSubmittingRating ? 'pointer-events-none opacity-55' : ''
                }`}>
                {(
                  [
                    { rating: Rating.Again, label: '忘了' },
                    { rating: Rating.Hard, label: '吃力' },
                    { rating: Rating.Good, label: '记住' },
                    { rating: Rating.Easy, label: '秒答' },
                  ] as const
                ).map(item => {
                  const selected = pendingMemoryRating === item.rating
                  return (
                    <button
                      key={`memory-rate-${item.rating}`}
                      type='button'
                      onClick={() => void handleMemoryRateTap(item.rating)}
                      className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors ${
                        selected
                          ? 'border-indigo-300 bg-indigo-100 text-indigo-700'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}>
                      {item.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {!memoryMode && (
            <div className='mt-4 flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white p-2'>
              <button
                onClick={goPrevCard}
                disabled={currentIndex === 0 || cardTransitionState !== 'idle'}
                className='inline-flex min-w-28 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm disabled:opacity-40 hover:bg-gray-100'>
                上一张
              </button>
              <div className='px-2 text-xs font-bold text-gray-400'>
                可左右拖拽切换
              </div>
              <button
                onClick={goNextCard}
                disabled={
                  currentIndex === flashList.length - 1 ||
                  cardTransitionState !== 'idle'
                }
                className='inline-flex min-w-28 items-center justify-center rounded-xl border border-slate-300 bg-slate-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40 hover:bg-slate-800'>
                下一张
              </button>
            </div>
          )}

          <div className='mt-6 flex flex-col items-center gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-500'>
            <div className='flex items-center p-1.5 bg-gray-100/90 backdrop-blur-xl border border-gray-200/50 rounded-2xl shadow-sm overflow-x-auto max-w-full scrollbar-hide'>
              {allExistingGroups.map(name => {
                const isActive = activeTab === name;
                return (
                  <button
                    key={name}
                    onClick={() => {
                      setActiveTab(name)
                      setCurrentIndex(0)
                    }}
                    className={`relative flex items-center justify-center gap-1.5 px-5 py-2.5 min-w-[5rem] rounded-xl text-sm font-bold transition-all duration-300 whitespace-nowrap ${
                      isActive
                        ? 'bg-white text-indigo-600 shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-black/5'
                        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200/50'
                    }`}>
                    {LANG_NAMES[name] || name}
                    <span
                      className={`text-[10px] font-black px-1.5 py-0.5 rounded-md transition-colors ${
                        isActive ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-200/80 text-gray-400'
                      }`}>
                      {groupedTotals[name] || 0}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              type='button'
              onClick={() => void handleRenameGroup()}
              className='text-[11px] font-bold text-gray-400 hover:text-gray-600 transition-colors bg-white/50 border border-gray-200/50 px-3 py-1 rounded-full'
            >
              重命名组: {LANG_NAMES[activeTab] || activeTab}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
