'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  saveVocabulary,
  submitQuizAttempts,
  updateQuestionExplanation,
} from '@/app/actions/content'
import VocabularyTooltip, {
  TooltipSaveState,
} from '@/components/VocabularyTooltip'
import ToggleSwitch from '@/components/ToggleSwitch'
import WordMetaPanel from '@/components/WordMetaPanel'
import {
  annotateJapaneseHtml,
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import {
  getPosOptions,
  inferContextualPos,
  posWordHighlightClass,
} from '@/utils/posTagger'
import { getReadingFontClass } from '@/utils/readingTypography'

type QuizMode = 'scroll' | 'random' | 'sequential'

type QuestionOption = {
  id: string
  text: string
  isCorrect: boolean
}

type QuestionAttempt = {
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
}

type QuizData = {
  questions: QuizQuestion[]
}

type AiPromptContext = {
  sourceLabel?: string
  articleTitle?: string
  articleText?: string
}

export type QuizAnswerMap = Record<string, string | null>

type TooltipState = {
  word: string
  x: number
  y: number
  isTop: boolean
  questionId: string
  contextSentence: string
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

type QuizEngineUIProps = {
  quiz: QuizData
  backUrl?: string
  onFinish?: () => void
  onAnswerChange?: React.Dispatch<React.SetStateAction<QuizAnswerMap>>
  isArticleMode?: boolean
  onGradedChange?: (gradedMap: Record<string, boolean>) => void
  vocabularyMetaMapByQuestion?: Record<string, Record<string, VocabularyMeta>>
  aiPromptContext?: AiPromptContext
  isAllMode?: boolean
}

type SortingBoardProps = {
  question: QuizQuestion
  userAnswerId?: string | null
  onAnswerSelected: (optionId: string | null) => void
  isGraded: boolean
  textFontClass: string
}

type QuestionDisplayData = {
  promptText: string
  hasPrompt: boolean
  displayPrompt: string
}

type RenderContext = {
  showMeaning: boolean
  showPronunciation: boolean
  questionMetaMap: Record<string, VocabularyMeta>
  posHighlightTokens: PosHighlightToken[]
  questionPronunciationMap: Record<string, string>
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

const SLOT_REGEX = /[＿_]{2,}|[★＊]/
const BLANK_REGEX =
  /([（(][\s　]*[）)]|__{2,}|～|[＿_★＊][＿_★＊\s　]+[＿_★＊]|[★＊])/

const BASE_RT_CLASS =
  '[&_rt]:text-[10px] [&_rt]:font-bold [&_rt]:text-indigo-500 dark:[&_rt]:text-indigo-300'

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
}

const DEFAULT_TYPE_CONFIG: BadgeConfig = {
  label: '普通题',
  style:
    'bg-gray-50 text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
}

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ')

const shuffleArray = <T,>(array: T[]) => {
  const next = [...array]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
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

const getQuizMode = (rawMode: string | null, isAllMode: boolean): QuizMode => {
  if (isAllMode) return 'sequential'
  if (
    rawMode === 'scroll' ||
    rawMode === 'random' ||
    rawMode === 'sequential'
  ) {
    return rawMode
  }
  return 'sequential'
}

const getModeLabel = (mode: QuizMode) => {
  if (mode === 'scroll') return '全卷模式'
  if (mode === 'random') return '随机模式'
  return '逐题模式'
}

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

const buildTypeSpecificPromptRequirements = (
  questionType: string,
  includeFullArticle: boolean,
) => {
  if (questionType === 'PRONUNCIATION') {
    return [
      '先判断正确读音，并说明关键音变（长音/促音/拨音/浊音）依据。',
      '逐项指出错误读音为什么不成立。',
      '补充 2 组同类易混读音对比，帮助迁移。',
    ]
  }

  if (questionType === 'WORD_DISTINCTION') {
    return [
      '先给出目标词核心义与语域差异。',
      '逐项比较选项在语义、搭配和语境上的可用性。',
      '给出 1 个正确替换例句和 1 个常见误用例句。',
    ]
  }

  if (questionType === 'GRAMMAR') {
    return [
      '先给出正确语法点与接续规则。',
      '逐项说明错误项在语法或语气上不自然的原因。',
      '给出“看到此类题先检查什么”的三步法。',
    ]
  }

  if (questionType === 'SORTING') {
    return [
      '先给出正确排序结果。',
      '说明每一步衔接线索（主语省略、接续词、时态、照应）。',
      '总结一个可复用的“排序检查清单”。',
    ]
  }

  if (questionType === 'READING_COMPREHENSION' || includeFullArticle) {
    return [
      '必须先结合全文主旨与段落逻辑，再判断该题。',
      '逐项排除错误选项，并指出其与原文冲突点。',
      '最后给出本题在全文中的定位方法（关键词/指代/转折）。',
    ]
  }

  return [
    '先直接给出正确答案。',
    '逐项排除错误选项（语法/语义/搭配/语境）。',
    '最后给出同类题可复用的判断模板。',
  ]
}

const buildAiSolvePrompt = ({
  question,
  realIndex,
  userAnswerId,
  graded,
  includeFullArticle,
  aiPromptContext,
}: {
  question: QuizQuestion
  realIndex: number
  userAnswerId?: string | null
  graded: boolean
  includeFullArticle: boolean
  aiPromptContext?: AiPromptContext
}) => {
  const typeConfig = getTypeLabel(question.questionType)
  const userAnswer =
    question.options.find(option => option.id === userAnswerId) || null
  const correctAnswer =
    question.options.find(option => option.isCorrect) || null
  const optionsText = question.options
    .map(
      (option, index) => `${String.fromCharCode(65 + index)}. ${option.text}`,
    )
    .join('\n')
  const requirements = buildTypeSpecificPromptRequirements(
    question.questionType,
    includeFullArticle,
  )
  const articleText = (aiPromptContext?.articleText || '')
    .replace(/\r\n/g, '\n')
    .trim()

  return [
    '你是一位日语考试与阅读教练。请按题型给出结构化、可执行的讲解。',
    '',
    '输出要求：',
    ...requirements.map((line, index) => `${index + 1}) ${line}`),
    '',
    '请使用简洁中文，必要时标注日文原文与假名。',
    '输出结构固定为：',
    'A. 正确答案',
    'B. 错项诊断',
    'C. 语法/语义关键点',
    'D. 可迁移模板',
    'E. 本题复盘建议（1-2条）',
    '',
    `题号: Q${realIndex}`,
    `题型: ${typeConfig.label}`,
    `题干: ${(question.prompt || '').trim() || '（无独立题干）'}`,
    `语境句: ${question.contextSentence}`,
    '选项:',
    optionsText,
    `我的作答: ${userAnswer ? userAnswer.text : '未作答'}`,
    `标准答案: ${correctAnswer ? correctAnswer.text : '未知'}`,
    `是否已批改: ${graded ? '是' : '否'}`,
    question.explanation
      ? `题目已有笔记/解析: ${question.explanation}`
      : '题目已有笔记/解析: 无',
    includeFullArticle && articleText
      ? `内容来源: ${aiPromptContext?.sourceLabel || '阅读文章'}`
      : '',
    includeFullArticle && aiPromptContext?.articleTitle
      ? `文章标题: ${aiPromptContext.articleTitle}`
      : '',
    includeFullArticle && articleText ? `文章全文:\n${articleText}` : '',
    '',
    '请开始讲解：',
  ]
    .filter(Boolean)
    .join('\n')
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const applyPosHighlightsToHtml = (
  html: string,
  tokens: PosHighlightToken[],
  enabled: boolean,
) => {
  if (!enabled || !html || tokens.length === 0) return html

  const sortedTokens = [...tokens].sort((a, b) => b.word.length - a.word.length)
  const chunks = html.split(/(<[^>]+>)/g)

  return chunks
    .map(chunk => {
      if (!chunk || (chunk.startsWith('<') && chunk.endsWith('>'))) return chunk

      let nextChunk = chunk
      sortedTokens.forEach(token => {
        const regex = new RegExp(`(${escapeRegExp(token.word)})`, 'g')
        nextChunk = nextChunk.replace(
          regex,
          `<span class="rounded px-1 py-0.5 ${token.className}">$1</span>`,
        )
      })

      return nextChunk
    })
    .join('')
}

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

const createQuestionPromptHtml = ({
  question,
  displayPrompt,
  graded,
}: {
  question: QuizQuestion
  displayPrompt: string
  graded: boolean
}) => {
  let promptHtml = displayPrompt

  if (graded && question.prompt && question.questionType === 'FILL_BLANK') {
    const parts = question.prompt.split(BLANK_REGEX)

    if (parts.length >= 3) {
      const prefix = parts[0] || ''
      const suffix = parts[parts.length - 1] || ''
      const delimiter = parts[1] || ''
      let insertedText = question.contextSentence

      if (prefix && insertedText.startsWith(prefix)) {
        insertedText = insertedText.slice(prefix.length)
      }

      if (suffix && insertedText.endsWith(suffix)) {
        insertedText = insertedText.slice(
          0,
          insertedText.length - suffix.length,
        )
      }

      let replacement = `<span class="mx-1 border-b-[3px] border-indigo-500 px-1 pb-0.5 font-bold text-indigo-700">${insertedText || '???'}</span>`

      if (delimiter.includes('(') && delimiter.includes(')')) {
        replacement = `(${replacement})`
      } else if (delimiter.includes('（') && delimiter.includes('）')) {
        replacement = `（${replacement}）`
      }

      promptHtml = `${prefix}${replacement}${suffix}`
    }

    return promptHtml
  }

  if (question.questionType === 'PRONUNCIATION' && question.targetWord) {
    return displayPrompt.replace(
      question.targetWord,
      `<u class="border-b-2 border-indigo-500 pb-0.5 font-semibold text-indigo-700">${question.targetWord}</u>`,
    )
  }

  return promptHtml
}

const createQuestionContextHtml = (question: QuizQuestion) => {
  if (question.questionType === 'PRONUNCIATION' && question.targetWord) {
    return question.contextSentence.replace(
      question.targetWord,
      `<u class="border-b border-indigo-400 pb-px font-semibold text-gray-500">${question.targetWord}</u>`,
    )
  }

  return question.contextSentence
}

const annotateQuestionHtml = (html: string, renderContext: RenderContext) =>
  annotateJapaneseHtml(
    applyPosHighlightsToHtml(
      html,
      renderContext.posHighlightTokens,
      renderContext.showMeaning,
    ),
    renderContext.questionPronunciationMap,
    renderContext.showPronunciation,
    {
      showMeaning: renderContext.showMeaning,
      vocabularyMetaMap: renderContext.questionMetaMap,
      sentenceMeaningMap: {},
    },
  )

const initializeQuestions = (questions: QuizQuestion[], mode: QuizMode) => {
  const sorted = [...questions].sort((a, b) => (a.order || 0) - (b.order || 0))
  const withShuffledOptions = sorted.map(question => ({
    ...question,
    options: shuffleArray(question.options),
  }))

  return mode === 'random'
    ? shuffleArray(withShuffledOptions)
    : withShuffledOptions
}

const createTooltipStateFromSelection = ({
  selection,
  questionId,
  contextSentence,
}: {
  selection: Selection
  questionId: string
  contextSentence: string
}): TooltipState | null => {
  const selectedText = selection.toString().trim()
  if (
    !selectedText ||
    selectedText.length >= 25 ||
    selection.rangeCount === 0
  ) {
    return null
  }

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  const isMobileLike = window.innerWidth < 768 || rect.top < 60

  return {
    word: selectedText,
    x: rect.left + rect.width / 2,
    y: isMobileLike ? rect.bottom + 10 : rect.top - 10,
    isTop: !isMobileLike,
    questionId,
    contextSentence,
  }
}

const createUpdatedVocabularyMeta = ({
  current,
  questionId,
  word,
  pronunciations,
  partsOfSpeech,
  meanings,
  saveWithPronunciation,
  saveWithMeaning,
}: {
  current: Record<string, Record<string, VocabularyMeta>>
  questionId: string
  word: string
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  saveWithPronunciation: boolean
  saveWithMeaning: boolean
}) => {
  const existingMeta = current[questionId]?.[word] || {
    pronunciations: [],
    partsOfSpeech: [],
    meanings: [],
  }

  return {
    ...current,
    [questionId]: {
      ...(current[questionId] || {}),
      [word]: {
        pronunciations: saveWithPronunciation ? pronunciations : [],
        partsOfSpeech:
          partsOfSpeech.length > 0 ? partsOfSpeech : existingMeta.partsOfSpeech,
        meanings: saveWithMeaning ? meanings : [],
      },
    },
  }
}

const getOptionCardStyle = ({
  graded,
  isSelected,
  isCorrect,
}: {
  graded: boolean
  isSelected: boolean
  isCorrect: boolean
}) => {
  if (graded) {
    if (isCorrect) {
      return 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30'
    }
    if (isSelected) {
      return 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/30'
    }
    return 'border-gray-200 bg-white opacity-50 dark:border-slate-800 dark:bg-slate-900'
  }

  if (isSelected) {
    return 'border-indigo-200 bg-indigo-50 dark:border-indigo-900/60 dark:bg-indigo-950/30'
  }

  return 'border-gray-200 bg-white hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/70'
}

const getOptionLabelStyle = ({
  graded,
  isSelected,
  isCorrect,
}: {
  graded: boolean
  isSelected: boolean
  isCorrect: boolean
}) => {
  if (graded && isCorrect) return 'text-emerald-600'
  if (graded && isSelected) return 'text-rose-600'
  if (isSelected) return 'text-indigo-600'
  return 'text-gray-400'
}

const getOptionTextStyle = ({
  graded,
  isSelected,
  isCorrect,
}: {
  graded: boolean
  isSelected: boolean
  isCorrect: boolean
}) => {
  if (graded && isCorrect) return 'text-emerald-900 dark:text-emerald-200'
  if (graded && isSelected) return 'text-rose-900 dark:text-rose-200'
  if (isSelected) return 'text-indigo-900 dark:text-indigo-200'
  return 'text-gray-800 dark:text-slate-100'
}

const copyTextToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {}

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const HighlightedContext = ({
  prompt,
  contextSentence,
}: {
  prompt: string
  contextSentence: string
}) => {
  const normalizedPrompt = (prompt || '').trim()
  const normalizedContext = (contextSentence || '').trim()

  if (!normalizedPrompt) return <span>{normalizedContext}</span>
  if (!normalizedContext) return <span>{normalizedPrompt}</span>
  if (normalizedPrompt === normalizedContext)
    return <span>{normalizedContext}</span>

  if (BLANK_REGEX.test(normalizedPrompt)) {
    const parts = normalizedPrompt.split(BLANK_REGEX)

    if (parts.length >= 3) {
      const prefix = parts[0] || ''
      const suffix = parts[parts.length - 1] || ''
      const delimiter = parts[1] || ''
      let insertedText = normalizedContext

      if (prefix && insertedText.startsWith(prefix)) {
        insertedText = insertedText.slice(prefix.length)
      }

      if (suffix && insertedText.endsWith(suffix)) {
        insertedText = insertedText.slice(
          0,
          insertedText.length - suffix.length,
        )
      }

      let replacement = (
        <span className='mx-1 border-b-[3px] border-indigo-500 px-1 pb-0.5 font-bold text-indigo-700'>
          {insertedText || '???'}
        </span>
      )

      if (delimiter.includes('(') && delimiter.includes(')')) {
        replacement = <>({replacement})</>
      } else if (delimiter.includes('（') && delimiter.includes('）')) {
        replacement = <>（{replacement}）</>
      }

      return (
        <span>
          {prefix}
          {replacement}
          {suffix}
        </span>
      )
    }
  }

  return <span>{normalizedContext}</span>
}

const SortingBoard = ({
  question,
  userAnswerId,
  onAnswerSelected,
  isGraded,
  textFontClass,
}: SortingBoardProps) => {
  const [slots, setSlots] = useState<(QuestionOption | null)[]>([])
  const [pool, setPool] = useState<QuestionOption[]>([])
  const [canDrag, setCanDrag] = useState(false)

  const segments = useMemo(
    () =>
      (question.prompt || question.contextSentence).split(/([＿_]{2,}|[★＊])/),
    [question.contextSentence, question.prompt],
  )

  const slotCount = useMemo(
    () => segments.filter(segment => SLOT_REGEX.test(segment)).length,
    [segments],
  )

  const starIndex = useMemo(() => {
    let index = 0
    let target = -1

    segments.forEach(segment => {
      if (!SLOT_REGEX.test(segment)) return
      if (/[★＊]/.test(segment)) target = index
      index++
    })

    return target
  }, [segments])

  useEffect(() => {
    const updateCanDrag = () => {
      setCanDrag(window.innerWidth >= 768)
    }

    updateCanDrag()
    window.addEventListener('resize', updateCanDrag)
    return () => window.removeEventListener('resize', updateCanDrag)
  }, [])

  useEffect(() => {
    const nextSlots = Array(slotCount).fill(null) as (QuestionOption | null)[]
    const selectedOption =
      userAnswerId != null
        ? question.options.find(option => option.id === userAnswerId) || null
        : null

    if (selectedOption && starIndex >= 0 && starIndex < nextSlots.length) {
      nextSlots[starIndex] = selectedOption
    }

    setSlots(nextSlots)
    setPool(question.options.filter(option => option.id !== selectedOption?.id))
  }, [question.options, slotCount, starIndex, userAnswerId])

  useEffect(() => {
    if (isGraded) return

    if (slots.every(Boolean) && starIndex !== -1 && slots[starIndex]) {
      onAnswerSelected(slots[starIndex]!.id)
      return
    }

    onAnswerSelected(null)
  }, [isGraded, onAnswerSelected, slots, starIndex])

  const moveToSlot = (option: QuestionOption) => {
    if (isGraded) return

    const emptyIndex = slots.findIndex(item => item === null)
    if (emptyIndex === -1) return

    setSlots(prev => {
      const next = [...prev]
      next[emptyIndex] = option
      return next
    })
    setPool(prev => prev.filter(item => item.id !== option.id))
  }

  const moveToPool = (option: QuestionOption, slotIndex: number) => {
    if (isGraded) return

    setSlots(prev => {
      const next = [...prev]
      next[slotIndex] = null
      return next
    })
    setPool(prev => [...prev, option])
  }

  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    option: QuestionOption,
  ) => {
    if (isGraded) {
      event.preventDefault()
      return
    }

    event.dataTransfer.setData('optObj', JSON.stringify(option))
  }

  const handleDropToSlot = (
    event: React.DragEvent<HTMLDivElement>,
    slotIndex: number,
  ) => {
    if (isGraded || slots[slotIndex] !== null) return

    const raw = event.dataTransfer.getData('optObj')
    if (!raw) return

    const option = JSON.parse(raw) as QuestionOption
    if (!option?.id) return

    setPool(prev => prev.filter(item => item.id !== option.id))
    setSlots(prev => {
      const next = prev.map(item => (item?.id === option.id ? null : item))
      next[slotIndex] = option
      return next
    })
  }

  return (
    <div className='my-6'>
      <div
        className={cx(
          'mb-6 border-b border-orange-200 pb-4 text-base font-medium leading-10 text-gray-800 md:text-lg',
          textFontClass,
        )}>
        {segments.map((segment, index) => {
          if (!SLOT_REGEX.test(segment)) {
            return (
              <span
                key={`sorting-text-${segment}-${index}`}
                className={cx('align-middle', textFontClass)}>
                {segment}
              </span>
            )
          }

          const slotIndex =
            segments.slice(0, index + 1).filter(item => SLOT_REGEX.test(item))
              .length - 1
          const filledOption = slots[slotIndex]
          const isStarSlot = slotIndex === starIndex
          const isCorrectStar =
            isGraded && isStarSlot && filledOption?.isCorrect
          const isWrongStar = isGraded && isStarSlot && !filledOption?.isCorrect

          return (
            <div
              key={`sorting-slot-${slotIndex}-${segment}-${index}`}
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDropToSlot(event, slotIndex)}
              onClick={() =>
                filledOption && moveToPool(filledOption, slotIndex)
              }
              className={cx(
                'relative mx-1 inline-flex h-12 min-w-20 items-center justify-center border-b-2 px-3 align-middle transition-colors duration-300',
                filledOption
                  ? 'border-orange-400 bg-white'
                  : 'border-dashed border-gray-300 bg-gray-100/50',
                isCorrectStar && 'border-green-500 bg-green-100 text-green-800',
                isWrongStar && 'border-red-500 bg-red-100 text-red-800',
                isGraded
                  ? 'cursor-default'
                  : 'cursor-pointer hover:border-orange-500',
              )}>
              {isStarSlot && !filledOption && (
                <span className='absolute -top-5 text-sm text-orange-400'>
                  ★
                </span>
              )}

              {filledOption && (
                <span
                  className={cx(
                    'whitespace-nowrap text-base font-bold text-gray-800',
                    textFontClass,
                  )}>
                  {filledOption.text}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className='min-h-24 border-b border-gray-200 bg-gray-50 p-6'>
        {!isGraded && (
          <div className='mb-5 text-center text-xs font-semibold tracking-wide text-gray-500'>
            选择选项填入上方空缺处
          </div>
        )}

        <div className='flex flex-wrap justify-center gap-3'>
          {pool.map(option => (
            <div
              key={option.id}
              draggable={!isGraded && canDrag}
              onDragStart={event => {
                if (canDrag) {
                  handleDragStart(event, option)
                }
              }}
              onClick={() => moveToSlot(option)}
              className={cx(
                'select-none border border-orange-200 bg-white px-6 py-3 font-semibold text-orange-700 transition-colors',
                isGraded
                  ? 'cursor-not-allowed opacity-50'
                  : 'cursor-pointer hover:border-orange-400 active:scale-95',
              )}>
              <span className={textFontClass}>{option.text}</span>
            </div>
          ))}

          {pool.length === 0 && (
            <div className='my-3 text-sm font-bold text-gray-400'>
              ✅ 选项已全部填入
            </div>
          )}
        </div>
      </div>

      {isGraded && (
        <div className='animate-in slide-in-from-top-4 mt-6 border-b border-indigo-200 bg-indigo-50/40 px-4 py-5 md:px-6 md:py-6'>
          <div className='mb-4 text-sm font-black text-indigo-400'>
            正确语境
          </div>
          <div className='text-lg font-medium leading-relaxed text-indigo-900 md:text-xl'>
            <HighlightedContext
              prompt={question.prompt || question.contextSentence}
              contextSentence={question.contextSentence}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const QuizResultSummary = ({
  backUrl,
  score,
  questionCount,
  totalTimeSpent,
}: {
  backUrl: string
  score: number
  questionCount: number
  totalTimeSpent: number
}) => {
  const accuracy = Math.round((score / questionCount) * 100)
  const avgSec = (totalTimeSpent / questionCount / 1000).toFixed(1)

  let title = '继续练习'
  if (accuracy >= 80 && Number(avgSec) <= 15) title = '状态很好'
  else if (accuracy >= 80) title = '掌握不错'
  else if (Number(avgSec) <= 10) title = '速度很快'

  return (
    <div className='theme-page-quiz flex min-h-screen items-center justify-center bg-gray-50 p-6 dark:bg-slate-950'>
      <div className='w-full max-w-lg border-b border-gray-200 bg-white p-8 dark:border-slate-700 dark:bg-slate-900 md:p-12'>
        <div className='mb-10 text-center'>
          <span className='mb-4 inline-block rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1.5 text-sm font-bold text-indigo-600'>
            {title}
          </span>
          <h2 className='text-3xl font-bold text-gray-900 dark:text-slate-100'>
            测验完成
          </h2>
        </div>

        <div className='mb-10 grid grid-cols-2 gap-4'>
          <div className='border border-blue-100 bg-blue-50 p-6 text-center'>
            <div className='mb-2 text-xs font-bold text-blue-500'>正确率</div>
            <div className='text-4xl font-black text-blue-700'>
              {accuracy}
              <span className='text-xl'>%</span>
            </div>
          </div>

          <div className='border border-orange-100 bg-orange-50 p-6 text-center'>
            <div className='mb-2 text-xs font-bold text-orange-500'>
              平均单题耗时
            </div>
            <div className='text-4xl font-black text-orange-700'>
              {avgSec}
              <span className='text-xl'>s</span>
            </div>
          </div>
        </div>

        <Link
          href={backUrl}
          className='block border border-gray-900 bg-gray-900 px-8 py-4 text-center font-semibold text-white transition-colors hover:bg-gray-800'>
          {backUrl === '/articles' ? '返回阅读' : '返回题库'}
        </Link>
      </div>
    </div>
  )
}

const QuizToolbar = ({
  backUrl,
  mode,
  currentIndex,
  questionCount,
  isScrollMode,
  showPronunciation,
  setShowPronunciation,
  showMeaning,
  setShowMeaning,
}: {
  backUrl: string
  mode: QuizMode
  currentIndex: number
  questionCount: number
  isScrollMode: boolean
  showPronunciation: boolean
  setShowPronunciation: (value: boolean) => void
  showMeaning: boolean
  setShowMeaning: (value: boolean) => void
}) => (
  <div className='sticky top-0 z-20 mb-5 border-b border-gray-200/80 bg-gray-50/90 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90'>
    <div className='flex items-center justify-between gap-3'>
      <div className='flex min-w-0 items-center gap-2'>
        <Link href={backUrl} className='ui-btn ui-btn-sm shrink-0'>
          返回
        </Link>
        <span className='ui-tag ui-tag-muted'>{getModeLabel(mode)}</span>
      </div>

      <div className='flex flex-wrap items-center justify-end gap-2'>
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
        {!isScrollMode && (
          <span className='ui-tag ui-tag-info'>
            {currentIndex + 1} / {questionCount}
          </span>
        )}
      </div>
    </div>
  </div>
)

const QuestionMetaHeader = ({
  realIndex,
  difficulty,
  copied,
  copyButtonLabel,
  shouldCopyWithArticle,
  onCopy,
}: {
  realIndex: number
  difficulty: BadgeConfig
  copied: boolean
  copyButtonLabel: string
  shouldCopyWithArticle: boolean
  onCopy: () => void
}) => (
  <div className='mb-4 flex items-center justify-between'>
    <div className='flex items-center gap-2'>
      <span className='ui-tag border-gray-900 bg-gray-900 text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900'>
        Q{realIndex}
      </span>
      <span className={`ui-tag ${difficulty.style}`}>{difficulty.label}</span>
    </div>

    <button
      type='button'
      onClick={onCopy}
      className={cx(
        'ui-btn ui-btn-sm shrink-0',
        copied && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        !copied &&
          shouldCopyWithArticle &&
          'border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100/70',
      )}>
      {copied ? '已复制提示词' : copyButtonLabel}
    </button>
  </div>
)

const QuestionPromptCard = ({
  question,
  isArticleMode,
  graded,
  fontClass,
  display,
  renderContext,
}: {
  question: QuizQuestion
  isArticleMode: boolean
  graded: boolean
  fontClass: string
  display: QuestionDisplayData
  renderContext: RenderContext
}) => {
  const shouldHideCard = question.questionType === 'FILL_BLANK' && isArticleMode
  if (shouldHideCard) return null

  if (question.questionType === 'WORD_DISTINCTION') {
    return (
      <div className='mb-6 rounded-2xl bg-white/80 px-4 py-4 ring-1 ring-gray-200/70 dark:bg-slate-900/70 dark:ring-slate-800 md:px-5 md:py-5'>
        <div className='text-center'>
          <div className='text-xs font-bold uppercase tracking-[0.18em] text-gray-400'>
            单词辨析
          </div>
          <div
            className={cx(
              'mt-2 text-4xl font-black text-gray-900 dark:text-slate-100 md:text-5xl',
              fontClass,
            )}>
            {question.targetWord || display.displayPrompt}
          </div>
        </div>
      </div>
    )
  }

  if (!display.hasPrompt && isArticleMode) {
    return null
  }

  const promptHtml = createQuestionPromptHtml({
    question,
    displayPrompt: display.displayPrompt,
    graded,
  })
  const contextHtml = createQuestionContextHtml(question)
  const finalPromptHtml = annotateQuestionHtml(promptHtml, renderContext)
  const finalContextHtml = annotateQuestionHtml(contextHtml, renderContext)

  return (
    <div className='mb-6 rounded-2xl bg-white/80 px-4 py-4 ring-1 ring-gray-200/70 dark:bg-slate-900/70 dark:ring-slate-800 md:px-5 md:py-5'>
      <div
        className={cx(
          'select-text text-xl font-semibold leading-9 tracking-wide text-gray-900 dark:text-slate-100 md:text-2xl',
          fontClass,
          BASE_RT_CLASS,
        )}
        dangerouslySetInnerHTML={{ __html: finalPromptHtml }}
      />

      {question.questionType !== 'FILL_BLANK' &&
        question.questionType !== 'WORD_DISTINCTION' &&
        question.contextSentence &&
        (!display.hasPrompt ||
          question.prompt !== question.contextSentence) && (
          <div
            className={cx(
              'select-text mt-3 text-[15px] leading-7 text-gray-500 dark:text-slate-400 md:text-base',
              fontClass,
              BASE_RT_CLASS,
            )}
            dangerouslySetInnerHTML={{ __html: finalContextHtml }}
          />
        )}
    </div>
  )
}

const QuestionOptions = ({
  question,
  fontClass,
  graded,
  userAnswerId,
  renderContext,
  onSelect,
}: {
  question: QuizQuestion
  fontClass: string
  graded: boolean
  userAnswerId: string | null
  renderContext: RenderContext
  onSelect: (optionId: string) => void
}) => (
  <div className='mb-8 space-y-3'>
    {question.options.map((option, index) => {
      const isSelected = userAnswerId === option.id
      const renderedHtml = annotateQuestionHtml(option.text, renderContext)

      return (
        <div
          key={option.id}
          role='button'
          tabIndex={0}
          onKeyDown={event => {
            if (!graded && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              onSelect(option.id)
            }
          }}
          onClick={() => {
            const selection = window.getSelection()
            if (selection?.toString().trim()) return
            if (!graded) onSelect(option.id)
          }}
          className={cx(
            'w-full rounded-2xl border px-4 py-4 text-left transition-all duration-200',
            graded ? 'cursor-default' : 'cursor-pointer',
            getOptionCardStyle({
              graded,
              isSelected,
              isCorrect: option.isCorrect,
            }),
          )}>
          <div className='flex items-start gap-4'>
            <span
              className={cx(
                'mt-0.5 shrink-0 text-lg font-black',
                getOptionLabelStyle({
                  graded,
                  isSelected,
                  isCorrect: option.isCorrect,
                }),
              )}>
              {String.fromCharCode(65 + index)}.
            </span>

            <span
              className={cx(
                'select-text text-[17px] font-semibold leading-7 md:text-lg',
                fontClass,
                BASE_RT_CLASS,
                getOptionTextStyle({
                  graded,
                  isSelected,
                  isCorrect: option.isCorrect,
                }),
              )}
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        </div>
      )
    })}
  </div>
)

const ExplanationPanel = ({
  question,
  editingExpId,
  expDraft,
  isSavingExp,
  onStartEdit,
  onCancelEdit,
  onDraftChange,
  onSave,
}: {
  question: QuizQuestion
  editingExpId: string | null
  expDraft: string
  isSavingExp: boolean
  onStartEdit: (question: QuizQuestion) => void
  onCancelEdit: () => void
  onDraftChange: (value: string) => void
  onSave: (questionId: string) => void
}) => {
  const isEditing = editingExpId === question.id

  if (!question.explanation && !isEditing) {
    return (
      <div className='mb-6'>
        <button
          type='button'
          onClick={() => onStartEdit(question)}
          className='ui-btn border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300'>
          添加错题笔记
        </button>
      </div>
    )
  }

  return (
    <div className='mb-6'>
      <div className='rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20'>
        <div className='mb-3 flex items-center justify-between gap-3'>
          <h4 className='flex items-center gap-2 text-sm font-black text-blue-800 dark:text-blue-200'>
            题目解析 / 笔记
          </h4>

          {!isEditing && (
            <button
              type='button'
              onClick={() => onStartEdit(question)}
              className='rounded-md bg-blue-100/60 px-2.5 py-1 text-xs font-bold text-blue-600 transition-colors hover:text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'>
              编辑
            </button>
          )}
        </div>

        {isEditing ? (
          <div
            onMouseUp={event => event.stopPropagation()}
            onTouchEnd={event => event.stopPropagation()}>
            <textarea
              value={expDraft}
              onChange={event => onDraftChange(event.target.value)}
              className='w-full resize-y rounded-xl border border-blue-200 bg-white/90 p-4 text-sm outline-none transition-colors focus:ring-2 focus:ring-blue-400 dark:border-blue-900/50 dark:bg-slate-900/80 dark:text-slate-100 md:text-base'
              rows={4}
              placeholder='查完词典了？在这里记录你的错题笔记吧...'
            />
            <div className='mt-3 flex justify-end gap-3'>
              <button
                type='button'
                onClick={onCancelEdit}
                className='px-3 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'>
                取消
              </button>
              <button
                type='button'
                onClick={() => onSave(question.id)}
                disabled={isSavingExp}
                className='ui-btn ui-btn-primary disabled:opacity-50'>
                {isSavingExp ? '保存中...' : '保存笔记'}
              </button>
            </div>
          </div>
        ) : (
          <div className='whitespace-pre-wrap text-sm leading-relaxed text-blue-900 dark:text-blue-100 md:text-base'>
            {question.explanation}
          </div>
        )}
      </div>
    </div>
  )
}

const QuestionActions = ({
  isScrollMode,
  isArticleMode,
  isFinished,
  graded,
  currentIndex,
  questionCount,
  userAnswerId,
  onPrev,
  onGrade,
  onNext,
}: {
  isScrollMode: boolean
  isArticleMode: boolean
  isFinished: boolean
  graded: boolean
  currentIndex: number
  questionCount: number
  userAnswerId: string | null
  onPrev: () => void
  onGrade: () => void
  onNext: () => void
}) => {
  if (isScrollMode) return null

  if (isArticleMode) {
    return (
      <div className='pt-2'>
        <div className='flex gap-3'>
          <button
            type='button'
            onClick={onPrev}
            disabled={currentIndex === 0}
            className='ui-btn flex-1 disabled:cursor-not-allowed disabled:opacity-40'>
            上一题
          </button>

          {!isFinished ? (
            <button
              type='button'
              onClick={onNext}
              className='ui-btn ui-btn-primary flex-1'>
              {currentIndex === questionCount - 1 ? '提交' : '下一题'}
            </button>
          ) : (
            <button
              type='button'
              disabled
              className='ui-btn flex-1 cursor-default border-green-200 bg-green-50 text-green-700'>
              已提交
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!graded) {
    return (
      <div className='pt-2'>
        <div className='flex gap-3'>
          <button
            type='button'
            onClick={onGrade}
            className={cx(
              'ui-btn flex-1',
              userAnswerId
                ? 'ui-btn-primary'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
            )}>
            {userAnswerId ? '确认答案' : '跳过本题'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className='pt-2'>
      <button
        type='button'
        onClick={onNext}
        className='ui-btn w-full border-gray-900 bg-gray-900 text-white hover:bg-gray-800 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200'>
        {currentIndex === questionCount - 1 ? '查看结果' : '下一题'}
      </button>
    </div>
  )
}

const ScrollFooter = ({
  isFinished,
  score,
  questionCount,
  backUrl,
  onSubmit,
}: {
  isFinished: boolean
  score: number
  questionCount: number
  backUrl: string
  onSubmit: () => void
}) => (
  <div className='mt-10'>
    {!isFinished ? (
      <button
        type='button'
        onClick={onSubmit}
        className='ui-btn ui-btn-primary w-full text-base'>
        提交全卷
      </button>
    ) : (
      <div className='rounded-3xl border border-green-200 bg-green-50 p-8 text-center dark:border-green-900/50 dark:bg-green-950/20'>
        <h3 className='mb-2 text-2xl font-black text-green-800 dark:text-green-200'>
          已完成批改
        </h3>
        <p className='mb-5 text-sm text-green-700 dark:text-green-300'>
          正确 {score} / {questionCount} 题
        </p>
        <Link href={backUrl} className='ui-btn ui-btn-primary inline-flex'>
          {backUrl === '/articles' ? '返回阅读' : '返回题库'}
        </Link>
      </div>
    )}
  </div>
)

const QuestionCard = ({
  question,
  prepared,
  isArticleMode,
  copiedQuestionId,
  editingExpId,
  expDraft,
  isSavingExp,
  showMeaning,
  showPronunciation,
  onTextSelection,
  onCopyQuestion,
  onSelectOption,
  onStartEdit,
  onCancelEdit,
  onDraftChange,
  onSaveExplanation,
  onPrev,
  onGrade,
  onNext,
  isScrollMode,
  isFinished,
  currentIndex,
  questionCount,
}: {
  question: QuizQuestion
  prepared: PreparedQuestion
  isArticleMode: boolean
  copiedQuestionId: string | null
  editingExpId: string | null
  expDraft: string
  isSavingExp: boolean
  showMeaning: boolean
  showPronunciation: boolean
  onTextSelection: (
    event: React.MouseEvent | React.TouchEvent,
    questionId: string,
    contextSentence: string,
  ) => void
  onCopyQuestion: () => void
  onSelectOption: (optionId: string | null) => void
  onStartEdit: (question: QuizQuestion) => void
  onCancelEdit: () => void
  onDraftChange: (value: string) => void
  onSaveExplanation: (questionId: string) => void
  onPrev: () => void
  onGrade: () => void
  onNext: () => void
  isScrollMode: boolean
  isFinished: boolean
  currentIndex: number
  questionCount: number
}) => {
  const renderContext: RenderContext = {
    showMeaning,
    showPronunciation,
    questionMetaMap: prepared.questionMetaMap,
    posHighlightTokens: prepared.posHighlightTokens,
    questionPronunciationMap: prepared.questionPronunciationMap,
  }

  return (
    <div
      onMouseUp={event =>
        onTextSelection(event, question.id, question.contextSentence)
      }
      onTouchEnd={event =>
        onTextSelection(event, question.id, question.contextSentence)
      }
      className='select-text border-b border-gray-200 px-0 py-7 dark:border-slate-800 md:py-9'>
      {!isArticleMode && prepared.wordPanelEntries.length > 0 && (
        <WordMetaPanel
          className='mb-5'
          entries={prepared.wordPanelEntries}
          showPronunciation={showPronunciation}
          showMeaning={showMeaning}
          contextSentence={question.contextSentence}
        />
      )}

      {question.sourcePaper && (
        <div className='mb-6 inline-block border-b border-gray-300 pb-1 text-xs font-semibold tracking-wide text-gray-600 dark:border-slate-600 dark:text-slate-300'>
          {question.sourcePaper}
        </div>
      )}

      <QuestionMetaHeader
        realIndex={prepared.realIndex}
        difficulty={prepared.difficulty}
        copied={copiedQuestionId === question.id}
        copyButtonLabel={prepared.copyButtonLabel}
        shouldCopyWithArticle={prepared.shouldCopyWithArticle}
        onCopy={onCopyQuestion}
      />

      {question.questionType === 'SORTING' ? (
        <div className='rounded-2xl bg-white/80 px-4 py-4 ring-1 ring-gray-200/70 dark:bg-slate-900/70 dark:ring-slate-800 md:px-5 md:py-5'>
          <SortingBoard
            question={question}
            userAnswerId={prepared.userAnswerId}
            onAnswerSelected={onSelectOption}
            isGraded={prepared.graded}
            textFontClass={prepared.fontClass}
          />
        </div>
      ) : (
        <>
          <QuestionPromptCard
            question={question}
            isArticleMode={isArticleMode}
            graded={prepared.graded}
            fontClass={prepared.fontClass}
            display={prepared.display}
            renderContext={renderContext}
          />

          <QuestionOptions
            question={question}
            fontClass={prepared.fontClass}
            graded={prepared.graded}
            userAnswerId={prepared.userAnswerId}
            renderContext={renderContext}
            onSelect={optionId => onSelectOption(optionId)}
          />
        </>
      )}

      {prepared.graded && (
        <ExplanationPanel
          question={question}
          editingExpId={editingExpId}
          expDraft={expDraft}
          isSavingExp={isSavingExp}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onDraftChange={onDraftChange}
          onSave={onSaveExplanation}
        />
      )}

      <QuestionActions
        isScrollMode={isScrollMode}
        isArticleMode={isArticleMode}
        isFinished={isFinished}
        graded={prepared.graded}
        currentIndex={currentIndex}
        questionCount={questionCount}
        userAnswerId={prepared.userAnswerId}
        onPrev={onPrev}
        onGrade={onGrade}
        onNext={onNext}
      />
    </div>
  )
}

export default function QuizEngineUI({
  quiz,
  backUrl = '/quizzes',
  onFinish,
  onAnswerChange,
  isArticleMode = false,
  onGradedChange,
  vocabularyMetaMapByQuestion = {},
  aiPromptContext,
  isAllMode = false,
}: QuizEngineUIProps) {
  const searchParams = useSearchParams()
  const mode = getQuizMode(searchParams.get('mode'), isAllMode)
  const isScrollMode = mode === 'scroll'

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<QuizAnswerMap>({})
  const [isGraded, setIsGraded] = useState<Record<string, boolean>>({})
  const [timeLogs, setTimeLogs] = useState<Record<string, number>>({})
  const [globalStartTime, setGlobalStartTime] = useState(0)
  const [currentQuestionStartTime, setCurrentQuestionStartTime] = useState(0)
  const [totalTimeSpent, setTotalTimeSpent] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFinished, setIsFinished] = useState(false)
  const [score, setScore] = useState(0)

  const [activeTooltip, setActiveTooltip] = useState<TooltipState | null>(null)
  const [saveState, setSaveState] = useState<TooltipSaveState>('idle')
  const [saveWithPronunciation, setSaveWithPronunciation] = useState(false)
  const [saveWithMeaning, setSaveWithMeaning] = useState(false)
  const [tooltipPronunciation, setTooltipPronunciation] = useState('')
  const [tooltipPartOfSpeech, setTooltipPartOfSpeech] = useState('')
  const [tooltipMeaning, setTooltipMeaning] = useState('')

  const [editingExpId, setEditingExpId] = useState<string | null>(null)
  const [expDraft, setExpDraft] = useState('')
  const [isSavingExp, setIsSavingExp] = useState(false)
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null)
  const [
    localVocabularyMetaMapByQuestion,
    setLocalVocabularyMetaMapByQuestion,
  ] = useState(vocabularyMetaMapByQuestion)

  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()

  useEffect(() => {
    onAnswerChange?.(answers)
  }, [answers, onAnswerChange])

  useEffect(() => {
    onGradedChange?.(isGraded)
  }, [isGraded, onGradedChange])

  useEffect(() => {
    const initializedQuestions = initializeQuestions(quiz.questions, mode)
    const now = Date.now()

    setQuestions(initializedQuestions)
    setAnswers({})
    setIsGraded({})
    setTimeLogs({})
    setCurrentIndex(0)
    setIsFinished(false)
    setScore(0)
    setTotalTimeSpent(0)
    setGlobalStartTime(now)
    setCurrentQuestionStartTime(now)
  }, [quiz.questions, mode])

  useEffect(() => {
    const hideTooltip = () => setActiveTooltip(null)
    window.addEventListener('scroll', hideTooltip, { passive: true })
    window.addEventListener('resize', hideTooltip)

    return () => {
      window.removeEventListener('scroll', hideTooltip)
      window.removeEventListener('resize', hideTooltip)
    }
  }, [])

  const handleTextSelection = (
    event: React.MouseEvent | React.TouchEvent,
    questionId: string,
    contextSentence: string,
  ) => {
    const target = event.target as HTMLElement
    if (target.closest('.no-select')) return

    window.setTimeout(() => {
      const selection = window.getSelection()
      if (!selection) {
        setActiveTooltip(null)
        return
      }

      const tooltip = createTooltipStateFromSelection({
        selection,
        questionId,
        contextSentence,
      })

      if (!tooltip) {
        if (!selection.toString().trim()) {
          setActiveTooltip(null)
        }
        return
      }

      setActiveTooltip(tooltip)

      const existingMeta =
        localVocabularyMetaMapByQuestion[questionId]?.[tooltip.word]
      const inferredPos = inferContextualPos(
        tooltip.word,
        contextSentence,
        existingMeta?.partsOfSpeech || [],
      )

      setTooltipPronunciation((existingMeta?.pronunciations || []).join('\n'))
      setTooltipPartOfSpeech(inferredPos.join('\n'))
      setTooltipMeaning((existingMeta?.meanings || []).join('\n'))
      setSaveWithPronunciation(true)
      setSaveWithMeaning(true)
      setSaveState('idle')
    }, 50)
  }

  const handleSaveWord = async (word: string) => {
    if (!activeTooltip) return

    setSaveState('saving')

    const pronunciationList = splitListInput(tooltipPronunciation)
    const partOfSpeechList = splitListInput(tooltipPartOfSpeech)
    const meaningList = splitListInput(tooltipMeaning)

    const result = await saveVocabulary(
      word,
      activeTooltip.contextSentence,
      'QUIZ_QUESTION',
      activeTooltip.questionId,
      saveWithPronunciation ? pronunciationList[0] : undefined,
      saveWithPronunciation ? pronunciationList : [],
      saveWithMeaning ? meaningList : [],
      partOfSpeechList[0],
      partOfSpeechList,
    )

    if (result.success || result.state === 'already_exists') {
      setLocalVocabularyMetaMapByQuestion(prev =>
        createUpdatedVocabularyMeta({
          current: prev,
          questionId: activeTooltip.questionId,
          word,
          pronunciations: pronunciationList,
          partsOfSpeech: partOfSpeechList,
          meanings: meaningList,
          saveWithPronunciation,
          saveWithMeaning,
        }),
      )
      setSaveState(result.success ? 'success' : 'already_exists')
      window.setTimeout(() => setActiveTooltip(null), 1500)
      return
    }

    setSaveState('error')
  }

  const handleSelectOption = (questionId: string, optionId: string | null) => {
    if (isGraded[questionId]) return
    setAnswers(prev => ({ ...prev, [questionId]: optionId }))
  }

  const moveQuestionIndex = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= questions.length) return
    setCurrentIndex(nextIndex)
    setCurrentQuestionStartTime(Date.now())
    window.getSelection()?.removeAllRanges()
  }

  const recordCurrentQuestionTime = () => {
    const currentQuestion = questions[currentIndex]
    if (!currentQuestion) return

    const elapsed = Date.now() - currentQuestionStartTime
    if (elapsed <= 0) return

    setTimeLogs(prev => ({
      ...prev,
      [currentQuestion.id]: (prev[currentQuestion.id] || 0) + elapsed,
    }))
  }

  const handleGradeSingle = () => {
    const currentQuestion = questions[currentIndex]
    if (!currentQuestion) return

    setTimeLogs(prev => ({
      ...prev,
      [currentQuestion.id]: Date.now() - currentQuestionStartTime,
    }))
    setIsGraded(prev => ({ ...prev, [currentQuestion.id]: true }))
  }

  const handlePrev = () => {
    if (currentIndex <= 0) return
    if (isArticleMode && !isFinished) recordCurrentQuestionTime()
    moveQuestionIndex(currentIndex - 1)
  }

  const finishQuiz = async () => {
    if (questions.length === 0) return

    setIsFinished(true)
    onFinish?.()

    const finalLogs = { ...timeLogs }

    if (isArticleMode) {
      const currentQuestion = questions[currentIndex]
      if (currentQuestion) {
        const elapsed = Date.now() - currentQuestionStartTime
        if (elapsed > 0) {
          finalLogs[currentQuestion.id] =
            (finalLogs[currentQuestion.id] || 0) + elapsed
        }
      }
      setTimeLogs(finalLogs)
    }

    const totalMs = Date.now() - globalStartTime
    setTotalTimeSpent(totalMs)

    const nextGradedState = { ...isGraded }

    if (isScrollMode) {
      const avgTime = Math.floor(totalMs / questions.length)
      questions.forEach(question => {
        finalLogs[question.id] = avgTime
        nextGradedState[question.id] = true
      })
    } else {
      questions.forEach(question => {
        nextGradedState[question.id] = true
      })
    }

    setIsGraded(nextGradedState)

    let correctCount = 0
    const payload = questions.map(question => {
      const isCorrect =
        question.options.find(option => option.id === answers[question.id])
          ?.isCorrect || false

      if (isCorrect) correctCount++

      return {
        questionId: question.id,
        isCorrect,
        timeSpentMs: finalLogs[question.id] || 0,
      }
    })

    setScore(correctCount)
    await submitQuizAttempts(payload)
  }

  const handleNext = () => {
    if (isArticleMode) {
      if (!isFinished) recordCurrentQuestionTime()

      if (currentIndex < questions.length - 1) {
        moveQuestionIndex(currentIndex + 1)
      } else if (!isFinished) {
        void finishQuiz()
      }
      return
    }

    if (currentIndex < questions.length - 1) {
      moveQuestionIndex(currentIndex + 1)
      return
    }

    void finishQuiz()
  }

  const handleSaveExplanation = async (questionId: string) => {
    setIsSavingExp(true)
    const result = await updateQuestionExplanation(questionId, expDraft)

    if (result.success) {
      setQuestions(prev =>
        prev.map(question =>
          question.id === questionId
            ? { ...question, explanation: expDraft }
            : question,
        ),
      )
      setEditingExpId(null)
    }

    setIsSavingExp(false)
  }

  const handleCopyQuestion = async (
    question: QuizQuestion,
    realIndex: number,
    userAnswerId?: string | null,
    graded = false,
    includeFullArticle = false,
  ) => {
    const text = buildAiSolvePrompt({
      question,
      realIndex,
      userAnswerId,
      graded,
      includeFullArticle,
      aiPromptContext,
    })

    await copyTextToClipboard(text)
    setCopiedQuestionId(question.id)

    window.setTimeout(() => {
      setCopiedQuestionId(prev => (prev === question.id ? null : prev))
    }, 1400)
  }

  const startEditExplanation = (question: QuizQuestion) => {
    setEditingExpId(question.id)
    setExpDraft(question.explanation || '')
  }

  const preparedQuestions = useMemo(
    () =>
      questions.map((question, index) => {
        const questionMetaMap =
          localVocabularyMetaMapByQuestion[question.id] || {}
        const shouldCopyWithArticle = shouldIncludeArticleInAiPrompt(
          question,
          isArticleMode,
          aiPromptContext,
        )

        return {
          graded: Boolean(isGraded[question.id]),
          userAnswerId: answers[question.id] || null,
          difficulty: getDifficultyBadge(question.attempts),
          typeConfig: getTypeLabel(question.questionType),
          realIndex: isScrollMode ? index + 1 : currentIndex + 1,
          fontClass: getReadingFontClass(
            `${question.prompt || ''}\n${question.contextSentence}\n${question.options
              .map(option => option.text)
              .join(' ')}`,
          ),
          display: getQuestionDisplayData(question),
          questionMetaMap,
          posHighlightTokens: buildPosHighlightTokens(
            question.contextSentence,
            questionMetaMap,
          ),
          questionPronunciationMap: getPronunciationMap(questionMetaMap),
          wordPanelEntries: getWordMetaPanelEntries({
            question,
            questionMetaMap,
            showMeaning,
            showPronunciation,
          }),
          shouldCopyWithArticle,
          copyButtonLabel: getCopyButtonLabel(question, shouldCopyWithArticle),
        } satisfies PreparedQuestion
      }),
    [
      questions,
      localVocabularyMetaMapByQuestion,
      isArticleMode,
      aiPromptContext,
      isGraded,
      answers,
      isScrollMode,
      currentIndex,
      showMeaning,
      showPronunciation,
    ],
  )

  if (questions.length === 0) {
    return <div className='p-12 text-center text-gray-500'>正在加载题目...</div>
  }

  if (isFinished && !isScrollMode && !isArticleMode) {
    return (
      <QuizResultSummary
        backUrl={backUrl}
        score={score}
        questionCount={questions.length}
        totalTimeSpent={totalTimeSpent}
      />
    )
  }

  const visibleQuestions = isScrollMode
    ? questions.map((question, index) => ({
        question,
        prepared: preparedQuestions[index],
      }))
    : [
        {
          question: questions[currentIndex],
          prepared: preparedQuestions[currentIndex],
        },
      ]

  return (
    <div
      className='theme-page-quiz relative min-h-screen bg-gray-50 px-3 pb-28 pt-3 dark:bg-slate-950 md:px-6 md:pt-6'
      onClick={() => setActiveTooltip(null)}>
      {activeTooltip && (
        <VocabularyTooltip
          {...activeTooltip}
          saveState={saveState}
          onSaveWord={handleSaveWord}
          enablePronunciation
          pronunciationValue={tooltipPronunciation}
          saveWithPronunciation={saveWithPronunciation}
          onPronunciationChange={setTooltipPronunciation}
          onSaveWithPronunciationChange={setSaveWithPronunciation}
          partOfSpeechValue={tooltipPartOfSpeech}
          onPartOfSpeechChange={setTooltipPartOfSpeech}
          partOfSpeechOptions={getPosOptions(
            activeTooltip.word,
            activeTooltip.contextSentence,
          )}
          meaningValue={tooltipMeaning}
          saveWithMeaning={saveWithMeaning}
          onMeaningChange={setTooltipMeaning}
          onSaveWithMeaningChange={setSaveWithMeaning}
        />
      )}

      <div className='mx-auto w-full max-w-3xl'>
        {!isArticleMode && (
          <QuizToolbar
            backUrl={backUrl}
            mode={mode}
            currentIndex={currentIndex}
            questionCount={questions.length}
            isScrollMode={isScrollMode}
            showPronunciation={showPronunciation}
            setShowPronunciation={setShowPronunciation}
            showMeaning={showMeaning}
            setShowMeaning={setShowMeaning}
          />
        )}

        <div className='space-y-0'>
          {visibleQuestions.map(({ question, prepared }) => (
            <QuestionCard
              key={question.id}
              question={question}
              prepared={prepared}
              isArticleMode={isArticleMode}
              copiedQuestionId={copiedQuestionId}
              editingExpId={editingExpId}
              expDraft={expDraft}
              isSavingExp={isSavingExp}
              showMeaning={showMeaning}
              showPronunciation={showPronunciation}
              onTextSelection={handleTextSelection}
              onCopyQuestion={() =>
                void handleCopyQuestion(
                  question,
                  prepared.realIndex,
                  prepared.userAnswerId,
                  prepared.graded,
                  prepared.shouldCopyWithArticle,
                )
              }
              onSelectOption={optionId =>
                handleSelectOption(question.id, optionId)
              }
              onStartEdit={startEditExplanation}
              onCancelEdit={() => setEditingExpId(null)}
              onDraftChange={setExpDraft}
              onSaveExplanation={questionId =>
                void handleSaveExplanation(questionId)
              }
              onPrev={handlePrev}
              onGrade={handleGradeSingle}
              onNext={handleNext}
              isScrollMode={isScrollMode}
              isFinished={isFinished}
              currentIndex={currentIndex}
              questionCount={questions.length}
            />
          ))}

          {isScrollMode && (
            <ScrollFooter
              isFinished={isFinished}
              score={score}
              questionCount={questions.length}
              backUrl={backUrl}
              onSubmit={() => void finishQuiz()}
            />
          )}
        </div>
      </div>
    </div>
  )
}
