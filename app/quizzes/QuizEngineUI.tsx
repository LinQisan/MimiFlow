'use client'

import React, { useState, useEffect, useMemo } from 'react'
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
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import { getPosOptions, inferContextualPos } from '@/utils/posTagger'

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
  options: QuestionOption[]
  attempts?: QuestionAttempt[]
  explanation?: string | null
  order?: number | null
}

type QuizData = {
  questions: QuizQuestion[]
}

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

const SLOT_REGEX = /[＿_]{2,}|[★＊]/

const shuffleArray = <T,>(array: T[]) => {
  const newArr = [...array]
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[newArr[i], newArr[j]] = [newArr[j], newArr[i]]
  }
  return newArr
}

const getDifficultyBadge = (attempts?: QuestionAttempt[]) => {
  if (!attempts || attempts.length === 0)
    return { label: '新题', style: 'bg-gray-100 text-gray-500 border-gray-200' }

  const correctCount = attempts.filter(a => a.isCorrect).length
  const accuracy = correctCount / attempts.length

  if (accuracy <= 0.3)
    return { label: '地狱难度', style: 'bg-red-50 text-red-600 border-red-200' }
  if (accuracy <= 0.6)
    return {
      label: '极具挑战',
      style: 'bg-orange-50 text-orange-600 border-orange-200',
    }
  if (accuracy <= 0.8)
    return {
      label: '难度适中',
      style: 'bg-blue-50 text-blue-600 border-blue-200',
    }
  return {
    label: '轻松拿捏',
    style: 'bg-green-50 text-green-600 border-green-200',
  }
}

const getTypeLabel = (type: string) => {
  switch (type) {
    case 'PRONUNCIATION':
      return {
        label: '读音题',
        style: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      }
    case 'FILL_BLANK':
      return {
        label: '填空题',
        style: 'bg-indigo-50 text-indigo-600 border-indigo-200',
      }
    case 'SORTING':
      return {
        label: '排序题',
        style: 'bg-orange-50 text-orange-600 border-orange-200',
      }
    case 'READING_COMPREHENSION':
      return {
        label: '阅读题',
        style: 'bg-purple-50 text-purple-600 border-purple-200',
      }
    default:
      return {
        label: '普通题',
        style: 'bg-gray-50 text-gray-500 border-gray-200',
      }
  }
}

const HighlightedContext = ({
  prompt,
  contextSentence,
}: {
  prompt: string
  contextSentence: string
}) => {
  if (!prompt || prompt === contextSentence)
    return <span>{contextSentence}</span>
  const blankRegex =
    /([（(][\s　]*[）)]|__{2,}|～|[＿_★＊][＿_★＊\s　]+[＿_★＊]|[★＊])/
  const parts = prompt.split(blankRegex)
  if (parts.length >= 3) {
    const prefix = parts[0]
    const suffix = parts[parts.length - 1]
    let insertedText = contextSentence
    if (prefix && insertedText.startsWith(prefix))
      insertedText = insertedText.slice(prefix.length)
    if (suffix && insertedText.endsWith(suffix))
      insertedText = insertedText.slice(
        0,
        insertedText.length - suffix.length,
      )
    return (
      <span>
        {prefix}
        <span className='border-b-[3px] border-indigo-500 text-indigo-700 font-bold mx-1 px-1 pb-0.5 relative'>
          {insertedText || '???'}
        </span>
        {suffix}
      </span>
    )
  }
  return <span>{contextSentence}</span>
}

const SortingBoard = ({
  question,
  userAnswerId,
  onAnswerSelected,
  isGraded,
}: {
  question: QuizQuestion
  userAnswerId?: string | null
  onAnswerSelected: (optionId: string | null) => void
  isGraded: boolean
}) => {
  const [slots, setSlots] = useState<(QuestionOption | null)[]>([])
  const [pool, setPool] = useState<QuestionOption[]>([])

  const segments = useMemo(
    () => (question.prompt || question.contextSentence).split(/([＿_]{2,}|[★＊])/),
    [question.contextSentence, question.prompt],
  )
  const slotCount = useMemo(
    () => segments.filter(segment => SLOT_REGEX.test(segment)).length,
    [segments],
  )
  const starIndex = useMemo(() => {
    let sIdx = 0,
      target = -1
    segments.forEach(seg => {
      if (SLOT_REGEX.test(seg)) {
        if (/[★＊]/.test(seg)) target = sIdx
        sIdx++
      }
    })
    return target
  }, [segments])

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
    setPool(
      question.options.filter(option => option.id !== selectedOption?.id),
    )
  }, [question.options, slotCount, starIndex, userAnswerId])

  useEffect(() => {
    if (isGraded) return
    if (slots.every(s => s !== null) && starIndex !== -1 && slots[starIndex])
      onAnswerSelected(slots[starIndex].id)
    else onAnswerSelected(null)
  }, [isGraded, onAnswerSelected, slots, starIndex])

  const moveToSlot = (opt: QuestionOption) => {
    if (isGraded) return
    const emptyIdx = slots.findIndex(s => s === null)
    if (emptyIdx === -1) return
    const newSlots = [...slots]
    newSlots[emptyIdx] = opt
    setSlots(newSlots)
    setPool(prev => prev.filter(o => o.id !== opt.id))
  }

  const moveToPool = (opt: QuestionOption, index: number) => {
    if (isGraded) return
    const newSlots = [...slots]
    newSlots[index] = null
    setSlots(newSlots)
    setPool(prev => [...prev, opt])
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, opt: QuestionOption) => {
    if (isGraded) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('optObj', JSON.stringify(opt))
  }

  const handleDropToSlot = (
    e: React.DragEvent<HTMLDivElement>,
    slotIndex: number,
  ) => {
    if (isGraded || slots[slotIndex] !== null) return
    const raw = e.dataTransfer.getData('optObj')
    if (!raw) return
    const opt = JSON.parse(raw) as QuestionOption
    if (!opt?.id) return
    setPool(prev => prev.filter(o => o.id !== opt.id))
    setSlots(prev => {
      const next = prev.map(s => (s?.id === opt.id ? null : s))
      next[slotIndex] = opt
      return next
    })
  }

  return (
    <div className='my-6'>
      <div className='text-lg md:text-xl text-gray-800 font-medium leading-12 mb-8 p-6 bg-orange-50/50 rounded-3xl border border-orange-100'>
        {(() => {
          let currentSlot = 0
          return segments.map((seg: string, i: number) => {
            if (SLOT_REGEX.test(seg)) {
              const idx = currentSlot++
              const isStar = idx === starIndex
              const filledOpt = slots[idx]
              const isCorrectStar = isGraded && isStar && filledOpt?.isCorrect
              const isWrongStar = isGraded && isStar && !filledOpt?.isCorrect

              return (
                <div
                  key={i}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleDropToSlot(e, idx)}
                  onClick={() => filledOpt && moveToPool(filledOpt, idx)}
                  className={`inline-flex items-center justify-center min-w-20 h-12 mx-1 px-3 align-middle rounded-xl border-b-4 transition-all duration-300 cursor-pointer shadow-sm relative
                    ${filledOpt ? 'bg-white border-orange-400 -translate-y-1 shadow-md' : 'bg-gray-100/50 border-gray-300 border-dashed'}
                    ${isCorrectStar ? 'bg-green-100 border-green-500 text-green-800' : ''}
                    ${isWrongStar ? 'bg-red-100 border-red-500 text-red-800' : ''}
                    ${isGraded ? 'cursor-default' : 'hover:border-orange-500'}
                  `}>
                  {isStar && !filledOpt && (
                    <span className='text-orange-400 text-sm absolute -top-5'>
                      ★
                    </span>
                  )}
                  {filledOpt && (
                    <span className='text-base font-bold whitespace-nowrap text-gray-800'>
                      {filledOpt.text}
                    </span>
                  )}
                </div>
              )
            }
            return (
              <span key={i} className='align-middle'>
                {seg}
              </span>
            )
          })
        })()}
      </div>

      <div className='bg-gray-50 p-6 rounded-2xl border border-gray-200 min-h-24'>
        {!isGraded && (
          <div className='text-xs font-bold text-gray-400 mb-5 text-center'>
            👇 点击或拖拽选项填入上方空缺处
          </div>
        )}
        <div className='flex flex-wrap gap-3 justify-center'>
          {pool.map(opt => (
            <div
              key={opt.id}
              draggable={!isGraded}
              onDragStart={e => handleDragStart(e, opt)}
              onClick={() => moveToSlot(opt)}
              className={`px-6 py-3 bg-white rounded-xl shadow-sm border-2 border-orange-100 text-orange-700 font-bold transition-all select-none
                ${isGraded ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-orange-400 hover:shadow-md hover:-translate-y-1 active:scale-95'}
              `}>
              {opt.text}
            </div>
          ))}
          {pool.length === 0 && (
            <div className='text-sm text-gray-400 my-3 font-bold'>
              ✅ 选项已全部填入
            </div>
          )}
        </div>
      </div>

      {isGraded && (
        <div className='mt-6 p-6 md:p-8 bg-indigo-50/50 rounded-3xl border border-indigo-100 animate-in slide-in-from-top-4'>
          <div className='text-sm font-black text-indigo-400 mb-4 flex items-center gap-2'>
            💡 正确完整语境
          </div>
          <div className='text-xl md:text-2xl text-indigo-900 font-medium leading-relaxed'>
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

// ==========================================
// 🚀 主引擎：QuizEngineUI
// ==========================================
export default function QuizEngineUI({
  quiz,
  backUrl = '/quizzes',
  onFinish,
  onAnswerChange,
  isArticleMode = false,
  onGradedChange,
  vocabularyMetaMapByQuestion = {},
}: {
  quiz: QuizData
  backUrl?: string
  onFinish?: () => void
  onAnswerChange?: (answers: Record<string, string | null>) => void
  isArticleMode?: boolean
  onGradedChange?: (gradedMap: Record<string, boolean>) => void
  vocabularyMetaMapByQuestion?: Record<string, Record<string, VocabularyMeta>>
}) {
  const searchParams = useSearchParams()
  const rawMode = searchParams.get('mode')
  const mode: QuizMode =
    rawMode === 'scroll' || rawMode === 'random' || rawMode === 'sequential'
      ? rawMode
      : 'sequential'
  const isScrollMode = mode === 'scroll'

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string | null>>({})
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
  const [localVocabularyMetaMapByQuestion, setLocalVocabularyMetaMapByQuestion] =
    useState(vocabularyMetaMapByQuestion)
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()

  const splitListInput = (value: string) =>
    Array.from(
      new Set(
        value
          .split(/[\n,，；;]+/)
          .map(item => item.trim())
          .filter(Boolean),
      ),
    )

  useEffect(() => {
    // 🌟 修复 2：严格按照数据库保存的 order 字段进行初始排序！
    const sortedQs = [...quiz.questions].sort((a, b) => (a.order || 0) - (b.order || 0))

    // 只打乱选项，不打乱题目顺序
    let initialQs = sortedQs.map(q => ({
      ...q,
      options: shuffleArray(q.options),
    }))

    // 如果用户明确选择了“随机模式”，才打乱整个题目
    if (mode === 'random') initialQs = shuffleArray(initialQs)

    setQuestions(initialQs)
    const now = Date.now()
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
    e: React.MouseEvent | React.TouchEvent,
    questionId: string,
    contextSentence: string,
  ) => {
    const target = e.target as HTMLElement

    // ❗如果点击的是不允许选中的区域，直接退出
    if (target.closest('.no-select')) {
      return
    }
    setTimeout(() => {
      const selection = window.getSelection()
      const text = selection?.toString().trim()
      if (text && text.length > 0 && text.length < 25) {
        const range = selection!.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        let y = rect.top - 10
        let isTop = true
        if (window.innerWidth < 768 || rect.top < 60) {
          y = rect.bottom + 10
          isTop = false
        }
        setActiveTooltip({
          word: text,
          x,
          y,
          isTop,
          questionId,
          contextSentence,
        })
        const existing =
          localVocabularyMetaMapByQuestion[questionId]?.[text] || null
        const inferredPos = inferContextualPos(
          text,
          contextSentence,
          existing?.partsOfSpeech || [],
        )
        setTooltipPronunciation((existing?.pronunciations || []).join('\n'))
        setTooltipPartOfSpeech(inferredPos.join('\n'))
        setTooltipMeaning((existing?.meanings || []).join('\n'))
        setSaveWithPronunciation(true)
        setSaveWithMeaning(true)
        setSaveState('idle')
      } else if (!text) setActiveTooltip(null)
    }, 50)
  }

  const handleSaveWord = async (word: string) => {
    if (!activeTooltip) return
    setSaveState('saving')
    const existingMeta =
      localVocabularyMetaMapByQuestion[activeTooltip.questionId]?.[word] || {
        pronunciations: [],
        partsOfSpeech: [],
        meanings: [],
      }
    const pronunciationList = splitListInput(tooltipPronunciation)
    const partOfSpeechList = splitListInput(tooltipPartOfSpeech)
    const meaningList = splitListInput(tooltipMeaning)
    const firstPron = pronunciationList[0]
    const res = await saveVocabulary(
      word,
      activeTooltip.contextSentence,
      'QUIZ_QUESTION',
      activeTooltip.questionId,
      saveWithPronunciation ? firstPron : undefined,
      saveWithPronunciation ? pronunciationList : [],
      saveWithMeaning ? meaningList : [],
      partOfSpeechList[0],
      partOfSpeechList,
    )
    if (res.success) {
      setLocalVocabularyMetaMapByQuestion(prev => ({
        ...prev,
        [activeTooltip.questionId]: {
          ...(prev[activeTooltip.questionId] || {}),
          [word]: {
            pronunciations: saveWithPronunciation ? pronunciationList : [],
            partsOfSpeech:
              partOfSpeechList.length > 0
                ? partOfSpeechList
                : existingMeta.partsOfSpeech,
            meanings: saveWithMeaning ? meaningList : [],
          },
        },
      }))
      setSaveState('success')
      setTimeout(() => setActiveTooltip(null), 1500)
      return
    }
    if (res.state === 'already_exists') {
      setLocalVocabularyMetaMapByQuestion(prev => ({
        ...prev,
        [activeTooltip.questionId]: {
          ...(prev[activeTooltip.questionId] || {}),
          [word]: {
            pronunciations: saveWithPronunciation ? pronunciationList : [],
            partsOfSpeech:
              partOfSpeechList.length > 0
                ? partOfSpeechList
                : existingMeta.partsOfSpeech,
            meanings: saveWithMeaning ? meaningList : [],
          },
        },
      }))
      setSaveState('already_exists')
      setTimeout(() => setActiveTooltip(null), 1500)
      return
    }
    setSaveState('error')
  }

  const handleSelectOption = (questionId: string, optionId: string | null) => {
    if (isGraded[questionId]) return
    setAnswers(prev => {
      const newAnswers = { ...prev, [questionId]: optionId }
      if (onAnswerChange) onAnswerChange(newAnswers)
      return newAnswers
    })
  }

  const moveQuestionIndex = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= questions.length) return
    setCurrentIndex(nextIndex)
    setCurrentQuestionStartTime(Date.now())
    window.getSelection()?.removeAllRanges()
  }

  const recordCurrentQuestionTime = () => {
    const q = questions[currentIndex]
    if (!q) return
    const elapsed = Date.now() - currentQuestionStartTime
    if (elapsed <= 0) return
    setTimeLogs(prev => ({
      ...prev,
      [q.id]: (prev[q.id] || 0) + elapsed,
    }))
  }

  const handleGradeSingle = () => {
    const q = questions[currentIndex]
    if (!q) return
    setTimeLogs(prev => ({
      ...prev,
      [q.id]: Date.now() - currentQuestionStartTime,
    }))
    setIsGraded(prev => {
      const newState = { ...prev, [q.id]: true }
      if (onGradedChange) onGradedChange(newState)
      return newState
    })
  }

  const handlePrev = () => {
    if (currentIndex <= 0) return
    if (isArticleMode && !isFinished) recordCurrentQuestionTime()
    moveQuestionIndex(currentIndex - 1)
  }

  const handleNext = () => {
    if (isArticleMode) {
      if (!isFinished) recordCurrentQuestionTime()
      if (currentIndex < questions.length - 1) {
        moveQuestionIndex(currentIndex + 1)
      } else if (!isFinished) {
        finishQuiz()
      }
      return
    }

    if (currentIndex < questions.length - 1) {
      moveQuestionIndex(currentIndex + 1)
    } else finishQuiz()
  }

  const finishQuiz = async () => {
    if (questions.length === 0) return
    setIsFinished(true)
    if (onFinish) onFinish()
    const finalLogs = { ...timeLogs }
    if (isArticleMode) {
      const q = questions[currentIndex]
      if (q) {
        const elapsed = Date.now() - currentQuestionStartTime
        if (elapsed > 0) finalLogs[q.id] = (finalLogs[q.id] || 0) + elapsed
      }
      setTimeLogs(finalLogs)
    }
    const totalMs = Date.now() - globalStartTime
    setTotalTimeSpent(totalMs)

    const finalGradedState = { ...isGraded }
    if (isScrollMode) {
      const avgTime = Math.floor(totalMs / questions.length)
      questions.forEach(q => {
        finalLogs[q.id] = avgTime
        finalGradedState[q.id] = true
      })
    } else questions.forEach(q => (finalGradedState[q.id] = true))
    setIsGraded(finalGradedState)
    if (onGradedChange) onGradedChange(finalGradedState)

    let correctCount = 0
    const payload = questions.map(q => {
      const isCorrect =
        q.options.find(o => o.id === answers[q.id])?.isCorrect || false
      if (isCorrect) correctCount++
      return { questionId: q.id, isCorrect, timeSpentMs: finalLogs[q.id] || 0 }
    })
    setScore(correctCount)
    await submitQuizAttempts(payload)
  }

  const handleSaveExplanation = async (questionId: string) => {
    setIsSavingExp(true)
    const res = await updateQuestionExplanation(questionId, expDraft)
    if (res.success) {
      setQuestions(prev =>
        prev.map(q =>
          q.id === questionId ? { ...q, explanation: expDraft } : q,
        ),
      )
      setEditingExpId(null)
    }
    setIsSavingExp(false)
  }

  if (questions.length === 0)
    return <div className='p-12 text-center text-gray-500'>加载题库中...</div>

  // 结算页面
  if (isFinished && !isScrollMode && !isArticleMode) {
    const accuracy = Math.round((score / questions.length) * 100)
    const avgSec = (totalTimeSpent / questions.length / 1000).toFixed(1)
    let title = '稳扎稳打 🐢'
    if (accuracy >= 80 && parseFloat(avgSec) <= 15) title = '闪电神算 ⚡'
    else if (accuracy >= 80) title = '学霸附体 🎓'
    else if (parseFloat(avgSec) <= 10) title = '蒙题大师 🎲'

    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center p-6'>
        <div className='bg-white p-8 md:p-12 rounded-3xl shadow-sm max-w-lg w-full'>
          <div className='text-center mb-10'>
            <span className='inline-block px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-600 font-bold text-sm mb-4 border border-indigo-100'>
              {title}
            </span>
            <h2 className='text-3xl font-black text-gray-900'>测验完成</h2>
          </div>
          <div className='grid grid-cols-2 gap-4 mb-10'>
            <div className='bg-blue-50 p-6 rounded-2xl border border-blue-100 text-center'>
              <div className='text-xs font-bold text-blue-500 mb-2'>正确率</div>
              <div className='text-4xl font-black text-blue-700'>
                {accuracy}
                <span className='text-xl'>%</span>
              </div>
            </div>
            <div className='bg-orange-50 p-6 rounded-2xl border border-orange-100 text-center'>
              <div className='text-xs font-bold text-orange-500 mb-2'>
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
            className='bg-gray-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-gray-800 transition-colors block text-center shadow-xl shadow-gray-200'>
            {backUrl === '/articles' ? '返回阅读' : '返回题库'}
          </Link>
        </div>
      </div>
    )
  }

  const visibleQuestions = isScrollMode ? questions : [questions[currentIndex]]

  return (
    <div
      className='min-h-screen bg-gray-50 p-6 md:p-12 relative pb-32'
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

      <div className='max-w-3xl mx-auto'>
        {isArticleMode ? null : (
          <div className='flex justify-between items-center mb-6 sticky top-4 z-10 bg-gray-50/90 backdrop-blur-md py-3 px-2 rounded-2xl'>
            <Link
              href={backUrl}
              className='text-gray-400 hover:text-gray-600 font-bold text-sm'>
              &larr; 退出测验
            </Link>
            <div className='flex items-center gap-3'>
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
              <span className='text-xs font-bold text-gray-400 bg-white px-3 py-1.5 rounded-full shadow-sm'>
                {mode === 'scroll'
                  ? '📜 全卷展示'
                  : mode === 'random'
                    ? '🔀 随机乱序'
                    : '🎯 逐题通关'}
              </span>
              {!isScrollMode && (
                <span className='text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full'>
                  {currentIndex + 1} / {questions.length}
                </span>
              )}
            </div>
          </div>
        )}

        <div className='space-y-8'>
          {visibleQuestions.map((q, idx) => {
            const graded = isGraded[q.id]
            const userAnswerId = answers[q.id]
            const difficulty = getDifficultyBadge(q.attempts)
            const realIndex = isScrollMode ? idx + 1 : currentIndex + 1
            const typeConfig = getTypeLabel(q.questionType) // 获取题型样式

            return (
              <div
                key={q.id}
                onMouseUp={e => handleTextSelection(e, q.id, q.contextSentence)}
                onTouchEnd={e =>
                  handleTextSelection(e, q.id, q.contextSentence)
                }
                className='bg-white p-6 md:p-10 rounded-4xl shadow-sm border border-gray-100 select-text'>
                {(() => {
                  const entries = Object.entries(
                    localVocabularyMetaMapByQuestion[q.id] || {},
                  )
                    .filter(([word, meta]) => {
                      if (!q.contextSentence.includes(word)) return false
                      if (showMeaning && meta.meanings.length > 0) return true
                      if (showMeaning && showPronunciation && meta.pronunciations.length > 0)
                        return true
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
                  return (
                    entries.length > 0 ? (
                      <WordMetaPanel
                        className='mb-4'
                        entries={entries}
                        showPronunciation={showPronunciation}
                        showMeaning={showMeaning}
                        contextSentence={q.contextSentence}
                      />
                    ) : null
                  )
                })()}
                {/* 🌟 1. 顶部题号与徽章 (完美复刻设计图) */}
                <div className='flex justify-between items-center mb-6'>
                  <div className='flex items-center gap-3'>
                    <span className='bg-gray-900 text-white px-3 py-1 rounded-lg font-black text-sm'>
                      Q{realIndex}
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${typeConfig.style}`}>
                      {typeConfig.label}
                    </span>
                  </div>

                  <div className='flex items-center gap-2'>
                    {graded && timeLogs[q.id] && (
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-md ${timeLogs[q.id] > 30000 ? 'bg-orange-50 text-orange-500' : 'bg-green-50 text-green-500'}`}>
                        {(timeLogs[q.id] / 1000).toFixed(1)}s
                      </span>
                    )}
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-md border ${difficulty.style}`}>
                      {difficulty.label}
                    </span>
                  </div>
                </div>

                {/* 🌟 2. 核心题干区 */}
                {q.questionType === 'SORTING' ? (
                  <SortingBoard
                    question={q}
                    userAnswerId={userAnswerId}
                    onAnswerSelected={(optId: string | null) =>
                      handleSelectOption(q.id, optId)
                    }
                    isGraded={graded}
                  />
                ) : (
                  <>
                    {q.questionType === 'FILL_BLANK' && isArticleMode ? null : (
                      <div className='mb-8'>
                        <div className='text-2xl md:text-3xl text-gray-900 font-black leading-snug mb-3 tracking-wide'>
                          {graded &&
                          q.prompt ? (
                            <HighlightedContext
                              prompt={q.prompt}
                              contextSentence={q.contextSentence}
                            />
                          ) : (
                            q.prompt || q.contextSentence
                          )}
                        </div>
                        {/* 补充语境展示 (当 Prompt 与语境不同时展示，贴合你的设计图) */}
                        {q.contextSentence &&
                          q.prompt !== q.contextSentence && (
                            <div className='text-base md:text-lg font-bold text-gray-400 mt-2'>
                              {q.contextSentence}
                            </div>
                          )}
                      </div>
                    )}

                    {/* 🌟 3. 选项渲染区域 (使用字母 A, B, C) */}
                    <div className='space-y-4 mb-8'>
                      {q.options.map((opt, index: number) => {
                        const isSelected = userAnswerId === opt.id
                        let optionStyle =
                          'border-gray-100 bg-gray-50/50 hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer'

                        if (graded) {
                          if (opt.isCorrect)
                            optionStyle =
                              'border-green-500 bg-green-50 ring-2 ring-green-500/20 cursor-default shadow-sm'
                          else if (isSelected && !opt.isCorrect)
                            optionStyle =
                              'border-red-500 bg-red-50 cursor-default'
                          else
                            optionStyle =
                              'border-gray-100 bg-gray-50/30 opacity-50 cursor-default'
                        } else if (isSelected) {
                          optionStyle =
                            'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20 cursor-pointer shadow-sm'
                        }

                        return (
                          <button
                            key={opt.id}
                            disabled={graded}
                            onClick={() => handleSelectOption(q.id, opt.id)}
                            className={`w-full text-left px-5 py-4 rounded-2xl border-2 transition-all duration-200 ${optionStyle}`}>
                            <div className='flex items-center'>
                              <span
                                className={`font-black mr-4 text-xl ${isSelected || (graded && opt.isCorrect) ? (opt.isCorrect && graded ? 'text-green-600' : graded && !opt.isCorrect ? 'text-red-600' : 'text-indigo-600') : 'text-gray-400'}`}>
                                {String.fromCharCode(65 + index)}.
                              </span>
                              <span
                                className={`text-lg font-bold ${isSelected || (graded && opt.isCorrect) ? (opt.isCorrect && graded ? 'text-green-800' : graded && !opt.isCorrect ? 'text-red-800' : 'text-indigo-900') : 'text-gray-700'}`}>
                                {opt.text}
                              </span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* 4. 笔记系统 (保持原样) */}
                {graded && (
                  <div className='mb-6'>
                    {q.explanation || editingExpId === q.id ? (
                      <div className='p-5 bg-blue-50/50 rounded-2xl border border-blue-100 animate-in slide-in-from-top-4 duration-500'>
                        <div className='flex justify-between items-center mb-3'>
                          <h4 className='text-sm font-black text-blue-800 flex items-center gap-2'>
                            💡 题目解析 / 笔记
                          </h4>
                          {editingExpId !== q.id && (
                            <button
                              onClick={() => {
                                setEditingExpId(q.id)
                                setExpDraft(q.explanation || '')
                              }}
                              className='text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-100/50 px-2.5 py-1 rounded-md transition-colors'>
                              ✏️ 编辑
                            </button>
                          )}
                        </div>
                        {editingExpId === q.id ? (
                          <div
                            onMouseUp={e => e.stopPropagation()}
                            onTouchEnd={e => e.stopPropagation()}>
                            <textarea
                              value={expDraft}
                              onChange={e => setExpDraft(e.target.value)}
                              className='w-full p-4 rounded-xl border border-blue-200 outline-none focus:ring-2 focus:ring-blue-400 text-sm md:text-base bg-white/80 transition-all resize-y'
                              rows={4}
                              placeholder='查完词典了？在这里记录你的错题笔记吧...'
                            />
                            <div className='flex justify-end gap-3 mt-3'>
                              <button
                                onClick={() => setEditingExpId(null)}
                                className='text-xs font-bold text-gray-500 hover:text-gray-700 px-3 py-2'>
                                取消
                              </button>
                              <button
                                onClick={() => handleSaveExplanation(q.id)}
                                disabled={isSavingExp}
                                className='text-sm font-bold bg-blue-600 text-white px-5 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md shadow-blue-200'>
                                {isSavingExp ? '保存中...' : '保存笔记'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className='text-blue-900 leading-relaxed text-sm md:text-base whitespace-pre-wrap'>
                            {q.explanation}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingExpId(q.id)
                          setExpDraft('')
                        }}
                        className='text-sm font-bold text-blue-500 hover:text-blue-700 flex items-center gap-1.5 px-3 py-2 bg-blue-50/50 rounded-xl transition-colors'>
                        ➕ 添加错题笔记
                      </button>
                    )}
                  </div>
                )}

                {/* 5. 底部跳转按钮 */}
                {!isScrollMode && (
                  <div>
                    {isArticleMode ? (
                      <div className='flex gap-3'>
                        <button
                          onClick={handlePrev}
                          disabled={currentIndex === 0}
                          className='flex-1 font-black py-4 rounded-2xl transition-all bg-white border border-gray-200 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50'>
                          上一题
                        </button>
                        {!isFinished ? (
                          <button
                            onClick={handleNext}
                            className='flex-1 font-black py-4 rounded-2xl transition-all shadow-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'>
                            {currentIndex === questions.length - 1
                              ? '提交答案'
                              : '下一题'}
                          </button>
                        ) : (
                          <button
                            disabled
                            className='flex-1 font-black py-4 rounded-2xl transition-all bg-green-50 text-green-700 border border-green-200 cursor-default'>
                            已提交
                          </button>
                        )}
                      </div>
                    ) : !graded ? (
                      <div className='flex gap-3'>
                        <button
                          onClick={handleGradeSingle}
                          className={`flex-1 font-black py-4 rounded-2xl transition-all shadow-lg ${userAnswerId ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 shadow-none'}`}>
                          {userAnswerId ? '确认答案' : '不会，直接跳过'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleNext}
                        className='w-full bg-gray-900 text-white font-black py-4 rounded-2xl hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200'>
                        {currentIndex === questions.length - 1
                          ? '查看结算'
                          : '下一题'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {isScrollMode && (
            <div className='mt-10'>
              {!isFinished ? (
                <button
                  onClick={finishQuiz}
                  className='w-full bg-indigo-600 text-white font-black py-5 rounded-3xl text-lg hover:bg-indigo-700 shadow-xl shadow-indigo-200'>
                  📤 提交全卷
                </button>
              ) : (
                <div className='bg-green-50 border border-green-200 p-8 rounded-3xl text-center'>
                  <div className='text-4xl mb-4'>🎉</div>
                  <h3 className='text-2xl font-black text-green-800 mb-2'>
                    交卷成功！
                  </h3>
                  <Link
                    href={backUrl}
                    className='inline-block bg-green-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-green-700 transition-colors'>
                    {backUrl === '/articles' ? '返回阅读' : '返回题库'}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
