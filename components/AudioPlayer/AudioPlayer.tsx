'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { StudyTimeKind } from '@prisma/client'

import { saveVocabulary } from '@/app/actions/content'
import { addSentenceToReview } from '@/app/actions/fsrs'
import { logMaterialPlaytime } from '@/app/actions/materialPlaytime'

// 🌟 移除了 SmartText 组件，改回原生文本渲染解决移动端溢出问题
import VocabularyTooltip, {
  TooltipSaveState,
  SaveStatusIcon,
  SAVE_BG_COLORS,
} from '@/components/vocabulary/VocabularyTooltip'
import ToggleSwitch from '@/components/ToggleSwitch'
import WordMetaPanel from '@/components/vocabulary/WordMetaPanel'
import {
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import { annotateJapaneseText } from '@/utils/language/japaneseRuby'
import { getPosOptions, inferContextualPos } from '@/utils/language/posTagger'
import useStudyTimeHeartbeat from '@/hooks/useStudyTimeHeartbeat'
import { useAudioController } from './useAudioController'

// ================= 类型定义 =================
type DialogueItem = {
  id: number
  text: string
  start: number
  end: number
}

type PlayerLesson = {
  id: string
  materialId: string
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
  lessonSwitcher?: {
    currentLessonId: string
    groups: {
      id: string
      label: string
      items: { id: string; title: string }[]
    }[]
  }
  initialTotalPlaySeconds?: number
  initialPlayedDays?: number
  vocabularyMetaMap: Record<string, VocabularyMeta>
  isEmbedded?: boolean
  forceBlindMode?: boolean
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

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(
      s,
    ).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const formatDurationCompact = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  const day = Math.floor(safe / 86400)
  const hour = Math.floor((safe % 86400) / 3600)
  const minute = Math.floor((safe % 3600) / 60)
  const sec = safe % 60

  if (day > 0) {
    if (hour > 0) return `${day}天 ${hour}小时`
    return `${day}天 ${minute}分钟`
  }
  if (hour > 0) return `${hour}小时 ${minute}分钟`
  if (minute > 0) return `${minute}分钟`
  return `${sec}秒`
}

// ================= 主控组件 =================
export default function AudioPlayer({
  lesson,
  lessonGroup,
  prevId,
  nextId,
  lessonSwitcher: _lessonSwitcher,
  initialTotalPlaySeconds = 0,
  initialPlayedDays = 0,
  vocabularyMetaMap,
  isEmbedded = false,
  forceBlindMode,
}: Props) {
  const router = useRouter()
  const {
    audioRef,
    activeId,
    isPlaying,
    playbackRate,
    isTrackLoop,
    loopId,
    togglePlaybackRate,
    toggleTrackLoop,
    playSentence,
    toggleLoop,
  } = useAudioController(lesson.dialogue)

  const [isBlindMode, setIsBlindMode] = useState(false)

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
  const [sessionPlaySeconds, setSessionPlaySeconds] = useState(0)
  const [totalPlaySeconds, setTotalPlaySeconds] = useState(
    initialTotalPlaySeconds,
  )
  const [playedDays, setPlayedDays] = useState(initialPlayedDays)
  const sessionPlaySecondsRef = useRef(0)
  const totalPlaySecondsRef = useRef(initialTotalPlaySeconds)
  const dirtySecondsRef = useRef(0)
  const isFlushingRef = useRef(false)
  const activeSentenceNo =
    activeId === null
      ? 0
      : lesson.dialogue.findIndex(item => item.id === activeId) + 1
  const activeSentenceIndex =
    activeId === null
      ? -1
      : lesson.dialogue.findIndex(item => item.id === activeId)
  const previousSentenceId =
    activeSentenceIndex > 0
      ? (lesson.dialogue[activeSentenceIndex - 1]?.id ?? null)
      : null
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
    const pronMap = entries.reduce<Record<string, string>>(
      (acc, [word, meta]) => {
        const pronunciation = meta.pronunciations[0]
        if (pronunciation) acc[word] = pronunciation
        return acc
      },
      {},
    )
    const html = annotateJapaneseText(text, pronMap, {
      rubyClassName: 'text-slate-900 dark:text-slate-100',
      rtClassName: 'text-[10px] font-bold text-slate-500 dark:text-slate-300',
    })
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  }

  // ---------------- 音频控制逻辑 ----------------

  const handleSentenceClick = (item: DialogueItem) => {
    const selection = window.getSelection()
    if (selection && selection.toString().trim().length > 0) return
    if (activeTooltip) {
      setActiveTooltip(null)
      return
    }
    playSentence(item)
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
        firstPron,
        pronunciationList,
        meaningList,
        partOfSpeechList[0],
        partOfSpeechList,
      )
      if (res.success) {
        setLocalVocabularyMetaMap(prev => ({
          ...prev,
          [word]: {
            pronunciations: pronunciationList,
            partsOfSpeech:
              partOfSpeechList.length > 0
                ? partOfSpeechList
                : existingMeta.partsOfSpeech,
            meanings: meaningList,
          },
        }))
        setWordSaveState('success')
        setTimeout(() => setActiveTooltip(null), 1500)
      } else if (res.state === 'already_exists') {
        setLocalVocabularyMetaMap(prev => ({
          ...prev,
          [word]: {
            pronunciations: pronunciationList,
            partsOfSpeech:
              partOfSpeechList.length > 0
                ? partOfSpeechList
                : existingMeta.partsOfSpeech,
            meanings: meaningList,
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

  const handleBackToPrevious = () => {
    router.push('/shadowing')
  }

  // ---------------- 副作用钩子 ----------------
  useEffect(() => {
    if (forceBlindMode !== undefined) {
      setIsBlindMode(forceBlindMode)
    }
  }, [forceBlindMode])

  useEffect(() => {
    // 仅在切换材料时重置会话计时，避免上报后 props 回流导致每 10s 清零。
    sessionPlaySecondsRef.current = 0
    totalPlaySecondsRef.current = initialTotalPlaySeconds
    dirtySecondsRef.current = 0
    setSessionPlaySeconds(0)
    setTotalPlaySeconds(initialTotalPlaySeconds)
    setPlayedDays(initialPlayedDays)
  }, [lesson.id])

  useEffect(() => {
    if (!isPlaying) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      sessionPlaySecondsRef.current += 1
      totalPlaySecondsRef.current += 1
      dirtySecondsRef.current += 1
      setSessionPlaySeconds(sessionPlaySecondsRef.current)
      setTotalPlaySeconds(totalPlaySecondsRef.current)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isPlaying])

  useEffect(() => {
    const flushPlaytime = async () => {
      if (dirtySecondsRef.current <= 0 || isFlushingRef.current) return
      const delta = dirtySecondsRef.current
      dirtySecondsRef.current = 0
      isFlushingRef.current = true
      const result = await logMaterialPlaytime(lesson.materialId, delta)
      if (result.success && typeof result.totalSeconds === 'number') {
        totalPlaySecondsRef.current = result.totalSeconds
        setTotalPlaySeconds(result.totalSeconds)
        if (typeof result.playedDays === 'number') {
          setPlayedDays(result.playedDays)
        }
      } else {
        // 上报失败时回退计数，下一轮重试。
        dirtySecondsRef.current += delta
      }
      isFlushingRef.current = false
    }

    const onVisibilityChange = () => {
      if (document.hidden) void flushPlaytime()
    }
    const onPageHide = () => {
      void flushPlaytime()
    }

    const timer = window.setInterval(() => {
      void flushPlaytime()
    }, 10000)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      void flushPlaytime()
    }
  }, [lesson.materialId])

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
    if (activeId === null) return
    const targetId =
      isBlindMode && previousSentenceId !== null ? previousSentenceId : activeId
    const element = document.getElementById(`sentence-${targetId}`)
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeId, isBlindMode, previousSentenceId])

  return (
    <div
      className={`relative bg-slate-50 dark:bg-slate-950 ${
        isEmbedded ? 'min-h-full h-full overflow-y-auto' : 'min-h-screen'
      }`}
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
          onPronunciationChange={setTooltipPronunciation}
          partOfSpeechValue={tooltipPartOfSpeech}
          onPartOfSpeechChange={setTooltipPartOfSpeech}
          partOfSpeechOptions={
            activeTooltip
              ? getPosOptions(activeTooltip.word, activeTooltip.contextSentence)
              : []
          }
          meaningValue={tooltipMeaning}
          onMeaningChange={setTooltipMeaning}
        />
      )}

      <header className='sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl shadow-[0_1px_5px_-4px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-950/80'>
        <div className='mx-auto w-full max-w-5xl px-3 py-2 md:px-6 md:py-3'>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={handleBackToPrevious}
              className='inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'>
              <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M15 19l-7-7 7-7'
                />
              </svg>
              返回
            </button>

            <div className='min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900'>
              <h1 className='truncate text-sm font-bold text-slate-900 dark:text-slate-100'>
                {lesson.title}
              </h1>
              <p className='hidden truncate text-[11px] font-semibold text-slate-500 md:block'>
                {lessonGroup.name}
              </p>
            </div>

            {prevId ? (
              <Link
                href={`/shadowing/${prevId}`}
                className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'>
                <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M15 19l-7-7 7-7'
                  />
                </svg>
              </Link>
            ) : null}
            {nextId ? (
              <Link
                href={`/shadowing/${nextId}`}
                className='inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'>
                <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M9 5l7 7-7 7'
                  />
                </svg>
              </Link>
            ) : null}
          </div>

          <div className='mt-2 overflow-x-auto'>
            <div className='flex min-w-max items-center gap-2 pb-0.5'>
              <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'>
                本次 {formatDuration(sessionPlaySeconds)}
              </span>
              <span className='rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'>
                累计 {formatDurationCompact(totalPlaySeconds)}
              </span>
              <span className='rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'>
                {Math.max(playedDays, totalPlaySeconds > 0 ? 1 : 0)} 天
              </span>

              <button
                onClick={toggleTrackLoop}
                aria-pressed={isTrackLoop}
                title='整段循环播放'
                className={`h-7 rounded-lg border px-2 text-xs font-semibold transition-colors ${
                  isTrackLoop
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}>
                循环
              </button>
              <button
                onClick={togglePlaybackRate}
                title='切换播放速度'
                className='h-7 min-w-[3.3rem] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'>
                {playbackRate}x
              </button>

              <div className='flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-[inset_0_1px_1px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900'>
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
            </div>
          </div>
        </div>
      </header>

      <div className='mx-auto w-full max-w-5xl px-4 py-4 md:px-6 md:py-5'>
        {activeSentenceEntries.length > 0 && (
          <div className='mb-4 rounded-[18px] bg-white p-3 shadow-[0_1px_5px_-4px_rgba(15,23,42,0.35),0_0_0_1px_rgba(15,23,42,0.08),0_4px_10px_rgba(15,23,42,0.04)] dark:border dark:border-slate-700 dark:bg-slate-900 md:p-4 '>
            <div className='mb-2 flex items-center justify-between'>
              <h2 className='text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100'>
                词条区
              </h2>
              <span className='text-[11px] text-slate-400 dark:text-slate-400'>
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
                  : forceBlindMode
                    ? 'blur'
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
              onToggleLoop={e => toggleLoop(item)}
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
      ? 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900'
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
          className={`flex-1 min-w-0 rounded-2xl border p-4 text-lg leading-relaxed transition-[background-color,border-color,color,box-shadow,filter,opacity] duration-300 select-text wrap-break-word md:p-5 md:text-xl
          ${
            isActive
              ? 'scale-[1.01] border-slate-900 bg-slate-100 text-slate-900 font-bold shadow-sm dark:border-slate-100 dark:bg-slate-800 dark:text-slate-100'
              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:bg-slate-800'
          }
          ${isBlindMode && blindState === 'clear' ? 'border-slate-400/80 bg-white text-slate-900 dark:border-slate-500 dark:bg-slate-900 dark:text-slate-100' : ''}
        `}>
        <div
          className={`min-w-0 transition-[filter,opacity] duration-300 ${blurClass}`}>
          {renderedText}
        </div>
      </div>

      {/* 右侧操作区 */}
      <div className='flex w-9 shrink-0 flex-col gap-2 md:w-10'>
          <button
            onClick={onAddToReview}
            title={canAddToReview ? '加入跟读训练库' : '先完成释义匹配'}
            disabled={savingDialogueId === item.id || !canAddToReview}
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs transition-colors duration-200 md:h-10 md:w-10
            ${isActive && currentState === 'idle' ? 'scale-110 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200' : currentBgClass}
            ${isActive || currentState !== 'idle' ? 'ring-2 ring-slate-200 dark:ring-slate-500/30' : ''}
          `}>
          <SaveStatusIcon
            state={currentState}
            className='h-4 w-4 md:h-5 md:w-5'
          />
        </button>

          <button
            onClick={onToggleLoop}
            title='单句复读'
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs transition-colors duration-200 md:h-10 md:w-10
            ${isLooping ? 'scale-110 bg-slate-900 text-white ring-2 ring-slate-200 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-400/40' : isActive ? 'scale-105 bg-slate-800 text-white hover:bg-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100' : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'}
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
