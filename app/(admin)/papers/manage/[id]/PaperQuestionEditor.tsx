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
  listeningSectionTitle: string
  listeningSectionNumber: string
  listeningSectionKey: string
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
  activeSectionKey?: string | null
}

const MATERIAL_TYPE_LABEL: Record<string, string> = {
  READING: '阅读',
  LISTENING: '听力',
  VOCAB_GRAMMAR: '选择',
  SPEAKING: '口语',
}

const MATERIAL_GROUPS = [
  {
    key: 'LISTENING',
    title: '听力部分',
    description: '可在每道听力题里维护它属于第几部分。',
  },
  {
    key: 'READING',
    title: '阅读部分',
    description: '阅读材料与配套题目。',
  },
  {
    key: 'VOCAB_GRAMMAR',
    title: '选择部分',
    description: '词汇、语法、排序等选择题。',
  },
]

function parseActiveSection(sectionKey?: string | null) {
  if (!sectionKey) return null
  if (sectionKey === 'READING' || sectionKey === 'VOCAB_GRAMMAR') {
    return { materialType: sectionKey, listeningSectionKey: null }
  }
  if (sectionKey.startsWith('LISTENING:')) {
    return {
      materialType: 'LISTENING',
      listeningSectionKey: sectionKey.slice('LISTENING:'.length),
    }
  }
  if (sectionKey === 'LISTENING') {
    return { materialType: 'LISTENING', listeningSectionKey: null }
  }
  return null
}

export default function PaperQuestionEditor({
  paper,
  activeSectionKey,
}: PaperQuestionEditorProps) {
  const [materials, setMaterials] = useState<MaterialBlock[]>(paper.materials)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  const totalQuestionCount = useMemo(
    () => materials.reduce((sum, item) => sum + item.questions.length, 0),
    [materials],
  )
  const activeSection = useMemo(
    () => parseActiveSection(activeSectionKey),
    [activeSectionKey],
  )
  const visibleMaterials = useMemo(() => {
    if (!activeSection) return materials
    return materials
      .filter(item => item.materialType === activeSection.materialType)
      .map(material => {
        if (
          activeSection.materialType !== 'LISTENING' ||
          !activeSection.listeningSectionKey
        ) {
          return material
        }
        return {
          ...material,
          questionCount: material.questions.filter(
            question =>
              question.listeningSectionKey === activeSection.listeningSectionKey,
          ).length,
          questions: material.questions.filter(
            question =>
              question.listeningSectionKey === activeSection.listeningSectionKey,
          ),
        }
      })
      .filter(item => item.questions.length > 0)
  }, [activeSection, materials])
  const groupedMaterials = useMemo(
    () =>
      MATERIAL_GROUPS.map(group => ({
        ...group,
        materials: visibleMaterials.filter(item => item.materialType === group.key),
      })).filter(group => group.materials.length > 0),
    [visibleMaterials],
  )
  const activeSectionLabel = useMemo(() => {
    if (!activeSection) return ''
    if (
      activeSection.materialType === 'LISTENING' &&
      activeSection.listeningSectionKey
    ) {
      const question = visibleMaterials
        .flatMap(material => material.questions)
        .find(item => item.listeningSectionKey === activeSection.listeningSectionKey)
      return question?.listeningSectionNumber
        ? `听力部分 ${question.listeningSectionNumber}`
        : '听力部分'
    }
    return groupedMaterials[0]?.title || ''
  }, [activeSection, groupedMaterials, visibleMaterials])

  const setQuestionField = (
    materialId: string,
    questionId: string,
    field:
      | 'prompt'
      | 'contextSentence'
      | 'explanation'
      | 'listeningSectionNumber',
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
        listeningSectionNumber: question.listeningSectionNumber,
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
            <Link href='/manage/practice' className='text-indigo-600 hover:underline'>
              试卷管理
            </Link>
            <span className='text-slate-300'>/</span>
            <span className='text-slate-500'>
              {activeSection ? '编辑部分' : '编辑详情'}
            </span>
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
            {activeSection ? (
              <span className='rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-blue-700'>
                当前：{activeSectionLabel}
              </span>
            ) : null}
          </div>
          {activeSection ? (
            <Link
              href={`/manage/practice/${encodeURIComponent(paper.id)}`}
              className='mt-3 inline-flex text-xs font-bold text-blue-700 hover:underline'>
              查看整卷结构
            </Link>
          ) : null}
        </header>

        {groupedMaterials.map(group => (
          <section key={group.key} className='space-y-3'>
            <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'>
              <div className='flex flex-wrap items-end justify-between gap-2'>
                <div>
                  <h2 className='text-xl font-black text-slate-900'>{group.title}</h2>
                  <p className='mt-1 text-sm text-slate-500'>{group.description}</p>
                </div>
                <span className='rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600'>
                  {group.materials.length} 组材料
                </span>
              </div>
            </div>

            {group.materials.map(material => (
              <div
                key={material.id}
                className='rounded-2xl border border-slate-200 bg-white shadow-sm'>
                <div className='border-b border-slate-100 p-4'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700'>
                      {MATERIAL_TYPE_LABEL[material.materialType] || material.materialType}
                    </span>
                    <h3 className='text-lg font-bold text-slate-900'>
                      {material.title}
                    </h3>
                    <span className='text-xs text-slate-500'>
                      题数 {material.questionCount}
                    </span>
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

                        {material.materialType === 'LISTENING' ? (
                          <label className='mb-2 block space-y-1'>
                            <span className='text-xs font-semibold text-slate-600'>
                              第几部分
                            </span>
                            <input
                              type='number'
                              min='1'
                              step='1'
                              value={question.listeningSectionNumber}
                              onChange={e =>
                                setQuestionField(
                                  material.id,
                                  question.id,
                                  'listeningSectionNumber',
                                  e.target.value,
                                )
                              }
                              className='w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 md:max-w-md'
                              placeholder='例如：1'
                            />
                          </label>
                        ) : null}

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
              </div>
            ))}
          </section>
        ))}
      </div>
    </main>
  )
}
