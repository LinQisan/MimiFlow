'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import type { CollectionType, QuestionType } from '@prisma/client'

// 🌟 复用拖拽系统
import {
  SortableList,
  SortableItem,
  DragHandle,
  ActionInterceptor,
} from '@/features/collections/ui/DndSystem'
import { useDialog } from '@/context/DialogContext'
import {
  getQuestionEditorTypeConfig as getTypeConfig,
  createDefaultQuestionOptions,
  getDefaultQuestionPrompt,
  createQuestionOption,
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
  updateQuestionOption,
  updateQuestionField,
} from '@/modules/questions/domain/editor'
import { useQuestionListEditorState } from '@/features/questions/hooks/useQuestionListEditorState'
import { useQuestionEditorMutations } from '@/features/questions/hooks/useQuestionEditorMutations'
import { getQuestionTypeLabel } from '@/utils/questions/typeLabels'
import { useQuizMetadataState } from '@/features/questions/hooks/useQuestionEditorPageState'
import QuestionTypeBadge from '@/features/questions/components/QuestionTypeBadge'
import {
  supportsSeparateQuestionContext,
  usesExplicitQuestionTargetWord,
} from '@/modules/practice/domain/question-text'

type EditableOption = {
  id: string
  text: string
  isCorrect: boolean
}

type EditableQuestion = {
  id: string
  questionType: QuestionType
  contextSentence: string
  targetWord?: string | null
  sortingOrder?: number[]
  prompt?: string | null
  explanation?: string | null
  options: EditableOption[]
}

type EditableQuiz = {
  id: string
  title: string
  category?: {
    levelId?: string | null
    collectionType?: CollectionType | null
  } | null
  questions: EditableQuestion[]
}

type EditableQuestionField =
  | 'questionType'
  | 'contextSentence'
  | 'targetWord'
  | 'prompt'
  | 'explanation'

export default function EditQuizUI({
  quiz,
  initialFocusQuestionId,
}: {
  quiz: EditableQuiz
  initialFocusQuestionId?: string
}) {
  const dialog = useDialog()
  const { updateQuizWithQuestions, updateSortOrder } = useQuestionEditorMutations()
  const {
    isSaving,
    setIsSaving,
    questions,
    setQuestions,
    editingQuestionId,
    setEditingQuestionId,
    showAddMenu,
    setShowAddMenu,
    audioOnlyFlags,
    setAudioOnlyFlags,
  } = useQuestionListEditorState<EditableQuestion>(quiz.questions || [])

  const { title, setTitle } = useQuizMetadataState(quiz.title || '')
  const backHref =
    quiz.category?.collectionType === 'PAPER' && quiz.category.levelId
      ? `/manage/practice/${quiz.category.levelId}`
      : '/manage/practice'

  useEffect(() => {
    if (!initialFocusQuestionId) return
    if (!questions.some(question => question.id === initialFocusQuestionId)) return
    setEditingQuestionId(initialFocusQuestionId)
    window.requestAnimationFrame(() => {
      document
        .getElementById(`question-${initialFocusQuestionId}`)
        ?.scrollIntoView({ block: 'center' })
    })
  }, [initialFocusQuestionId, questions, setEditingQuestionId])

  // ================= 1. 新增题目 =================
  const handleAddNewQuestion = (
    type: QuestionType,
  ) => {
    const id = `new_${Date.now()}`
    const newQ = {
      id,
      questionType: type,
      contextSentence: '',
      targetWord: '',
      prompt: getDefaultQuestionPrompt(type),
      explanation: '',
      options: createDefaultQuestionOptions(`${id}_opt`, [
        '选项 A', '选项 B', '选项 C', '选项 D',
      ]),
    }
    setQuestions([...questions, newQ])
    setEditingQuestionId(newQ.id)
    setShowAddMenu(false)
  }

  const handleToggleAudioOnly = (questionId: string, enabled: boolean) => {
    setAudioOnlyFlags(prev => ({ ...prev, [questionId]: enabled }))
    if (enabled) {
      setQuestions(prev =>
        prev.map(q => {
          if (q.id !== questionId) return q
          return {
            ...q,
            options: q.options.map(opt => ({ ...opt, text: '' })),
          }
        }),
      )
    }
  }

  const isAudioOnly = (questionId: string) => Boolean(audioOnlyFlags[questionId])

  // ================= 2. 更新与排序 =================
  const handleUpdateQuestion = (
    id: string,
    field: EditableQuestionField,
    value: string,
  ) => {
    setQuestions(current => updateQuestionField(current, id, field, value))
  }

  const handleUpdateOption = (
    qId: string,
    optIndex: number,
    field: 'text' | 'isCorrect',
    value: string | boolean,
  ) => {
    setQuestions(current =>
      updateQuestionOption(current, qId, optIndex, field, value),
    )
  }

  const handleAddOption = (questionId: string) => {
    setQuestions(current =>
      current.map(question =>
        question.id === questionId
          ? {
              ...question,
              options: [
                ...question.options,
                createQuestionOption(`${question.id}_opt`),
              ],
            }
          : question,
      ),
    )
  }

  const handleRemoveOption = (questionId: string, optionIndex: number) => {
    setQuestions(current =>
      current.map(question =>
        question.id === questionId
          ? {
              ...question,
              options: removeQuestionOptionAt(
                question.options,
                optionIndex,
              ),
            }
          : question,
      ),
    )
  }

  const handleReorderQuestions = async (orderedIds: string[]) => {
    const reordered = orderedIds
      .map(id => questions.find(q => q.id === id))
      .filter((item): item is EditableQuestion => Boolean(item))
    setQuestions(reordered)
    return updateSortOrder('Question', orderedIds)
  }

  const handleRemoveQuestion = async (questionId: string, index: number) => {
    const confirmed = await dialog.confirm(`确认移除第 ${index + 1} 题吗？`, {
      title: '移除题目',
      confirmText: '移除',
      danger: true,
    })
    if (!confirmed) return
    setQuestions(prev => prev.filter(item => item.id !== questionId))
    if (editingQuestionId === questionId) {
      setEditingQuestionId(null)
    }
  }

  const handleSaveQuiz = async () => {
    setIsSaving(true)
    try {
      const payload = {
        quizId: quiz.id,
        title,
        questions: questions.map(q => ({
          id: q.id,
          questionType: q.questionType,
          contextSentence: q.contextSentence || '',
          targetWord: q.targetWord || '',
          sortingOrder: q.sortingOrder || [],
          prompt: q.prompt || '',
          explanation: q.explanation || '',
          options: (q.options || []).map(opt => ({
            id: opt.id,
            text: opt.text || '',
            isCorrect: Boolean(opt.isCorrect),
          })),
        })),
      }

      const res = await updateQuizWithQuestions(payload)
      if (!res.success) {
        await dialog.alert(res.message || '保存失败，请稍后再试。')
        setIsSaving(false)
        return
      }
      dialog.toast('题库与题目已保存', { tone: 'success' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className='relative mx-auto max-w-6xl animate-in px-3 pb-28 pt-3 fade-in duration-500 md:px-8 md:pb-32 md:pt-6'>
      <div className='sticky top-0 z-40 -mx-3 mb-6 border-b border-gray-100 bg-white/95 px-3 py-4 shadow-sm backdrop-blur-md md:-mx-8 md:mb-8 md:px-8 md:py-5'>
        <div className='flex flex-col justify-between gap-4 md:flex-row md:items-start'>
        <div className='flex items-start gap-3 flex-1'>
          <Link
            href={backHref}
            className='mt-2 p-2 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-full transition-colors shrink-0'
            title='返回列表'>
            <svg
              className='w-5 h-5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2.5}
                d='M10 19l-7-7m0 0l7-7m-7 7h18'
              />
            </svg>
          </Link>

          <div className='flex-1'>
            <div className='flex items-center gap-2 mb-1.5 ml-1'>
              <span className='text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded border border-gray-200'>
                ID: {quiz.id}
              </span>
              <span className='text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100'>
                共 {questions.length} 道题
              </span>
            </div>

            <input
              type='text'
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder='输入题库名称'
              className='w-full text-2xl md:text-3xl font-bold bg-transparent border-none outline-none focus:ring-0 p-0 pl-1 text-gray-900 placeholder-gray-300 transition-all'
            />
            <p className='mt-2 pl-1 text-xs text-gray-500'>
              支持拖拽调整题目顺序，编辑后统一保存。
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveQuiz}
          disabled={isSaving}
          className='ui-btn ui-btn-primary mt-1 h-11 shrink-0 px-6 disabled:opacity-50'>
          {isSaving ? '保存中...' : '保存题库'}
        </button>
      </div>
      </div>

      <section className='flex w-full flex-col border-t border-slate-200 py-6 md:py-8'>
        <div className='flex items-center justify-between mb-8 shrink-0 relative'>
          <h2 className='text-xl font-bold text-gray-800'>题目列表</h2>

          <div className='relative z-20'>
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className='ui-btn ui-btn-primary px-5'>
              新增题目
              <svg
                className='w-4 h-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M19 9l-7 7-7-7'
                />
              </svg>
            </button>

            {showAddMenu && (
              <>
                <div
                  className='fixed inset-0'
                  onClick={() => setShowAddMenu(false)}></div>
                <div className='ui-pop ui-pop-surface absolute right-0 top-full z-50 mt-2 w-48 p-2'>
                  <button
                    onClick={() => handleAddNewQuestion('PRONUNCIATION')}
                    className='w-full text-left px-3 py-2.5 hover:bg-emerald-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    {getQuestionTypeLabel('PRONUNCIATION')}
                  </button>
                  <button
                    onClick={() => handleAddNewQuestion('SYNONYM_REPLACEMENT')}
                    className='w-full text-left px-3 py-2.5 hover:bg-fuchsia-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    {getQuestionTypeLabel('SYNONYM_REPLACEMENT')}
                  </button>
                  <button
                    onClick={() => handleAddNewQuestion('WORD_DISTINCTION')}
                    className='w-full text-left px-3 py-2.5 hover:bg-teal-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    {getQuestionTypeLabel('WORD_DISTINCTION')}
                  </button>
                  <button
                    onClick={() => handleAddNewQuestion('GRAMMAR')}
                    className='w-full text-left px-3 py-2.5 hover:bg-sky-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    {getQuestionTypeLabel('GRAMMAR')}
                  </button>
                  <button
                    onClick={() => handleAddNewQuestion('GRAMMAR_SELECTION')}
                    className='w-full text-left px-3 py-2.5 hover:bg-blue-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    {getQuestionTypeLabel('GRAMMAR_SELECTION')}
                  </button>
                  <button
                    onClick={() => handleAddNewQuestion('SORTING')}
                    className='w-full text-left px-3 py-2.5 hover:bg-orange-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    {getQuestionTypeLabel('SORTING')}
                  </button>
                  <button
                    onClick={() => handleAddNewQuestion('LISTENING')}
                    className='w-full text-left px-3 py-2.5 hover:bg-cyan-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    {getQuestionTypeLabel('LISTENING')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className='flex-1'>
          {questions.length === 0 ? (
            <div className='rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center text-sm font-medium text-slate-400'>
              当前题库暂无题目，请先新增。
            </div>
          ) : (
            <SortableList
              items={questions}
              action={handleReorderQuestions}
              className='space-y-5 flex flex-col pb-10'>
              {questions.map((q, index: number) => {
                const isEditing = editingQuestionId === q.id
                const tConfig = getTypeConfig(q.questionType)

                return (
                  <SortableItem key={q.id} id={q.id}>
                    <div id={`question-${q.id}`} className='scroll-mt-24'>
                    {isEditing ? (
                      <div
                        className={`group relative cursor-default rounded-xl border border-slate-300 p-5 transition-colors md:p-6 ${tConfig.color.split(' ')[0]}`}>
                        <div className='flex justify-between items-center mb-5'>
                          <div className='flex items-center gap-2.5'>
                            <span className='px-2.5 py-1 rounded text-[10px] font-bold bg-gray-900 text-white animate-pulse tracking-wider'>
                              编辑中 Q{index + 1}
                            </span>
                            <QuestionTypeBadge type={q.questionType} />
                          </div>
                          <ActionInterceptor>
                            <button
                              onClick={() => setEditingQuestionId(null)}
                              className='ui-btn ui-btn-primary ui-btn-sm px-5 text-xs'>
                              完成
                            </button>
                          </ActionInterceptor>
                        </div>

                        <ActionInterceptor className='space-y-5'>
                          {/* 语境句 - 听力题不显示 */}
                          {q.questionType !== 'LISTENING' &&
                            supportsSeparateQuestionContext(q.questionType) && (
                          <div>
                            <label className='text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block'>
                              语境句（可选）
                            </label>
                            <textarea
                              value={q.contextSentence || ''}
                              onChange={e =>
                                handleUpdateQuestion(
                                  q.id,
                                  'contextSentence',
                                  e.target.value,
                                )
                              }
                              className='h-20 w-full resize-none rounded-lg border border-slate-300 bg-white p-4 text-sm font-semibold outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100'
                              placeholder='仅在内容与题干不同时填写'
                            />
                          </div>
                          )}

                          <div className='grid grid-cols-1 md:grid-cols-2 gap-5'>
                            {usesExplicitQuestionTargetWord(q.questionType) && (
                              <div>
                                <label className='text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block'>
                                  目标词
                                </label>
                                <input
                                  type='text'
                                  value={q.targetWord || ''}
                                  onChange={e =>
                                    handleUpdateQuestion(
                                      q.id,
                                      'targetWord',
                                      e.target.value,
                                    )
                                  }
                                  className='w-full rounded-lg border border-slate-300 bg-white p-3 text-sm font-semibold outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100'
                                  placeholder='例如：合宿'
                                />
                              </div>
                            )}

                            <div
                              className={
                                !usesExplicitQuestionTargetWord(q.questionType)
                                  ? 'md:col-span-2'
                                  : ''
                              }>
                            <label className='text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block'>
                                题干
                              </label>
                              <input
                                type='text'
                                value={q.prompt || ''}
                                onChange={e =>
                                  handleUpdateQuestion(
                                    q.id,
                                    'prompt',
                                    e.target.value,
                                  )
                                }
                                className='w-full rounded-lg border border-slate-300 bg-white p-3 text-sm font-semibold outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100'
                                placeholder={q.questionType === 'LISTENING' ? '可留空（纯听力时不显示题干）' : '例如：划线部分的读音是？'}
                              />
                            </div>
                          </div>

                          <div>
                            <div className='flex flex-wrap items-center justify-between gap-2 mb-2'>
                            <label className='text-[10px] font-bold text-gray-500 uppercase tracking-wider'>
                              选项（{q.options.length} 个，最少 {MIN_QUESTION_OPTION_COUNT} 个）
                            </label>
                            <div className='flex items-center gap-2'>
                              <button
                                type='button'
                                onClick={() => handleAddOption(q.id)}
                                className='rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100'>
                                + 添加选项
                              </button>
                              {q.questionType === 'LISTENING' && (
                              <button
                                type='button'
                                onClick={() => handleToggleAudioOnly(q.id, !isAudioOnly(q.id))}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                  isAudioOnly(q.id)
                                    ? 'bg-cyan-100 text-cyan-700 border border-cyan-300 shadow-sm'
                                    : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                                }`}>
                                <span className={`inline-block w-3 h-3 rounded-full transition-colors ${
                                  isAudioOnly(q.id) ? 'bg-cyan-500' : 'bg-gray-300'
                                }`} />
                                纯听力选项
                              </button>
                              )}
                            </div>
                            </div>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                              {q.options?.map((opt, i: number) => (
                                <div
                                  key={opt.id}
                                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${opt.isCorrect ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                                  <input
                                    type='radio'
                                    checked={opt.isCorrect}
                                    onChange={() =>
                                      handleUpdateOption(
                                        q.id,
                                        i,
                                        'isCorrect',
                                        true,
                                      )
                                    }
                                    className='w-5 h-5 text-emerald-600 focus:ring-emerald-500 cursor-pointer'
                                  />
                                  <span className='text-sm font-bold text-gray-300'>
                                    {String.fromCharCode(65 + i)}
                                  </span>
                                  {!isAudioOnly(q.id) && (
                                  <input
                                    type='text'
                                    value={opt.text}
                                    onChange={e =>
                                      handleUpdateOption(
                                        q.id,
                                        i,
                                        'text',
                                        e.target.value,
                                      )
                                    }
                                    className='flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-800 outline-none'
                                    placeholder='输入选项'
                                  />
                                  )}
                                  <button
                                    type='button'
                                    disabled={q.options.length <= MIN_QUESTION_OPTION_COUNT}
                                    onClick={() => handleRemoveOption(q.id, i)}
                                    aria-label={`删除选项 ${i + 1}`}
                                    className='shrink-0 rounded-md px-2 py-1 text-xs font-bold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-25'>
                                    删除
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className='text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 block'>
                              解析说明
                            </label>
                            <textarea
                              value={q.explanation || ''}
                              onChange={e =>
                                handleUpdateQuestion(
                                  q.id,
                                  'explanation',
                                  e.target.value,
                                )
                              }
                              className='h-20 w-full resize-none rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm font-medium outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100'
                              placeholder='输入解析，用户作答后可见'
                            />
                          </div>
                        </ActionInterceptor>
                      </div>
                    ) : (
                      <div className='group relative rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-400 md:p-6'>
                        <div className='flex justify-between items-start mb-4 gap-2'>
                          <div className='flex items-center gap-3 flex-wrap'>
                            <ActionInterceptor>
                              <DragHandle />
                            </ActionInterceptor>
                            <span className='bg-gray-800 text-white text-[10px] font-bold px-2 py-0.5 rounded tracking-wider'>
                              Q{index + 1}
                            </span>
                            <QuestionTypeBadge type={q.questionType} />
                          </div>
                          <div className='flex gap-2.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity'>
                            <ActionInterceptor>
                              <button
                                onClick={() => setEditingQuestionId(q.id)}
                                className='text-xs text-indigo-500 hover:text-indigo-700 font-bold bg-indigo-50 px-4 py-2 rounded-xl'>
                                编辑
                              </button>
                            </ActionInterceptor>
                            <ActionInterceptor>
                              <button
                                onClick={() =>
                                  void handleRemoveQuestion(q.id, index)
                                }
                                className='rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 hover:text-red-700'>
                                移除题目
                              </button>
                            </ActionInterceptor>
                          </div>
                        </div>

                        <div className='pl-8'>
                          {/* 语境句 - 听力题不显示 */}
                          {q.questionType !== 'LISTENING' &&
                            supportsSeparateQuestionContext(q.questionType) && (
                          <div className='text-base text-gray-800 font-bold leading-relaxed mb-2'>
                            {q.contextSentence || (
                              <span className='text-red-400 italic font-medium text-sm'>
                                未设置语境句
                              </span>
                            )}
                          </div>
                          )}

                          {/* 题干提示 */}
                          {(q.prompt ||
                            (usesExplicitQuestionTargetWord(q.questionType) &&
                              q.targetWord)) && (
                            <div className='text-xs text-gray-500 font-medium mb-5 flex items-center gap-2'>
                              {usesExplicitQuestionTargetWord(q.questionType) &&
                                q.targetWord && (
                                <span className='bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 rounded font-bold'>
                                  划线词: {q.targetWord}
                                </span>
                              )}
                              {q.prompt}
                            </div>
                          )}

                          {/* 选项展示 (Grid排列) */}
                          {isAudioOnly(q.id) && (
                            <div className='mb-4'>
                              <span className='rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700'>
                                纯听力选项
                              </span>
                            </div>
                          )}
                          <div className='grid grid-cols-1 md:grid-cols-2 gap-3 mt-4'>
                            {q.options?.map((opt, i: number) => (
                              <div
                                key={opt.id}
                                className={`text-sm p-3 rounded-xl border flex justify-between items-center ${opt.isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-600 font-medium'}`}>
                                <span>
                                  <span className='opacity-50 mr-1'>
                                    {String.fromCharCode(65 + i)}.
                                  </span>{' '}
                                  {isAudioOnly(q.id) ? '' : opt.text}
                                </span>
                                {opt.isCorrect && (
                                  <span className='text-emerald-500 font-bold'>
                                    ✅
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    </div>
                  </SortableItem>
                )
              })}
            </SortableList>
          )}
        </div>
      </section>
    </div>
  )
}
