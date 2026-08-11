'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { StudyTimeKind } from '@/lib/domain/prisma-enums'

import { addSentenceToReview } from '@/modules/review/actions/memory'
import { logMaterialPlaytime } from '@/features/audio/actions'

import type { TooltipSaveState } from '@/components/vocabulary/VocabularySaveStatus'
import WordTooltip from '@/components/exam/WordTooltip'
import TrustedHtml from '@/components/ui/TrustedHtml'
import WordMetaPanel from '@/components/vocabulary/WordMetaPanel'
import {
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import { annotateJapaneseText } from '@/utils/language/japaneseRuby'
import { inferContextualPos } from '@/utils/language/posTagger'
import {
  buildPronunciationMapForText,
  buildSurfaceAliasMapForText,
} from '@/utils/vocabulary/japaneseInflection'
import useStudyTimeHeartbeat from '@/hooks/useStudyTimeHeartbeat'
import { useTextSelection } from '@/hooks/useTextSelection'
import { useAudioController } from './useAudioController'
import { getCleanSelectionText } from '@/utils/text/selection'
import { buildAudioDialogueSourceId } from '@/utils/audioDialogue/sourceId'
import ListeningPlayerHeader from './ListeningPlayerHeader'
import ListeningSentenceRow from './ListeningSentenceRow'

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
  const [savingDialogueId, setSavingDialogueId] = useState<number | null>(null)
  const [dialogueSaveState, setDialogueSaveState] =
    useState<TooltipSaveState>('idle')
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()
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
  const playerRootRef = useRef<HTMLDivElement>(null)
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
        const aliasMap = buildSurfaceAliasMapForText(
          item.text,
          entries.map(([word]) => word),
        )
        const bestByBase = new Map<
          string,
          {
            word: string
            baseWord: string
            pronunciation: string
            pronunciations: string[]
            partsOfSpeech: string[]
            meanings: string[]
          }
        >()
        Object.entries(aliasMap).forEach(([surface, base]) => {
          const meta = localVocabularyMetaMap[base]
          if (!meta) return
          const nextItem = {
            word: surface,
            baseWord: base,
            pronunciation: meta.pronunciations[0] || '',
            pronunciations: meta.pronunciations,
            partsOfSpeech: meta.partsOfSpeech,
            meanings: meta.meanings,
          }
          const existing = bestByBase.get(base)
          if (!existing || surface.length > existing.word.length) {
            bestByBase.set(base, nextItem)
          }
        })
        const matched = Array.from(bestByBase.values())
          .sort((a, b) => b.word.length - a.word.length)
          .slice(0, 6)
          .map(item => ({
            word: item.word,
            pronunciation: item.pronunciation,
            pronunciations: item.pronunciations,
            partsOfSpeech: item.partsOfSpeech,
            meanings: item.meanings,
          }))
        return [item.id, matched] as const
      }),
    )
  }, [localVocabularyMetaMap, lesson.dialogue])
  const transcriptPlainText = useMemo(
    () =>
      lesson.dialogue
        .map(item => item.text.trim())
        .filter(Boolean)
        .join('\n'),
    [lesson.dialogue],
  )
  const activeSentenceEntries = activeId
    ? sentenceMetaMap.get(activeId) || []
    : []
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
    const basePronMap = Object.entries(localVocabularyMetaMap).reduce<
      Record<string, string>
    >((acc, [word, meta]) => {
      const pronunciation = (meta.pronunciations[0] || '').trim()
      if (pronunciation) acc[word] = pronunciation
      return acc
    }, {})
    const pronMap = buildPronunciationMapForText(text, basePronMap)
    if (Object.keys(pronMap).length === 0) return text
    const html = annotateJapaneseText(text, pronMap, {
      rubyClassName: 'text-slate-900 dark:text-slate-100',
      rtClassName: 'text-[10px] font-bold text-slate-500 dark:text-slate-300',
    })
    return <TrustedHtml html={html} />
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
      await navigator.clipboard.writeText(transcriptPlainText)
      setCopyStatus('success')
      window.setTimeout(() => setCopyStatus('idle'), 1800)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 1800)
    }
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
      const targetId =
        isBlindMode && previousSentenceId !== null
          ? previousSentenceId
          : activeId
      const element = document.getElementById(`sentence-${targetId}`)
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
      const safeTop = Math.max(0, headerBottom) + 16
      const safeBottom = Math.max(safeTop + 80, viewportBottom - 72)
      const targetRect = element.getBoundingClientRect()
      const scrollDelta =
        targetRect.top < safeTop
          ? targetRect.top - safeTop
          : targetRect.bottom > safeBottom
            ? targetRect.bottom - safeBottom
            : 0

      // 当前句仍在舒适阅读区时保持用户视角，只在离开视区时最小幅度跟随。
      if (Math.abs(scrollDelta) < 1) return
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches
        ? 'auto'
        : 'smooth'
      if (root) root.scrollBy({ top: scrollDelta, behavior })
      else window.scrollBy({ top: scrollDelta, behavior })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [activeId, isBlindMode, isEmbedded, previousSentenceId])

  const activeVocabularyPanel =
    activeId !== null && activeSentenceEntries.length > 0 ? (
      <section className='rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 md:p-4'>
        <div className='mb-2 flex items-center justify-between'>
          <h2 className='text-sm font-bold text-slate-900 dark:text-slate-100'>
            当前句词汇
          </h2>
          <span className='text-[11px] text-slate-400'>
            第 {activeSentenceNo} 句
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
          matchedMeaningMap={meaningMatchBySentence[activeId] || {}}
          onMatchedMeaningChange={(word, meaningIndex) => {
            setMeaningMatchBySentence(prev => ({
              ...prev,
              [activeId]: {
                ...(prev[activeId] || {}),
                [word]: meaningIndex,
              },
            }))
          }}
        />
      </section>
    ) : null

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
            initialMeta={selectedVocabularyMeta}
            onClose={closeSelection}
            onSaved={({ word, meta }) =>
              setLocalVocabularyMetaMap(prev => ({
                ...prev,
                [word]: meta,
                ...(selection.text && selection.text !== word
                  ? { [selection.text]: meta }
                  : {}),
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
        showMeaning={showMeaning}
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
        onShowMeaningChange={setShowMeaning}
        onBlindModeChange={setIsBlindMode}
      />

      <div className='mx-auto grid w-full max-w-6xl gap-4 px-3 py-3 md:px-5 md:py-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start'>
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
              activeVocabulary={
                activeId === item.id ? activeVocabularyPanel : null
              }
              canAddToReview={isSentenceMeaningMatched(item.id)}
              onClick={() => handleSentenceClick(item)}
              onToggleLoop={event => {
                event.stopPropagation()
                toggleLoop(item)
              }}
              onAddToReview={event => handleAddToReview(event, item.id)}
            />
          ))}
        </div>

        <aside className='sticky top-28 hidden max-h-[calc(100vh-8rem)] overflow-y-auto [overflow-anchor:none] lg:block'>
          {activeVocabularyPanel || (
            <div className='rounded-xl border border-dashed border-slate-300 bg-white/60 p-5 text-center dark:border-slate-700 dark:bg-slate-900/60'>
              <p className='text-sm font-semibold text-slate-600 dark:text-slate-300'>
                播放一句后显示词汇
              </p>
              <p className='mt-1 text-xs text-slate-400'>
                词汇会固定在右侧，不会挤动正文
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
