'use client'

import Link from 'next/link'
import { useMemo, useTransition } from 'react'
import CustomSelect from '@/components/ui/CustomSelect'
import {
  formatOptionLabel,
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
  type OptionLabelFormat,
} from '@/utils/questions/optionLabels'
import { getQuestionTypeLabel } from '@/utils/questions/typeLabels'
import {
  MATERIAL_GROUPS,
  parseActiveQuestionSection,
} from '@/features/questions/domain/paper-editor'
import { usePaperQuestionEditorState } from '@/features/questions/hooks/usePaperQuestionEditorState'
import { useQuestionEditorMutations } from '@/features/questions/hooks/useQuestionEditorMutations'
import {
  createQuestionOption,
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
} from '@/features/questions/domain/editor'

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
  optionLabelFormat: OptionLabelFormat
  customOptionLabels: string
  sortOrder: number
  options: EditableOption[]
}

type MaterialBlock = {
  id: string
  materialType: string
  title: string
  sortOrder: number
  questionCount: number
  listeningSectionTitle: string
  listeningSectionNumber: string
  listeningSectionKey: string
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

export default function PaperQuestionEditor({
  paper,
  activeSectionKey,
}: PaperQuestionEditorProps) {
  const { updatePaperQuestion } = useQuestionEditorMutations()
  const {
    materials, setMaterials, savingId, setSavingId, message, setMessage,
    openQuestionId, setOpenQuestionId, questionQuery, setQuestionQuery,
    questionTypeFilter, setQuestionTypeFilter, dirtyIds, setDirtyIds,
  } = usePaperQuestionEditorState<MaterialBlock>(paper.materials)
  const [isPending, startTransition] = useTransition()

  const totalQuestionCount = useMemo(
    () => materials.reduce((sum, item) => sum + item.questions.length, 0),
    [materials],
  )
  const activeSection = useMemo(
    () => parseActiveQuestionSection(activeSectionKey),
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
      .filter(item => {
        if (
          activeSection.materialType !== 'LISTENING' ||
          !activeSection.listeningSectionKey
        ) {
          return true
        }
        return (
          item.listeningSectionKey === activeSection.listeningSectionKey ||
          item.questions.length > 0
        )
      })
  }, [activeSection, materials])
  const questionTypes = useMemo(
    () =>
      Array.from(
        new Set(materials.flatMap(material => material.questions.map(item => item.questionType))),
      ).sort((a, b) => getQuestionTypeLabel(a).localeCompare(getQuestionTypeLabel(b), 'ja')),
    [materials],
  )
  const filteredMaterials = useMemo(() => {
    const keyword = questionQuery.trim().toLowerCase()
    return visibleMaterials
      .map(material => {
        const questions = material.questions.filter(question => {
          if (questionTypeFilter !== 'all' && question.questionType !== questionTypeFilter) {
            return false
          }
          if (!keyword) return true
          return [
            question.prompt,
            question.contextSentence,
            question.explanation,
            material.title,
            getQuestionTypeLabel(question.questionType),
          ].some(value => String(value || '').toLowerCase().includes(keyword))
        })
        return { ...material, questions, questionCount: questions.length }
      })
      .filter(material => {
        if (material.questions.length > 0) return true
        return (
          !keyword &&
          questionTypeFilter === 'all' &&
          activeSection?.materialType === 'LISTENING' &&
          material.listeningSectionKey === activeSection.listeningSectionKey
        )
      })
  }, [activeSection, questionQuery, questionTypeFilter, visibleMaterials])
  const groupedMaterials = useMemo(
    () =>
      MATERIAL_GROUPS.map(group => ({
        ...group,
        materials: filteredMaterials.filter(item => item.materialType === group.key),
      })).filter(group => group.materials.length > 0),
    [filteredMaterials],
  )
  const visibleQuestionCount = filteredMaterials.reduce(
    (sum, material) => sum + material.questions.length,
    0,
  )
  const activeSectionLabel = useMemo(() => {
    if (!activeSection) return ''
    if (
      activeSection.materialType === 'LISTENING' &&
      activeSection.listeningSectionKey
    ) {
      const material = materials.find(
        item => item.listeningSectionKey === activeSection.listeningSectionKey,
      )
      const question = materials
        .flatMap(item => item.questions)
        .find(item => item.listeningSectionKey === activeSection.listeningSectionKey)
      const sectionNumber = question?.listeningSectionNumber || material?.listeningSectionNumber
      const sectionTitle = question?.listeningSectionTitle || material?.listeningSectionTitle
      return sectionNumber
        ? `問題${sectionNumber}${sectionTitle ? `｜${sectionTitle}` : ''}`
        : '聴解'
    }
    return MATERIAL_GROUPS.find(group => group.key === activeSection.materialType)?.title || ''
  }, [activeSection, materials])

  const setQuestionField = (
    materialId: string,
    questionId: string,
    field:
      | 'prompt'
      | 'contextSentence'
      | 'explanation'
      | 'listeningSectionNumber'
      | 'optionLabelFormat'
      | 'customOptionLabels',
    value: string,
  ) => {
    setDirtyIds(current => new Set(current).add(questionId))
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
    setDirtyIds(current => new Set(current).add(questionId))
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
    setDirtyIds(current => new Set(current).add(questionId))
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

  const addOption = (materialId: string, questionId: string) => {
    setDirtyIds(current => new Set(current).add(questionId))
    setMaterials(previous =>
      previous.map(material =>
        material.id !== materialId
          ? material
          : {
              ...material,
              questions: material.questions.map(question =>
                question.id !== questionId
                  ? question
                  : {
                      ...question,
                      options: [
                        ...question.options,
                        createQuestionOption(`${question.id}_opt`),
                      ],
                    },
              ),
            },
      ),
    )
  }

  const removeOption = (
    materialId: string,
    questionId: string,
    optionIndex: number,
  ) => {
    setDirtyIds(current => new Set(current).add(questionId))
    setMaterials(previous =>
      previous.map(material =>
        material.id !== materialId
          ? material
          : {
              ...material,
              questions: material.questions.map(question =>
                question.id !== questionId
                  ? question
                  : {
                      ...question,
                      options: removeQuestionOptionAt(
                        question.options,
                        optionIndex,
                      ),
                    },
              ),
            },
      ),
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
        optionLabelFormat: question.optionLabelFormat,
        customOptionLabels: question.customOptionLabels,
        options: question.options,
      })
      setSavingId(null)
      if (result.success) {
        setDirtyIds(current => {
          const next = new Set(current)
          next.delete(questionId)
          return next
        })
      }
      setMessage(prev => ({
        ...prev,
        [questionId]: result.message || (result.success ? '已保存。' : '保存失败。'),
      }))
    })
  }

  return (
    <main className='min-h-screen bg-slate-50 px-3 py-4 md:px-6 md:py-6'>
      <div className='mx-auto max-w-6xl space-y-4'>
        <header className='space-y-3'>
          <Link
            href='/manage/practice'
            className='text-sm font-bold text-slate-500 hover:text-slate-900'>
            ← 试卷
          </Link>
          <div className='flex flex-wrap items-end justify-between gap-2'>
            <div className='min-w-0'>
              <h1 className='truncate text-xl font-black text-slate-950 md:text-2xl'>
                {paper.title}
              </h1>
              <p className='mt-1 text-xs text-slate-500'>
                {activeSection ? `${activeSectionLabel} · ` : ''}
                {visibleQuestionCount} / {totalQuestionCount} 题
                {dirtyIds.size > 0 ? ` · ${dirtyIds.size} 项未保存` : ''}
              </p>
            </div>
            {activeSection ? (
              <Link
                href={`/manage/practice/${encodeURIComponent(paper.id)}`}
                className='ui-btn ui-btn-sm'>
                整卷
              </Link>
            ) : null}
          </div>
          <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]'>
            <input
              type='search'
              value={questionQuery}
              onChange={event => setQuestionQuery(event.target.value)}
              placeholder='搜索题目'
              aria-label='搜索题目'
              className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
            />
            <CustomSelect
              value={questionTypeFilter}
              onChange={event => setQuestionTypeFilter(event.target.value)}
              aria-label='筛选题型'
              className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm'>
              <option value='all'>全部题型</option>
              {questionTypes.map(type => (
                <option key={type} value={type}>{getQuestionTypeLabel(type)}</option>
              ))}
            </CustomSelect>
          </div>
        </header>

        {groupedMaterials.length === 0 ? (
          <section className='rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500'>
            暂无题目
          </section>
        ) : groupedMaterials.map(group => (
          <section key={group.key} className='space-y-2'>
            <div className='flex items-center gap-2'>
              <h2 className='text-sm font-black text-slate-700'>{group.title}</h2>
              <span className='text-xs text-slate-400'>
                {group.materials.reduce(
                  (sum, material) => sum + material.questions.length,
                  0,
                )}
              </span>
            </div>

            {group.materials.map(material => (
              <div
                key={material.id}
                className='rounded-xl border border-slate-200 bg-white'>
                {material.materialType !== 'LISTENING' ||
                material.questions.length !== 1 ? (
                  <div className='border-b border-slate-100 px-3 py-2.5'>
                  <div className='flex min-w-0 items-center justify-between gap-2'>
                    <h3 className='truncate text-sm font-bold text-slate-900'>
                      {material.title}
                    </h3>
                    {material.questionCount > 1 ? (
                      <span className='shrink-0 text-xs text-slate-400'>
                        {material.questionCount} 题
                      </span>
                    ) : null}
                  </div>
                  </div>
                ) : null}

                <div className='divide-y divide-slate-100'>
                  {material.questions.length === 0 ? (
                    <div className='flex items-center justify-between gap-3 px-3 py-3'>
                      <span className='text-sm text-slate-500'>暂无题目</span>
                      <Link
                        href={`/manage/listening/${encodeURIComponent(material.id)}#questions`}
                        className='ui-btn ui-btn-primary ui-btn-sm'>
                        添加题目
                      </Link>
                    </div>
                  ) : null}
                  {material.questions.map((question, index) => {
                    const statusText = message[question.id] || ''
                    const isSaving = savingId === question.id && isPending
                    const isOpen = openQuestionId === question.id
                    const typeLabel = getQuestionTypeLabel(question.questionType)
                    const summaryText =
                      question.prompt || question.contextSentence

                    return (
                      <article
                        key={question.id}
                        className={`overflow-hidden bg-white ${
                          dirtyIds.has(question.id)
                            ? 'border-l-2 border-amber-400'
                            : 'border-l-2 border-transparent'
                        }`}>
                        <div className='flex items-center gap-2 px-3 py-2.5'>
                          <div className='flex min-w-0 flex-1 items-center gap-2.5'>
                            {material.materialType !== 'LISTENING' ? (
                              <span className='inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 px-1.5 text-xs font-black text-white'>
                                {question.sortOrder || index + 1}
                              </span>
                            ) : null}
                            <div className='min-w-0'>
                              {material.materialType === 'LISTENING' &&
                              material.questions.length === 1 ? (
                                <div className='flex flex-wrap items-center gap-2'>
                                  <h3 className='truncate text-sm font-bold text-slate-900'>
                                    {material.title}
                                  </h3>
                                  {dirtyIds.has(question.id) ? (
                                    <span className='text-[10px] font-bold text-amber-700'>
                                      未保存
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <>
                                  <div className='flex flex-wrap items-center gap-2'>
                                    <span className='text-[11px] font-bold text-slate-500'>
                                      {typeLabel}
                                    </span>
                                    {dirtyIds.has(question.id) ? (
                                      <span className='text-[10px] font-bold text-amber-700'>
                                        未保存
                                      </span>
                                    ) : null}
                                  </div>
                                  {summaryText ? (
                                    <p className='mt-0.5 line-clamp-2 text-sm font-medium leading-5 text-slate-800'>
                                      {summaryText}
                                    </p>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </div>
                          <div className='flex shrink-0 items-center gap-1.5'>
                            <button type='button' onClick={() => setOpenQuestionId(isOpen ? null : question.id)} className='ui-btn ui-btn-sm'>
                              {isOpen ? '收起' : '编辑'}
                            </button>
                          </div>
                        </div>

                        {isOpen ? (
                        <div className='border-t border-slate-200 bg-slate-100/70 p-3 md:p-4'>
                          <div className='grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]'>
                            <section className='space-y-4 rounded-xl border border-slate-200 bg-white p-4'>
                              <div className='flex items-center justify-between gap-3'>
                                <h4 className='text-sm font-black text-slate-900'>题目内容</h4>
                                {material.materialType === 'LISTENING' ? (
                                  <label className='flex items-center gap-2 text-xs font-semibold text-slate-500'>
                                    所属問題
                                    <input
                                      type='number'
                                      min='1'
                                      step='1'
                                      value={question.listeningSectionNumber}
                                      onChange={event =>
                                        setQuestionField(
                                          material.id,
                                          question.id,
                                          'listeningSectionNumber',
                                          event.target.value,
                                        )
                                      }
                                      aria-label='所属問題'
                                      className='h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-slate-400'
                                    />
                                  </label>
                                ) : null}
                              </div>

                              <label className='block space-y-1.5'>
                                <span className='text-xs font-bold text-slate-600'>题干</span>
                                <textarea
                                  value={question.prompt}
                                  onChange={event =>
                                    setQuestionField(
                                      material.id,
                                      question.id,
                                      'prompt',
                                      event.target.value,
                                    )
                                  }
                                  rows={4}
                                  className='w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                                />
                              </label>

                              <details
                                key={`${question.id}-${question.contextSentence ? 'with-context' : 'empty-context'}`}
                                open={
                                  material.materialType !== 'LISTENING' ||
                                  Boolean(question.contextSentence)
                                }
                                className='rounded-lg border border-slate-200 bg-slate-50/70'>
                                <summary className='cursor-pointer list-none px-3 py-2 text-xs font-bold text-slate-600'>
                                  {question.questionType === 'FILL_BLANK'
                                    ? '定位句（可选，保留空位）'
                                    : question.questionType === 'READING_COMPREHENSION'
                                      ? '引用原文（可选）'
                                      : '语境句（可选）'}
                                </summary>
                                <div className='border-t border-slate-200 p-2'>
                                <textarea
                                  value={question.contextSentence}
                                  onChange={event =>
                                    setQuestionField(
                                      material.id,
                                      question.id,
                                      'contextSentence',
                                      event.target.value,
                                    )
                                  }
                                  rows={3}
                                  aria-label='语境句'
                                  placeholder='仅在内容与题干不同时填写'
                                  className='w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                                />
                                </div>
                              </details>

                              <label className='block space-y-1.5'>
                                <span className='text-xs font-bold text-slate-600'>解析（可选）</span>
                                <textarea
                                  value={question.explanation}
                                  onChange={event =>
                                    setQuestionField(
                                      material.id,
                                      question.id,
                                      'explanation',
                                      event.target.value,
                                    )
                                  }
                                  rows={3}
                                  className='w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                                />
                              </label>
                            </section>

                            <section className='rounded-xl border border-slate-200 bg-white p-4'>
                              <div className='flex flex-wrap items-center justify-between gap-2'>
                                <div>
                                  <h4 className='text-sm font-black text-slate-900'>选项与答案</h4>
                                  <p className='mt-0.5 text-xs text-slate-400'>{question.options.length} 个选项</p>
                                </div>
                                <button
                                  type='button'
                                  onClick={() => addOption(material.id, question.id)}
                                  className='ui-btn ui-btn-sm'>
                                  添加选项
                                </button>
                              </div>

                              <div className='mt-3 grid gap-2 sm:grid-cols-2'>
                                <label className='space-y-1'>
                                  <span className='text-[11px] font-semibold text-slate-500'>序号</span>
                                  <CustomSelect
                                    value={question.optionLabelFormat || 'numeric'}
                                    onChange={event =>
                                      setQuestionField(
                                        material.id,
                                        question.id,
                                        'optionLabelFormat',
                                        event.target.value,
                                      )
                                    }
                                    className='h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm'>
                                    <option value='numeric'>1、2、3、4</option>
                                    <option value='upper-alpha'>A、B、C、D</option>
                                    <option value='circled-number'>①、②、③、④</option>
                                    <option value='katakana'>ア、イ、ウ、エ</option>
                                    <option value='custom'>自定义</option>
                                  </CustomSelect>
                                </label>
                                {question.optionLabelFormat === 'custom' ? (
                                  <label className='space-y-1'>
                                    <span className='text-[11px] font-semibold text-slate-500'>自定义序号</span>
                                    <input
                                      value={question.customOptionLabels || ''}
                                      onChange={event =>
                                        setQuestionField(
                                          material.id,
                                          question.id,
                                          'customOptionLabels',
                                          event.target.value,
                                        )
                                      }
                                      placeholder='Ⅰ|Ⅱ|Ⅲ|Ⅳ'
                                      className='h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-slate-400'
                                    />
                                  </label>
                                ) : null}
                              </div>

                              <div className='mt-4 space-y-2'>
                                {question.options.map((option, optionIndex) => {
                                  const optionLabel = formatOptionLabel(
                                    optionIndex,
                                    normalizeOptionLabelFormat(
                                      question.optionLabelFormat,
                                      'numeric',
                                    ),
                                    parseCustomOptionLabels(
                                      question.customOptionLabels,
                                    ),
                                  )

                                  return (
                                    <div
                                      key={option.id}
                                      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border p-2 ${
                                        option.isCorrect
                                          ? 'border-emerald-300 bg-emerald-50/70'
                                          : 'border-slate-200 bg-slate-50/60'
                                      }`}>
                                      <span className='inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-white px-1.5 text-xs font-black text-slate-600 shadow-sm ring-1 ring-slate-200'>
                                        {optionLabel}
                                      </span>
                                      <input
                                        value={option.text}
                                        onChange={event =>
                                          setOptionField(
                                            material.id,
                                            question.id,
                                            option.id,
                                            'text',
                                            event.target.value,
                                          )
                                        }
                                        aria-label={`选项 ${optionLabel}`}
                                        className='h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-slate-400'
                                      />
                                      <div className='flex items-center gap-1'>
                                        <label className={`flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-[11px] font-bold ${
                                          option.isCorrect
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'text-slate-500 hover:bg-white'
                                        }`}>
                                          <input
                                            type='radio'
                                            name={`correct-${question.id}`}
                                            checked={option.isCorrect}
                                            onChange={() =>
                                              setCorrectOption(
                                                material.id,
                                                question.id,
                                                option.id,
                                              )
                                            }
                                            className='h-3.5 w-3.5'
                                          />
                                          正确
                                        </label>
                                        <button
                                          type='button'
                                          disabled={question.options.length <= MIN_QUESTION_OPTION_COUNT}
                                          onClick={() =>
                                            removeOption(
                                              material.id,
                                              question.id,
                                              optionIndex,
                                            )
                                          }
                                          aria-label={`删除选项 ${optionIndex + 1}`}
                                          className='h-8 rounded-md px-2 text-[11px] font-bold text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-25'>
                                          移除
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </section>
                          </div>

                          <div className='mt-3 flex flex-wrap items-center justify-end gap-3'>
                            {statusText ? (
                              <p
                                role='status'
                                className={`mr-auto text-xs font-semibold ${
                                  statusText.includes('已保存')
                                    ? 'text-emerald-700'
                                    : 'text-rose-600'
                                }`}>
                                {statusText}
                              </p>
                            ) : null}
                            <button
                              type='button'
                              onClick={() => saveQuestion(material.id, question.id)}
                              disabled={isSaving}
                              className='ui-btn ui-btn-primary min-w-24 disabled:opacity-50'>
                              {isSaving ? '保存中…' : '保存题目'}
                            </button>
                          </div>
                        </div>
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
