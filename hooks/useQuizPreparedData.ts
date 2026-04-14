'use client'

import { useMemo } from 'react'
import { getReadingFontClass } from '@/utils/language/readingTypography'
import { inferContextualPos, posWordHighlightClass } from '@/utils/language/posTagger'

type QuestionAttempt = {
  isCorrect: boolean
}

type QuestionOption = {
  id: string
  text: string
  isCorrect: boolean
}

type QuizQuestion = {
  id: string
  questionType: string
  prompt?: string | null
  contextSentence: string
  targetWord?: string | null
  options: QuestionOption[]
  attempts?: QuestionAttempt[]
  explanation?: string | null
  order?: number | null
  sourcePaper?: string | null
  lessonId?: string | null
  passageId?: string | null
}

type VocabularyMeta = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

type PosHighlightToken = {
  word: string
  className: string
}

type BadgeConfig = {
  label: string
  style: string
}

type QuestionDisplayData = {
  promptText: string
  hasPrompt: boolean
  displayPrompt: string
}

type WordMetaPanelEntry = {
  word: string
  pronunciation: string
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

type PreparedQuestion = {
  graded: boolean
  userAnswerId: string | null
  difficulty: BadgeConfig
  typeConfig: BadgeConfig
  realIndex: number
  fontClass: string
  display: QuestionDisplayData
  questionMetaMap: Record<string, VocabularyMeta>
  posHighlightTokens: PosHighlightToken[]
  questionPronunciationMap: Record<string, string>
  wordPanelEntries: WordMetaPanelEntry[]
  shouldCopyWithArticle: boolean
  copyButtonLabel: string
}

type AiPromptContext = {
  sourceLabel?: string
  articleTitle?: string
  articleText?: string
}

const DIFFICULTY_BADGES = {
  new: {
    label: '新题',
    style:
      'bg-gray-100 text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
  hard: {
    label: '高难',
    style:
      'bg-red-50 text-red-600 border-red-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/40',
  },
  mediumHard: {
    label: '偏难',
    style:
      'bg-orange-50 text-orange-600 border-orange-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40',
  },
  medium: {
    label: '中等',
    style:
      'bg-blue-50 text-blue-600 border-blue-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/40',
  },
  easy: {
    label: '较易',
    style:
      'bg-green-50 text-green-600 border-green-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40',
  },
} satisfies Record<string, BadgeConfig>

const QUESTION_TYPE_CONFIG: Record<string, BadgeConfig> = {
  PRONUNCIATION: {
    label: '读音题',
    style:
      'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40',
  },
  SYNONYM_REPLACEMENT: {
    label: '近义词题',
    style:
      'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/40',
  },
  WORD_DISTINCTION: {
    label: '单词辨析题',
    style:
      'bg-teal-50 text-teal-600 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/40',
  },
  GRAMMAR: {
    label: '语法题',
    style:
      'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/40',
  },
  FILL_BLANK: {
    label: '填空题',
    style:
      'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/40',
  },
  SORTING: {
    label: '排序题',
    style:
      'bg-orange-50 text-orange-600 border-orange-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40',
  },
  READING_COMPREHENSION: {
    label: '阅读题',
    style:
      'bg-purple-50 text-purple-600 border-purple-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/40',
  },
  LISTENING: {
    label: '听力题',
    style:
      'bg-cyan-50 text-cyan-600 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/40',
  },
}

const DEFAULT_TYPE_CONFIG: BadgeConfig = {
  label: '普通题',
  style:
    'bg-gray-50 text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
}

const BLANK_REGEX =
  /([（(][\s　]*[）)]|__{2,}|～|[＿_★＊][＿_★＊\s　]+[＿_★＊]|[★＊])/

const getDifficultyBadge = (attempts?: QuestionAttempt[]): BadgeConfig => {
  if (!attempts?.length) return DIFFICULTY_BADGES.new

  const correctCount = attempts.filter(item => item.isCorrect).length
  const accuracy = correctCount / attempts.length

  if (accuracy <= 0.3) return DIFFICULTY_BADGES.hard
  if (accuracy <= 0.6) return DIFFICULTY_BADGES.mediumHard
  if (accuracy <= 0.8) return DIFFICULTY_BADGES.medium
  return DIFFICULTY_BADGES.easy
}

const getTypeLabel = (type: string): BadgeConfig =>
  QUESTION_TYPE_CONFIG[type] || DEFAULT_TYPE_CONFIG

const buildPosHighlightTokens = (
  sentence: string,
  metaMap: Record<string, VocabularyMeta>,
): PosHighlightToken[] =>
  Object.entries(metaMap)
    .filter(
      ([word, meta]) =>
        sentence.includes(word) && meta.partsOfSpeech.length > 0,
    )
    .map(([word, meta]) => {
      const contextualPos = inferContextualPos(
        word,
        sentence,
        meta.partsOfSpeech,
      )
      const primaryPos = contextualPos[0]

      if (!primaryPos) return null

      return {
        word,
        className: posWordHighlightClass(primaryPos),
      }
    })
    .filter((item): item is PosHighlightToken => item !== null)

const getQuestionDisplayData = (
  question: QuizQuestion,
): QuestionDisplayData => {
  const promptText = (question.prompt || '').trim()
  const hasPrompt = promptText.length > 0
  const displayPrompt =
    question.questionType === 'FILL_BLANK'
      ? question.prompt || question.contextSentence
      : hasPrompt
        ? promptText
        : question.contextSentence

  return {
    promptText,
    hasPrompt,
    displayPrompt,
  }
}

const getPronunciationMap = (metaMap: Record<string, VocabularyMeta>) =>
  Object.entries(metaMap).reduce(
    (acc, [word, meta]) => {
      if (meta.pronunciations[0]) {
        acc[word] = meta.pronunciations[0]
      }
      return acc
    },
    {} as Record<string, string>,
  )

const getWordMetaPanelEntries = ({
  question,
  questionMetaMap,
  showMeaning,
  showPronunciation,
}: {
  question: QuizQuestion
  questionMetaMap: Record<string, VocabularyMeta>
  showMeaning: boolean
  showPronunciation: boolean
}) =>
  Object.entries(questionMetaMap)
    .filter(([word, meta]) => {
      if (!question.contextSentence.includes(word)) return false
      if (showMeaning && meta.meanings.length > 0) return true
      if (showMeaning && showPronunciation && meta.pronunciations.length > 0) {
        return true
      }
      return false
    })
    .sort((a, b) => b[0].length - a[0].length)
    .slice(0, 8)
    .map(([word, meta]) => ({
      word,
      pronunciation: meta.pronunciations[0] || '',
      pronunciations: meta.pronunciations,
      partsOfSpeech: meta.partsOfSpeech,
      meanings: meta.meanings,
    }))

const shouldIncludeArticleInAiPrompt = (
  question: QuizQuestion,
  isArticleMode: boolean,
  aiPromptContext?: AiPromptContext,
) =>
  Boolean(aiPromptContext?.articleText?.trim()) &&
  (isArticleMode ||
    question.questionType === 'READING_COMPREHENSION' ||
    question.questionType === 'FILL_BLANK')

const getCopyButtonLabel = (
  question: QuizQuestion,
  shouldCopyWithArticle: boolean,
) => {
  if (shouldCopyWithArticle) return '复制给AI'
  if (
    question.questionType === 'READING_COMPREHENSION' ||
    question.questionType === 'FILL_BLANK'
  ) {
    return '复制阅读解析'
  }
  return '复制给AI'
}

export function useQuizPreparedData(
  questions: QuizQuestion[],
  answers: Record<string, string | null>,
  isGraded: Record<string, boolean>,
  localVocabularyMetaMapByQuestion: Record<
    string,
    Record<string, VocabularyMeta>
  >,
  showMeaning: boolean,
  showPronunciation: boolean,
  isArticleMode: boolean,
  aiPromptContext?: AiPromptContext,
): PreparedQuestion[] {
  return useMemo<PreparedQuestion[]>(() => {
    return questions.map((question, index) => {
      const userAnswerId = answers[question.id] || null
      const graded = Boolean(isGraded[question.id])
      const difficulty = getDifficultyBadge(question.attempts)
      const typeConfig = getTypeLabel(question.questionType)
      const fontClass = getReadingFontClass(question.contextSentence || '')
      const display = getQuestionDisplayData(question)

      const questionMetaMap =
        localVocabularyMetaMapByQuestion[question.id] || {}
      const posHighlightTokens = buildPosHighlightTokens(
        question.contextSentence,
        questionMetaMap,
      )
      const questionPronunciationMap = getPronunciationMap(questionMetaMap)

      const wordPanelEntries = getWordMetaPanelEntries({
        question,
        questionMetaMap,
        showMeaning,
        showPronunciation,
      })

      const shouldCopyWithArticle = shouldIncludeArticleInAiPrompt(
        question,
        isArticleMode,
        aiPromptContext,
      )
      const copyButtonLabel = getCopyButtonLabel(
        question,
        shouldCopyWithArticle,
      )

      return {
        graded,
        userAnswerId,
        difficulty,
        typeConfig,
        realIndex: index + 1,
        fontClass,
        display,
        questionMetaMap,
        posHighlightTokens,
        questionPronunciationMap,
        wordPanelEntries,
        shouldCopyWithArticle,
        copyButtonLabel,
      }
    })
  }, [
    questions,
    answers,
    isGraded,
    localVocabularyMetaMapByQuestion,
    showMeaning,
    showPronunciation,
    isArticleMode,
    aiPromptContext,
  ])
}

export type {
  PreparedQuestion,
  VocabularyMeta,
  PosHighlightToken,
  BadgeConfig,
  WordMetaPanelEntry,
}
