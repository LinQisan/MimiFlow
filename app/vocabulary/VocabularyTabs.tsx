// app/vocabulary/VocabularyTabs.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  assignVocabularyFolder,
  createVocabularyFolder,
  deleteVocabulary,
  searchSentencesForWord,
  addVocabularySentence,
  moveVocabularyToGroup,
  updateVocabularyPronunciationById,
  assignVocabularySentenceMeaning,
  clearVocabularySentenceMeaning,
  updateVocabularySentence,
  deleteVocabularySentence,
  updateVocabularyPartsOfSpeechById,
  updateVocabularySentencePosTags,
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
  if (sentence.sourceUrl.startsWith('/quizzes/')) return '题目'
  if (sentence.sourceUrl.startsWith('/articles/')) return '文章'
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
        className='flex h-10 w-full items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 px-3 text-sm font-semibold text-gray-700 shadow-sm outline-none transition-all hover:border-gray-300 hover:shadow focus-visible:border-indigo-300 focus-visible:ring-2 focus-visible:ring-indigo-100'>
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
  folders,
}: {
  groupedData: Record<string, VocabItem[]>
  folders: FolderItem[]
}) {
  const dialog = useDialog()
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
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const [sortMode, setSortMode] = useState<'recent' | 'word' | 'pos'>('recent')
  const [selectedPosFilter, setSelectedPosFilter] = useState('all')
  const [selectedFolderFilter, setSelectedFolderFilter] = useState('all')
  const [folderList, setFolderList] = useState(folders)

  // 🌟 轻量级分组移动控制
  const [activeMoveId, setActiveMoveId] = useState<string | null>(null)
  const [newGroupInput, setNewGroupInput] = useState('')
  const [activePronEditId, setActivePronEditId] = useState<string | null>(null)
  const [pronInput, setPronInput] = useState('')
  const [activeFolderEditId, setActiveFolderEditId] = useState<string | null>(
    null,
  )
  const [dragOffsetX, setDragOffsetX] = useState(0)
  const [cardTransitionState, setCardTransitionState] = useState<
    'idle' | 'leaving' | 'entering'
  >('idle')
  const [cardTransitionDirection, setCardTransitionDirection] = useState<
    'next' | 'prev'
  >('next')
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

  const handleCreateFolder = async () => {
    const nextName = await dialog.prompt('收藏夹名称', {
      title: '新建收藏夹',
      defaultValue: '',
      confirmText: '创建',
    })
    if (nextName == null) return
    const trimmed = nextName.trim()
    if (!trimmed) {
      dialog.toast('收藏夹名称不能为空', { tone: 'error' })
      return
    }
    const result = await createVocabularyFolder(trimmed)
    if (!result.success || !result.folder) {
      dialog.toast(result.message || '创建失败', { tone: 'error' })
      return
    }
    setFolderList(prev => [...prev, result.folder])
    dialog.toast('收藏夹已创建', { tone: 'success' })
  }

  const handleAssignFolder = async (vocabId: string, folderId: string) => {
    const nextFolderId = folderId === 'none' ? null : folderId
    const nextFolderName =
      nextFolderId == null
        ? null
        : folderList.find(item => item.id === nextFolderId)?.name || null
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
  const allExistingGroups = Object.keys(localData).filter(
    g => localData[g].length > 0,
  )

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
    }
    if (activeMoveId || activePronEditId || activeFolderEditId)
      window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [activeMoveId, activePronEditId, activeFolderEditId])

  useEffect(() => {
    setPendingSentenceIndex(null)
  }, [activeTab, currentIndex, viewMode])

  useEffect(() => {
    if (!isEditMode) {
      setActiveMoveId(null)
      setActivePronEditId(null)
      setActiveFolderEditId(null)
      setPendingSentenceIndex(null)
    }
  }, [isEditMode])

  useEffect(() => {
    setSelectedPosFilter('all')
    setSelectedFolderFilter('all')
    setCurrentIndex(0)
  }, [activeTab])

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
    const canPlay = canPlaySentenceAudio(vocab, sentence)
    const sourceClass =
      'inline-flex h-5 items-center text-[12px] font-medium leading-5 text-slate-400'
    const divider = (
      <span className='inline-flex h-5 items-center text-[12px] leading-5 text-slate-300'>
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
              className={`${sourceClass} underline-offset-2 hover:text-slate-600 hover:underline`}>
              {sourceText}
            </Link>
          ) : (
            <span className={sourceClass}>{sourceText}</span>
          ))}
        {sentencePos && (
          <>
            {hasSource && divider}
            <span className='inline-flex h-5 items-center text-[12px] font-medium leading-5 text-slate-400'>
              {sentencePos}
            </span>
          </>
        )}
        {canPlay && (
          <>
            {(hasSource || sentencePos) && divider}
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
              className='inline-flex h-5 items-center text-[12px] font-medium leading-5 text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline'>
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
      <p className='mt-1.5 text-[14px] leading-relaxed text-slate-500'>
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
    <div className='max-w-7xl mx-auto'>
      {/* 头部导航 */}
      <div className={viewMode === 'flashcard' ? 'mb-3' : 'mb-6'}>
        <div
          className={`flex w-full flex-wrap gap-2 overflow-x-auto border-b border-gray-200 pb-3 scrollbar-hide ${
            viewMode === 'flashcard' ? 'mb-2' : 'mb-3'
          }`}>
          {allExistingGroups.map(name => (
            <button
              key={name}
              onClick={() => {
                setActiveTab(name)
                setCurrentIndex(0)
                setViewMode('list')
              }}
              className={`rounded-full font-bold whitespace-nowrap transition-all ${
                viewMode === 'flashcard' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'
              } ${
                activeTab === name
                  ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {LANG_NAMES[name] || name}
              <span className='ml-1 opacity-75'>
                ({localData[name].length})
              </span>
            </button>
          ))}
        </div>

        <div className='space-y-2 border-b border-gray-200 pb-3'>
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
                  onChange={setSelectedFolderFilter}
                  className='w-full'
                  options={[
                    { value: 'all', label: '全部收藏夹' },
                    { value: 'none', label: '未收藏' },
                    ...folderList.map(folder => ({
                      value: folder.id,
                      label: folder.name,
                    })),
                  ]}
                />
                <button
                  type='button'
                  onClick={handleCreateFolder}
                  className='h-10 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-sm font-bold text-indigo-700 transition-colors hover:bg-indigo-100'>
                  新建收藏夹
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 列表模式：仅显示单词和基础操作 */}
      {viewMode === 'list' && (
        <div className='grid grid-cols-1 xl:grid-cols-2 gap-4'>
          {visibleList.map((vocab, idx) => (
            <div
              key={vocab.id}
              onClick={() => {
                const nextIndex = flashList.findIndex(
                  item => item.id === vocab.id,
                )
                setCurrentIndex(nextIndex >= 0 ? nextIndex : idx)
                setViewMode('flashcard')
              }}
              className='bg-white/95 p-5 rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-indigo-200 cursor-pointer flex items-center justify-between group transition-all'>
              <div className='flex items-center gap-4'>
                <div>
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
                      播放发音
                    </button>
                  )}
                  {vocab.wordAudio && (
                    <div className='mt-1.5'>
                      <button
                        type='button'
                        onClick={e => {
                          e.stopPropagation()
                          playAudioFile(vocab.wordAudio)
                        }}
                        className='inline-flex h-6 items-center rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700'>
                        发音
                      </button>
                    </div>
                  )}
                  {vocab.folderName && (
                    <div className='mt-1'>
                      <span className='inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700'>
                        收藏夹: {vocab.folderName}
                      </span>
                    </div>
                  )}
                  {vocab.meanings && vocab.meanings.length > 0 && (
                    <div className='mt-2 space-y-1.5'>
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
                  <div className='mt-2 flex flex-wrap gap-1.5'>
                    {(vocab.partsOfSpeech || []).slice(0, 3).map(pos => (
                      <button
                        key={`${vocab.id}-list-pos-${pos}`}
                        type='button'
                        onClick={e => {
                          e.stopPropagation()
                          if (!isEditMode) return
                          void handleToggleWordPos(vocab, pos)
                        }}
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-bold transition-colors ${posBadgeClass(pos)} ${
                          isEditMode ? 'hover:brightness-95' : ''
                        }`}>
                        {pos}
                      </button>
                    ))}
                    {isEditMode &&
                      getPosOptions(vocab.word, vocab.sentences[0]?.text || '')
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
                </div>
              </div>

              {isEditMode && (
                <div className='flex items-center gap-2 relative'>
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
                          placeholder='例如：にん げん（或 にん|げん） / ˈlæŋɡwɪdʒ'
                          className='w-full px-3 py-2 text-sm bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 text-gray-800'
                        />
                        <p className='mt-1 px-1 text-[10px] text-gray-400'>
                          日语可用空格或 | 拆分读音（如 人間: にん
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
                            className='h-10 w-full appearance-none rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 px-3 pr-8 text-sm font-semibold text-gray-700 shadow-sm outline-none transition-all hover:border-gray-300 hover:shadow focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'>
                            <option value='none'>不收藏</option>
                            {folderList.map(folder => (
                              <option
                                key={`folder-option-${vocab.id}-${folder.id}`}
                                value={folder.id}>
                                {folder.name}
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
                      className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${activePronEditId === currentFlashVocab.id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 bg-gray-50'}`}>
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
                          placeholder='例如：にん げん（或 にん|げん） / ˈlæŋɡwɪdʒ'
                          className='w-full px-3 py-2 text-sm bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 text-gray-800'
                        />
                        <p className='mt-1 px-1 text-[10px] text-gray-400'>
                          日语可用空格或 | 拆分读音（如 人間: にん
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
                      className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${activeMoveId === currentFlashVocab.id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 bg-gray-50'}`}>
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
                    triggerClassName='text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-xl transition-all'
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
                    收藏夹: {currentFlashVocab.folderName}
                  </span>
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
                            <button
                              type='button'
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
                                                  <button
                                                    type='button'
                                                    onClick={event => {
                                                      event.stopPropagation()
                                                      handleEditSentence(
                                                        currentVocab.id,
                                                        idx,
                                                      )
                                                    }}
                                                    className='text-[11px] font-bold text-gray-600 bg-white border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-100'>
                                                    编辑
                                                  </button>
                                                  <InlineConfirmAction
                                                    message='删除这条例句后不可恢复，确认删除吗？'
                                                    onConfirm={() =>
                                                      handleDeleteSentence(
                                                        currentVocab.id,
                                                        idx,
                                                      )
                                                    }
                                                    triggerLabel='删除'
                                                    confirmLabel='确认删除'
                                                    pendingLabel='删除中...'
                                                    triggerClassName='text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg hover:bg-rose-100'
                                                  />
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
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  )}

                  {unmatchedEntries.length > 0 && (
                    <section className='min-h-0 border-t border-gray-100 pt-2'>
                      <div className='max-h-[42vh] overflow-auto pr-1'>
                        {unmatchedEntries.map(({ sent: sentObj, idx: i }) => (
                          <button
                            type='button'
                            key={`${currentVocab.id}-sentence-${i}`}
                            draggable
                            onClick={() =>
                              setPendingSentenceIndex(prev =>
                                prev === i ? null : i,
                              )
                            }
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
                              {isEditMode && (
                                <>
                                  <button
                                    type='button'
                                    onClick={event => {
                                      event.stopPropagation()
                                      handleEditSentence(currentVocab.id, i)
                                    }}
                                    className='text-[11px] font-bold text-gray-600 bg-white border border-gray-200 px-3 py-1 rounded-lg hover:bg-gray-100'>
                                    编辑
                                  </button>
                                  <InlineConfirmAction
                                    message='删除这条例句后不可恢复，确认删除吗？'
                                    onConfirm={() =>
                                      handleDeleteSentence(currentVocab.id, i)
                                    }
                                    triggerLabel='删除'
                                    confirmLabel='确认删除'
                                    pendingLabel='删除中...'
                                    triggerClassName='text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1 rounded-lg hover:bg-rose-100'
                                  />
                                </>
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
                          </button>
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
                  (searchResults[currentFlashVocab.id] || []).length === 0 && (
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
                        key={idx}
                        className={`p-4 rounded-2xl border flex flex-col gap-3 transition-all ${isAdded ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
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
        </div>
      )}
    </div>
  )
}
