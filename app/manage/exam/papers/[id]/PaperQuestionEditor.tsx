'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { updatePaperQuestion } from '../actions'

type EditableOption = {
  id: string
  text: string
  isCorrect: boolean
}

type EditableQuestion = {
  id: string
  questionType: string
  prompt: string
  contextSentence: string
  explanation: string
  sortOrder: number
  options: EditableOption[]
}

type MaterialBlock = {
  id: string
  materialType: string
  title: string
  sortOrder: number
  questionCount: number
  questions: EditableQuestion[]
}

type PaperQuestionEditorProps = {
  paper: {
    id: string
    title: string
    description: string | null
    language: string | null
    level: string | null
    materials: MaterialBlock[]
  }
}

const MATERIAL_TYPE_LABEL: Record<string, string> = {
  READING: '阅读',
  LISTENING: '听力',
  VOCAB_GRAMMAR: '语法',
  SPEAKING: '口语',
}

export default function PaperQuestionEditor({ paper }: PaperQuestionEditorProps) {
  const [materials, setMaterials] = useState<MaterialBlock[]>(paper.materials)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  const totalQuestionCount = useMemo(
    () => materials.reduce((sum, item) => sum + item.questions.length, 0),
    [materials],
  )

  const setQuestionField = (
    materialId: string,
    questionId: string,
    field: 'prompt' | 'contextSentence' | 'explanation',
    value: string,
  ) => {
    setMaterials(prev =>
      prev.map(material => {
        if (material.id !== materialId) return material
        return {
          ...material,
          questions: material.questions.map(question =>
            question.id === questionId ? { ...question, [field]: value } : question,
          ),
        }
      }),
    )
  }

  const setOptionField = (
    materialId: string,
    questionId: string,
    optionId: string,
    field: 'text' | 'isCorrect',
    value: string | boolean,
  ) => {
    setMaterials(prev =>
      prev.map(material => {
        if (material.id !== materialId) return material
        return {
          ...material,
          questions: material.questions.map(question => {
            if (question.id !== questionId) return question
            return {
              ...question,
              options: question.options.map(option => {
                if (option.id !== optionId) return option
                if (field === 'isCorrect') {
                  return {
                    ...option,
                    isCorrect: Boolean(value),
                  }
                }
                return {
                  ...option,
                  text: String(value),
                }
              }),
            }
          }),
        }
      }),
    )
  }

  const setCorrectOption = (
    materialId: string,
    questionId: string,
    optionId: string,
  ) => {
    setMaterials(prev =>
      prev.map(material => {
        if (material.id !== materialId) return material
        return {
          ...material,
          questions: material.questions.map(question => {
            if (question.id !== questionId) return question
            return {
              ...question,
              options: question.options.map(option => ({
                ...option,
                isCorrect: option.id === optionId,
              })),
            }
          }),
        }
      }),
    )
  }

  const saveQuestion = (materialId: string, questionId: string) => {
    const material = materials.find(item => item.id === materialId)
    const question = material?.questions.find(item => item.id === questionId)
    if (!material || !question) return

    setSavingId(questionId)
    setMessage(prev => ({ ...prev, [questionId]: '' }))

    startTransition(async () => {
      const result = await updatePaperQuestion({
        questionId: question.id,
        prompt: question.prompt,
        contextSentence: question.contextSentence,
        explanation: question.explanation,
        options: question.options,
      })
      setSavingId(null)
      setMessage(prev => ({
        ...prev,
        [questionId]: result.message || (result.success ? '已保存。' : '保存失败。'),
      }))
    })
  }

  return (
    <main className='min-h-screen bg-slate-50 p-4 md:p-6'>
      <div className='mx-auto max-w-7xl space-y-4'>
        <header className='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'>
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <Link href='/manage/exam/papers' className='text-indigo-600 hover:underline'>
              试卷管理
            </Link>
            <span className='text-slate-300'>/</span>
            <span className='text-slate-500'>编辑详情</span>
          </div>
          <h1 className='mt-2 text-2xl font-black text-slate-900'>{paper.title}</h1>
          <div className='mt-2 flex flex-wrap gap-2 text-xs font-semibold'>
            <span className='rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600'>
              语言：{paper.language || '未设置'}
            </span>
            <span className='rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600'>
              等级：{paper.level || '未设置'}
            </span>
            <span className='rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600'>
              材料：{materials.length}
            </span>
            <span className='rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600'>
              题目：{totalQuestionCount}
            </span>
          </div>
        </header>

        {materials.map(material => (
          <section
            key={material.id}
            className='rounded-2xl border border-slate-200 bg-white shadow-sm'>
            <div className='border-b border-slate-100 p-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700'>
                  {MATERIAL_TYPE_LABEL[material.materialType] || material.materialType}
                </span>
                <h2 className='text-lg font-bold text-slate-900'>{material.title}</h2>
                <span className='text-xs text-slate-500'>题数 {material.questionCount}</span>
              </div>
            </div>

            <div className='space-y-3 p-3 md:p-4'>
              {material.questions.map((question, index) => {
                const statusText = message[question.id] || ''
                const isSaving = savingId === question.id && isPending

                return (
                  <article
                    key={question.id}
                    className='rounded-xl border border-slate-200 bg-slate-50/50 p-3'>
                    <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                      <div className='flex items-center gap-2 text-sm font-semibold text-slate-700'>
                        <span>#{question.sortOrder || index + 1}</span>
                        <span className='rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600'>
                          {question.questionType}
                        </span>
                        <span className='font-mono text-xs text-slate-400'>
                          {question.id}
                        </span>
                      </div>
                      <button
                        type='button'
                        onClick={() => saveQuestion(material.id, question.id)}
                        disabled={isSaving}
                        className='rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300'>
                        {isSaving ? '保存中...' : '保存题目'}
                      </button>
                    </div>

                    <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                      <label className='space-y-1'>
                        <span className='text-xs font-semibold text-slate-600'>题干</span>
                        <textarea
                          value={question.prompt}
                          onChange={e =>
                            setQuestionField(
                              material.id,
                              question.id,
                              'prompt',
                              e.target.value,
                            )
                          }
                          className='min-h-[88px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400'
                        />
                      </label>
                      <label className='space-y-1'>
                        <span className='text-xs font-semibold text-slate-600'>语境句</span>
                        <textarea
                          value={question.contextSentence}
                          onChange={e =>
                            setQuestionField(
                              material.id,
                              question.id,
                              'contextSentence',
                              e.target.value,
                            )
                          }
                          className='min-h-[88px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400'
                        />
                      </label>
                    </div>

                    <label className='mt-2 block space-y-1'>
                      <span className='text-xs font-semibold text-slate-600'>解析</span>
                      <textarea
                        value={question.explanation}
                        onChange={e =>
                          setQuestionField(
                            material.id,
                            question.id,
                            'explanation',
                            e.target.value,
                          )
                        }
                        className='min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400'
                      />
                    </label>

                    {question.options.length > 0 && (
                      <div className='mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-2.5'>
                        <div className='text-xs font-bold text-slate-600'>
                          选项与正确答案（单选）
                        </div>
                        {question.options.map((option, optionIndex) => (
                          <div
                            key={option.id}
                            className='grid grid-cols-[auto,1fr] items-center gap-2'>
                            <input
                              type='radio'
                              name={`correct-${question.id}`}
                              checked={option.isCorrect}
                              onChange={() =>
                                setCorrectOption(material.id, question.id, option.id)
                              }
                              className='h-4 w-4'
                            />
                            <input
                              value={option.text}
                              onChange={e =>
                                setOptionField(
                                  material.id,
                                  question.id,
                                  option.id,
                                  'text',
                                  e.target.value,
                                )
                              }
                              className='w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400'
                              placeholder={`选项 ${String.fromCharCode(65 + optionIndex)}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {statusText ? (
                      <p
                        className={`mt-2 text-xs font-semibold ${
                          statusText.includes('已保存')
                            ? 'text-emerald-600'
                            : 'text-rose-600'
                        }`}>
                        {statusText}
                      </p>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
