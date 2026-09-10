'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import { usePracticeSession } from '@/hooks/usePracticeSession'
import { useTextSelection } from '@/hooks/useTextSelection'
import { QuestionRenderer } from './QuestionRenderer'
import QuestionNoteEditor from './QuestionNoteEditor'
import type { ExamQuestion } from './question-renderer/types'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { applyVocabularyInspectorMetaUpdate, applyVocabularyInspectorPronunciationUpdate } from '@/modules/knowledge/vocabulary/domain/inspector-meta'
import {
  formatOptionLabel,
  normalizeOptionLabelFormat,
} from '@/utils/questions/optionLabels'
import {
  buildPracticeQuestionGroups,
  findPracticeQuestionGroupIndex,
} from '@/modules/practice/domain/question-groups'
import { buildAnswerCardSections } from '@/modules/practice/domain/answer-card-sections'
import PronunciationSourceSelector from '@/components/ui/PronunciationSourceSelector'
import JlptScoreSummary from '@/features/practice/ui/JlptScoreSummary'
import type { JlptScoreSummary as JlptScoreSummaryData } from '@/modules/practice/domain/jlpt-scoring'
import {
  readUserStorageValue,
  useCurrentUser,
  userStorageKey,
} from '@/context/UserContext'
import { usePronunciationSource } from '@/hooks/usePronunciationSource'
import { copyText } from '@/features/reading/ui/copy-text'
import {
  formatJapaneseTextWithRubyNotation,
  formatJapaneseTextWithSudachiRubyNotation,
} from '@/utils/language/japaneseRuby'
import {
  buildPronunciationMapForText,
  buildSurfaceAliasMapForText,
  buildSurfaceVariantMapForText,
} from '@/utils/vocabulary/japaneseInflection'
import type { SudachiLexeme } from '@/modules/language/domain/sudachi'
import { buildExamAnnotationTexts } from '@/modules/practice/domain/exam-annotation-texts'
import {
  useStudyTextHighlights,
} from '@/hooks/useStudyTextHighlights'
import {
  JLPT_LEVELS,
  groupWordbookDistributionBySource,
  isJlptVisibleWithHiddenLevels,
  type JlptLevel,
} from '@/features/reading/domain/wordbook-highlight-groups'
import LearningPointHighlightPanel from '@/modules/knowledge/learning-records/components/LearningPointHighlightPanel'
import WordbookHighlightSelector from '@/features/reading/ui/WordbookHighlightSelector'
import type { PaperWordbookDistribution } from '@/features/practice/domain/paper-word-frequency'
import VocabularyWordbookInspector from '@/modules/knowledge/vocabulary/components/VocabularyWordbookInspector'

const WordTooltip = dynamic(() => import('./WordTooltip'))

interface PracticePlayerProps {
  questions: ExamQuestion[]
  paperTitle?: string
  paperLanguage?: string | null
  mode?: 'exam' | 'random' | 'single' | 'history'
  initialIndex?: number
  exitHref?: string
  exitLabel?: string
  paperId?: string
  draftKey?: string
  restoreDraftIndex?: boolean
  historyPositionKey?: string
  restoreHistoryPosition?: boolean
  pronunciationMap: Record<string, string>
  sudachiPronunciationMap?: Record<string, string>
  sudachiLexicon?: Record<string, SudachiLexeme>
  sudachiAvailable?: boolean
  loadSudachiInBackground?: boolean
  vocabularyMetaMap: Record<string, VocabularyMeta>
  initialAnswers?: Record<string, string>
  initialSubmitted?: boolean
  historyCorrectQuestionIds?: string[]
  historyWrongQuestionIds?: string[]
  initialWordbookDistribution?: PaperWordbookDistribution | null
}

type AttemptStats = {
  total: number
  correct: number
}

const initAttemptStats = (questions: ExamQuestion[]) =>
  questions.reduce<Record<string, AttemptStats>>((acc, question) => {
    const attempts = question.attempts || []
    acc[question.id] = {
      total: question.attemptCount ?? attempts.length,
      correct:
        question.correctAttemptCount ??
        attempts.filter(item => item.isCorrect).length,
    }
    return acc
  }, {})

const restoreAuthoredOptionOrder = (question: ExamQuestion): ExamQuestion =>
  question.authoredOptions
    ? { ...question, options: question.authoredOptions }
    : question

const isEditableKeyboardTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"]',
    ),
  )
}

const isInteractiveSpaceTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[data-context-role="question-option"]')) return false
  return Boolean(
    target.closest(
      'button, a[href], input, textarea, select, [contenteditable="true"], [role="button"], [role="slider"], [role="dialog"]',
    ),
  )
}

export function PracticePlayer({
  questions,
  paperTitle = '专项练习',
  paperLanguage = null,
  mode = 'exam',
  initialIndex = 0,
  exitHref = '/practice',
  exitLabel = '返回试卷库',
  paperId,
  draftKey,
  restoreDraftIndex = true,
  historyPositionKey,
  restoreHistoryPosition = false,
  pronunciationMap,
  sudachiPronunciationMap: initialSudachiPronunciationMap = {},
  sudachiLexicon: initialSudachiLexicon = {},
  sudachiAvailable: initialSudachiAvailable = false,
  loadSudachiInBackground = false,
  vocabularyMetaMap,
  initialAnswers = {},
  initialSubmitted = false,
  historyCorrectQuestionIds = [],
  historyWrongQuestionIds = [],
  initialWordbookDistribution = null,
}: PracticePlayerProps) {
  const currentUser = useCurrentUser()
  const router = useRouter()
  const [selectionEnabled, setSelectionEnabled] = React.useState(true)
  const [learningPointsEnabled, setLearningPointsEnabled] = React.useState(false)
  const playerRootRef = React.useRef<HTMLDivElement>(null)
  const { selection, closeSelection } = useTextSelection(selectionEnabled)
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()
  const [localPronunciationMap, setLocalPronunciationMap] =
    React.useState(pronunciationMap)
  const [sudachiPronunciationMap, setSudachiPronunciationMap] =
    React.useState(initialSudachiPronunciationMap)
  const [sudachiLexicon, setSudachiLexicon] =
    React.useState(initialSudachiLexicon)
  const [sudachiAvailable, setSudachiAvailable] =
    React.useState(initialSudachiAvailable)
  const { pronunciationSource, setPronunciationSource } =
    usePronunciationSource(sudachiAvailable, {
      initialSource: initialSudachiAvailable ? 'sudachi' : 'personal',
    })
  const [localVocabularyMetaMap, setLocalVocabularyMetaMap] =
    React.useState(vocabularyMetaMap)
  const [wordbookDistribution, setWordbookDistribution] =
    React.useState<PaperWordbookDistribution | null>(
      initialWordbookDistribution,
    )
  const [wordbookAnalysisLoaded, setWordbookAnalysisLoaded] =
    React.useState(Boolean(initialWordbookDistribution))
  const [hiddenWordbookIds, setHiddenWordbookIds] = React.useState<Set<string>>(
    () => new Set(),
  )
  const [hiddenJlptLevels, setHiddenJlptLevels] = React.useState<Set<JlptLevel>>(
    () => new Set(),
  )
  const [inspectedWord, setInspectedWord] = React.useState<{
    word: string
    matchedVariant: string
    wordbookId: string
    x: number
    y: number
  } | null>(null)
  const [attemptStatsByQuestion, setAttemptStatsByQuestion] = React.useState<
    Record<string, AttemptStats>
  >(() => initAttemptStats(questions))
  const [persistState, setPersistState] = React.useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [scoreSummary, setScoreSummary] =
    React.useState<JlptScoreSummaryData | null>(null)
  const [copyState, setCopyState] = React.useState<'idle' | 'copied' | 'error'>(
    'idle',
  )
  const historyPositionScope = historyPositionKey
    ? userStorageKey(currentUser.id, historyPositionKey)
    : null
  const [restoredHistoryPositionScope, setRestoredHistoryPositionScope] =
    React.useState<string | null>(null)
  const [savedNotesByQuestionId, setSavedNotesByQuestionId] = React.useState<
    Record<string, string>
  >(() =>
    questions.reduce<Record<string, string>>((notes, question) => {
      notes[question.id] = (question.note || '').trim()
      return notes
    }, {}),
  )

  const session = usePracticeSession(questions, initialIndex, {
    draftKey,
    restoreDraftIndex,
    initialAnswers,
    initialSubmitted,
  })
  const questionGroups = React.useMemo(
    () => buildPracticeQuestionGroups(questions),
    [questions],
  )
  const answerCardSections = React.useMemo(
    () => buildAnswerCardSections(questions, paperLanguage),
    [paperLanguage, questions],
  )
  const questionNumberMap = React.useMemo(
    () =>
      Object.fromEntries(
        answerCardSections.flatMap(section =>
          section.items.map(item => [item.question.id, item.localNumber]),
        ),
      ),
    [answerCardSections],
  )
  const historyCorrectQuestionIdSet = React.useMemo(
    () => new Set(historyCorrectQuestionIds),
    [historyCorrectQuestionIds],
  )
  const historyWrongQuestionIdSet = React.useMemo(
    () => new Set(historyWrongQuestionIds),
    [historyWrongQuestionIds],
  )
  const currentGroupIndex = findPracticeQuestionGroupIndex(
    questionGroups,
    session.currentIndex,
  )
  const currentGroup = questionGroups[currentGroupIndex]
  const normalizedPaperLanguage = (paperLanguage || '').trim().toLowerCase()
  const isJapanesePaper =
    normalizedPaperLanguage === 'ja' ||
    normalizedPaperLanguage.startsWith('ja-') ||
    normalizedPaperLanguage.includes('japanese') ||
    /日语|日文|日本语|日本語/.test(paperLanguage || '')
  const isEnglishPaper =
    normalizedPaperLanguage === 'en' ||
    normalizedPaperLanguage.startsWith('en-') ||
    normalizedPaperLanguage.includes('english')

  const displayedQuestionsForAnnotation = React.useMemo(() => {
    const question = currentGroup?.questions[0]
    if (!question) return []
    const lessonId = question.lessonId || question.lesson?.id
    if (lessonId) {
      const matched = questions.filter(
        item => (item.lessonId || item.lesson?.id) === lessonId,
      )
      return matched.length > 0 ? matched : currentGroup.questions
    }
    const passageId = question.passageId || question.passage?.id
    if (passageId) {
      const matched = questions.filter(
        item => (item.passageId || item.passage?.id) === passageId,
      )
      return matched.length > 0 ? matched : currentGroup.questions
    }
    return currentGroup.questions
  }, [currentGroup?.questions, questions])

  const currentExamAnnotationTexts = React.useMemo(
    () => buildExamAnnotationTexts(displayedQuestionsForAnnotation),
    [displayedQuestionsForAnnotation],
  )
  const currentText = React.useMemo(
    () => currentExamAnnotationTexts.join('\n'),
    [currentExamAnnotationTexts],
  )

  const wordbookHighlightGroups = React.useMemo(() => {
    const sources = groupWordbookDistributionBySource(
      wordbookDistribution?.wordbooks || [],
    )
    const jlptByCanonicalWord = new Map<string, Set<JlptLevel>>()
    sources.forEach(source => {
      source.matchedWords.forEach(word => {
        const levels = jlptByCanonicalWord.get(word) || new Set<JlptLevel>()
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
          currentText,
          matchedHeadwords,
        )
        const variants = buildSurfaceVariantMapForText(
          currentText,
          matchedHeadwords,
        )
        const metadataByHeadword = new Map<
          string,
          { jlpt: Set<JlptLevel>; wordbookIds: Set<string> }
        >()
        source.matchedWords.forEach(word => {
          const headword = source.matchedHeadwords[word] || word
          const metadata = metadataByHeadword.get(headword) || {
            jlpt: new Set<JlptLevel>(),
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
  }, [currentText, wordbookDistribution])
  const wordbookSurfaceToBaseWord = React.useMemo(
    () =>
      Object.assign(
        {},
        ...wordbookHighlightGroups.map(group => group.aliases || {}),
      ) as Record<string, string>,
    [wordbookHighlightGroups],
  )
  const visibleWordbookSourceGroups = React.useMemo(
    () =>
      wordbookHighlightGroups.filter(
        group => !hiddenWordbookIds.has(group.id),
      ),
    [hiddenWordbookIds, wordbookHighlightGroups],
  )
  const visibleWordbookHighlightGroups = React.useMemo(
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
  const wordbookTokenWords = React.useMemo(
    () =>
      showMeaning
        ? Array.from(
            new Set(
              visibleWordbookSourceGroups.flatMap(group => group.words),
            ),
          )
        : [],
    [showMeaning, visibleWordbookSourceGroups],
  )
  const handleWordbookVisibilityChange = React.useCallback(
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
  const handleJlptVisibilityChange = React.useCallback(
    (levels: JlptLevel[], visible: boolean) =>
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
  const handleAllHighlightVisibilityChange = React.useCallback(
    (visible: boolean) => {
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
    },
    [wordbookHighlightGroups],
  )
  const handleWordbookWordClick = React.useCallback(
    (payload: { word: string; wordbookId: string; x: number; y: number }) => {
      closeSelection()
      setInspectedWord({
        ...payload,
        word: wordbookSurfaceToBaseWord[payload.word] || payload.word,
        matchedVariant:
          wordbookHighlightGroups
            .find(
              group =>
                group.wordbookIdsByWord?.[payload.word]?.includes(
                  payload.wordbookId,
                ) || group.id === payload.wordbookId,
            )
            ?.variants?.[payload.word] || payload.word,
      })
    },
    [closeSelection, wordbookHighlightGroups, wordbookSurfaceToBaseWord],
  )
  const displayedAnswersKey = displayedQuestionsForAnnotation
    .map(q => session.answers[q.id] || '')
    .join(':')
  const displayedSortingKey = displayedQuestionsForAnnotation
    .map(q => (session.sortingDrafts[q.id] || []).filter(Boolean).join('-'))
    .join(':')
  const {
    learningPoints,
    isLoadingLearningPoints,
    learningPointSelection,
    closeLearningPoint,
    inspectLearningPoint,
    inspectLearningPointWord,
  } = useStudyTextHighlights({
    rootRef: playerRootRef,
    contentKey: `${session.currentIndex}:${currentGroupIndex}:${currentGroup?.key || ''}:${showMeaning}:${showPronunciation}:${pronunciationSource}:${session.submittedQuestionIds.length}:${session.isSubmitted}:${Object.keys(sudachiLexicon).length}:${displayedAnswersKey}:${displayedSortingKey}`,
    showLearningPoints: learningPointsEnabled,
    showWordbooks: showMeaning,
    wordbookGroups: visibleWordbookHighlightGroups,
    onWordbookWordClick: handleWordbookWordClick,
  })

  React.useEffect(() => {
    setInspectedWord(previous => (previous ? null : previous))
  }, [currentGroupIndex, session.currentIndex])

  React.useEffect(() => {
    const needsSudachi = loadSudachiInBackground && !sudachiAvailable
    const needsWordbooks = showMeaning && !wordbookAnalysisLoaded
    if (!isJapanesePaper || (!needsSudachi && !needsWordbooks)) return
    const controller = new AbortController()
    const texts = buildExamAnnotationTexts(questions)
    if (texts.length === 0) return

    void fetch('/api/pronunciation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, includeWordbookAnalysis: needsWordbooks }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) return null
        return (await response.json()) as {
          available?: boolean
          pronunciationMap?: Record<string, string>
          lexicon?: Record<string, SudachiLexeme>
          wordbookDistribution?: PaperWordbookDistribution
        }
      })
      .then(result => {
        if (!result) return
        if (needsWordbooks) setWordbookAnalysisLoaded(true)
        if (result.wordbookDistribution) {
          setWordbookDistribution(result.wordbookDistribution)
        } else if (needsWordbooks) {
          const fallbackWords = Object.keys(localVocabularyMetaMap)
          if (fallbackWords.length > 0) {
            void fetch('/api/reading/wordbook-distribution', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ words: fallbackWords }),
              signal: controller.signal,
            })
              .then(res => (res.ok ? res.json() : null))
              .then(dist => {
                if (dist) setWordbookDistribution(dist)
              })
              .catch(() => {})
          }
        }
        if (!result.available) return
        setSudachiPronunciationMap(result.pronunciationMap || {})
        setSudachiLexicon(result.lexicon || {})
        setSudachiAvailable(true)
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
      })

    return () => controller.abort()
  }, [
    currentUser.id,
    isJapanesePaper,
    loadSudachiInBackground,
    localVocabularyMetaMap,
    questions,
    showMeaning,
    sudachiAvailable,
    wordbookAnalysisLoaded,
  ])

  React.useEffect(() => {
    if (
      mode !== 'history' ||
      !historyPositionKey ||
      !historyPositionScope ||
      !restoreHistoryPosition ||
      restoredHistoryPositionScope === historyPositionScope
    ) {
      return
    }

    const storedQuestionId = readUserStorageValue(
      currentUser.id,
      historyPositionKey,
    )
    const storedQuestionIndex = storedQuestionId
      ? questions.findIndex(question => question.id === storedQuestionId)
      : -1

    if (storedQuestionIndex >= 0) {
      session.setCurrentIndex(storedQuestionIndex)
    }
    setRestoredHistoryPositionScope(historyPositionScope)
  }, [
    currentUser.id,
    historyPositionKey,
    historyPositionScope,
    mode,
    questions,
    restoreHistoryPosition,
    restoredHistoryPositionScope,
    session,
  ])

  React.useEffect(() => {
    if (mode !== 'history') return
    if (
      historyPositionScope &&
      restoreHistoryPosition &&
      restoredHistoryPositionScope !== historyPositionScope
    ) {
      return
    }

    const currentQuestionId = questions[session.currentIndex]?.id
    if (!currentQuestionId) return

    if (historyPositionKey) {
      window.localStorage.setItem(historyPositionScope!, currentQuestionId)
    }

    const url = new URL(window.location.href)
    if (url.searchParams.get('qid') === currentQuestionId) return
    url.searchParams.set('qid', currentQuestionId)
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    )
  }, [
    historyPositionKey,
    historyPositionScope,
    mode,
    questions,
    restoreHistoryPosition,
    restoredHistoryPositionScope,
    session.currentIndex,
  ])

  const handleSelectOption = React.useCallback(
    (questionId: string, optionId: string) => {
      session.selectOption(questionId, optionId)
    },
    [session],
  )

  const handleQuestionNoteSaved = React.useCallback(
    (questionId: string, savedNote: string) => {
      setSavedNotesByQuestionId(previous => ({
        ...previous,
        [questionId]: savedNote,
      }))
    },
    [],
  )

  const goToPreviousGroup = React.useCallback(() => {
    const previousGroup = questionGroups[currentGroupIndex - 1]
    if (previousGroup) session.setCurrentIndex(previousGroup.startIndex)
    session.setShowSheet(false)
  }, [currentGroupIndex, questionGroups, session])

  const goToNextGroup = React.useCallback(() => {
    const nextGroup = questionGroups[currentGroupIndex + 1]
    if (nextGroup) session.setCurrentIndex(nextGroup.startIndex)
    session.setShowSheet(false)
  }, [currentGroupIndex, questionGroups, session])

  const handleExit = React.useCallback(() => {
    session.saveDraft()
    if (window.history.length > 1) {
      router.back()
      return
    }
    router.push(exitHref)
  }, [exitHref, router, session])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        session.showSheet ||
        selection.isVisible ||
        Boolean(inspectedWord) ||
        isEditableKeyboardTarget(event.target)
      ) {
        return
      }

      if (event.key === 'ArrowLeft') {
        if (currentGroupIndex <= 0) return
        event.preventDefault()
        goToPreviousGroup()
        return
      }

      if (event.key === 'ArrowRight') {
        if (currentGroupIndex >= questionGroups.length - 1) return
        event.preventDefault()
        goToNextGroup()
        return
      }

      if (event.code === 'Space' || event.key === ' ') {
        if (isInteractiveSpaceTarget(event.target)) return
        const audio = document.querySelector<HTMLAudioElement>(
          'audio[data-practice-audio="current"]',
        )
        if (!audio) return

        event.preventDefault()
        if (audio.paused) audio.play().catch(() => {})
        else audio.pause()
        return
      }

      if (session.isSubmitted || !currentGroup) return
      const numericOptionNumber =
        /^Digit[1-9]$/.test(event.code) || /^Numpad[1-9]$/.test(event.code)
          ? Number(event.code.at(-1))
          : /^[1-9]$/.test(event.key)
            ? Number(event.key)
            : 0
      const optionNumber = numericOptionNumber
      if (!optionNumber) return

      const targetQuestion =
        currentGroup.questions.find(question => !session.answers[question.id]) ||
        currentGroup.questions[0]
      if (!targetQuestion || targetQuestion.questionType === 'SORTING') return
      const option = targetQuestion.options?.[optionNumber - 1]
      if (!option) return

      event.preventDefault()
      handleSelectOption(targetQuestion.id, option.id)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    currentGroup,
    currentGroupIndex,
    goToNextGroup,
    goToPreviousGroup,
    handleSelectOption,
    inspectedWord,
    questionGroups.length,
    selection.isVisible,
    session,
  ])

  if (!questions || questions.length === 0) {
    return (
      <div className='flex min-h-screen items-center justify-center text-gray-500'>
        此模块暂无题目数据。
      </div>
    )
  }

  const currentQuestion = currentGroup.questions[0]
  const displayedCurrentQuestion = session.isSubmitted
    ? restoreAuthoredOptionOrder(currentQuestion)
    : currentQuestion
  const displayedAllQuestions = session.isSubmitted
    ? (currentQuestion.lessonId ? currentGroup.questions : questions).map(
        restoreAuthoredOptionOrder,
      )
    : currentQuestion.lessonId
      ? currentGroup.questions
      : questions
  const reviewWrongQuestionIds =
    mode === 'history'
      ? historyWrongQuestionIds
      : session.isSubmitted
        ? session.wrongIndexes
            .map(index => questions[index]?.id)
            .filter((id): id is string => Boolean(id))
        : []
  const currentCardSection = answerCardSections.find(section =>
    section.items.some(item => item.question.id === currentQuestion.id),
  )
  const currentSectionItems = currentCardSection?.items.filter(item =>
    currentGroup.questions.some(question => question.id === item.question.id),
  )
  const currentNumberingItems = currentCardSection
    ? answerCardSections
        .filter(section => {
          if (isJapanesePaper) {
            return currentCardSection.materialKey === 'LISTENING'
              ? section.key === currentCardSection.key
              : section.materialKey !== 'LISTENING'
          }
          if (isEnglishPaper) {
            return (
              (section.materialKey === 'LISTENING') ===
              (currentCardSection.materialKey === 'LISTENING')
            )
          }
          return section.key === currentCardSection.key
        })
        .flatMap(section => section.items)
    : []
  const currentNumberTotal = Math.max(
    0,
    ...currentNumberingItems.map(item => item.localNumber),
  )
  const currentLocalRange = currentSectionItems?.length
    ? currentSectionItems.length === 1
      ? `${currentSectionItems[0].localNumber}`
      : `${currentSectionItems[0].localNumber}–${currentSectionItems[currentSectionItems.length - 1].localNumber}`
    : `${currentGroup.startIndex + 1}`
  const currentQuestionRange = currentCardSection
    ? isJapanesePaper
      ? `問題${currentCardSection.sectionNumber}｜${currentCardSection.sectionTitle} · ${currentLocalRange}/${currentNumberTotal}`
      : `${currentCardSection.sectionTitle} · ${currentLocalRange}/${currentNumberTotal}`
    : `第 ${currentGroup.startIndex + 1} 题`
  const isSingleMode = questionGroups.length === 1
  const currentWrongPosition = session.wrongIndexes.indexOf(
    session.currentIndex,
  )
  const prevWrongIndex =
    currentWrongPosition > 0
      ? session.wrongIndexes[currentWrongPosition - 1]
      : currentWrongPosition === -1
        ? [...session.wrongIndexes]
            .reverse()
            .find(index => index < session.currentIndex) ?? null
        : null
  const nextWrongIndex =
    currentWrongPosition >= 0 &&
    currentWrongPosition < session.wrongIndexes.length - 1
      ? session.wrongIndexes[currentWrongPosition + 1]
      : currentWrongPosition === -1
        ? session.wrongIndexes.find(index => index > session.currentIndex) ??
          session.wrongIndexes[0] ??
          null
        : null

  const currentStats = attemptStatsByQuestion[currentQuestion.id] || {
    total: 0,
    correct: 0,
  }
  const currentAccuracy =
    currentStats.total > 0
      ? Math.round((currentStats.correct / currentStats.total) * 100)
      : 0
  const answeredProgress =
    mode === 'history'
      ? Math.round(((currentGroupIndex + 1) / questionGroups.length) * 100)
      : Math.round((session.answeredCount / questions.length) * 100)

  const handleSubmit = async () => {
    if (session.isSubmitted || persistState === 'saving') return

    session.submit()
    setPersistState('saving')

    const attempts = questions
      .map(question => {
        const selectedId = session.answers[question.id]
        if (!selectedId) return null
        return {
          questionId: question.id,
          selectedOptionId: selectedId,
          timeSpentMs: Math.max(
            0,
            session.timeSpentByQuestionId[question.id] || 0,
          ),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    if (attempts.length === 0) {
      setPersistState('idle')
      return
    }

    const response = await fetch('/api/quiz-attempts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        attempts,
        completedPaperId:
          paperId && attempts.length === questions.length ? paperId : undefined,
      }),
    })
    const result = (await response.json()) as {
      success?: boolean
      results?: Array<{ questionId: string; isCorrect: boolean }>
      submission?: JlptScoreSummaryData | null
    }
    if (!result.success) {
      setPersistState('error')
      return
    }

    setAttemptStatsByQuestion(prev => {
      const next = { ...prev }
      for (const item of result.results || []) {
        const current = next[item.questionId] || { total: 0, correct: 0 }
        next[item.questionId] = {
          total: current.total + 1,
          correct: current.correct + (item.isCorrect ? 1 : 0),
        }
      }
      return next
    })
    session.clearDraft()
    setScoreSummary(result.submission || null)
    setPersistState('saved')
  }

  const formatCopyText = (value: string) => {
    if (!showPronunciation || !isJapanesePaper) return value
    if (pronunciationSource === 'sudachi') {
      return Object.keys(sudachiLexicon).length > 0
        ? formatJapaneseTextWithSudachiRubyNotation(value, sudachiLexicon)
        : formatJapaneseTextWithRubyNotation(
            value,
            buildPronunciationMapForText(value, sudachiPronunciationMap),
          )
    }
    return formatJapaneseTextWithRubyNotation(
      value,
      buildPronunciationMapForText(value, localPronunciationMap),
    )
  }

  const buildCopyPayload = (question: ExamQuestion) => {
    const sections: string[] = []
    if (question.lesson?.sectionTitle) {
      sections.push(`听力部分：${formatCopyText(question.lesson.sectionTitle)}`)
    }
    if (question.lesson?.audioFile) {
      sections.push(`音频：${question.lesson.audioFile}`)
    }

    if (question.passageId) {
      const passage = (question.passage?.content || '').trim()
      if (passage) sections.push(`阅读正文：\n${formatCopyText(passage)}`)
    }

    const context = (question.contextSentence || '').trim()
    const prompt = (question.prompt || '').trim()
    if (prompt) sections.push(`题目：${formatCopyText(prompt)}`)
    else if (context) sections.push(`题目：${formatCopyText(context)}`)

    const optionLabelFormat = normalizeOptionLabelFormat(
      question.optionLabelFormat,
      'numeric',
    )
    const optionLines = (question.options || [])
      .map((option, index) => {
        const marker = formatOptionLabel(
          index,
          optionLabelFormat,
          question.customOptionLabels,
        )
        const text = (option.text || '').trim()
        return text ? `${marker}. ${formatCopyText(text)}` : ''
      })
      .filter(Boolean)
    if (optionLines.length > 0) {
      sections.push(`选项：\n${optionLines.join('\n')}`)
    }

    return sections.join('\n\n').trim()
  }

  const buildListeningTranscriptCopyPayload = (copyQuestions: ExamQuestion[]) => {
    const lessonQuestion = copyQuestions.find(
      question => (question.lesson?.dialogues || []).length > 0,
    )
    if (!lessonQuestion?.lesson) return ''

    const lessonId = lessonQuestion.lessonId || lessonQuestion.lesson.id
    const lessonQuestions = copyQuestions.filter(
      question => (question.lessonId || question.lesson?.id) === lessonId,
    )
    const transcriptText = [...(lessonQuestion.lesson.dialogues || [])]
      .filter(line => (line.text || '').trim())
      .sort(
        (left, right) =>
          left.start - right.start ||
          (left.sequenceId || 0) - (right.sequenceId || 0),
      )
      .map(line => formatCopyText((line.text || '').trim()))
      .join('\n')
    const optionsText = lessonQuestions
      .flatMap(question => question.options || [])
      .map((option, index) => {
        const text = (option.text || '').trim()
        return text ? `${index + 1}. ${formatCopyText(text)}` : ''
      })
      .filter(Boolean)
      .join('\n')
    const sections = [
      transcriptText,
      optionsText ? `选项：\n${optionsText}` : '',
    ].filter(Boolean)
    return sections.join('\n\n').trim()
  }

  const handleCopyCurrentQuestion = async () => {
    const copyQuestions = session.isSubmitted
      ? currentGroup.questions.map(restoreAuthoredOptionOrder)
      : currentGroup.questions
    const listeningPayload = buildListeningTranscriptCopyPayload(copyQuestions)
    const payload = listeningPayload ||
      copyQuestions
        .map(question => buildCopyPayload(question))
        .join('\n\n---\n\n')
    if (!payload) return
    try {
      await copyText(payload)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
  }

  const handleQuestionAreaMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (session.isSubmitted) return
    const target = event.target as HTMLElement
    const clickedInsideOption = Boolean(
      target.closest('[data-context-role="question-option"]') ||
      target.closest('[data-context-role="sorting-option"]') ||
      target.closest('[data-context-role="sorting-slot"]'),
    )
    if (clickedInsideOption) return
    const questionNode = target.closest<HTMLElement>('[data-question-id]')
    session.clearOption(questionNode?.dataset.questionId || currentQuestion.id)
  }

  return (
    <div
      ref={playerRootRef}
      className={`relative flex min-h-screen flex-col bg-[#f7f7f5] font-sans ${
        isJapanesePaper ? 'exam-japanese' : ''
      }`}>
      <header className='sticky top-0 z-40 border-b border-slate-200 bg-[#f7f7f5]'>
        <div className='mx-auto grid min-h-14 max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 px-2 md:flex md:h-14 md:gap-2 md:px-6'>
          <div className='flex h-12 min-w-0 items-center gap-2 md:h-auto md:flex-1'>
            {mode !== 'single' && (
              <>
                <button
                  type='button'
                  onClick={handleExit}
                  title={`${exitLabel}，当前进度会自动保存`}
                  className='inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-950'>
                  <span aria-hidden='true'>←</span>
                  <span className='hidden sm:inline'>返回</span>
                </button>
                <span className='h-4 w-px shrink-0 bg-slate-300' />
              </>
            )}
            <h1 className='hidden shrink-0 text-sm font-bold tracking-tight text-slate-900 lg:block'>
              {paperTitle}
            </h1>
            <span className='hidden h-4 w-px bg-slate-300 lg:block' />
            <div className='min-w-0'>
              <p className='truncate text-xs font-semibold text-slate-900 sm:text-sm'>
                {currentQuestionRange}
              </p>
              {!isSingleMode && (
                <p className='mt-0.5 hidden truncate text-[10px] text-slate-500 md:block'>
                  {mode === 'history' ? (
                    <>
                      整套 {questions.length} 题
                      <span className='mx-1 text-slate-300'>·</span>
                      错题 {historyWrongQuestionIds.length}
                      <span className='mx-1 text-slate-300'>·</span>
                      第 {currentGroupIndex + 1}/{questionGroups.length} 页
                    </>
                  ) : session.isSubmitted ? (
                    <>
                      本次答对 {session.correctCount}/{session.submittedCount}
                      {session.unansweredCount > 0 && (
                        <>
                          <span className='mx-1 text-slate-300'>·</span>
                          未答 {session.unansweredCount}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      已答 {session.answeredCount}/{questions.length}
                      <span className='mx-1 text-slate-300'>·</span>
                      正确率{' '}
                      {currentStats.total > 0 ? `${currentAccuracy}%` : '--'}
                    </>
                  )}
                  <span className='mx-1 text-slate-300'>·</span>
                  第 {currentGroupIndex + 1}/{questionGroups.length} 页
                </p>
              )}
            </div>
          </div>

          {!isSingleMode ? (
            <div className='flex shrink-0 items-center gap-1 md:hidden'>
              <button
                type='button'
                aria-label='上一题'
                disabled={currentGroupIndex === 0}
                onClick={goToPreviousGroup}
                className='inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold text-slate-600 transition-colors active:bg-slate-200 disabled:opacity-25'>
                ←
              </button>
              <button
                type='button'
                aria-label='下一题'
                disabled={currentGroupIndex === questionGroups.length - 1}
                onClick={goToNextGroup}
                className='inline-flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white transition-colors active:bg-slate-700 disabled:opacity-25'>
                →
              </button>
            </div>
          ) : null}

          <div className='col-span-2 flex min-w-0 items-center justify-between gap-2 border-t border-slate-200/80 py-1.5 md:col-span-1 md:shrink-0 md:justify-start md:gap-1 md:border-0 md:py-0'>
            <div className='flex min-w-0 items-center gap-0.5 sm:gap-1'>
            <button
              type='button'
              aria-pressed={selectionEnabled}
              aria-label='切换划词'
              onClick={() => setSelectionEnabled(value => !value)}
              className={`inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
                selectionEnabled
                  ? 'bg-slate-200 text-slate-900'
                  : 'text-slate-500 hover:bg-slate-200/70'
              }`}>
              <span className='sm:hidden'>划</span>
              <span className='hidden sm:inline'>划词</span>
            </button>
            {isJapanesePaper ? (
              <>
                <button
                  type='button'
                  aria-pressed={showPronunciation}
                  aria-label='切换注音'
                  onClick={() => setShowPronunciation(!showPronunciation)}
                  className={`inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
                    showPronunciation
                      ? 'bg-slate-200 text-slate-900'
                      : 'text-slate-500 hover:bg-slate-200/70'
                  }`}>
                  <span className='sm:hidden'>注</span>
                  <span className='hidden sm:inline'>注音</span>
                </button>
                {showPronunciation ? (
                  <PronunciationSourceSelector
                    value={pronunciationSource}
                    onChange={setPronunciationSource}
                    sudachiAvailable={sudachiAvailable}
                  />
                ) : null}
                <button
                  type='button'
                  aria-pressed={showMeaning}
                  aria-label='切换注释'
                  onClick={() => setShowMeaning(!showMeaning)}
                  className={`inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
                    showMeaning
                      ? 'bg-slate-200 text-slate-900'
                      : 'text-slate-500 hover:bg-slate-200/70'
                  }`}>
                  <span className='sm:hidden'>释</span>
                  <span className='hidden sm:inline'>注释</span>
                </button>
              </>
            ) : null}
            <button
              type='button'
              aria-pressed={learningPointsEnabled}
              aria-label='切换学习点'
              onClick={() => setLearningPointsEnabled(value => !value)}
              className={`inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
                learningPointsEnabled
                  ? 'bg-slate-200 text-slate-900'
                  : 'text-slate-500 hover:bg-slate-200/70'
              }`}>
              <span className='sm:hidden'>点</span>
              <span className='hidden sm:inline'>学习点</span>
            </button>
            </div>

            <div className='flex shrink-0 items-center gap-0.5 sm:gap-1'>
            {!isSingleMode && (
              <>
                <span className='mx-0.5 hidden h-5 w-px bg-slate-300 md:block' />
                <button
                  type='button'
                  onClick={() => session.setShowSheet(!session.showSheet)}
                  aria-expanded={session.showSheet}
                  aria-label='答题卡'
                  className={`inline-flex h-9 min-w-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors ${
                    session.showSheet
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}>
                  <svg
                    className='h-4 w-4'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M4 6h4v4H4V6zm6 0h4v4h-4V6zm6 0h4v4h-4V6zM4 14h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z'
                    />
                  </svg>
                  <span className='hidden xl:inline'>答题卡</span>
                </button>
                <button
                  type='button'
                  onClick={() => void handleCopyCurrentQuestion()}
                  aria-label={
                    currentGroup.questions.some(
                      question => (question.lesson?.dialogues || []).length > 0,
                    )
                      ? '复制听力原文和选项'
                      : '复制题目和选项'
                  }
                  className={`inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors ${
                    copyState === 'copied'
                      ? 'bg-slate-200 text-slate-900'
                      : copyState === 'error'
                        ? 'bg-rose-50 text-rose-700'
                        : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}>
                  <svg
                    className='h-4 w-4'
                    fill='none'
                    viewBox='0 0 24 24'
                    stroke='currentColor'>
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={2}
                      d='M8 7V5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2h-2M6 7h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2z'
                    />
                  </svg>
                  <span className='sr-only' aria-live='polite'>
                    {copyState === 'copied'
                      ? '已复制'
                      : copyState === 'error'
                        ? '复制失败'
                        : '复制'}
                  </span>
                </button>
                <div className='hidden items-center gap-0.5 md:flex'>
                  <button
                    type='button'
                    aria-label='上一题'
                    title='上一题（←）'
                    disabled={currentGroupIndex === 0}
                    onClick={goToPreviousGroup}
                    className='inline-flex h-9 min-w-8 items-center justify-center rounded-md px-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30'>
                    ←
                  </button>
                  <button
                    type='button'
                    aria-label='下一题'
                    title='下一题（→）'
                    disabled={currentGroupIndex === questionGroups.length - 1}
                    onClick={goToNextGroup}
                    className='inline-flex h-9 min-w-8 items-center justify-center rounded-md bg-slate-900 px-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-30'>
                    →
                  </button>
                </div>
              </>
            )}

            {mode !== 'single' && !session.isSubmitted ? (
              <button
                type='button'
                onClick={() => void handleSubmit()}
                disabled={session.isSubmitted || persistState === 'saving'}
                className='ml-0.5 h-9 rounded-md bg-slate-900 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 md:px-3'>
                {persistState === 'saving' ? '保存中' : '交卷'}
              </button>
            ) : null}
            </div>
          </div>
        </div>

        {!isSingleMode && (
          <div
            className='h-0.5 bg-slate-100'
            role='progressbar'
            aria-label={`已完成 ${session.answeredCount} / ${questions.length} 题`}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-valuenow={session.answeredCount}>
            <div
              className='h-full bg-slate-900 transition-[width] duration-200'
              style={{ width: `${answeredProgress}%` }}
            />
          </div>
        )}
      </header>

      {showMeaning && wordbookHighlightGroups.length > 0 ? (
        <div className='mx-auto w-full max-w-7xl px-3 pt-1 md:px-6'>
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

      {learningPointsEnabled || (showMeaning && learningPoints.length > 0) ? (
        <div className='mx-auto w-full max-w-7xl px-3 pt-3 md:px-6'>
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

      {session.showSheet && !isSingleMode && (
        <>
          <button
            type='button'
            aria-label='关闭答题卡'
            onClick={() => session.setShowSheet(false)}
            className='fixed inset-0 z-30 cursor-default bg-slate-900/10 backdrop-blur-[1px]'
          />
          <section
            role='dialog'
            aria-modal='true'
            aria-label='答题卡'
            className='fixed inset-x-3 top-[6.5rem] z-50 mx-auto max-h-[calc(100vh-7.5rem)] max-w-6xl overflow-hidden rounded-xl border border-slate-200 bg-[#f7f7f5] shadow-[0_24px_70px_-28px_rgba(15,23,42,0.55)] md:top-[4.25rem] md:max-h-[calc(100vh-5.25rem)]'>
            <div className='flex items-center justify-between border-b border-slate-200 px-4 py-3 md:px-5'>
              <div>
                <h4 className='text-sm font-bold tracking-tight text-slate-900 md:text-base'>
                  答题卡
                </h4>
                <p className='mt-0.5 text-[11px] text-slate-500'>
                  {mode === 'history'
                    ? `整套 ${questions.length} 题 · 答对 ${historyCorrectQuestionIds.length} · 答错 ${historyWrongQuestionIds.length}`
                    : `已答 ${session.answeredCount}/${questions.length}`}
                </p>
              </div>
              <button
                type='button'
                onClick={() => session.setShowSheet(false)}
                className='inline-flex h-8 items-center rounded-md px-2 text-sm text-slate-500 hover:bg-slate-200 hover:text-slate-900'>
                关闭
              </button>
            </div>

            <div className='custom-scrollbar grid max-h-[calc(100vh-11.75rem)] gap-x-8 gap-y-5 overflow-y-auto p-4 md:max-h-[calc(100vh-9.5rem)] md:grid-cols-2 md:p-5'>
              {answerCardSections.map((section, sectionIndex) => (
                <React.Fragment key={section.key}>
                  {(sectionIndex === 0 ||
                    answerCardSections[sectionIndex - 1].materialKey !==
                      section.materialKey) && (
                    <h5 className='border-b border-slate-300 pb-2 text-xs font-bold tracking-[0.16em] text-slate-500 md:col-span-2'>
                      {section.materialTitle}
                    </h5>
                  )}
                  <section className='grid grid-cols-[minmax(7.5rem,auto)_1fr] items-start gap-3'>
                    <div className='pt-1'>
                      <p className='text-sm font-bold text-slate-800'>
                        {isJapanesePaper
                          ? `問題${section.sectionNumber}`
                          : section.sectionTitle}
                      </p>
                      {isJapanesePaper ? (
                        <p className='mt-0.5 text-xs text-slate-500'>
                          {section.sectionTitle}
                        </p>
                      ) : null}
                    </div>
                    <div className='grid grid-cols-6 gap-1.5 sm:grid-cols-8'>
                      {section.items.map(item => {
                        const question = questions[item.questionIndex]
                        const isCurrent =
                          session.currentIndex === item.questionIndex
                        const isAnswered = !!session.answers[question.id]
                        const isHistoryCorrect =
                          mode === 'history' &&
                          historyCorrectQuestionIdSet.has(question.id)
                        const isWrong =
                          mode === 'history'
                            ? historyWrongQuestionIdSet.has(question.id)
                            : session.isQuestionSubmitted(question.id) &&
                              !!session.getCorrectOptionId(question) &&
                              session.answers[question.id] !==
                                session.getCorrectOptionId(question)

                        return (
                          <button
                            key={question.id}
                            type='button'
                            aria-label={
                              isJapanesePaper
                                ? `問題${section.sectionNumber} ${section.sectionTitle} 第${item.localNumber}题`
                                : `${section.sectionTitle} 第${item.localNumber}题`
                            }
                            onClick={() => {
                              session.setCurrentIndex(item.questionIndex)
                              session.setShowSheet(false)
                            }}
                            className={`h-8 rounded-md border text-xs font-semibold transition-colors md:h-9 ${
                              isCurrent
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : isWrong
                                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                                  : isHistoryCorrect
                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                  : isAnswered
                                    ? 'border-slate-400 bg-slate-200/70 text-slate-900'
                                    : 'border-slate-300 bg-white text-slate-600 hover:border-slate-600 hover:text-slate-900'
                            }`}>
                            {item.localNumber}
                          </button>
                        )
                      })}
                    </div>
                  </section>
                </React.Fragment>
              ))}
            </div>
          </section>
        </>
      )}

      <main
        onMouseDown={handleQuestionAreaMouseDown}
        className='flex w-full flex-1 flex-col px-5 py-4 md:px-10 md:py-6'>
        {session.isSubmitted && mode !== 'history' && (
          <div className='mx-auto mb-3 flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 text-xs text-slate-500'>
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5'>
              <span className='font-semibold text-slate-900'>答题结果</span>
              <span>答对 {session.correctCount}</span>
              <span className={session.wrongCount > 0 ? 'text-rose-600' : ''}>
                答错 {session.wrongCount}
              </span>
              {session.unansweredCount > 0 ? (
                <span>未答 {session.unansweredCount}</span>
              ) : null}
            </div>
            {session.wrongCount > 0 && (
              <div className='flex items-center gap-1'>
                <span className='mr-1 tabular-nums'>
                  错题 {currentWrongPosition >= 0 ? currentWrongPosition + 1 : '—'}/
                  {session.wrongCount}
                </span>
                <button
                  type='button'
                  aria-label='上一道错题'
                  title='上一道错题'
                  disabled={prevWrongIndex === null}
                  onClick={() => {
                    if (prevWrongIndex !== null) {
                      session.setCurrentIndex(prevWrongIndex)
                    }
                  }}
                  className='inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30'>
                  ←
                </button>
                <button
                  type='button'
                  aria-label='下一道错题'
                  title='下一道错题'
                  disabled={nextWrongIndex === null}
                  onClick={() => {
                    if (nextWrongIndex !== null) {
                      session.setCurrentIndex(nextWrongIndex)
                    }
                  }}
                  className='inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30'>
                  →
                </button>
              </div>
            )}
          </div>
        )}

        {scoreSummary ? (
          <div className='mx-auto mb-5 w-full max-w-5xl'>
            <JlptScoreSummary summary={scoreSummary} />
          </div>
        ) : null}

        <QuestionRenderer
          key={currentGroup.key}
          question={displayedCurrentQuestion}
          currentAnswer={session.answers[currentQuestion.id]}
          currentSortingOrder={session.sortingDrafts[currentQuestion.id]}
          answerMap={session.answers}
          allQuestions={displayedAllQuestions}
          onSelect={optionId =>
            handleSelectOption(currentQuestion.id, optionId)
          }
          onClear={() => session.clearOption(currentQuestion.id)}
          onSortingOrderChange={order =>
            session.setSortingDraft(currentQuestion.id, order)
          }
          onSelectQuestion={handleSelectOption}
          isSubmitted={session.isQuestionSubmitted(currentQuestion.id)}
          isInteractionLocked={session.isSubmitted}
          submittedQuestionIds={session.submittedQuestionIds}
          wrongQuestionIds={reviewWrongQuestionIds}
          questionNumberMap={questionNumberMap}
          isJapanesePaper={isJapanesePaper}
          annotation={{
            showPronunciation,
            showMeaning: false,
            groupKanji: pronunciationSource === 'sudachi',
            pronunciationMap:
              pronunciationSource === 'sudachi'
                ? sudachiPronunciationMap
                : localPronunciationMap,
            vocabularyMetaMap: localVocabularyMetaMap,
            sudachiLexicon:
              Object.keys(sudachiLexicon).length > 0 ? sudachiLexicon : undefined,
            pronunciationSource,
            tokenWords: showMeaning ? wordbookTokenWords : [],
          }}
        />

        {currentGroup.questions.map(question =>
          session.isQuestionSubmitted(question.id) ? (
            <QuestionNoteEditor
              key={question.id}
              questionId={question.id}
              initialNote={savedNotesByQuestionId[question.id] ?? question.note}
              onSaved={handleQuestionNoteSaved}
            />
          ) : null,
        )}

        {selectionEnabled && selection.isVisible && selection.sourceType !== '' && (
          <WordTooltip
            word={selection.text}
            x={selection.x}
            y={selection.y}
            isTop={selection.isTop}
            contextSentence={selection.contextSentence}
            sourceType={selection.sourceType}
            sourceId={selection.sourceId}
            detectedWord={selection.detectedWord}
            initialMeta={localVocabularyMetaMap[selection.text]}
            onSaved={update => {
              setLocalVocabularyMetaMap(prev => applyVocabularyInspectorMetaUpdate(prev, update))
              setLocalPronunciationMap(prev => applyVocabularyInspectorPronunciationUpdate(prev, update))
            }}
            onClose={closeSelection}
          />
        )}

        {inspectedWord ? (
          <VocabularyWordbookInspector
            word={inspectedWord.word}
            matchedVariant={inspectedWord.matchedVariant}
            wordbookId={inspectedWord.wordbookId}
            x={inspectedWord.x}
            y={inspectedWord.y}
            onClose={() => setInspectedWord(null)}
            onSaved={({ membershipsChanged, ...update }) => {
              setLocalVocabularyMetaMap(current => applyVocabularyInspectorMetaUpdate(current, update))
              setLocalPronunciationMap(current => applyVocabularyInspectorPronunciationUpdate(current, update))
              if (membershipsChanged) {
                setWordbookDistribution(null)
                setWordbookAnalysisLoaded(false)
              }
            }}
          />
        ) : null}
      </main>

    </div>
  )
}
