'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { StudyTimeKind } from '@prisma/client'

import { saveVocabulary } from '@/app/actions/content'
import { addSentenceToReview } from '@/app/actions/fsrs'

// 🌟 移除了 SmartText 组件，改回原生文本渲染解决移动端溢出问题
import VocabularyTooltip, {
  TooltipSaveState,
  SaveStatusIcon,
  SAVE_BG_COLORS,
} from '@/components/VocabularyTooltip'
import ToggleSwitch from '@/components/ToggleSwitch'
import WordMetaPanel from '@/components/WordMetaPanel'
import {
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import { annotateJapaneseText } from '@/utils/japaneseRuby'
import { getPosOptions, inferContextualPos } from '@/utils/posTagger'
import useStudyTimeHeartbeat from '@/hooks/useStudyTimeHeartbeat'

// ================= 类型定义 =================
type DialogueItem = {
  id: number
  text: string
  start: number
  end: number
}

type PlayerLesson = {
  id: string
  title: string
  audioFile: string
  dialogue: DialogueItem[]
}

type PlayerLessonGroup = {
  id: string
  name: string
  levelId: string
}

type VocabularyMeta = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

interface Props {
  lesson: PlayerLesson
  lessonGroup: PlayerLessonGroup
  prevId: string | null
  nextId: string | null
  vocabularyMetaMap: Record<string, VocabularyMeta>
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

// ================= 主控组件 =================
export default function AudioPlayer({
  lesson,
  lessonGroup,
  prevId,
  nextId,
  vocabularyMetaMap,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)

  const [activeId, setActiveId] = useState<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isBlindMode, setIsBlindMode] = useState(false)
  const [isTrackLoop, setIsTrackLoop] = useState(false)
  const [loopId, setLoopId] = useState<number | null>(null)

  const [activeTooltip, setActiveTooltip] = useState<{
    word: string
    contextSentence: string
    dialogueId: number
    x: number
    y: number
    isTop: boolean
  } | null>(null)

  const [wordSaveState, setWordSaveState] = useState<TooltipSaveState>('idle')
  const [savingDialogueId, setSavingDialogueId] = useState<number | null>(null)
  const [dialogueSaveState, setDialogueSaveState] =
    useState<TooltipSaveState>('idle')
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()
  const [localVocabularyMetaMap, setLocalVocabularyMetaMap] =
    useState(vocabularyMetaMap)
  const [saveWithPronunciation, setSaveWithPronunciation] = useState(false)
  const [saveWithMeaning, setSaveWithMeaning] = useState(false)
  const [tooltipPronunciation, setTooltipPronunciation] = useState('')
  const [tooltipPartOfSpeech, setTooltipPartOfSpeech] = useState('')
  const [tooltipMeaning, setTooltipMeaning] = useState('')
  useStudyTimeHeartbeat({
    enabled: isPlaying,
    kind: StudyTimeKind.LESSON_SPEAKING,
    intervalMs: 45000,
  })
  const [meaningMatchBySentence, setMeaningMatchBySentence] = useState<
    Record<number, Record<string, number>>
  >({})
  const activeSentenceNo =
    activeId === null
      ? 0
      : lesson.dialogue.findIndex(item => item.id === activeId) + 1
  const activeSentenceIndex =
    activeId === null ? -1 : lesson.dialogue.findIndex(item => item.id === activeId)
  const previousSentenceId =
    activeSentenceIndex > 0 ? lesson.dialogue[activeSentenceIndex - 1]?.id ?? null : null
  const sentenceMetaMap = useMemo(() => {
    const entries = Object.entries(localVocabularyMetaMap).filter(
      ([, meta]) =>
        meta.pronunciations.filter(Boolean).length > 0 ||
        meta.meanings.filter(Boolean).length > 0,
    )
    return new Map(
      lesson.dialogue.map(item => {
        const matched = entries
          .filter(([word]) => item.text.includes(word))
          .sort((a, b) => b[0].length - a[0].length)
          .slice(0, 6)
          .map(([word, meta]) => ({
            word,
            pronunciation: meta.pronunciations[0] || '',
            pronunciations: meta.pronunciations,
            partsOfSpeech: meta.partsOfSpeech,
            meanings: meta.meanings,
          }))
        return [item.id, matched] as const
      }),
    )
  }, [localVocabularyMetaMap, lesson.dialogue])
  const activeSentenceEntries = activeId
    ? sentenceMetaMap.get(activeId) || []
    : []
  const isSentenceMeaningMatched = (sentenceId: number) => {
    if (!showMeaning) return true
    const entries = sentenceMetaMap.get(sentenceId) || []
    const requiredWords = entries
      .filter(entry => entry.meanings.length > 0)
      .map(entry => entry.word)
    if (requiredWords.length === 0) return true
    const matchedMap = meaningMatchBySentence[sentenceId] || {}
    return requiredWords.every(word => !!matchedMap[word])
  }

  const annotateSentence = (text: string) => {
    if (!showPronunciation) return text
    const entries = Object.entries(localVocabularyMetaMap)
      .filter(
        ([word, meta]) => text.includes(word) && meta.pronunciations.length > 0,
      )
      .sort((a, b) => b[0].length - a[0].length)
    if (entries.length === 0) return text
    const pronMap = entries.reduce<Record<string, string>>((acc, [word, meta]) => {
      const pronunciation = meta.pronunciations[0]
      if (pronunciation) acc[word] = pronunciation
      return acc
    }, {})
    const html = annotateJapaneseText(text, pronMap, {
      rubyClassName: 'text-indigo-700',
      rtClassName: 'text-[10px] font-bold text-indigo-500',
    })
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  }

  // ---------------- 音频控制逻辑 ----------------
  const togglePlaybackRate = () => {
    const audio = audioRef.current
    if (!audio) return
    const nextRate =
      playbackRate === 1
        ? 1.25
        : playbackRate === 1.25
          ? 1.5
          : playbackRate === 1.5
            ? 0.75
            : 1
    audio.playbackRate = nextRate
    setPlaybackRate(nextRate)
  }

  const toggleTrackLoop = () => {
    const audio = audioRef.current
    if (!audio) return
    const nextLoop = !isTrackLoop
    audio.loop = nextLoop
    setIsTrackLoop(nextLoop)
  }

  const handleSentenceClick = (item: DialogueItem) => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) return
    if (activeTooltip) {
      setActiveTooltip(null)
      return
    }

    const audio = audioRef.current
    if (!audio) return

    if (loopId !== null && loopId !== item.id) setLoopId(null)

    if (isPlaying && activeId === item.id) {
      audio.pause()
    } else {
      audio.currentTime = item.start
      audio.play()
    }
  }

  const toggleLoop = (e: React.MouseEvent, item: DialogueItem) => {
    e.stopPropagation()
    const audio = audioRef.current
    if (!audio) return
    if (loopId === item.id) {
      setLoopId(null)
    } else {
      setLoopId(item.id)
      audio.currentTime = item.start
      audio.play()
    }
  }

  // ---------------- 原生划词与复习逻辑 ----------------
  const handleTextSelection = (
    e: React.MouseEvent | React.TouchEvent,
    item: DialogueItem,
  ) => {
    setTimeout(() => {
      const selection = window.getSelection()
      const text = selection?.toString().trim()

      if (text && text.length > 0) {
        const range = selection!.getRangeAt(0)
        const rect = range.getBoundingClientRect()

        let x = rect.left + rect.width / 2
        let y = rect.top - 10
        let isTop = true

        const screenWidth = window.innerWidth
        if (x < 110) x = 110
        if (x > screenWidth - 110) x = screenWidth - 110
        if (rect.top < 60) {
          y = rect.bottom + 10
          isTop = false
        }

        setActiveTooltip({
          word: text,
          contextSentence: item.text,
          dialogueId: item.id,
          x,
          y,
          isTop,
        })
        const existingMeta = localVocabularyMetaMap[text]
        const inferredPos = inferContextualPos(
          text,
          item.text,
          existingMeta?.partsOfSpeech || [],
        )
        setTooltipPronunciation((existingMeta?.pronunciations || []).join('\n'))
        setTooltipPartOfSpeech(inferredPos.join('\n'))
        setTooltipMeaning((existingMeta?.meanings || []).join('\n'))
        setSaveWithPronunciation(true)
        setSaveWithMeaning(true)
        setWordSaveState('idle')
      } else {
        setActiveTooltip(null)
      }
    }, 50)
  }

  const handleSaveWord = async (word: string) => {
    if (!activeTooltip) return
    setWordSaveState('saving')
    const existingMeta = localVocabularyMetaMap[word] || {
      pronunciations: [],
      partsOfSpeech: [],
      meanings: [],
    }
    const pronunciationList = splitListInput(tooltipPronunciation)
    const partOfSpeechList = splitListInput(tooltipPartOfSpeech)
    const meaningList = splitListInput(tooltipMeaning)
    const firstPron = pronunciationList[0]
    try {
      const res = await saveVocabulary(
        word,
        activeTooltip.contextSentence,
        'AUDIO_DIALOGUE',
        String(activeTooltip.dialogueId),
        saveWithPronunciation ? firstPron : undefined,
        saveWithPronunciation ? pronunciationList : [],
        saveWithMeaning ? meaningList : [],
        partOfSpeechList[0],
        partOfSpeechList,
      )
      if (res.success) {
        setLocalVocabularyMetaMap(prev => ({
          ...prev,
          [word]: {
            pronunciations: saveWithPronunciation ? pronunciationList : [],
            partsOfSpeech:
              partOfSpeechList.length > 0
                ? partOfSpeechList
                : existingMeta.partsOfSpeech,
            meanings: saveWithMeaning ? meaningList : [],
          },
        }))
        setWordSaveState('success')
        setTimeout(() => setActiveTooltip(null), 1500)
      } else if (res.state === 'already_exists') {
        setLocalVocabularyMetaMap(prev => ({
          ...prev,
          [word]: {
            pronunciations: saveWithPronunciation ? pronunciationList : [],
            partsOfSpeech:
              partOfSpeechList.length > 0
                ? partOfSpeechList
                : existingMeta.partsOfSpeech,
            meanings: saveWithMeaning ? meaningList : [],
          },
        }))
        setWordSaveState('already_exists')
        setTimeout(() => setActiveTooltip(null), 1500)
      } else {
        setWordSaveState('error')
      }
    } catch (error) {
      setWordSaveState('error')
    }
  }

  const handleAddToReview = async (e: React.MouseEvent, dialogueId: number) => {
    e.stopPropagation()
    setSavingDialogueId(dialogueId)
    setDialogueSaveState('saving')
    try {
      const res = await addSentenceToReview(dialogueId)
      if (res.success) setDialogueSaveState('success')
      else setDialogueSaveState('already_exists')

      setTimeout(() => {
        setSavingDialogueId(null)
        setDialogueSaveState('idle')
      }, 1500)
    } catch (error) {
      setDialogueSaveState('error')
      setTimeout(() => {
        setSavingDialogueId(null)
        setDialogueSaveState('idle')
      }, 1500)
    }
  }

  // ---------------- 副作用钩子 ----------------
  useEffect(() => {
    if (!activeTooltip) return
    const handleScrollOrResize = () => {
      setActiveTooltip(null)
      setWordSaveState('idle')
      window.getSelection()?.removeAllRanges()
    }
    window.addEventListener('scroll', handleScrollOrResize, { passive: true })
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [activeTooltip])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.loop = isTrackLoop
  }, [isTrackLoop])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    let animationFrameId: number

    const syncHighlight = () => {
      const currentTime = audio.currentTime
      if (loopId !== null) {
        const loopItem = lesson.dialogue.find(d => d.id === loopId)
        if (loopItem && currentTime >= loopItem.end)
          audio.currentTime = loopItem.start
      }
      const currentItem = lesson.dialogue.find(
        d => currentTime >= d.start && currentTime <= d.end,
      )
      setActiveId(prev => (currentItem ? currentItem.id : prev))
      animationFrameId = requestAnimationFrame(syncHighlight)
    }

    animationFrameId = requestAnimationFrame(syncHighlight)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      setIsPlaying(false)
      setActiveId(null)
      setLoopId(null)
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)

    return () => {
      cancelAnimationFrame(animationFrameId)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [lesson.dialogue, loopId])

  useEffect(() => {
    if (activeId === null) return
    const targetId =
      isBlindMode && previousSentenceId !== null ? previousSentenceId : activeId
    const element = document.getElementById(`sentence-${targetId}`)
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeId, isBlindMode, previousSentenceId])

  // 🌟 新增：高级键盘事件监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      // Space 键：播放 / 暂停
      if (e.code === 'Space') {
        e.preventDefault()
        const audio = audioRef.current
        if (!audio) return
        if (audio.paused) audio.play()
        else audio.pause()
      }

      // 🌟 R 键：精准重播当前句子
      if (e.code === 'KeyR' || e.key.toLowerCase() === 'r') {
        e.preventDefault()
        const audio = audioRef.current
        if (!audio) return

        // 寻找当前高亮的句子并退回开头
        if (activeId !== null) {
          const currentItem = lesson.dialogue.find(d => d.id === activeId)
          if (currentItem) {
            audio.currentTime = currentItem.start
            audio.play()
          }
        } else if (lesson.dialogue.length > 0) {
          // 如果没有激活的句子（比如刚进来没播放），直接从第一句开始播
          audio.currentTime = lesson.dialogue[0].start
          audio.play()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeId, lesson.dialogue]) // 🌟 必须依赖 activeId 才能获取到最准的当前状态

  // ---------------- 渲染主视图 ----------------
  return (
    <div
      className='relative min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff_0%,_#f8fafc_42%,_#f8fafc_100%)]'
      onClick={() => setActiveTooltip(null)}>
      <audio ref={audioRef} src={lesson.audioFile} preload='metadata' />

      {activeTooltip && (
        <VocabularyTooltip
          word={activeTooltip.word}
          x={activeTooltip.x}
          y={activeTooltip.y}
          isTop={activeTooltip.isTop}
          saveState={wordSaveState}
          onSaveWord={handleSaveWord}
          enablePronunciation
          pronunciationValue={tooltipPronunciation}
          saveWithPronunciation={saveWithPronunciation}
          onPronunciationChange={setTooltipPronunciation}
          onSaveWithPronunciationChange={setSaveWithPronunciation}
          partOfSpeechValue={tooltipPartOfSpeech}
          onPartOfSpeechChange={setTooltipPartOfSpeech}
          partOfSpeechOptions={
            activeTooltip
              ? getPosOptions(activeTooltip.word, activeTooltip.contextSentence)
              : []
          }
          meaningValue={tooltipMeaning}
          saveWithMeaning={saveWithMeaning}
          onMeaningChange={setTooltipMeaning}
          onSaveWithMeaningChange={setSaveWithMeaning}
        />
      )}

      <div className='sticky top-0 z-30 border-b border-gray-200/70 bg-gray-50/80 backdrop-blur-xl'>
        <div className='mx-auto w-full max-w-5xl px-4 py-3 md:px-6 md:py-4'>
          <div className='space-y-3'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <p className='truncate text-[11px] font-semibold uppercase tracking-wide text-indigo-500 md:text-xs'>
                {lessonGroup.name}
                </p>
                <h1 className='truncate text-[28px] font-semibold leading-none text-gray-900 md:text-3xl'>
                  {lesson.title}
                </h1>
              </div>

              <button
                onClick={togglePlaybackRate}
                className='shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 md:px-3.5 md:py-2'>
                {playbackRate}x
              </button>
              <button
                onClick={toggleTrackLoop}
                aria-pressed={isTrackLoop}
                title='整段循环播放'
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors md:px-3.5 md:py-2 ${
                  isTrackLoop
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                }`}>
                全曲循环
              </button>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              <ToggleSwitch
                label='注音'
                checked={showPronunciation}
                onChange={setShowPronunciation}
              />
              <ToggleSwitch
                label='释义'
                checked={showMeaning}
                onChange={setShowMeaning}
              />
              <ToggleSwitch
                label='盲听'
                checked={isBlindMode}
                onChange={setIsBlindMode}
              />
            </div>

            <div className='grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 md:grid-cols-[2.75rem_1fr_2.75rem]'>
              <div>
                {prevId && (
                  <Link
                    href={`/lessons/${prevId}`}
                    className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 md:h-11 md:w-11'>
                    <svg
                      className='h-4 w-4 md:h-5 md:w-5'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'>
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M15 19l-7-7 7-7'
                      />
                    </svg>
                  </Link>
                )}
              </div>

              <div className='flex items-center justify-center'>
                <span className='rounded-full border border-indigo-100 bg-white px-3 py-1 text-sm font-semibold text-gray-600 md:text-[15px]'>
                  {activeSentenceNo > 0
                    ? `句子 ${activeSentenceNo}/${lesson.dialogue.length}`
                    : `共 ${lesson.dialogue.length} 句`}
                </span>
              </div>

              <div className='flex justify-end'>
                {nextId && (
                  <Link
                    href={`/lessons/${nextId}`}
                    className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 md:h-11 md:w-11'>
                    <svg
                      className='h-4 w-4 md:h-5 md:w-5'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'>
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={2}
                        d='M9 5l7 7-7 7'
                      />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className='mx-auto w-full max-w-5xl px-4 py-4 md:px-6 md:py-5'>
        {activeSentenceEntries.length > 0 && (
          <div className='mb-4 border border-gray-200 bg-white p-3 md:p-4 '>
            <div className='mb-2 flex items-center justify-between'>
              <h2 className='text-sm font-bold text-gray-800'>
                词条区
              </h2>
              <span className='text-[11px] text-gray-400'>
                {activeId ? `当前句：${activeSentenceNo}` : '先点击句子'}
              </span>
            </div>
            <WordMetaPanel
              entries={activeSentenceEntries}
              showPronunciation={showPronunciation}
              showMeaning={showMeaning}
              contextSentence={
                lesson.dialogue.find(item => item.id === activeId)?.text || ''
              }
              enableMeaningMatch={showMeaning}
              matchedMeaningMap={meaningMatchBySentence[activeId || 0] || {}}
              onMatchedMeaningChange={(word, meaningIndex) => {
                if (!activeId) return
                setMeaningMatchBySentence(prev => ({
                  ...prev,
                  [activeId]: {
                    ...(prev[activeId] || {}),
                    [word]: meaningIndex,
                  },
                }))
              }}
            />
          </div>
        )}
        <div className='space-y-3 pb-44 md:pb-52'>
          {lesson.dialogue.map(item => (
            <SentenceRow
              key={item.id}
              item={item}
              isActive={activeId === item.id}
              isLooping={loopId === item.id}
              isBlindMode={isBlindMode}
              blindState={
                !isBlindMode
                  ? 'normal'
                  : item.id === previousSentenceId
                    ? 'clear'
                    : 'blur'
              }
              savingDialogueId={savingDialogueId}
              dialogueSaveState={dialogueSaveState}
              renderedText={annotateSentence(item.text)}
              canAddToReview={isSentenceMeaningMatched(item.id)}
              onClick={() => handleSentenceClick(item)}
              onMouseUp={e => handleTextSelection(e, item)}
              onToggleLoop={e => toggleLoop(e, item)}
              onAddToReview={e => handleAddToReview(e, item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ================= 子组件：单行字幕 UI =================
interface SentenceRowProps {
  item: DialogueItem
  isActive: boolean
  isLooping: boolean
  isBlindMode: boolean
  blindState: 'normal' | 'clear' | 'blur'
  savingDialogueId: number | null
  dialogueSaveState: TooltipSaveState
  renderedText: React.ReactNode
  canAddToReview: boolean
  onClick: () => void
  onMouseUp: (e: React.MouseEvent | React.TouchEvent) => void
  onToggleLoop: (e: React.MouseEvent) => void
  onAddToReview: (e: React.MouseEvent) => void
}

function SentenceRow({
  item,
  isActive,
  isLooping,
  isBlindMode,
  blindState,
  savingDialogueId,
  dialogueSaveState,
  renderedText,
  canAddToReview,
  onClick,
  onMouseUp,
  onToggleLoop,
  onAddToReview,
}: SentenceRowProps) {
  const currentState = savingDialogueId === item.id ? dialogueSaveState : 'idle'
  const currentBgClass =
    currentState === 'idle'
      ? 'border border-gray-200 bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'
      : SAVE_BG_COLORS[currentState]
  const blurClass = blindState === 'blur' ? 'blur-sm opacity-50' : ''

  return (
    <div
      id={`sentence-${item.id}`}
      className='group flex items-center gap-2 md:gap-3 scroll-mt-44'>
      {/* 左侧文字区 */}
      <div
        onClick={onClick}
        onMouseUp={onMouseUp}
        onTouchEnd={onMouseUp}
        className={`flex-1 min-w-0 rounded-2xl border p-4 text-lg leading-relaxed transition-all duration-300 select-text break-words md:p-5 md:text-xl
          ${
            isActive
              ? 'scale-[1.01] border-indigo-200 bg-indigo-50 text-indigo-700 font-bold shadow-sm'
              : 'border-gray-200 bg-white text-gray-800 hover:border-indigo-100 hover:bg-indigo-50/30'
          }
          ${isBlindMode && blindState === 'clear' ? 'border-indigo-200/80 bg-white text-gray-900' : ''}
        `}>
        <div className={`min-w-0 transition-all duration-300 ${blurClass}`}>
          {renderedText}
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className='flex w-9 shrink-0 flex-col gap-2 md:w-10'>
        <button
          onClick={onAddToReview}
          title={canAddToReview ? '加入跟读训练库' : '先完成释义匹配'}
          disabled={savingDialogueId === item.id || !canAddToReview}
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs transition-all duration-200 md:h-10 md:w-10
            ${isActive && currentState === 'idle' ? 'scale-110 bg-indigo-600 text-white hover:bg-indigo-700' : currentBgClass}
            ${isActive || currentState !== 'idle' ? 'ring-2 ring-indigo-100' : ''}
          `}>
          <SaveStatusIcon
            state={currentState}
            className='h-4 w-4 md:h-5 md:w-5'
          />
        </button>

        <button
          onClick={onToggleLoop}
          title='单句复读'
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs transition-all duration-200 md:h-10 md:w-10
            ${isLooping ? 'scale-110 bg-indigo-600 text-white ring-2 ring-indigo-200' : isActive ? 'scale-105 bg-indigo-500 text-white hover:bg-indigo-600' : 'border border-gray-200 bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}
          `}>
          <svg
            className='h-4 w-4 md:h-5 md:w-5'
            fill='none'
            stroke='currentColor'
            viewBox='0 0 24 24'>
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              strokeWidth={2}
              d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
