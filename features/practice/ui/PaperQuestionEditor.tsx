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
import {
  getQuestionTypeDisplay,
  getQuestionTypeLabel,
} from '@/utils/questions/typeLabels'
import {
  MATERIAL_GROUPS,
  MATERIAL_TYPE_LABEL,
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
    <main className='min-h-screen bg-slate-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-7xl space-y-5'>
        <header className='overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm'>
          <div className='p-5 md:p-6'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                <Link href='/manage/practice' className='font-bold text-indigo-600 hover:text-indigo-800'>
                  ← 返回试卷管理
                </Link>
                {activeSection ? (
                  <>
                    <span className='text-slate-300'>/</span>
                    <Link href={`/manage/practice/${encodeURIComponent(paper.id)}`} className='text-slate-500 hover:text-slate-900'>整卷</Link>
                  </>
                ) : null}
              </div>
              <div className='flex gap-2'>
                <Link href={`/practice/${encodeURIComponent(paper.id)}`} className='ui-btn ui-btn-sm'>预览试卷</Link>
                <Link href={`/practice/${encodeURIComponent(paper.id)}/do`} className='ui-btn ui-btn-sm'>测试作答</Link>
              </div>
            </div>
            <div className='mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
              <div>
                <p className='text-xs font-black tracking-[0.16em] text-slate-400 uppercase'>Paper editor</p>
                <h1 className='mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl'>{paper.title}</h1>
                <p className='mt-2 text-sm text-slate-500'>按材料检查题型、题干、选项、正确答案与解析。</p>
              </div>
              <div className='grid grid-cols-3 gap-2 text-center text-xs sm:min-w-[330px]'>
                <InfoTile label='材料' value={String(materials.length)} />
                <InfoTile label='题目' value={String(totalQuestionCount)} />
                <InfoTile label='未保存' value={String(dirtyIds.size)} warning={dirtyIds.size > 0} />
              </div>
            </div>
          </div>
          <div className='border-t border-slate-100 bg-slate-50/70 px-5 py-4 md:px-6'>
            <div className='grid gap-2 md:grid-cols-[minmax(240px,1fr)_240px_auto]'>
              <input
                value={questionQuery}
                onChange={event => setQuestionQuery(event.target.value)}
                placeholder='搜索题干、语境、解析或材料名'
                className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'
              />
              <CustomSelect
                value={questionTypeFilter}
                onChange={event => setQuestionTypeFilter(event.target.value)}
                className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm'>
                <option value='all'>全部题型</option>
                {questionTypes.map(type => (
                  <option key={type} value={type}>{getQuestionTypeLabel(type)}</option>
                ))}
              </CustomSelect>
              <button type='button' onClick={() => { setQuestionQuery(''); setQuestionTypeFilter('all') }} className='ui-btn ui-btn-sm h-10 px-4'>重置</button>
            </div>
            <p className='mt-2 text-xs font-semibold text-slate-500'>
              {activeSection ? `当前：${activeSectionLabel} · ` : ''}显示 {visibleQuestionCount} / {totalQuestionCount} 题
            </p>
          </div>
        </header>

        {groupedMaterials.length === 0 ? (
          <section className='rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center'>
            <p className='font-bold text-slate-700'>没有匹配的题目</p>
            <p className='mt-1 text-sm text-slate-500'>请更换关键词或题型筛选。</p>
          </section>
        ) : groupedMaterials.map(group => (
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
                  {material.questions.length === 0 ? (
                    <div className='rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-4 py-5 text-center'>
                      <p className='text-sm font-bold text-amber-900'>这个听力部分还没有题目</p>
                      <p className='mt-1 text-xs text-amber-700'>请先到听力材料页补充题干、选项与答案。</p>
                      <Link
                        href={`/manage/listening/${encodeURIComponent(material.id)}#questions`}
                        className='ui-btn ui-btn-primary ui-btn-sm mt-3'>
                        添加听力题目
                      </Link>
                    </div>
                  ) : null}
                  {material.questions.map((question, index) => {
                    const statusText = message[question.id] || ''
                    const isSaving = savingId === question.id && isPending
                    const isOpen = openQuestionId === question.id
                    const typeDisplay = getQuestionTypeDisplay(question.questionType)
                    const correctOptionIndex = question.options.findIndex(option => option.isCorrect)

                    return (
                      <article
                        key={question.id}
                        className={`overflow-hidden rounded-xl border bg-white transition ${dirtyIds.has(question.id) ? 'border-amber-300 ring-1 ring-amber-100' : isOpen ? 'border-slate-300 shadow-sm' : 'border-slate-200'}`}>
                        <div className='flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between md:p-4'>
                          <div className='flex min-w-0 items-start gap-3'>
                            <span className='inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 px-2 text-xs font-black text-white'>
                              {question.sortOrder || index + 1}
                            </span>
                            <div className='min-w-0'>
                              <div className='flex flex-wrap items-center gap-2'>
                                <span className='rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700'>
                                  {typeDisplay.label}
                                </span>
                                <span className='text-[11px] text-slate-400'>{typeDisplay.description}</span>
                                {dirtyIds.has(question.id) ? <span className='rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700'>未保存</span> : null}
                                {correctOptionIndex >= 0 ? <span className='text-[11px] font-semibold text-emerald-600'>答案 {formatOptionLabel(correctOptionIndex, normalizeOptionLabelFormat(question.optionLabelFormat, 'numeric'), parseCustomOptionLabels(question.customOptionLabels))}</span> : null}
                              </div>
                              <p className='mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-800'>
                                {question.prompt || question.contextSentence || '未填写题干'}
                              </p>
                            </div>
                          </div>
                          <div className='flex shrink-0 items-center gap-2 self-end md:self-auto'>
                            {isOpen ? (
                              <button type='button' onClick={() => saveQuestion(material.id, question.id)} disabled={isSaving} className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
                                {isSaving ? '保存中…' : '保存题目'}
                              </button>
                            ) : null}
                            <button type='button' onClick={() => setOpenQuestionId(isOpen ? null : question.id)} className='ui-btn ui-btn-sm'>
                              {isOpen ? '收起' : '编辑'}
                            </button>
                          </div>
                        </div>

                        {isOpen ? (
                        <div className='border-t border-slate-100 bg-slate-50/50 p-3 md:p-4'>
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
                            <div className='flex items-center justify-between gap-2'>
                              <div className='text-xs font-bold text-slate-600'>
                                选项与正确答案（{question.options.length} 个，最少 {MIN_QUESTION_OPTION_COUNT} 个）
                              </div>
                              <button
                                type='button'
                                onClick={() => addOption(material.id, question.id)}
                                className='rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100'>
                                + 添加选项
                              </button>
                            </div>
                            <div className='grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr]'>
                              <CustomSelect
                                value={question.optionLabelFormat || 'numeric'}
                                onChange={e =>
                                  setQuestionField(
                                    material.id,
                                    question.id,
                                    'optionLabelFormat',
                                    e.target.value,
                                  )
                                }
                                className='h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm'>
                                <option value='numeric'>1、2、3、4（日语默认）</option>
                                <option value='upper-alpha'>A、B、C、D</option>
                                <option value='circled-number'>①、②、③、④</option>
                                <option value='katakana'>ア、イ、ウ、エ</option>
                                <option value='custom'>自定义</option>
                              </CustomSelect>
                              {question.optionLabelFormat === 'custom' ? (
                                <input
                                  value={question.customOptionLabels || ''}
                                  onChange={e =>
                                    setQuestionField(
                                      material.id,
                                      question.id,
                                      'customOptionLabels',
                                      e.target.value,
                                    )
                                  }
                                  placeholder='例如：Ⅰ|Ⅱ|Ⅲ|Ⅳ'
                                  className='h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm'
                                />
                              ) : null}
                            </div>
                            {question.options.map((option, optionIndex) => (
                              <div
                                key={option.id}
                                className='grid grid-cols-[auto,1fr,auto] items-center gap-2'>
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
                                  placeholder={`选项 ${formatOptionLabel(
                                    optionIndex,
                                    normalizeOptionLabelFormat(
                                      question.optionLabelFormat,
                                      'numeric',
                                    ),
                                    parseCustomOptionLabels(
                                      question.customOptionLabels,
                                    ),
                                  )}`}
                                />
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
                                  className='rounded-md px-2 py-1 text-xs font-bold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-25'>
                                  删除
                                </button>
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
                        </div>
                        ) : statusText ? (
                          <p className={`border-t border-slate-100 px-4 py-2 text-xs font-semibold ${statusText.includes('已保存') ? 'text-emerald-600' : 'text-rose-600'}`}>{statusText}</p>
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

function InfoTile({
  label,
  value,
  warning = false,
}: {
  label: string
  value: string
  warning?: boolean
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warning ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
      <p className='text-[10px] font-bold text-slate-400'>{label}</p>
      <p className={`mt-0.5 text-lg font-black ${warning ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
