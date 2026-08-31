'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { StudyTimeKind } from '@prisma/client'

import { addSentenceToReview } from '@/modules/review/actions/memory'
import { logMaterialPlaytime } from '@/features/audio/actions'

import type { TooltipSaveState } from '@/components/vocabulary/VocabularySaveStatus'
import WordTooltip from '@/components/exam/WordTooltip'
import TrustedHtml from '@/components/ui/TrustedHtml'
import { useShowPronunciation } from '@/hooks/usePronunciationPrefs'
import {
  annotateJapaneseText,
  annotateJapaneseTextWithSudachi,
  formatJapaneseTextWithRubyNotation,
  formatJapaneseTextWithSudachiRubyNotation,
} from '@/utils/language/japaneseRuby'
import { inferContextualPos } from '@/utils/language/posTagger'
import {
  buildPronunciationMapForText,
} from '@/utils/vocabulary/japaneseInflection'
import useStudyTimeHeartbeat from '@/hooks/useStudyTimeHeartbeat'
import { useTextSelection } from '@/hooks/useTextSelection'
import { useStudyTextHighlights } from '@/hooks/useStudyTextHighlights'
import LearningPointHighlightPanel from '@/modules/knowledge/learning-records/components/LearningPointHighlightPanel'
import { useAudioController } from './useAudioController'
import { getCleanSelectionText } from '@/utils/text/selection'
import { buildAudioDialogueSourceId } from '@/utils/audioDialogue/sourceId'
import ListeningPlayerHeader from './ListeningPlayerHeader'
import ListeningSentenceRow from './ListeningSentenceRow'
import type { SudachiLexeme } from '@/modules/language/domain/sudachi'
import {
  PRONUNCIATION_SOURCE_STORAGE_KEY,
  type PronunciationSource,
} from '@/components/ui/PronunciationSourceSelector'
import {
  readUserStorageValue,
  useCurrentUser,
  userStorageKey,
} from '@/context/UserContext'
import { copyText } from '@/features/reading/ui/copy-text'

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

type VocabularyMeta = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

interface Props {
  lesson: PlayerLesson
  lessonGroup: { name: string }
  prevId: string | null
  nextId: string | null
  initialTotalPlaySeconds?: number
  initialPlayedDays?: number
  vocabularyMetaMap: Record<string, VocabularyMeta>
  isEmbedded?: boolean
  forceBlindMode?: boolean
}

// ================= 主控组件 =================
export default function AudioPlayer({
  lesson,
  lessonGroup,
  prevId,
  nextId,
  initialTotalPlaySeconds = 0,
  initialPlayedDays = 0,
  vocabularyMetaMap,
  isEmbedded = false,
  forceBlindMode,
}: Props) {
  const currentUser = useCurrentUser()
  const pronunciationStorageKey = userStorageKey(
    currentUser.id,
    PRONUNCIATION_SOURCE_STORAGE_KEY,
  )
  const router = useRouter()
  const {
    audioRef,
    activeId,
    isPlaying,
    playbackRate,
    isTrackLoop,
    loopId,
    togglePlayback,
    togglePlaybackRate,
    toggleTrackLoop,
    playSentence,
    toggleLoop,
  } = useAudioController(lesson.dialogue)
  const { selection, closeSelection } = useTextSelection()

  const [isBlindMode, setIsBlindMode] = useState(false)
  const [showLearningPoints, setShowLearningPoints] = useState(false)
  const [savingDialogueId, setSavingDialogueId] = useState<number | null>(null)
  const [dialogueSaveState, setDialogueSaveState] =
    useState<TooltipSaveState>('idle')
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const [pronunciationSource, setPronunciationSourceState] =
    useState<PronunciationSource>('personal')
  const [sudachiLexicon, setSudachiLexicon] = useState<
    Record<string, SudachiLexeme>
  >({})
  const [sudachiAvailable, setSudachiAvailable] = useState(false)
  const [localVocabularyMetaMap, setLocalVocabularyMetaMap] =
    useState(vocabularyMetaMap)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>(
    'idle',
  )
  useStudyTimeHeartbeat({
    enabled: isPlaying,
    kind: StudyTimeKind.LESSON_SPEAKING,
    intervalMs: 45000,
  })
  const [sessionPlaySeconds, setSessionPlaySeconds] = useState(0)
  const [totalPlaySeconds, setTotalPlaySeconds] = useState(
    initialTotalPlaySeconds,
  )
  const [playedDays, setPlayedDays] = useState(initialPlayedDays)
  const sessionPlaySecondsRef = useRef(0)
  const totalPlaySecondsRef = useRef(initialTotalPlaySeconds)
  const dirtySecondsRef = useRef(0)
  const isFlushingRef = useRef(false)
  const playerRootRef = useRef<HTMLDivElement>(null)
  const { learningPoints, isLoadingLearningPoints } = useStudyTextHighlights({
    rootRef: playerRootRef,
    contentKey: lesson.materialId,
    showLearningPoints,
  })
  const activeSentenceIndex =
    activeId === null
      ? -1
      : lesson.dialogue.findIndex(item => item.id === activeId)
  const previousSentenceId =
    activeSentenceIndex > 0
      ? (lesson.dialogue[activeSentenceIndex - 1]?.id ?? null)
      : null
  const transcriptPlainText = useMemo(
    () =>
      lesson.dialogue
        .map(item => item.text.trim())
        .filter(Boolean)
        .join('\n'),
    [lesson.dialogue],
  )
  const transcriptTexts = useMemo(
    () => lesson.dialogue.map(item => item.text.trim()).filter(Boolean),
    [lesson.dialogue],
  )
  const transcriptTextKey = useMemo(
    () => transcriptTexts.join('\u0000'),
    [transcriptTexts],
  )
  const personalPronunciationMap = useMemo(
    () =>
      Object.entries(localVocabularyMetaMap).reduce<Record<string, string>>(
        (acc, [word, meta]) => {
          const pronunciation = (meta.pronunciations[0] || '').trim()
          if (pronunciation) acc[word] = pronunciation
          return acc
        },
        {},
      ),
    [localVocabularyMetaMap],
  )
  const selectedVocabularyMeta = useMemo(() => {
    if (!selection.text) return undefined
    const existing = localVocabularyMetaMap[selection.text]
    return {
      pronunciations: existing?.pronunciations || [],
      meanings: existing?.meanings || [],
      partsOfSpeech: inferContextualPos(
        selection.text,
        selection.contextSentence,
        existing?.partsOfSpeech || [],
      ),
    }
  }, [localVocabularyMetaMap, selection.contextSentence, selection.text])
  const annotateSentence = (text: string) => {
    if (!showPronunciation) return text
    if (
      pronunciationSource === 'sudachi' &&
      Object.keys(sudachiLexicon).length > 0
    ) {
      const html = annotateJapaneseTextWithSudachi(text, sudachiLexicon, {
        pronunciationMap: buildPronunciationMapForText(
          text,
          personalPronunciationMap,
        ),
        useSudachiReading: true,
        rubyEnabled: true,
        rubyClassName: 'text-slate-900 dark:text-slate-100',
        rtClassName: 'text-[10px] font-bold text-slate-500 dark:text-slate-300',
      })
      return <TrustedHtml html={html} />
    }
    const pronMap = buildPronunciationMapForText(
      text,
      personalPronunciationMap,
    )
    if (Object.keys(pronMap).length === 0) return text
    const html = annotateJapaneseText(text, pronMap, {
      rubyClassName: 'text-slate-900 dark:text-slate-100',
      rtClassName: 'text-[10px] font-bold text-slate-500 dark:text-slate-300',
    })
    return <TrustedHtml html={html} />
  }

  const setPronunciationSource = (source: PronunciationSource) => {
    if (source === 'sudachi' && !sudachiAvailable) return
    setPronunciationSourceState(source)
    window.localStorage.setItem(pronunciationStorageKey, source)
  }

  // ---------------- 音频控制逻辑 ----------------

  const handleSentenceClick = (item: DialogueItem) => {
    const windowSelection = window.getSelection()
    if (getCleanSelectionText(windowSelection).length > 0) return
    if (selection.isVisible) {
      closeSelection()
      return
    }
    playSentence(item)
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
    } catch {
      setDialogueSaveState('error')
      setTimeout(() => {
        setSavingDialogueId(null)
        setDialogueSaveState('idle')
      }, 1500)
    }
  }

  const handleBackToPrevious = () => {
    router.push('/listening')
  }

  const handleCopyTranscript = async () => {
    if (!transcriptPlainText) return
    try {
      const copyValue = !showPronunciation
        ? transcriptPlainText
        : pronunciationSource === 'sudachi' &&
            Object.keys(sudachiLexicon).length > 0
          ? transcriptTexts
              .map(text =>
                formatJapaneseTextWithSudachiRubyNotation(
                  text,
                  sudachiLexicon,
                ),
              )
              .join('\n')
          : transcriptTexts
              .map(text =>
                formatJapaneseTextWithRubyNotation(
                  text,
                  buildPronunciationMapForText(
                    text,
                    personalPronunciationMap,
                  ),
                ),
              )
              .join('\n')
      await copyText(copyValue)
      setCopyStatus('success')
      window.setTimeout(() => setCopyStatus('idle'), 1800)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 1800)
    }
  }

  // ---------------- 副作用钩子 ----------------
  useEffect(() => {
    const stored = readUserStorageValue(
      currentUser.id,
      PRONUNCIATION_SOURCE_STORAGE_KEY,
    )
    if (stored === 'personal') setPronunciationSourceState('personal')
  }, [currentUser.id])

  useEffect(() => {
    if (transcriptTexts.length === 0) {
      setSudachiLexicon({})
      setSudachiAvailable(false)
      return
    }
    const controller = new AbortController()
    setSudachiLexicon({})
    setSudachiAvailable(false)

    void fetch('/api/pronunciation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: transcriptTexts }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) return null
        return (await response.json()) as {
          available?: boolean
          lexicon?: Record<string, SudachiLexeme>
        }
      })
      .then(result => {
        if (!result?.available) return
        setSudachiLexicon(result.lexicon || {})
        setSudachiAvailable(true)
        const stored = readUserStorageValue(
          currentUser.id,
          PRONUNCIATION_SOURCE_STORAGE_KEY,
        )
        if (stored !== 'personal') setPronunciationSourceState('sudachi')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
      })

    return () => controller.abort()
  }, [currentUser.id, transcriptTextKey, transcriptTexts])

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
  }, [initialPlayedDays, initialTotalPlaySeconds, lesson.id])

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
    if (activeId === null) return
    const frameId = window.requestAnimationFrame(() => {
      const element = document.getElementById(`sentence-${activeId}`)
      if (!element) return

      const root = isEmbedded ? playerRootRef.current : null
      const rootRect = root?.getBoundingClientRect()
      const headerBottom =
        playerRootRef.current
          ?.querySelector('header')
          ?.getBoundingClientRect().bottom ?? 0
      const viewportBottom = rootRect
        ? Math.min(rootRect.bottom, window.innerHeight)
        : window.innerHeight
      const safeTop = Math.max(rootRect?.top ?? 0, headerBottom) + 16
      const safeBottom = Math.max(safeTop + 80, viewportBottom - 24)
      const targetRect = element.getBoundingClientRect()
      const targetCenter = targetRect.top + targetRect.height / 2
      const visibleCenter = safeTop + (safeBottom - safeTop) / 2
      const scrollDelta = targetCenter - visibleCenter

      if (Math.abs(scrollDelta) < 2) return
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches
        ? 'auto'
        : 'smooth'
      if (root) root.scrollBy({ top: scrollDelta, behavior })
      else window.scrollBy({ top: scrollDelta, behavior })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [activeId, isEmbedded])

  return (
    <div
      ref={playerRootRef}
      className={`relative bg-slate-50 dark:bg-slate-950 ${
        isEmbedded ? 'min-h-full h-full overflow-y-auto' : 'min-h-screen'
      }`}>
      <audio ref={audioRef} src={lesson.audioFile} preload='metadata' />

      {selection.isVisible && selection.sourceType !== '' ? (
        <>
          <div className='pointer-events-none fixed inset-0 z-40'>
            {selection.rects.map((rect, index) => (
              <span
                key={`${rect.left}-${rect.top}-${index}`}
                className='absolute rounded-[2px] bg-blue-400/35'
                style={{
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                }}
              />
            ))}
          </div>
          <WordTooltip
            word={selection.text}
            x={selection.x}
            y={selection.y}
            isTop={selection.isTop}
            contextSentence={selection.contextSentence}
            sourceType={selection.sourceType}
            sourceId={selection.sourceId}
            detectedWord={selection.detectedWord}
            initialMeta={selectedVocabularyMeta}
            onClose={closeSelection}
            onSaved={({ word, meta }) =>
              setLocalVocabularyMetaMap(prev => ({
                ...prev,
                [word]: meta,
              }))
            }
          />
        </>
      ) : null}

      <ListeningPlayerHeader
        title={lesson.title}
        groupName={lessonGroup.name}
        dialogueCount={lesson.dialogue.length}
        prevId={prevId}
        nextId={nextId}
        isPlaying={isPlaying}
        isTrackLoop={isTrackLoop}
        playbackRate={playbackRate}
        showPronunciation={showPronunciation}
        showLearningPoints={showLearningPoints}
        pronunciationSource={pronunciationSource}
        sudachiAvailable={sudachiAvailable}
        isBlindMode={isBlindMode}
        sessionPlaySeconds={sessionPlaySeconds}
        totalPlaySeconds={totalPlaySeconds}
        playedDays={playedDays}
        copyStatus={copyStatus}
        onBack={handleBackToPrevious}
        onCopy={handleCopyTranscript}
        onTogglePlayback={togglePlayback}
        onToggleTrackLoop={toggleTrackLoop}
        onTogglePlaybackRate={togglePlaybackRate}
        onShowPronunciationChange={setShowPronunciation}
        onLearningPointsChange={setShowLearningPoints}
        onPronunciationSourceChange={setPronunciationSource}
        onBlindModeChange={setIsBlindMode}
      />

      {showLearningPoints ? (
        <div className='mx-auto w-full max-w-5xl px-3 pt-3 md:px-5'>
          <LearningPointHighlightPanel
            points={learningPoints}
            isLoading={isLoadingLearningPoints}
          />
        </div>
      ) : null}

      <div className='mx-auto w-full max-w-5xl px-3 py-4 md:px-5 md:py-5'>
        <div className='min-w-0 space-y-2 pb-24 md:pb-32'>
          {lesson.dialogue.map((item, index) => (
            <ListeningSentenceRow
              key={item.id}
              sequence={index + 1}
              sourceId={buildAudioDialogueSourceId(
                lesson.materialId,
                String(item.id),
              )}
              item={item}
              isActive={activeId === item.id}
              isLooping={loopId === item.id}
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
              onClick={() => handleSentenceClick(item)}
              onToggleLoop={event => {
                event.stopPropagation()
                toggleLoop(item)
              }}
              onAddToReview={event => handleAddToReview(event, item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
