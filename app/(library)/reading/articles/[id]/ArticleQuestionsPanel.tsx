'use client'

import { useEffect, useRef, useState } from 'react'

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

const optionLabel = (index: number) => String(index + 1)

export default function ArticleQuestionsPanel({
  questions,
}: {
  questions: ArticleQuestion[]
}) {
  const openedAtRef = useRef<number | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Record<string, SubmissionResult>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    openedAtRef.current = Date.now()
  }, [])

  if (questions.length === 0) {
    return null
  }

  const submitQuestion = async (
    question: ArticleQuestion,
    submittedAt: number,
  ) => {
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
              timeSpentMs:
                openedAtRef.current === null
                  ? 0
                  : Math.max(0, submittedAt - openedAtRef.current),
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
    <section className='pt-8'>
      <div className='pb-4'>
        <h2 className='text-lg font-black text-slate-900'>理解练习</h2>
      </div>

      <div className='mt-3 divide-y divide-slate-200 border-y border-slate-200'>
        {questions.map((question, index) => {
          const selectedId = answers[question.id]
          const result = results[question.id]
          return (
            <div
              key={question.id}
              className='py-6 md:py-8'>
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
                  <span className='text-[11px] font-semibold text-slate-500'>
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
                <p className='mt-2 border-l-2 border-slate-200 py-1 pl-3 text-xs leading-6 text-slate-500'>
                  语境：{question.contextSentence}
                </p>
              ) : null}

              <div className='mt-4 divide-y divide-slate-200 border-y border-slate-200'>
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
                      className={`flex w-full items-start px-3 py-3 text-left text-sm transition ${
                        showCorrect
                          ? 'bg-emerald-50 text-emerald-900'
                          : showWrong
                            ? 'bg-rose-50 text-rose-900'
                            : isSelected
                              ? 'bg-slate-100 text-slate-950'
                              : 'bg-transparent text-slate-700 hover:bg-slate-50'
                      }`}>
                      <span className='mr-3 font-semibold text-slate-400'>
                        {optionLabel(optionIndex)}
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
                  onClick={() => void submitQuestion(question, Date.now())}
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
                <div className='mt-4 border-y border-slate-200 bg-slate-50 py-3'>
                  <p className='text-xs font-bold text-slate-500'>解析</p>
                  <p className='mt-1 text-sm leading-6 text-slate-700'>
                    {question.analysis}
                  </p>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {error ? (
        <p className='mt-4 text-sm font-semibold text-rose-700'>{error}</p>
      ) : null}
    </section>
  )
}
