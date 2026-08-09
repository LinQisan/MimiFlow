'use client'

import { useRef, useState } from 'react'

type ArticleQuestion = {
  id: string
  questionType: string
  prompt: string | null
  contextSentence: string | null
  analysis: string | null
  attemptCount: number
  options: Array<{
    id: string
    text: string
  }>
}

type SubmissionResult = {
  selectedId: string
  isCorrect: boolean
  correctOptionId: string | null
}

const optionLabel = (index: number) => String.fromCharCode(65 + index)

export default function ArticleQuestionsPanel({
  questions,
}: {
  questions: ArticleQuestion[]
}) {
  const openedAtRef = useRef(Date.now())
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, SubmissionResult>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  if (questions.length === 0) {
    return null
  }

  const submitQuestion = async (question: ArticleQuestion) => {
    const selectedId = answers[question.id]
    if (!selectedId || results[question.id]) return
    if (!question.options.some(option => option.id === selectedId)) return

    setSavingId(question.id)
    setError('')
    try {
      const response = await fetch('/api/quiz-attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attempts: [
            {
              questionId: question.id,
              selectedOptionId: selectedId,
              timeSpentMs: Math.max(0, Date.now() - openedAtRef.current),
            },
          ],
        }),
      })
      const payload = (await response.json()) as {
        success?: boolean
        message?: string
        results?: Array<{
          questionId: string
          isCorrect: boolean
          correctOptionId: string | null
        }>
      }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || '作答保存失败')
      }
      const result = payload.results?.find(item => item.questionId === question.id)
      if (!result) throw new Error('未收到作答结果')
      setResults(prev => ({
        ...prev,
        [question.id]: {
          selectedId,
          isCorrect: result.isCorrect,
          correctOptionId: result.correctOptionId,
        },
      }))
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : '作答保存失败',
      )
    } finally {
      setSavingId(null)
    }
  }

  return (
    <section className='border-t border-slate-200 pt-8'>
      <div className='border-b border-slate-100 pb-4'>
        <h2 className='text-lg font-black text-slate-900'>理解练习</h2>
      </div>

      <div className='mt-5 space-y-5'>
        {questions.map((question, index) => {
          const selectedId = answers[question.id]
          const result = results[question.id]
          return (
            <article
              key={question.id}
              className='border-b border-slate-200 py-6 md:py-8'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <h3 className='text-sm font-bold text-slate-900'>
                  第 {index + 1} 题
                </h3>
                <div className='flex items-center gap-2'>
                  {question.attemptCount > 0 ? (
                    <span className='text-[11px] font-semibold text-slate-500'>
                      已作答 {question.attemptCount} 次
                    </span>
                  ) : null}
                  <span className='rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600'>
                    {question.questionType}
                  </span>
                </div>
              </div>

              {question.prompt ? (
                <p className='mt-3 text-sm leading-7 text-slate-800'>
                  {question.prompt}
                </p>
              ) : null}
              {question.contextSentence ? (
                <p className='mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-500'>
                  语境：{question.contextSentence}
                </p>
              ) : null}

              <div className='mt-4 grid gap-2'>
                {question.options.map((option, optionIndex) => {
                  const isSelected = selectedId === option.id
                  const showCorrect =
                    Boolean(result) && result.correctOptionId === option.id
                  const showWrong =
                    Boolean(result) &&
                    result.selectedId === option.id &&
                    result.correctOptionId !== option.id
                  return (
                    <button
                      key={option.id}
                      type='button'
                      disabled={Boolean(result)}
                      onClick={() =>
                        setAnswers(prev => ({
                          ...prev,
                          [question.id]: option.id,
                        }))
                      }
                      className={`flex items-start rounded-lg border px-3 py-3 text-left text-sm transition ${
                        showCorrect
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : showWrong
                            ? 'border-rose-300 bg-rose-50 text-rose-900'
                            : isSelected
                              ? 'border-slate-900 bg-white text-slate-900 ring-1 ring-slate-300'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}>
                      <span className='mr-3 font-semibold text-slate-400'>
                        {optionLabel(optionIndex)}.
                      </span>
                      <span className='leading-6'>{option.text}</span>
                    </button>
                  )
                })}
              </div>

              <div className='mt-4 flex flex-wrap items-center gap-3'>
                <button
                  type='button'
                  disabled={!selectedId || Boolean(result) || savingId === question.id}
                  onClick={() => void submitQuestion(question)}
                  className='ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-45'>
                  {savingId === question.id ? '保存中…' : '提交答案'}
                </button>
                {result ? (
                  <p
                    className={`text-sm font-semibold ${
                      result.isCorrect ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                    {result.isCorrect ? '回答正确' : '回答错误，已加入错题回顾'}
                  </p>
                ) : null}
              </div>

              {result && question.analysis ? (
                <div className='mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3'>
                  <p className='text-xs font-bold text-slate-500'>解析</p>
                  <p className='mt-1 text-sm leading-6 text-slate-700'>
                    {question.analysis}
                  </p>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      {error ? (
        <p className='mt-4 text-sm font-semibold text-rose-700'>{error}</p>
      ) : null}
    </section>
  )
}
