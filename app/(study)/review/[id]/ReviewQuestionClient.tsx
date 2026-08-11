'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { RetryQueueItem } from '@/modules/review/actions/mistakes'
import {
  resetRetryQuestionAccuracy,
  submitRetryAnswer,
} from '@/modules/review/actions/mistakes'
import { QuestionRenderer } from '@/components/exam/QuestionRenderer'
import CustomSelect from '@/components/ui/CustomSelect'
import WordTooltip from '@/components/exam/WordTooltip'
import ToggleSwitch from '@/components/ToggleSwitch'
import type { ExamQuestion } from '@/components/exam/question-renderer/types'
import {
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import { useTextSelection } from '@/hooks/useTextSelection'
import { formatTokyoDateTime } from '@/utils/time/format'
import { getQuestionTypeLabel } from '@/utils/questions/typeLabels'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

type Summary = {
  dueCount: number
  totalCount: number
  nextDueAt: Date | string | null
}

type QueueItem = {
  retryId: string
}

type QuestionTypeSummary = {
  questionType: string
  count: number
  firstRetryId: string
}

const formatPercent = (value: number) => `${Math.round(value * 100)}%`

function mapRetryItemToExamQuestion(item: RetryQueueItem): ExamQuestion {
  return {
    id: item.questionId,
    order: item.questionOrder,
    questionType: item.questionType,
    prompt: item.prompt,
    contextSentence: item.contextSentence,
    targetWord: item.targetWord,
    options: item.options,
    passageId: item.passageId,
    passage: item.passage,
    lessonId: item.lessonId,
    lesson: item.lesson,
  }
}

export default function ReviewQuestionClient({
  initialSummary,
  currentItem,
  queue,
  currentIndex,
  activeQuestionType,
  questionTypes,
}: {
  initialSummary: Summary
  currentItem: RetryQueueItem
  queue: QueueItem[]
  currentIndex: number
  activeQuestionType: string | null
  questionTypes: QuestionTypeSummary[]
}) {
  const router = useRouter()
  const [item, setItem] = useState(currentItem)
  const [summary, setSummary] = useState(initialSummary)
  const [selectedOptionId, setSelectedOptionId] = useState<string>('')
  const [feedback, setFeedback] = useState<string>('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  )
  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()
  const [localPronunciationMap, setLocalPronunciationMap] = useState<
    Record<string, string>
  >({})
  const [localVocabularyMetaMap, setLocalVocabularyMetaMap] = useState<
    Record<string, VocabularyMeta>
  >({})
  const { selection, closeSelection } = useTextSelection()

  const prevRetryId = currentIndex > 0 ? queue[currentIndex - 1]?.retryId : null
  const nextRetryId =
    currentIndex < queue.length - 1 ? queue[currentIndex + 1]?.retryId : null
  const activeTypeQuery = activeQuestionType
    ? `?type=${encodeURIComponent(activeQuestionType)}`
    : ''
  const examQuestion = useMemo(() => mapRetryItemToExamQuestion(item), [item])
  const reviewAnswerMap = useMemo(
    () => (selectedOptionId ? { [examQuestion.id]: selectedOptionId } : {}),
    [examQuestion.id, selectedOptionId],
  )
  const reviewPassageQuestions = useMemo(
    () =>
      examQuestion.passageId && examQuestion.questionType === 'FILL_BLANK'
        ? [examQuestion]
        : [],
    [examQuestion],
  )

  useEffect(() => {
    setSummary(initialSummary)
  }, [initialSummary])

  useEffect(() => {
    // Revalidation can refresh props for the same retry item after submission.
    // Preserve the submitted result unless navigation actually changes the item.
    if (item.retryId === currentItem.retryId) return
    setItem(currentItem)
    setSelectedOptionId('')
    setFeedback('')
    setIsSubmitted(false)
    setResettingId(null)
  }, [currentItem, item.retryId])

  const handleSubmit = () => {
    if (!selectedOptionId) {
      setFeedback('请先选择一个选项。')
      return
    }
    if (isSubmitted) return

    startTransition(async () => {
      const result = await submitRetryAnswer(item.retryId, selectedOptionId)
      if (!result.success) {
        setFeedback(result.message || '提交失败。')
        return
      }

      setIsSubmitted(true)
      setSummary(prev => ({
        ...prev,
        dueCount: Math.max(0, prev.dueCount - 1),
        totalCount:
          result.done && result.isCorrect
            ? Math.max(0, prev.totalCount - 1)
            : prev.totalCount,
      }))

      const message = result.isCorrect
        ? result.done
          ? '阶段反馈：答对，已完成该错题回流。'
          : `阶段反馈：答对，已进入下一阶段（${result.nextInHours || 0}h 后）。`
        : `阶段反馈：答错，已重置阶段（${result.nextInHours || 24}h 后再试）。`
      setFeedback(message)
    })
  }

  const handleSoftReset = () => {
    if (resettingId) return

    setResettingId(item.retryId)
    startTransition(async () => {
      const result = await resetRetryQuestionAccuracy(item.questionId)
      if (!result.success) {
        setFeedback(result.message || '重置失败。')
        setResettingId(null)
        return
      }

      setItem(prev => ({
        ...prev,
        stats: result.stats ? { ...prev.stats, ...result.stats } : prev.stats,
      }))
      setFeedback(result.message || '已完成轻度重置。')
      setResettingId(null)
    })
  }

  const buildCopyPayload = (question: ExamQuestion, questionIndex: number) => {
    const sections: string[] = []
    sections.push(`第 ${questionIndex + 1} 题`)

    const context = (question.contextSentence || '').trim()
    const prompt = (question.prompt || '').trim()
    const shouldIncludePrompt = prompt && prompt !== context
    if (context) sections.push(`题目：${context}`)
    else if (prompt) sections.push(`题目：${prompt}`)
    if (shouldIncludePrompt) sections.push(`补充：${prompt}`)

    if (question.passageId) {
      const passage = (question.passage?.content || '').trim()
      if (passage) sections.push(`阅读正文：\n${passage}`)
    }

    const optionLines = (question.options || [])
      .map((option, index) => {
        const marker = String.fromCharCode(65 + index)
        const text = (option.text || '').trim()
        return text ? `${marker}. ${text}` : ''
      })
      .filter(Boolean)
    if (optionLines.length > 0) {
      sections.push(`选项：\n${optionLines.join('\n')}`)
    }

    return sections.join('\n\n').trim()
  }

  const writeClipboard = async (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    if (typeof document === 'undefined') {
      throw new Error('clipboard api unavailable')
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (!copied) throw new Error('copy fallback failed')
  }

  const handleCopyCurrentQuestion = async () => {
    const payload = buildCopyPayload(examQuestion, currentIndex)
    if (!payload) return
    try {
      await writeClipboard(payload)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
  }

  const handleQuestionTypeChange = (value: string) => {
    if (value === 'all') {
      const firstRetryId = questionTypes[0]?.firstRetryId
      if (firstRetryId) router.push(`/review/${firstRetryId}`)
      return
    }

    const selectedType = questionTypes.find(item => item.questionType === value)
    if (selectedType) {
      router.push(
        `/review/${selectedType.firstRetryId}?type=${encodeURIComponent(value)}`,
      )
    }
  }

  return (
    <main className='min-h-screen bg-slate-50 pb-24'>
      <header className='sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur'>
        <div className='mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-8'>
          <div className='min-w-0'>
            <h1 className='text-base font-black text-slate-900 md:text-lg'>
              错题回看
            </h1>
            <p className='truncate text-xs text-slate-500'>
              第 {currentIndex + 1} / {queue.length} 题，到期 {summary.dueCount} 题
            </p>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <CustomSelect
              value={activeQuestionType || 'all'}
              onChange={event => handleQuestionTypeChange(event.target.value)}
              aria-label='选择复习题型'
              className='h-8 min-w-32 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700'>
              <option value='all'>全部题型 · {summary.dueCount}</option>
              {questionTypes.map(type => (
                <option key={type.questionType} value={type.questionType}>
                  {getQuestionTypeLabel(type.questionType)} · {type.count}
                </option>
              ))}
            </CustomSelect>
            <span className='hidden rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 sm:inline-flex'>
              下一到期 {formatTokyoDateTime(summary.nextDueAt)}
            </span>
            <Link
              href='/review'
              className='ui-btn ui-btn-sm'>
              复习中心
            </Link>
          </div>
        </div>
        <div
          className='h-1 bg-slate-100'
          role='progressbar'
          aria-label={`错题复习进度 ${currentIndex + 1} / ${queue.length}`}
          aria-valuemin={1}
          aria-valuemax={queue.length}
          aria-valuenow={currentIndex + 1}>
          <div
            className='h-full bg-slate-900 transition-[width]'
            style={{ width: `${((currentIndex + 1) / queue.length) * 100}%` }}
          />
        </div>
      </header>

      <div className='mx-auto w-full max-w-7xl space-y-4 px-4 py-4 md:px-8 md:py-6'>
        <section className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4'>
          <div className='flex flex-wrap items-center gap-2 text-xs'>
            <span className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600'>
              复习阶段 {item.stage + 1} / 3
            </span>
            <span className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600'>
              历史正确率 {formatPercent(item.stats.accuracy)}
            </span>
          </div>

          <div className='flex flex-wrap gap-2'>
            <button
              type='button'
              onClick={() => void handleCopyCurrentQuestion()}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                copyState === 'copied'
                  ? 'border-slate-300 bg-slate-100 text-slate-900'
                  : copyState === 'error'
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}>
              {copyState === 'copied'
                ? '已复制'
                : copyState === 'error'
                  ? '复制失败'
                  : '复制题目'}
            </button>
            <ToggleSwitch
              label='注音'
              checked={showPronunciation}
              onChange={setShowPronunciation}
            />
            <ToggleSwitch
              label='注释'
              checked={showMeaning}
              onChange={setShowMeaning}
            />
            {item.stats.resetEligible ? (
              <button
                type='button'
                disabled={isPending || resettingId === item.retryId}
                onClick={handleSoftReset}
                className='rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40'>
                重置早期错误
              </button>
            ) : null}
          </div>

          {feedback && (
            <p
              role='status'
              className={`basis-full rounded-lg px-3 py-2 text-xs font-medium ${
                feedback.includes('失败') || feedback.includes('请先')
                  ? 'bg-rose-50 text-rose-700'
                  : 'bg-slate-100 text-slate-700'
              }`}>
              {feedback}
            </p>
          )}
        </section>

        <QuestionRenderer
          key={examQuestion.id}
          question={examQuestion}
          allQuestions={reviewPassageQuestions}
          onSelect={optionId => setSelectedOptionId(optionId)}
          currentAnswer={selectedOptionId}
          answerMap={reviewAnswerMap}
          isSubmitted={isSubmitted}
          annotation={{
            showPronunciation,
            showMeaning,
            pronunciationMap: localPronunciationMap,
            vocabularyMetaMap: localVocabularyMetaMap,
          }}
        />

        {selection.isVisible && selection.sourceType !== '' && (
          <WordTooltip
            word={selection.text}
            x={selection.x}
            y={selection.y}
            isTop={selection.isTop}
            contextSentence={selection.contextSentence}
            sourceType={selection.sourceType}
            sourceId={selection.sourceId}
            initialMeta={localVocabularyMetaMap[selection.text]}
            onSaved={({ word, meta }) => {
              setLocalVocabularyMetaMap(prev => {
                const next = { ...prev, [word]: meta }
                if (selection.text && selection.text !== word) {
                  next[selection.text] = meta
                }
                return next
              })
              if (meta.pronunciations[0]) {
                setLocalPronunciationMap(prev => {
                  const next = { ...prev, [word]: meta.pronunciations[0] }
                  if (selection.text && selection.text !== word) {
                    next[selection.text] = meta.pronunciations[0]
                  }
                  return next
                })
              }
            }}
            onClose={closeSelection}
          />
        )}
      </div>

      <footer className='fixed bottom-0 z-40 w-full border-t border-slate-200/90 bg-white/95 p-2 backdrop-blur md:p-4'>
        <div className='mx-auto grid w-full max-w-5xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2 md:gap-4 md:px-3'>
          <button
            type='button'
            disabled={!prevRetryId || isPending}
            onClick={() =>
              prevRetryId &&
              router.push(`/review/${prevRetryId}${activeTypeQuery}`)
            }
            className='rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 md:px-4 md:text-sm'>
            上一题
          </button>

          <Link
            href={item.sourceUrl}
            title={item.sourceTitle}
            className='min-w-0 truncate text-center text-[11px] font-medium text-slate-500 hover:text-slate-900 md:text-xs'>
            来源：{item.sourceTitle}
          </Link>

          {!isSubmitted ? (
            <button
              type='button'
              disabled={!selectedOptionId || isPending}
              onClick={handleSubmit}
              className='rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 md:px-4 md:text-sm'>
              {isPending ? '提交中…' : '提交复盘'}
            </button>
          ) : nextRetryId ? (
            <button
              type='button'
              disabled={isPending}
              onClick={() =>
                router.push(`/review/${nextRetryId}${activeTypeQuery}`)
              }
              className='rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40 md:px-4 md:text-sm'>
              下一题
            </button>
          ) : (
            <Link
              href='/review/mistakes'
              className='rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 md:px-4 md:text-sm'>
              返回队列
            </Link>
          )}
        </div>
      </footer>
    </main>
  )
}
