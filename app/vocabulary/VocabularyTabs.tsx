// app/vocabulary/VocabularyTabs.tsx
'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  deleteVocabulary,
  searchSentencesForWord,
  addVocabularySentence,
  moveVocabularyToGroup,
  updateVocabularyPronunciationById,
  assignVocabularySentenceMeaning,
} from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'
import WordPronunciation from '@/components/WordPronunciation'
import { hasJapanese, useShowPronunciation } from '@/hooks/usePronunciationPrefs'
import { annotateJapaneseText } from '@/utils/japaneseRuby'

type SentenceItem = {
  text: string
  source: string
  sourceUrl: string
  meaningIndex?: number | null
}

type AudioData = {
  audioFile: string
  start: number
  end: number
}

type VocabItem = {
  id: string
  word: string
  pronunciation?: string | null
  pronunciations?: string[]
  partOfSpeech?: string | null
  partsOfSpeech?: string[]
  meanings?: string[]
  sourceType: string
  sentences: SentenceItem[]
  audioData: AudioData | null
}

const LANG_NAMES: Record<string, string> = {
  ja: '🇯🇵 日语',
  en: '🇺🇸 英语',
  ko: '🇰🇷 韩语',
  zh: '🇨🇳 中文',
  other: '📁 更多',
}

export default function VocabularyTabs({
  groupedData,
}: {
  groupedData: Record<string, VocabItem[]>
}) {
  const dialog = useDialog()
  const [activeTab, setActiveTab] = useState(
    Object.keys(groupedData)[0] || '未分类',
  )
  const [localData, setLocalData] = useState(groupedData)
  const [viewMode, setViewMode] = useState<'list' | 'flashcard'>('list')
  const [currentIndex, setCurrentIndex] = useState(0)
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()

  // 🌟 轻量级分组移动控制
  const [activeMoveId, setActiveMoveId] = useState<string | null>(null)
  const [newGroupInput, setNewGroupInput] = useState('')
  const [activePronEditId, setActivePronEditId] = useState<string | null>(null)
  const [pronInput, setPronInput] = useState('')

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
    const shouldDelete = await dialog.confirm('确定要移除吗？', {
      title: '删除确认',
      danger: true,
      confirmText: '删除',
    })
    if (!shouldDelete) return
    setLocalData(prev => ({
      ...prev,
      [group]: prev[group].filter((item: VocabItem) => item.id !== id),
    }))
    await deleteVocabulary(id)
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
          prev >= currentList.length - 1 ? currentList.length - 2 : prev,
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

  const handleOpenPronEditor = (vocab: VocabItem) => {
    setActivePronEditId(vocab.id)
    setPronInput(vocab.pronunciation || '')
  }

  const handleSavePronunciation = async (vocab: VocabItem) => {
    const nextPron = pronInput.trim()
    setLocalData(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].map(item =>
        item.id === vocab.id ? { ...item, pronunciation: nextPron } : item,
      ),
    }))
    await updateVocabularyPronunciationById(vocab.id, nextPron)
    setActivePronEditId(null)
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

  const currentList: VocabItem[] = localData[activeTab] || []
  const pronunciationMap = Object.values(localData)
    .flat()
    .reduce<Record<string, string>>((acc, item) => {
      const pron = item.pronunciation?.trim()
      if (pron) acc[item.word] = pron
      return acc
    }, {})
  const allExistingGroups = Object.keys(localData).filter(
    g => localData[g].length > 0,
  )

  // 点击外部关闭移动菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMoveId(null)
      setActivePronEditId(null)
    }
    if (activeMoveId || activePronEditId)
      window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [activeMoveId, activePronEditId])

  useEffect(() => {
    setPendingSentenceIndex(null)
  }, [activeTab, currentIndex, viewMode])

  const renderSentenceWithPronunciation = (
    sentence: string,
  ) => {
    if (!showPronunciation) return sentence

    const entries = Object.entries(pronunciationMap)
      .filter(([word, pron]) => hasJapanese(word) && !!pron.trim())
      .sort((a, b) => b[0].length - a[0].length)
    if (entries.length === 0) return sentence

    const html = annotateJapaneseText(sentence, pronunciationMap, {
      rubyClassName: 'text-indigo-600',
      rtClassName: 'text-[10px] font-bold text-indigo-500',
    })
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
      if (viewMode === 'flashcard' && currentList.length > 0) {
        if (e.key === 'ArrowLeft') {
          setCurrentIndex(prev => Math.max(0, prev - 1))
        } else if (e.key === 'ArrowRight') {
          setCurrentIndex(prev => Math.min(currentList.length - 1, prev + 1))
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, currentList.length]) // 依赖项：当模式或列表长度变化时更新监听

  return (
    <div className='max-w-7xl mx-auto'>
      {/* 头部导航 */}
      <div className='flex flex-col md:flex-row justify-between items-center mb-8 gap-4'>
        <div className='flex gap-2 overflow-x-auto scrollbar-hide w-full md:w-auto'>
          {allExistingGroups.map(name => (
            <button
              key={name}
              onClick={() => {
                setActiveTab(name)
                setCurrentIndex(0)
                setViewMode('list')
              }}
              className={`px-5 py-2.5 rounded-full font-bold whitespace-nowrap transition-all ${
                activeTab === name
                  ? 'bg-gray-900 text-white shadow-lg'
                  : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'
              }`}>
              {LANG_NAMES[name] || '📁 '}
              {name} ({localData[name].length})
            </button>
          ))}
        </div>

        <div className='flex items-center gap-2 bg-white p-1 rounded-xl border border-gray-200 shadow-sm shrink-0'>
          <label className='px-2 text-xs text-gray-500 flex items-center gap-1.5'>
            <input
              type='checkbox'
              checked={showPronunciation}
              onChange={e => setShowPronunciation(e.currentTarget.checked)}
            />
            注音
          </label>
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${viewMode === 'list' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
            列表概览
          </button>
          <button
            onClick={() => {
              setViewMode('flashcard')
              setCurrentIndex(0)
            }}
            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors ${viewMode === 'flashcard' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
            沉浸闪卡
          </button>
        </div>
      </div>

      {/* 列表模式：仅显示单词和基础操作 */}
      {viewMode === 'list' && (
        <div className='grid grid-cols-1 xl:grid-cols-2 gap-4'>
          {currentList.map((vocab, idx) => (
            <div
              key={vocab.id}
              onClick={() => {
                setCurrentIndex(idx)
                setViewMode('flashcard')
              }}
              className='bg-white p-5 rounded-2xl border border-gray-50 shadow-sm hover:shadow-md hover:border-indigo-100 cursor-pointer flex items-center justify-between group transition-all'>
              <div className='flex items-center gap-4'>
                <div>
                  <WordPronunciation
                    word={vocab.word}
                    pronunciation={vocab.pronunciation || ''}
                    showPronunciation={showPronunciation}
                    wordClassName='text-2xl font-black text-gray-900 tracking-tight'
                    hintClassName='text-xs font-bold text-gray-500 mt-1'
                  />
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
                    showPronunciation && (
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

                {/* 🌟 简易移动分组弹出层 */}
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

                <button
                  onClick={e => {
                    e.stopPropagation()
                    handleDelete(activeTab, vocab.id)
                  }}
                  className='p-2 text-gray-300 hover:text-red-500 transition-colors'>
                  <svg
                    className='w-5 h-5'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 沉浸模式：详细例句与背诵 */}
      {viewMode === 'flashcard' && currentList[currentIndex] && (
        <div className='flex flex-col items-center justify-center min-h-[50vh] animate-in fade-in zoom-in-95 duration-300'>
          <div className='w-full bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 p-8 md:p-12 relative overflow-hidden'>
            <div className='flex justify-between items-center mb-8'>
              <div className='text-gray-300 font-bold tracking-widest text-xs uppercase'>
                Card {currentIndex + 1} of {currentList.length}
              </div>
              <div className='flex gap-3 relative'>
                <div className='relative'>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      const current = currentList[currentIndex]
                      if (!current) return
                      if (activePronEditId === current.id) {
                        setActivePronEditId(null)
                        return
                      }
                      handleOpenPronEditor(current)
                    }}
                    className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${activePronEditId === currentList[currentIndex].id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 bg-gray-50'}`}>
                    注音
                  </button>
                  {activePronEditId === currentList[currentIndex].id && (
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
                            handleSavePronunciation(currentList[currentIndex])
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
                      setActiveMoveId(
                        activeMoveId === currentList[currentIndex].id
                          ? null
                          : currentList[currentIndex].id,
                      )
                    }}
                    className={`text-xs font-bold px-4 py-2 rounded-xl transition-all ${activeMoveId === currentList[currentIndex].id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-indigo-600 bg-gray-50'}`}>
                    移动
                  </button>

                  {/* 闪卡模式的专属下拉菜单 */}
                  {activeMoveId === currentList[currentIndex].id && (
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
                                currentList[currentIndex].id,
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
                              currentList[currentIndex].id,
                              activeTab,
                              newGroupInput,
                            )
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() =>
                    handleDelete(activeTab, currentList[currentIndex].id)
                  }
                  className='text-xs font-bold text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 px-4 py-2 rounded-xl transition-all'>
                  删除
                </button>
              </div>
            </div>

            <div className='text-center mb-12'>
              <WordPronunciation
                word={currentList[currentIndex].word}
                pronunciation={currentList[currentIndex].pronunciation || ''}
                showPronunciation={showPronunciation}
                wordClassName='text-5xl md:text-7xl font-black text-gray-900 mb-2'
                hintClassName='text-sm md:text-base font-bold text-gray-500'
              />
              {showPronunciation &&
                currentList[currentIndex].pronunciations &&
                currentList[currentIndex].pronunciations.filter(Boolean).length >
                  1 && (
                  <div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
                    {currentList[currentIndex].pronunciations
                      .slice(1)
                      .map(pron => (
                        <span
                          key={`${currentList[currentIndex].id}-flash-pron-${pron}`}
                          className='rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600'>
                          {pron}
                        </span>
                      ))}
                  </div>
                )}
              {currentList[currentIndex].meanings &&
                currentList[currentIndex].meanings.length > 0 && (
                  <div className='mt-6 inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-4 py-1 text-xs font-semibold text-emerald-700'>
                    已录入释义 {currentList[currentIndex].meanings.length} 条
                  </div>
                )}
              {currentList[currentIndex].partsOfSpeech &&
                currentList[currentIndex].partsOfSpeech.length > 0 && (
                  <div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
                    {currentList[currentIndex].partsOfSpeech.map(pos => (
                      <span
                        key={`${currentList[currentIndex].id}-flash-pos-${pos}`}
                        className='rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700'>
                        {pos}
                      </span>
                    ))}
                  </div>
                )}
            </div>

            {(() => {
              const currentVocab = currentList[currentIndex]
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
                  className={`mb-8 grid grid-cols-1 gap-6 ${hasMeanings && unmatchedEntries.length > 0 ? 'lg:grid-cols-[1.2fr_1fr]' : ''}`}>
                  {unmatchedEntries.length > 0 && (
                    <section className='space-y-3'>
                      <div className='rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-2 text-xs font-bold text-indigo-700'>
                        {hasMeanings
                          ? '句子池：拖拽句子到右侧释义，或先点句子再点释义'
                          : '例句'}
                      </div>
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
                              : 'border-gray-100'
                          }`}>
                          <div className='mb-3 flex flex-wrap items-center gap-2'>
                            <span className='text-[10px] font-bold uppercase tracking-wider text-gray-400'>
                              可拖拽 / 可点选
                            </span>
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
                            {pendingSentenceIndex === i && (
                              <span className='text-[11px] font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 px-3 py-1 rounded-lg'>
                                已选中，点击右侧释义完成匹配
                              </span>
                            )}
                          </div>
                          <div className='text-lg text-gray-700 leading-relaxed font-medium'>
                            {renderSentenceWithPronunciation(sentObj.text)}
                          </div>
                        </button>
                      ))}
                    </section>
                  )}

                  <section className='space-y-3'>
                    <div className='rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-2 text-xs font-bold text-emerald-700'>
                      释义区：纵向编号，拖入后自动保存
                    </div>
                    {hasMeanings ? (
                      currentVocab.meanings!.map((meaning, meaningIdx) => {
                        const matchedSentences = currentVocab.sentences.filter(
                          sent => sent.meaningIndex === meaningIdx,
                        )
                        return (
                          <button
                            type='button'
                            key={`${currentVocab.id}-meaning-drop-${meaning}-${meaningIdx}`}
                            onClick={() => {
                              if (pendingSentenceIndex === null) return
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
                                    matchedSentences.map((sent, sentIdx) => (
                                      <div
                                        key={`${currentVocab.id}-meaning-${meaningIdx}-sent-${sentIdx}`}
                                        className='rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium leading-relaxed text-emerald-800'>
                                        <div className='text-sm leading-relaxed text-emerald-900'>
                                          {renderSentenceWithPronunciation(
                                            sent.text,
                                          )}
                                        </div>
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
                    ) : (
                      <div className='rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-500'>
                        当前单词还没有释义，先在后台补充释义后再进行句子匹配。
                      </div>
                    )}
                  </section>
                </div>
              )
            })()}

            <button
              onClick={() =>
                handleSearchSentences(
                  currentList[currentIndex].id,
                  currentList[currentIndex].word,
                )
              }
              className='w-full text-sm font-bold text-gray-400 bg-white border-2 border-dashed border-gray-200 hover:border-indigo-400 hover:text-indigo-600 py-4 rounded-3xl transition-all'>
              {searchingId === currentList[currentIndex].id
                ? '收起搜索'
                : '🔍 搜索更多例句'}
            </button>

            {/* 搜索结果 */}
            {searchingId === currentList[currentIndex].id &&
              searchResults[currentList[currentIndex].id] && (
                <div className='mt-6 space-y-3 max-h-60 overflow-y-auto pr-2'>
                  {searchResults[currentList[currentIndex].id].map(
                    (sentObj, idx) => {
                      const isAdded = currentList[currentIndex].sentences.some(
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
                                  currentList[currentIndex].id,
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

          <div className='flex items-center gap-6 mt-10'>
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className='w-16 h-16 rounded-full bg-white text-gray-600 font-black text-2xl shadow-lg border border-gray-100 disabled:opacity-20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center'>
              &larr;
            </button>
            <button
              onClick={() =>
                setCurrentIndex(prev =>
                  Math.min(currentList.length - 1, prev + 1),
                )
              }
              disabled={currentIndex === currentList.length - 1}
              className='w-16 h-16 rounded-full bg-indigo-600 text-white font-black text-2xl shadow-xl shadow-indigo-100 disabled:opacity-20 hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all flex items-center justify-center'>
              &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
