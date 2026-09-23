'use client'

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { StudyTimeKind } from '@prisma/client'

import { addSentenceToReview } from '@/modules/review/actions/memory'
import { logMaterialPlaytime } from '@/modules/media/audio/actions'

import type { TooltipSaveState } from '@/modules/knowledge/vocabulary/components/VocabularySaveStatus'
import WordTooltip from '@/modules/knowledge/vocabulary/components/WordTooltip'
import TrustedHtml from '@/components/ui/TrustedHtml'
import { useShowPronunciation } from '@/modules/language/hooks/usePronunciationPrefs'
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
import useStudyTimeHeartbeat from '@/modules/progress/useStudyTimeHeartbeat'
import { useTextSelection } from '@/hooks/useTextSelection'
import { useStudyTextHighlights } from '@/modules/knowledge/learning-records/useStudyTextHighlights'
import LearningPointHighlightPanel from '@/modules/knowledge/learning-records/components/LearningPointHighlightPanel'
import VocabularyWordbookInspector from '@/modules/knowledge/vocabulary/components/VocabularyWordbookInspector'
import { useAudioController } from './useAudioController'
import { getCleanSelectionText } from '@/utils/text/selection'
import { buildAudioDialogueSourceId } from '@/utils/audioDialogue/sourceId'
import ListeningPlayerHeader from './ListeningPlayerHeader'
import ListeningSentenceRow from './ListeningSentenceRow'
import type { SudachiLexeme } from '@/modules/language/domain/sudachi'
import { usePronunciationSource } from '@/modules/language/hooks/usePronunciationSource'
import { copyText } from '@/modules/reading/components/copy-text'
import WordbookHighlightSelector from '@/modules/reading/components/WordbookHighlightSelector'
import type { PaperWordbookDistribution } from '@/modules/practice/domain/paper-word-frequency'
import {
  groupWordbookDistributionBySource,
  isJlptVisibleWithHiddenLevels,
} from '@/modules/reading/domain/wordbook-highlight-groups'
import { JLPT_LEVELS, type VocabularyJlptLevel } from '@/modules/knowledge/vocabulary/domain/jlpt'
import {
  buildSurfaceAliasMapForText,
  buildSurfaceVariantMapForText,
} from '@/utils/vocabulary/japaneseInflection'
import { applyVocabularyInspectorMetaUpdate } from '@/modules/knowledge/vocabulary/domain/inspector-meta'

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
  } = useAudioController(lesson.dialogue, lesson.audioFile)
  const [isBlindMode, setIsBlindMode] = useState(false)
  const { selection, closeSelection } = useTextSelection(!isBlindMode)
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [showLearningPoints, setShowLearningPoints] = useState(false)
  const [savingDialogueId, setSavingDialogueId] = useState<number | null>(null)
  const [dialogueSaveState, setDialogueSaveState] =
    useState<TooltipSaveState>('idle')
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const [sudachiLexicon, setSudachiLexicon] = useState<
    Record<string, SudachiLexeme>
  >({})
  const [sudachiAvailable, setSudachiAvailable] = useState(false)
  const [wordbookDistribution, setWordbookDistribution] =
    useState<PaperWordbookDistribution | null>(null)
  const [wordbookAnalysisState, setWordbookAnalysisState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [wordbookRetryKey, setWordbookRetryKey] = useState(0)
  const [hiddenWordbookIds, setHiddenWordbookIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [hiddenJlptLevels, setHiddenJlptLevels] = useState<Set<VocabularyJlptLevel>>(
    () => new Set(),
  )
  const [inspectedWord, setInspectedWord] = useState<{
    word: string
    matchedVariant: string
    wordbookId: string
    x: number
    y: number
  } | null>(null)
  const { pronunciationSource, setPronunciationSource } =
    usePronunciationSource(sudachiAvailable)
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
  const transcriptPlainText = useMemo(
    () =>
      lesson.dialogue
        .map(item => item.text.trim())
        .filter(Boolean)
        .join('\n'),
    [lesson.dialogue],
  )
  const wordbookHighlightGroups = useMemo(() => {
    const sources = groupWordbookDistributionBySource(
      wordbookDistribution?.wordbooks || [],
    )
    const jlptByCanonicalWord = new Map<string, Set<VocabularyJlptLevel>>()
    sources.forEach(source => {
      source.matchedWords.forEach(word => {
        const levels = jlptByCanonicalWord.get(word) || new Set<VocabularyJlptLevel>()
        ;(source.jlptByWord[word] || []).forEach(level => levels.add(level))
        jlptByCanonicalWord.set(word, levels)
      })
    })
    return sources
      .map(source => {
        const matchedHeadwords = Array.from(
          new Set(Object.values(source.matchedHeadwords)),
        )
        const aliases = buildSurfaceAliasMapForText(
          transcriptPlainText,
          matchedHeadwords,
        )
        const variants = buildSurfaceVariantMapForText(
          transcriptPlainText,
          matchedHeadwords,
        )
        const metadataByHeadword = new Map<
          string,
          { jlpt: Set<VocabularyJlptLevel>; wordbookIds: Set<string> }
        >()
        source.matchedWords.forEach(word => {
          const headword = source.matchedHeadwords[word] || word
          const metadata = metadataByHeadword.get(headword) || {
            jlpt: new Set<VocabularyJlptLevel>(),
            wordbookIds: new Set<string>(),
          }
          ;(source.jlptByWord[word] || []).forEach(level =>
            metadata.jlpt.add(level),
          )
          ;(jlptByCanonicalWord.get(word) || []).forEach(level =>
            metadata.jlpt.add(level),
          )
          ;(source.wordbookIdsByWord[word] || []).forEach(wordbookId =>
            metadata.wordbookIds.add(wordbookId),
          )
          metadataByHeadword.set(headword, metadata)
        })
        const jlptByWord: Record<string, string[]> = {}
        const wordbookIdsByWord: Record<string, string[]> = {}
        source.matchedWords.forEach(word => {
          jlptByWord[word] = [...(jlptByCanonicalWord.get(word) || [])]
          wordbookIdsByWord[word] = source.wordbookIdsByWord[word] || []
        })
        metadataByHeadword.forEach((metadata, headword) => {
          jlptByWord[headword] = [...metadata.jlpt]
          wordbookIdsByWord[headword] = [...metadata.wordbookIds]
        })
        Object.entries(aliases).forEach(([surface, headword]) => {
          const metadata = metadataByHeadword.get(headword)
          jlptByWord[surface] = metadata ? [...metadata.jlpt] : []
          wordbookIdsByWord[surface] = metadata
            ? [...metadata.wordbookIds]
            : source.wordbookIds
        })
        return {
          id: source.id,
          label: source.label,
          words: Object.keys(aliases),
          canonicalWords: Array.from(new Set(Object.values(aliases))),
          jlptByWord,
          wordbookIdsByWord,
          aliases,
          variants,
        }
      })
      .filter(group => group.words.length > 0)
      .sort((left, right) => left.label.localeCompare(right.label, 'ja'))
  }, [transcriptPlainText, wordbookDistribution])
  const visibleWordbookSourceGroups = useMemo(
    () =>
      wordbookHighlightGroups.filter(group => !hiddenWordbookIds.has(group.id)),
    [hiddenWordbookIds, wordbookHighlightGroups],
  )
  const visibleWordbookHighlightGroups = useMemo(
    () =>
      visibleWordbookSourceGroups
        .map(group => ({
          ...group,
          words: group.words.filter(word =>
            isJlptVisibleWithHiddenLevels(
              group.jlptByWord?.[word] || [],
              hiddenJlptLevels,
            ),
          ),
          canonicalWords: (group.canonicalWords || []).filter(word =>
            isJlptVisibleWithHiddenLevels(
              group.jlptByWord?.[word] || [],
              hiddenJlptLevels,
            ),
          ),
        }))
        .filter(group => group.words.length > 0),
    [hiddenJlptLevels, visibleWordbookSourceGroups],
  )
  const wordbookTokenWords = useMemo(
    () =>
      showAnnotations
        ? Array.from(
            new Set(
              visibleWordbookSourceGroups.flatMap(group => group.words),
            ),
          )
        : [],
    [showAnnotations, visibleWordbookSourceGroups],
  )
  const wordbookSurfaceToBaseWord = useMemo(
    () =>
      Object.assign(
        {},
        ...wordbookHighlightGroups.map(group => group.aliases || {}),
      ) as Record<string, string>,
    [wordbookHighlightGroups],
  )
  const handleWordbookVisibilityChange = useCallback(
    (wordbookIds: string[], visible: boolean) =>
      setHiddenWordbookIds(current => {
        const next = new Set(current)
        wordbookIds.forEach(id => {
          if (visible) next.delete(id)
          else next.add(id)
        })
        return next
      }),
    [],
  )
  const handleJlptVisibilityChange = useCallback(
    (levels: VocabularyJlptLevel[], visible: boolean) =>
      setHiddenJlptLevels(current => {
        const next = new Set(current)
        levels.forEach(level => {
          if (visible) next.delete(level)
          else next.add(level)
        })
        return next
      }),
    [],
  )
  const handleAllHighlightVisibilityChange = useCallback((visible: boolean) => {
    setHiddenWordbookIds(
      visible
        ? new Set()
        : new Set(wordbookHighlightGroups.map(group => group.id)),
    )
    setHiddenJlptLevels(
      visible ||
        !wordbookHighlightGroups.some(group =>
          Object.values(group.jlptByWord || {}).some(levels => levels.length > 0),
        )
        ? new Set()
        : new Set(JLPT_LEVELS),
    )
  }, [wordbookHighlightGroups])
  const handleWordbookWordClick = useCallback((payload: {
    word: string
    wordbookId: string
    x: number
    y: number
  }) => {
    setInspectedWord({
      ...payload,
      word: wordbookSurfaceToBaseWord[payload.word] || payload.word,
      matchedVariant:
        wordbookHighlightGroups.find(
          group =>
            group.wordbookIdsByWord?.[payload.word]?.includes(
              payload.wordbookId,
            ) || group.id === payload.wordbookId,
        )?.variants?.[payload.word] || payload.word,
    })
  }, [wordbookHighlightGroups, wordbookSurfaceToBaseWord])
  const {
    learningPoints,
    isLoadingLearningPoints,
    learningPointSelection,
    closeLearningPoint,
    inspectLearningPoint,
    inspectLearningPointWord,
  } = useStudyTextHighlights({
    rootRef: playerRootRef,
    contentKey: `${lesson.materialId}:${showAnnotations}:${showPronunciation}:${pronunciationSource}:${Object.keys(sudachiLexicon).length}`,
    showLearningPoints: showLearningPoints && !isBlindMode,
    showWordbooks: showAnnotations && !isBlindMode,
    wordbookGroups: visibleWordbookHighlightGroups,
    onWordbookWordClick: handleWordbookWordClick,
  })
  const activeSentenceIndex =
    activeId === null
      ? -1
      : lesson.dialogue.findIndex(item => item.id === activeId)
  const previousSentenceId =
    activeSentenceIndex > 0
      ? (lesson.dialogue[activeSentenceIndex - 1]?.id ?? null)
      : null
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
    const existing =
      localVocabularyMetaMap[selection.detectedWord?.dictionaryForm || ''] ||
      localVocabularyMetaMap[selection.detectedWord?.surface || ''] ||
      localVocabularyMetaMap[selection.text]
    return {
      pronunciations: existing?.pronunciations || [],
      meanings: existing?.meanings || [],
      partsOfSpeech: inferContextualPos(
        selection.text,
        selection.contextSentence,
        existing?.partsOfSpeech || [],
      ),
    }
  }, [
    localVocabularyMetaMap,
    selection.contextSentence,
    selection.detectedWord,
    selection.text,
  ])
  const annotateSentence = (text: string) => {
    const hasSudachiLexicon = Object.keys(sudachiLexicon).length > 0
    const hasTokenWords = wordbookTokenWords.length > 0
    if (!showPronunciation && !hasTokenWords) return text
    if (hasSudachiLexicon) {
      const html = annotateJapaneseTextWithSudachi(text, sudachiLexicon, {
        pronunciationMap: buildPronunciationMapForText(
          text,
          personalPronunciationMap,
        ),
        useSudachiReading: pronunciationSource === 'sudachi',
        rubyEnabled: showPronunciation,
        rubyClassName: 'text-slate-900 dark:text-slate-100',
        rtClassName: 'text-[10px] font-bold text-slate-500 dark:text-slate-300',
        tokenClassName: hasTokenWords ? 'vocab-token' : undefined,
        tokenWords: hasTokenWords ? wordbookTokenWords : undefined,
      })
      return <TrustedHtml html={html} />
    }
    const pronMap = buildPronunciationMapForText(
      text,
      personalPronunciationMap,
    )
    if (Object.keys(pronMap).length === 0 && !hasTokenWords) return text
    const html = annotateJapaneseText(text, pronMap, {
      rubyEnabled: showPronunciation,
      rubyClassName: 'text-slate-900 dark:text-slate-100',
      rtClassName: 'text-[10px] font-bold text-slate-500 dark:text-slate-300',
      tokenClassName: hasTokenWords ? 'vocab-token' : undefined,
      tokenWords: hasTokenWords ? wordbookTokenWords : undefined,
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
      const res = await addSentenceToReview(
        buildAudioDialogueSourceId(lesson.materialId, String(dialogueId)),
      )
      if (res.success) setDialogueSaveState('success')
      else setDialogueSaveState(res.state === 'already_exists' ? 'already_exists' : 'error')

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
    if (transcriptTexts.length === 0) {
      setSudachiLexicon({})
      setSudachiAvailable(false)
      setWordbookDistribution(null)
      setWordbookAnalysisState('idle')
      return
    }
    const controller = new AbortController()
    setSudachiLexicon({})
    setSudachiAvailable(false)
    setWordbookDistribution(null)
    setWordbookAnalysisState('loading')

    void fetch('/api/pronunciation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts: transcriptTexts,
        includeWordbookAnalysis: true,
      }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) return null
        return (await response.json()) as {
          available?: boolean
          wordbookDistribution?: PaperWordbookDistribution
          lexicon?: Record<string, SudachiLexeme>
        }
      })
      .then(result => {
        if (!result) {
          setWordbookAnalysisState('error')
          return
        }
        setWordbookDistribution(result.wordbookDistribution || null)
        setWordbookAnalysisState('ready')
        if (!result.available) return
        setSudachiLexicon(result.lexicon || {})
        setSudachiAvailable(true)
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setWordbookAnalysisState('error')
      })

    return () => controller.abort()
    // transcriptTextKey is the stringified form of transcriptTexts, so
    // depending on the key alone avoids refetching (and aborting the in-flight
    // POST, which the server can observe as an empty/truncated body) when a
    // parent re-render recreates the texts array with identical content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcriptTextKey, wordbookRetryKey])

  useEffect(() => {
    if (forceBlindMode !== undefined) {
      setIsBlindMode(forceBlindMode)
    }
  }, [forceBlindMode])

  useEffect(() => {
    setHiddenWordbookIds(new Set())
    setHiddenJlptLevels(new Set())
    setInspectedWord(null)
  }, [lesson.id])

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
      className={`relative bg-[var(--editorial-paper)] ${
        isEmbedded ? 'min-h-full h-full overflow-y-auto' : 'min-h-screen'
      }`}>
      <audio ref={audioRef} src={lesson.audioFile} preload='metadata' />

      {!isBlindMode && selection.isVisible && selection.sourceType !== '' ? (
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
            onSaved={({ word, meta }) => {
              setLocalVocabularyMetaMap(prev => ({
                ...prev,
                [word]: meta,
              }))
              setWordbookRetryKey(value => value + 1)
            }}
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
        showAnnotations={showAnnotations}
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
        onAnnotationsChange={setShowAnnotations}
        onLearningPointsChange={setShowLearningPoints}
        onPronunciationSourceChange={setPronunciationSource}
        onBlindModeChange={setIsBlindMode}
      />

      {showAnnotations && !isBlindMode && wordbookHighlightGroups.length > 0 ? (
        <div className='mx-auto w-full max-w-5xl px-3 pt-1 md:px-5'>
          <WordbookHighlightSelector
            groups={wordbookHighlightGroups}
            hiddenWordbookIds={hiddenWordbookIds}
            onVisibilityChange={handleWordbookVisibilityChange}
            hiddenJlptLevels={hiddenJlptLevels}
            onJlptVisibilityChange={handleJlptVisibilityChange}
            onAllVisibilityChange={handleAllHighlightVisibilityChange}
          />
        </div>
      ) : null}

      {showAnnotations && !isBlindMode && wordbookAnalysisState === 'error' ? (
        <div className='mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-3 pt-2 text-xs text-slate-500 md:px-5'>
          <span>单词书注释加载失败。</span>
          <button
            type='button'
            onClick={() => setWordbookRetryKey(value => value + 1)}
            className='font-semibold text-slate-700 underline underline-offset-4 hover:text-slate-950 dark:text-slate-200'>
            重试
          </button>
        </div>
      ) : null}

      {!isBlindMode &&
      (showLearningPoints || (showAnnotations && learningPoints.length > 0)) ? (
        <div className='mx-auto w-full max-w-5xl px-3 pt-3 md:px-5'>
          <LearningPointHighlightPanel
            points={learningPoints}
            isLoading={isLoadingLearningPoints}
            selection={learningPointSelection}
            onClose={closeLearningPoint}
            onInspect={inspectLearningPoint}
            onInspectWord={inspectLearningPointWord}
          />
        </div>
      ) : null}

      {inspectedWord && showAnnotations && !isBlindMode ? (
        <VocabularyWordbookInspector
          word={inspectedWord.word}
          matchedVariant={inspectedWord.matchedVariant}
          wordbookId={inspectedWord.wordbookId}
          x={inspectedWord.x}
          y={inspectedWord.y}
          onClose={() => setInspectedWord(null)}
          onSaved={update => {
            setLocalVocabularyMetaMap(current =>
              applyVocabularyInspectorMetaUpdate(current, update),
            )
            setWordbookRetryKey(value => value + 1)
          }}
          onDeleted={() => {
            setInspectedWord(null)
            setWordbookRetryKey(value => value + 1)
          }}
        />
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
