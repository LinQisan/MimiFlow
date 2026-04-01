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
import { useDialog } from '@/context/DialogContext'
import WordPronunciation from '@/components/WordPronunciation'
import InlineConfirmAction from '@/components/InlineConfirmAction'
import ToggleSwitch from '@/components/ToggleSwitch'
import { hasJapanese, useShowPronunciation } from '@/hooks/usePronunciationPrefs'
import { buildJapaneseRubyHtml } from '@/utils/japaneseRuby'
import {
  inferContextualPos,
  posBadgeClass,
  getPosOptions,
} from '@/utils/posTagger'

type SentenceItem = {
  text: string
  source: string
  sourceUrl: string
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
}

type FolderItem = {
  id: string
  name: string
}

const LANG_NAMES: Record<string, string> = {
  ja: '🇯🇵 日语',
  en: '🇺🇸 英语',
  ko: '🇰🇷 韩语',
  zh: '🇨🇳 中文',
  other: '📁 更多',
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
  const fromList = (vocab.pronunciations || []).map(item => item.trim()).find(Boolean)
  if (fromList) return fromList
  return (vocab.pronunciation || '').trim()
}

const normalizeLanguageCode = (value: string) => {
  const text = value.trim().toLowerCase()
  if (text === 'ja' || text.includes('日语') || text.includes('日本')) return 'ja'
  if (text === 'en' || text.includes('英语') || text.includes('english')) return 'en'
  if (text === 'ko' || text.includes('韩语') || text.includes('korean')) return 'ko'
  if (text === 'zh' || text.includes('中文') || text.includes('chinese')) return 'zh'
  return 'other'
}

const supportsPronunciationByLanguage = (languageCode?: string) =>
  languageCode === 'ja' || languageCode === 'en'

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
  const [activePosEditId, setActivePosEditId] = useState<string | null>(null)
  const [posInput, setPosInput] = useState('')
  const [activeFolderEditId, setActiveFolderEditId] = useState<string | null>(null)
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
  const [searchResults, setSearchResults] = useState<
    Record<string, SentenceItem[]>
  >({})
  const [pendingSentenceIndex, setPendingSentenceIndex] = useState<
    number | null
  >(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)

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
    setSearchingId(id)
    const res = await searchSentencesForWord(word)
    if (res.success) setSearchResults(prev => ({ ...prev, [id]: res.data }))
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

  const handleOpenPosEditor = (vocab: VocabItem) => {
    setActivePosEditId(vocab.id)
    const initial = (vocab.partsOfSpeech || []).length
      ? vocab.partsOfSpeech || []
      : vocab.partOfSpeech
        ? [vocab.partOfSpeech]
        : []
    setPosInput(initial.join('\n'))
  }

  const handleSavePos = async (vocab: VocabItem) => {
    const nextPos = splitListInput(posInput)
    const result = await updateVocabularyPartsOfSpeechById(vocab.id, nextPos)
    if (!result.success) {
      await dialog.alert(result.message || '词性保存失败')
      return
    }
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
    setActivePosEditId(null)
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
      await dialog.alert(result.message || '保存失败，请重试', { title: '保存失败' })
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

  const handleEditSentence = async (
    vocabId: string,
    sentenceIndex: number,
  ) => {
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
              sentences: item.sentences.filter((_, idx) => idx !== sentenceIndex),
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
  const allExistingGroups = Object.keys(localData).filter(
    g => localData[g].length > 0,
  )

  // 点击外部关闭移动菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMoveId(null)
      setActivePronEditId(null)
      setActivePosEditId(null)
      setActiveFolderEditId(null)
    }
    if (activeMoveId || activePronEditId || activePosEditId || activeFolderEditId)
      window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [activeMoveId, activePronEditId, activePosEditId, activeFolderEditId])

  useEffect(() => {
    setPendingSentenceIndex(null)
  }, [activeTab, currentIndex, viewMode])

  useEffect(() => {
    if (!isEditMode) {
      setActiveMoveId(null)
      setActivePronEditId(null)
      setActivePosEditId(null)
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
    if (currentIndex >= visibleList.length) {
      setCurrentIndex(Math.max(0, visibleList.length - 1))
    }
  }, [currentIndex, visibleList.length])

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current)
      if (transitionRafRef.current) cancelAnimationFrame(transitionRafRef.current)
    }
  }, [])

  const wordHighlightClass = (pos: string) => {
    const key = pos.toLowerCase()
    if (key.includes('v') || pos.includes('動詞')) return 'bg-rose-100 text-rose-900'
    if (key.includes('n') || pos.includes('名詞')) return 'bg-sky-100 text-sky-900'
    if (key.includes('adj') || pos.includes('形容')) return 'bg-amber-100 text-amber-900'
    if (key.includes('adv') || pos.includes('副詞')) return 'bg-violet-100 text-violet-900'
    if (key.includes('prep') || pos.includes('助詞')) return 'bg-emerald-100 text-emerald-900'
    if (key.includes('pron')) return 'bg-cyan-100 text-cyan-900'
    if (key.includes('det') || pos.includes('連体詞')) return 'bg-lime-100 text-lime-900'
    if (key.includes('conj') || pos.includes('接続')) return 'bg-fuchsia-100 text-fuchsia-900'
    if (key.includes('interj') || pos.includes('感動')) return 'bg-orange-100 text-orange-900'
    return 'bg-gray-100 text-gray-900'
  }

  const shouldShowPronunciationForVocab = (vocab: VocabItem) => {
    const languageCode =
      activeTabLanguageCode !== 'other'
        ? activeTabLanguageCode
        : normalizeLanguageCode(vocab.languageCode || '')
    return showPronunciation && supportsPronunciationByLanguage(languageCode)
  }

  const renderSentenceWithPronunciation = (
    sentence: SentenceItem,
    vocab: VocabItem,
  ) => {
    const escapedWord = vocab.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const wordRegex = new RegExp(escapedWord, 'g')
    const targetPron = getPrimaryPronunciation(vocab)
    const sentencePos = sentencePosTagsFromItem(vocab, sentence)[0] || ''
    const highlightClass = wordHighlightClass(sentencePos)

    let html = sentence.text
    if (hasJapanese(vocab.word) && shouldShowPronunciationForVocab(vocab) && targetPron) {
      const rubyHtml = buildJapaneseRubyHtml(vocab.word, targetPron, {
        rubyClassName: `rounded px-1 py-0.5 ${highlightClass}`,
        rtClassName: 'text-[10px] font-bold text-indigo-500',
      })
      html = html.replace(wordRegex, rubyHtml)
    } else {
      html = html.replace(
        wordRegex,
        `<span class="rounded px-1 py-0.5 font-semibold ${highlightClass}">${vocab.word}</span>`,
      )
    }
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  }

  const canPlaySentenceAudio = (
    vocab: VocabItem,
    sentence: SentenceItem,
  ) => {
    if (!vocab.audioData) return false
    return (
      sentence.sourceUrl.startsWith('/lessons/') ||
      sentence.source.includes('听力')
    )
  }

  const sentencePosTags = (vocab: VocabItem, sentenceText: string) =>
    inferContextualPos(vocab.word, sentenceText, vocab.partsOfSpeech || [])

  const sentencePosTagsFromItem = (vocab: VocabItem, sentence: SentenceItem) => {
    const savedTag = firstSentencePosTag(sentence.posTags)
    if (savedTag) return [savedTag]
    const inferredTag = firstSentencePosTag(
      sentencePosTags(vocab, sentence.text),
    )
    return inferredTag ? [inferredTag] : []
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
        return {
          ...item,
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

  if (allExistingGroups.length === 0)
    return <div className='text-center py-20 text-gray-500'>生词本空空如也</div>

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 安全拦截：如果用户正在输入框里打字（比如新建分组），屏蔽快捷键翻页
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      // 只有在闪卡模式下，且有卡片时才触发
      if (viewMode === 'flashcard' && visibleList.length > 0) {
        if (e.key === 'ArrowLeft') {
          goPrevCard()
        } else if (e.key === 'ArrowRight') {
          goNextCard()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, visibleList.length, currentIndex, cardTransitionState]) // 依赖项：当模式或列表长度变化时更新监听

  const runCardTransition = (targetIndex: number, direction: 'next' | 'prev') => {
    if (targetIndex < 0 || targetIndex >= visibleList.length) return
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
    if (isEditMode || visibleList.length <= 1) return
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
  const cardTransitionOpacity =
    cardTransitionState === 'idle' ? 1 : 0.14

  return (
    <div className='max-w-7xl mx-auto'>
      {/* 头部导航 */}
      <div
        className={`rounded-2xl border border-gray-200/80 bg-white/90 p-3 shadow-sm backdrop-blur ${
          viewMode === 'flashcard' ? 'mb-3' : 'mb-6'
        }`}>
        <div
          className={`flex flex-wrap gap-2 overflow-x-auto scrollbar-hide w-full ${
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
                  ? 'bg-gray-900 text-white shadow'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-white'
              }`}>
              {LANG_NAMES[name] || '📁 '}
              {name} ({localData[name].length})
            </button>
          ))}
        </div>

        <div
          className={`flex flex-wrap items-center rounded-xl border border-gray-200 bg-gray-50/80 px-2 ${
            viewMode === 'flashcard' ? 'gap-1.5 py-1.5' : 'gap-2 py-2'
          }`}>
          <button
            onClick={() => setIsEditMode(prev => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isEditMode
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-gray-50 text-gray-600 border border-gray-200'
            }`}>
            {isEditMode ? '退出编辑' : '编辑'}
          </button>
          <ToggleSwitch
            label='注音'
            checked={showPronunciation}
            onChange={setShowPronunciation}
          />
          {viewMode === 'list' && (
            <>
              <select
                value={selectedPosFilter}
                onChange={e => setSelectedPosFilter(e.currentTarget.value)}
                className='h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600'>
                <option value='all'>全部词性</option>
                {posFilterOptions.map(pos => (
                  <option key={`pos-filter-${pos}`} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
              <select
                value={sortMode}
                onChange={e => setSortMode(e.currentTarget.value as 'recent' | 'word' | 'pos')}
                className='h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600'>
                <option value='recent'>最新</option>
                <option value='word'>词汇 A-Z</option>
                <option value='pos'>词性</option>
              </select>
              <select
                value={selectedFolderFilter}
                onChange={e => setSelectedFolderFilter(e.currentTarget.value)}
                className='h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600'>
                <option value='all'>全部收藏夹</option>
                <option value='none'>未收藏</option>
                {folderList.map(folder => (
                  <option key={`folder-filter-${folder.id}`} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <button
                type='button'
                onClick={handleCreateFolder}
                className='px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'>
                新建收藏夹
              </button>
            </>
          )}
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

      {/* 列表模式：仅显示单词和基础操作 */}
      {viewMode === 'list' && (
        <div className='grid grid-cols-1 xl:grid-cols-2 gap-4'>
          {visibleList.map((vocab, idx) => (
            <div
              key={vocab.id}
              onClick={() => {
                setCurrentIndex(idx)
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
                    wordClassName='text-2xl font-black text-gray-900 tracking-tight'
                    hintClassName='text-xs font-bold text-gray-500 mt-1'
                  />
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
                  {vocab.partsOfSpeech && vocab.partsOfSpeech.length > 0 && (
                    <div className='mt-2 flex flex-wrap gap-1.5'>
                      {vocab.partsOfSpeech.slice(0, 3).map(pos => (
                        <span
                          key={`${vocab.id}-list-pos-${pos}`}
                          className='rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700'>
                          {pos}
                        </span>
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
                        placeholder='例如：にほんご / ˈlæŋɡwɪdʒ'
                        className='w-full px-3 py-2 text-sm bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 text-gray-800'
                      />
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

                <div className='relative'>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (activePosEditId === vocab.id) {
                        setActivePosEditId(null)
                        return
                      }
                      handleOpenPosEditor(vocab)
                    }}
                    className={`p-2 rounded-lg transition-colors ${activePosEditId === vocab.id ? 'text-amber-700 bg-amber-50' : 'text-gray-300 hover:text-amber-700'}`}>
                    词
                  </button>
                  {activePosEditId === vocab.id && (
                    <div
                      onClick={e => e.stopPropagation()}
                      className='absolute right-0 bottom-full mb-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-30'>
                      <div className='text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider'>
                        编辑词性
                      </div>
                      <textarea
                        autoFocus
                        value={posInput}
                        onChange={e => setPosInput(e.currentTarget.value)}
                        rows={3}
                        placeholder='例如：n. / v. / 名詞'
                        className='w-full px-3 py-2 text-sm bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-amber-100 text-gray-800'
                      />
                      <div className='mt-2 flex flex-wrap gap-1.5'>
                        {getPosOptions(vocab.word, vocab.sentences[0]?.text || '').map(
                          option => {
                            const selected = splitListInput(posInput).includes(option)
                            return (
                              <button
                                key={`${vocab.id}-list-pos-option-${option}`}
                                type='button'
                                onClick={() => {
                                  const next = splitListInput(posInput)
                                  const updated = next.includes(option)
                                    ? next.filter(item => item !== option)
                                    : [...next, option]
                                  setPosInput(updated.join('\n'))
                                }}
                                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                  selected
                                    ? 'border-amber-300 bg-amber-100 text-amber-800'
                                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                }`}>
                                {option}
                              </button>
                            )
                          },
                        )}
                      </div>
                      <div className='mt-2 flex justify-end'>
                        <button
                          onClick={() => handleSavePos(vocab)}
                          className='text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700'>
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
                      setActiveFolderEditId(activeFolderEditId === vocab.id ? null : vocab.id)
                    }}
                    className={`p-2 rounded-lg transition-colors ${activeFolderEditId === vocab.id ? 'text-indigo-700 bg-indigo-50' : 'text-gray-300 hover:text-indigo-700'}`}>
                    夹
                  </button>
                  {activeFolderEditId === vocab.id && (
                    <div
                      onClick={e => e.stopPropagation()}
                      className='absolute right-0 bottom-full mb-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-30'>
                      <div className='text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider'>
                        收藏夹
                      </div>
                      <select
                        value={vocab.folderId || 'none'}
                        onChange={event => {
                          void handleAssignFolder(vocab.id, event.currentTarget.value)
                          setActiveFolderEditId(null)
                        }}
                        className='w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-100'>
                        <option value='none'>不收藏</option>
                        {folderList.map(folder => (
                          <option key={`folder-option-${vocab.id}-${folder.id}`} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className='relative'>
                  <button
                    onClick={e => {
                      e.stopPropagation()
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
                            {LANG_NAMES[g] || '📁 '}
                            {g}
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
                            handleMoveGroup(vocab.id, activeTab, newGroupInput)
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
      {viewMode === 'flashcard' && visibleList[currentIndex] && (
        <div className='animate-in fade-in zoom-in-95 duration-300'>
          <div
            onPointerDown={handleFlashCardPointerDown}
            onPointerMove={handleFlashCardPointerMove}
            onPointerUp={handleFlashCardPointerEnd}
            onPointerCancel={handleFlashCardPointerEnd}
            className='flex min-h-[calc(100vh-210px)] flex-col w-full bg-white rounded-[2rem] shadow-xl border border-gray-100 p-4 md:p-6 relative transition-[transform,opacity] duration-220 ease-out'
            style={{
              transform: `translateX(${dragOffsetX + cardTransitionOffset}px)`,
              opacity: cardTransitionOpacity,
            }}>
            <div className='flex justify-between items-center mb-4'>
              <div className='text-gray-300 font-bold tracking-widest text-xs uppercase'>
                {currentIndex + 1} / {visibleList.length}
              </div>
              {isEditMode && (
              <div className='flex gap-3 relative'>
                <div className='relative'>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      const current = visibleList[currentIndex]
                      if (!current) return
                      if (activePronEditId === current.id) {
                        setActivePronEditId(null)
                        return
                      }
                      handleOpenPronEditor(current)
                    }}
                    className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${activePronEditId === visibleList[currentIndex].id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 bg-gray-50'}`}>
                    注音
                  </button>
                  {activePronEditId === visibleList[currentIndex].id && (
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
                        placeholder='例如：にほんご / ˈlæŋɡwɪdʒ'
                        className='w-full px-3 py-2 text-sm bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 text-gray-800'
                      />
                      <div className='mt-2 flex justify-end'>
                        <button
                          onClick={() =>
                            handleSavePronunciation(visibleList[currentIndex])
                          }
                          className='text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700'>
                          保存
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className='relative'>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      const current = visibleList[currentIndex]
                      if (!current) return
                      if (activePosEditId === current.id) {
                        setActivePosEditId(null)
                        return
                      }
                      handleOpenPosEditor(current)
                    }}
                    className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${activePosEditId === visibleList[currentIndex].id ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:text-amber-700 bg-gray-50'}`}>
                    词性
                  </button>
                  {activePosEditId === visibleList[currentIndex].id && (
                    <div
                      onClick={e => e.stopPropagation()}
                      className='absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-50 text-left'>
                      <div className='text-[10px] font-bold text-gray-400 px-2 py-1 uppercase tracking-wider'>
                        编辑词性
                      </div>
                      <textarea
                        autoFocus
                        value={posInput}
                        onChange={e => setPosInput(e.currentTarget.value)}
                        rows={3}
                        placeholder='例如：n. / v. / 名詞'
                        className='w-full px-3 py-2 text-sm bg-gray-50 rounded-lg outline-none focus:ring-2 focus:ring-amber-100 text-gray-800'
                      />
                      <div className='mt-2 flex flex-wrap gap-1.5'>
                        {getPosOptions(
                          visibleList[currentIndex].word,
                          visibleList[currentIndex].sentences[0]?.text || '',
                        ).map(option => {
                          const selected = splitListInput(posInput).includes(option)
                          return (
                            <button
                              key={`${visibleList[currentIndex].id}-flash-pos-option-${option}`}
                              type='button'
                              onClick={() => {
                                const next = splitListInput(posInput)
                                const updated = next.includes(option)
                                  ? next.filter(item => item !== option)
                                  : [...next, option]
                                setPosInput(updated.join('\n'))
                              }}
                              className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                selected
                                  ? 'border-amber-300 bg-amber-100 text-amber-800'
                                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                              }`}>
                              {option}
                            </button>
                          )
                        })}
                      </div>
                      <div className='mt-2 flex justify-end'>
                        <button
                          onClick={() => handleSavePos(visibleList[currentIndex])}
                          className='text-xs font-bold bg-amber-600 text-white px-3 py-1.5 rounded-lg hover:bg-amber-700'>
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
                      setActiveMoveId(
                        activeMoveId === visibleList[currentIndex].id
                          ? null
                          : visibleList[currentIndex].id,
                      )
                    }}
                    className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${activeMoveId === visibleList[currentIndex].id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 bg-gray-50'}`}>
                    移动
                  </button>

                  {/* 闪卡模式的专属下拉菜单 */}
                  {activeMoveId === visibleList[currentIndex].id && (
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
                                visibleList[currentIndex].id,
                                activeTab,
                                g,
                              )
                            }
                            className='w-full text-left px-3 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors'>
                            {LANG_NAMES[g] || '📁 '}
                            {g}
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
                              visibleList[currentIndex].id,
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
                    handleDelete(activeTab, visibleList[currentIndex].id)
                  }
                  triggerLabel='删除'
                  confirmLabel='确认删除'
                  pendingLabel='删除中...'
                  triggerClassName='text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-xl transition-all'
                />
              </div>
              )}
            </div>

            <div className='text-center mb-5'>
              <WordPronunciation
                word={visibleList[currentIndex].word}
                pronunciation={getPrimaryPronunciation(visibleList[currentIndex])}
                pronunciations={visibleList[currentIndex].pronunciations || []}
                showPronunciation={shouldShowPronunciationForVocab(visibleList[currentIndex])}
                wordClassName='text-4xl md:text-6xl font-black text-gray-900 mb-1'
                hintClassName='text-xs md:text-sm font-bold text-gray-500'
              />
              {visibleList[currentIndex].folderName && (
                <div className='mt-3'>
                  <span className='inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700'>
                    收藏夹: {visibleList[currentIndex].folderName}
                  </span>
                </div>
              )}
              {shouldShowPronunciationForVocab(visibleList[currentIndex]) &&
                visibleList[currentIndex].pronunciations &&
                visibleList[currentIndex].pronunciations.filter(Boolean).length >
                  1 && (
                  <div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
                    {visibleList[currentIndex].pronunciations
                      .slice(1)
                      .map(pron => (
                        <span
                          key={`${visibleList[currentIndex].id}-flash-pron-${pron}`}
                          className='rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600'>
                          {pron}
                        </span>
                      ))}
                  </div>
                )}
              {visibleList[currentIndex].partsOfSpeech &&
                visibleList[currentIndex].partsOfSpeech.length > 0 && (
                  <div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
                    {visibleList[currentIndex].partsOfSpeech.map(pos => (
                      <span
                        key={`${visibleList[currentIndex].id}-flash-pos-${pos}`}
                        className='rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700'>
                        {pos}
                      </span>
                    ))}
                  </div>
                )}
            </div>

            {(() => {
              const currentVocab = visibleList[currentIndex]
              const hasMeanings =
                !!currentVocab.meanings && currentVocab.meanings.length > 0
              const unmatchedEntries = currentVocab.sentences
                .map((sent, idx) => ({ sent, idx }))
                .filter(
                  ({ sent }) =>
                    typeof sent.meaningIndex !== 'number' || sent.meaningIndex < 0,
                )
              return (
                <div
                  className={`flex-1 min-h-0 grid grid-cols-1 gap-4 ${hasMeanings && unmatchedEntries.length > 0 ? 'lg:grid-cols-[1.2fr_1fr]' : ''}`}>
                  {unmatchedEntries.length > 0 && (
                    <section className='space-y-3 min-h-0'>
                      <div className='rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-2 text-xs font-bold text-indigo-700'>
                        {hasMeanings
                          ? isEditMode
                            ? '句子：拖拽或点选后匹配释义'
                            : '句子'
                          : '例句'}
                      </div>
                      <div className='max-h-[42vh] overflow-auto pr-1 space-y-3'>
                      {unmatchedEntries.map(({ sent: sentObj, idx: i }) => (
                        <button
                          type='button'
                          key={`${currentVocab.id}-sentence-${i}`}
                          draggable
                          onClick={() =>
                            setPendingSentenceIndex(prev => (prev === i ? null : i))
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
                          className={`w-full text-left bg-gray-50 p-5 rounded-2xl border relative transition-colors ${
                            pendingSentenceIndex === i
                              ? 'border-indigo-300 bg-indigo-50/40'
                              : 'border-gray-100 bg-gray-50'
                          }`}>
                          <div className='mb-3 flex flex-wrap items-center gap-2'>
                            {isEditMode && (
                              <span className='text-[10px] font-bold uppercase tracking-wider text-gray-400'>
                                可拖拽
                              </span>
                            )}
                            {sentObj.sourceUrl && sentObj.sourceUrl !== '#' ? (
                              <Link
                                href={sentObj.sourceUrl}
                                onClick={event => event.stopPropagation()}
                                className='text-[11px] font-bold text-indigo-500 bg-white border border-indigo-100 px-3 py-1 rounded-lg hover:bg-indigo-600 hover:text-white transition-all'>
                                {sentObj.source} ↗
                              </Link>
                            ) : (
                              <span className='text-[11px] font-bold text-gray-400 bg-white border border-gray-200 px-3 py-1 rounded-lg'>
                                {sentObj.source}
                              </span>
                            )}
                            {canPlaySentenceAudio(currentVocab, sentObj) && (
                              <button
                                type='button'
                                onClick={event => {
                                  event.stopPropagation()
                                  const audioData = currentVocab.audioData
                                  if (audioData) playAudio(audioData)
                                }}
                                className='flex items-center gap-1.5 text-[11px] font-bold text-white bg-indigo-600 px-3 py-1 rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all'>
                                🔊 播放原音
                              </button>
                            )}
                            {isEditMode && pendingSentenceIndex === i && (
                              <span className='text-[11px] font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-lg'>
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
                          <div className='mt-2 flex flex-wrap gap-1.5'>
                            {sentencePosTagsFromItem(currentVocab, sentObj).map(pos => (
                              <span
                                key={`${currentVocab.id}-sent-${i}-pos-${pos}`}
                                className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${posBadgeClass(pos)}`}>
                                {pos}
                              </span>
                            ))}
                          </div>
                          {isEditMode && (
                            <div className='mt-2 flex flex-wrap gap-1.5'>
                              {getPosOptions(currentVocab.word, sentObj.text).map(
                                option => {
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
                                },
                              )}
                            </div>
                          )}
                        </button>
                      ))}
                      </div>
                    </section>
                  )}

                  {hasMeanings && (
                  <section className='space-y-3 min-h-0'>
                    <div className='rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-2 text-xs font-bold text-emerald-700'>
                      释义
                    </div>
                    <div className='max-h-[42vh] overflow-auto pr-1 space-y-3'>
                    {(
                      currentVocab.meanings!.map((meaning, meaningIdx) => {
                        const matchedSentences = currentVocab.sentences
                          .map((sent, idx) => ({ sent, idx }))
                          .filter(({ sent }) => sent.meaningIndex === meaningIdx)
                        return (
                          <button
                            type='button'
                            key={`${currentVocab.id}-meaning-drop-${meaning}-${meaningIdx}`}
                            onClick={() => {
                              if (!isEditMode || pendingSentenceIndex === null) return
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
                                  event.dataTransfer.getData('application/json'),
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
                            className={`w-full text-left rounded-2xl border bg-white p-4 transition-colors ${
                              pendingSentenceIndex !== null
                                ? 'border-indigo-300'
                                : 'border-emerald-200 hover:border-emerald-300'
                            }`}>
                            <div className='flex items-start gap-2.5'>
                              <span className='mt-[1px] inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-100 px-1 text-xs font-black text-emerald-800'>
                                {meaningIdx + 1}
                              </span>
                              <div className='min-w-0'>
                                <div className='text-sm font-semibold text-emerald-900'>
                                  {meaning}
                                </div>
                                <div className='mt-2 space-y-2'>
                                  {matchedSentences.length === 0 ? (
                                    <div className='rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs font-medium text-emerald-600'>
                                      {pendingSentenceIndex === null
                                        ? '拖拽句子到这里'
                                        : '点击以匹配已选句子'}
                                    </div>
                                  ) : (
                                    matchedSentences.map(({ sent, idx }, sentIdx) => (
                                      <div
                                        key={`${currentVocab.id}-meaning-${meaningIdx}-sent-${sentIdx}`}
                                        className='rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium leading-relaxed text-gray-800'>
                                        <div className='text-sm leading-relaxed text-emerald-900'>
                                          {renderSentenceWithPronunciation(
                                            sent,
                                            currentVocab,
                                          )}
                                        </div>
                                        <div className='mt-2 flex flex-wrap gap-1.5'>
                                          {sentencePosTagsFromItem(currentVocab, sent).map(
                                            pos => (
                                              <span
                                                key={`${currentVocab.id}-meaning-${meaningIdx}-sent-${sentIdx}-pos-${pos}`}
                                                className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${posBadgeClass(pos)}`}>
                                                {pos}
                                              </span>
                                            ),
                                          )}
                                        </div>
                                        {isEditMode && (
                                          <div className='mt-2 flex flex-wrap gap-1.5'>
                                            {getPosOptions(
                                              currentVocab.word,
                                              sent.text,
                                            ).map(option => {
                                              const active = sentencePosTagsFromItem(
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
                                        <div className='mt-2 flex flex-wrap items-center gap-2'>
                                          {sent.sourceUrl &&
                                          sent.sourceUrl !== '#' ? (
                                            <Link
                                              href={sent.sourceUrl}
                                              className='text-[11px] font-bold text-indigo-500 bg-white border border-indigo-100 px-2.5 py-1 rounded-lg hover:bg-indigo-600 hover:text-white transition-all'>
                                              {sent.source} ↗
                                            </Link>
                                          ) : (
                                            <span className='text-[11px] font-bold text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-lg'>
                                              {sent.source}
                                            </span>
                                          )}
                                          {canPlaySentenceAudio(
                                            currentVocab,
                                            sent,
                                          ) && (
                                            <button
                                              type='button'
                                              onClick={event => {
                                                event.stopPropagation()
                                                const audioData =
                                                  currentVocab.audioData
                                                if (audioData) playAudio(audioData)
                                              }}
                                              className='flex items-center gap-1.5 text-[11px] font-bold text-white bg-indigo-600 px-2.5 py-1 rounded-lg hover:bg-indigo-700 shadow-sm'>
                                              🔊 播放原音
                                            </button>
                                          )}
                                          {isEditMode && (
                                            <>
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
                                                  handleEditSentence(currentVocab.id, idx)
                                                }}
                                                className='text-[11px] font-bold text-gray-600 bg-white border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-100'>
                                                编辑
                                              </button>
                                              <InlineConfirmAction
                                                message='删除这条例句后不可恢复，确认删除吗？'
                                                onConfirm={() =>
                                                  handleDeleteSentence(currentVocab.id, idx)
                                                }
                                                triggerLabel='删除'
                                                confirmLabel='确认删除'
                                                pendingLabel='删除中...'
                                                triggerClassName='text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg hover:bg-rose-100'
                                              />
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })
                    )}
                    </div>
                  </section>
                  )}
                </div>
              )
            })()}

            <button
              onClick={() =>
                handleSearchSentences(
                  visibleList[currentIndex].id,
                  visibleList[currentIndex].word,
                )
              }
              className='w-full text-sm font-bold text-gray-400 bg-white border-2 border-dashed border-gray-200 hover:border-indigo-400 hover:text-indigo-600 py-4 rounded-3xl transition-all'>
              {searchingId === visibleList[currentIndex].id
                ? '收起'
                : '更多例句'}
            </button>

            {/* 搜索结果 */}
            {searchingId === visibleList[currentIndex].id &&
              searchResults[visibleList[currentIndex].id] && (
                <div className='mt-6 space-y-3 max-h-60 overflow-y-auto pr-2'>
                  {searchResults[visibleList[currentIndex].id].map(
                    (sentObj, idx) => {
                      const isAdded = visibleList[currentIndex].sentences.some(
                        (s: SentenceItem) => s.text === sentObj.text,
                      )
                      return (
                        <div
                          key={idx}
                          className={`p-4 rounded-2xl border flex flex-col gap-3 transition-all ${isAdded ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-indigo-50/30 border-indigo-100 hover:bg-indigo-50'}`}>
                          <div className='text-[10px] text-indigo-400 font-bold uppercase tracking-widest'>
                            {sentObj.source}
                          </div>
                          <div className='text-sm text-indigo-900 font-medium'>
                            {sentObj.text}
                          </div>
                          {!isAdded && (
                            <button
                              onClick={() =>
                                handleAddSentence(
                                  activeTab,
                                  visibleList[currentIndex].id,
                                  sentObj,
                                )
                              }
                              className='self-end text-xs font-bold bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 shadow-sm'>
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

          <div className='mt-4 flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-gray-50/80 p-2'>
            <button
              onClick={goPrevCard}
              disabled={currentIndex === 0 || cardTransitionState !== 'idle'}
              className='inline-flex min-w-28 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm disabled:opacity-40 hover:bg-gray-100'>
              <span aria-hidden='true'>&larr;</span>
              上一张
            </button>
            <div className='px-2 text-xs font-bold text-gray-400'>
              可左右拖拽切换
            </div>
            <button
              onClick={goNextCard}
              disabled={
                currentIndex === visibleList.length - 1 ||
                cardTransitionState !== 'idle'
              }
              className='inline-flex min-w-28 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-indigo-100 disabled:opacity-40 hover:bg-indigo-700'>
              下一张
              <span aria-hidden='true'>&rarr;</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
