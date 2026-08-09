// app/collections/lesson/[lessonId]/LessonQuestionsPanel.tsx
'use client'

import type { QuestionType } from '@prisma/client'

import {
  SortableList,
  SortableItem,
  DragHandle,
  ActionInterceptor,
} from '@/features/collections/ui/DndSystem'
import { useDialog } from '@/context/DialogContext'
import CustomSelect from '@/components/ui/CustomSelect'
import {
  formatOptionLabel,
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
  type OptionLabelFormat,
} from '@/utils/questions/optionLabels'
import { parseMultiQuizText } from '@/modules/import/domain/quiz-text-parser'
import {
  createDefaultQuestionOptions,
  getQuestionEditorTypeConfig as getTypeConfig,
  updateQuestionField,
  updateQuestionOption,
} from '@/features/questions/domain/editor'
import { useQuestionListEditorState } from '@/features/questions/hooks/useQuestionListEditorState'
import { useQuestionEditorMutations } from '@/features/questions/hooks/useQuestionEditorMutations'
import { useLessonQuestionPageState } from '@/features/questions/hooks/useQuestionEditorPageState'
import QuestionTypeBadge from '@/features/questions/components/QuestionTypeBadge'

// ─── Types ───

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
  prompt?: string | null
  explanation?: string | null
  listeningSectionNumber?: string | null
  optionLabelFormat: OptionLabelFormat
  customOptionLabels: string
  options: EditableOption[]
}

type EditableQuestionField =
  | 'questionType'
  | 'contextSentence'
  | 'targetWord'
  | 'prompt'
  | 'explanation'
  | 'optionLabelFormat'
  | 'customOptionLabels'

export default function LessonQuestionsPanel({
  lessonId,
  initialQuestions,
  defaultListeningSectionNumber = '',
}: {
  lessonId: string
  initialQuestions: EditableQuestion[]
  defaultListeningSectionNumber?: string
}) {
  const dialog = useDialog()
  const { updateLessonQuestions, updateSortOrder } = useQuestionEditorMutations()
  const {
    isSaving,
    setIsSaving,
    questions,
    setQuestions,
    editingQuestionId,
    setEditingQuestionId,
    audioOnlyFlags,
    setAudioOnlyFlags,
  } = useQuestionListEditorState<EditableQuestion>(initialQuestions)
  const initialSectionNumber =
    defaultListeningSectionNumber ||
      initialQuestions.find(question => question.listeningSectionNumber)
        ?.listeningSectionNumber ||
      ''
  const {
    isDirty,
    setIsDirty,
    listeningSectionNumber,
    setListeningSectionNumber,
    showBulkImport,
    setShowBulkImport,
    bulkText,
    setBulkText,
    bulkParsed,
    setBulkParsed,
    quickOptionInputs,
    setQuickOptionInputs,
  } = useLessonQuestionPageState(initialSectionNumber)

  // ─── Add single question ───
  const handleAddNewQuestion = () => {
    const id = `new_${Date.now()}`
    const newQ: EditableQuestion = {
      id,
      questionType: 'LISTENING' as QuestionType,
      contextSentence: '',
      targetWord: '',
      prompt: '',
      explanation: '',
      listeningSectionNumber,
      optionLabelFormat: 'numeric',
      customOptionLabels: '',
      options: createDefaultQuestionOptions(`${id}_opt`, ['', '', '', '']),
    }
    setQuestions([...questions, newQ])
    setEditingQuestionId(newQ.id)
    setIsDirty(true)
  }

  const handleToggleAudioOnly = (questionId: string, enabled: boolean) => {
    setIsDirty(true)
    setAudioOnlyFlags(prev => ({ ...prev, [questionId]: enabled }))
    if (enabled) {
      // Clear all option text when enabling audio-only
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

  const handleQuickOptionInput = (questionId: string, value: string) => {
    setQuickOptionInputs(current => ({ ...current, [questionId]: value }))
    if (!value.trim()) return

    const draft = parseMultiQuizText(value)[0]
    if (!draft || draft.options.length !== 4) return

    setQuestions(current =>
      current.map(question =>
        question.id !== questionId
          ? question
          : {
              ...question,
              prompt: draft.prompt || question.prompt,
              contextSentence:
                draft.contextSentence || question.contextSentence,
              options: question.options.map((option, index) => ({
                ...option,
                text: draft.options[index]?.text || '',
                isCorrect: index === 0,
              })),
            },
      ),
    )
    setAudioOnlyFlags(current => ({ ...current, [questionId]: false }))
    setIsDirty(true)
  }

  // ─── Bulk import ───
  const handleParseBulk = () => {
    const parsed = parseMultiQuizText(bulkText)
    setBulkParsed(parsed)
    if (parsed.length === 0) {
      void dialog.alert('未解析到有效题目，请检查格式。')
    }
  }

  const handleConfirmBulk = () => {
    const newQuestions: EditableQuestion[] = bulkParsed.map((draft, i) => ({
      id: `bulk_${Date.now()}_${i}`,
      questionType: 'LISTENING' as QuestionType,
      contextSentence: draft.contextSentence,
      targetWord: draft.targetWord || '',
      prompt: draft.prompt,
      explanation: draft.explanation,
      listeningSectionNumber,
      optionLabelFormat: 'numeric',
      customOptionLabels: '',
      options: draft.options.map((opt, j) => ({
        id: `bulkopt_${Date.now()}_${i}_${j}`,
        text: opt.text,
        isCorrect: opt.isCorrect,
      })),
    }))
    setQuestions(prev => [...prev, ...newQuestions])
    setIsDirty(true)
    setBulkText('')
    setBulkParsed([])
    setShowBulkImport(false)
    dialog.toast(`已导入 ${newQuestions.length} 道题目`, { tone: 'success' })
  }

  // ─── Update / reorder / remove ───
  const handleUpdateQuestion = (id: string, field: EditableQuestionField, value: string) => {
    setQuestions(current => updateQuestionField(current, id, field, value))
    setIsDirty(true)
  }

  const handleUpdateOption = (qId: string, optIndex: number, field: 'text' | 'isCorrect', value: string | boolean) => {
    setQuestions(current =>
      updateQuestionOption(current, qId, optIndex, field, value),
    )
    setIsDirty(true)
  }

  const handleReorderQuestions = async (orderedIds: string[]) => {
    const reordered = orderedIds
      .map(id => questions.find(q => q.id === id))
      .filter((item): item is EditableQuestion => Boolean(item))
    setQuestions(reordered)
    setIsDirty(true)
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
    setIsDirty(true)
    if (editingQuestionId === questionId) setEditingQuestionId(null)
  }

  // ─── Save ───
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const payload = {
        lessonId,
        listeningSectionNumber,
        questions: questions.map(q => ({
          id: q.id,
          questionType: q.questionType,
          contextSentence: q.contextSentence || '',
          targetWord: q.targetWord || '',
          prompt: q.prompt || '',
          explanation: q.explanation || '',
          optionLabelFormat: q.optionLabelFormat || 'numeric',
          customOptionLabels: q.customOptionLabels || '',
          options: (q.options || []).map(opt => ({
            id: opt.id,
            text: opt.text || '',
            isCorrect: Boolean(opt.isCorrect),
          })),
        })),
      }
      const res = await updateLessonQuestions(payload)
      if (!res.success) {
        await dialog.alert(res.message || '保存失败，请稍后再试。')
        setIsSaving(false)
        return
      }
      dialog.toast('题目已保存', { tone: 'success' })
      setIsDirty(false)
    } finally {
      setIsSaving(false)
    }
  }

  // ─── Render ───
  return (
    <section className='mt-4 rounded-2xl border border-gray-200 bg-white shadow-sm'>
      {/* Header */}
      <div className='sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-gray-100 bg-white/95 p-4 shadow-sm backdrop-blur md:p-5'>
        <div className='flex items-center gap-3'>
          <h2 className='text-lg font-black text-gray-800'>听力题目</h2>
          <span className='rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700'>
            {questions.length} 题
          </span>
          {isDirty && (
            <span className='rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700'>
              有未保存更改
            </span>
          )}
        </div>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <label className='flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600'>
            <span>所属問題</span>
            <input
              type='number'
              min='1'
              step='1'
              value={listeningSectionNumber}
              onChange={event => {
                setListeningSectionNumber(event.target.value)
                setQuestions(current =>
                  current.map(question => ({
                    ...question,
                    listeningSectionNumber: event.target.value,
                  })),
                )
                setIsDirty(true)
              }}
              aria-label='材料所属問題'
              className='h-7 w-14 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-black text-slate-900 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100'
              placeholder='1'
            />
          </label>
          <button
            type='button'
            onClick={() => setShowBulkImport(!showBulkImport)}
            className='ui-btn ui-btn-sm border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'>
            批量导入
          </button>

          <button
            type='button'
            onClick={handleAddNewQuestion}
            className='ui-btn ui-btn-sm flex items-center gap-1.5'>
            <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2.5} d='M12 4v16m8-8H4' />
            </svg>
            新增听力题
          </button>

          <button
            type='button'
            onClick={handleSave}
            disabled={isSaving}
            className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
            {isSaving ? '保存中...' : '保存题目'}
          </button>
        </div>
      </div>

      {/* Bulk import panel */}
      {showBulkImport && (
        <div className='border-b border-gray-100 bg-violet-50/30 p-4 md:p-5 space-y-3'>
          <div className='flex items-center justify-between'>
            <p className='text-sm font-bold text-violet-800'>批量导入题目</p>
            <button onClick={() => { setShowBulkImport(false); setBulkParsed([]) }}
              className='text-xs text-gray-400 hover:text-gray-600'>关闭</button>
          </div>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={8}
            className='w-full rounded-xl border border-violet-200 bg-white p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none'
            placeholder={'粘贴题目文本，支持自动识别题型\n\n格式示例：\n1. 合宿の（　）を決めましょう。\n1 ひにち\n2 ひづけ\n3 にちじ\n4 にっき'}
          />
          <div className='flex items-center justify-between'>
            <button
              onClick={handleParseBulk}
              disabled={!bulkText.trim()}
              className='text-xs px-5 py-2 bg-violet-600 text-white font-bold rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50'>
              解析预览
            </button>
            {bulkParsed.length > 0 && (
              <span className='text-xs font-bold text-violet-700'>
                已解析 {bulkParsed.length} 道题
              </span>
            )}
          </div>
          {bulkParsed.length > 0 && (
            <div className='space-y-2 max-h-60 overflow-y-auto'>
              {bulkParsed.map((draft, i) => {
                const tc = getTypeConfig(draft.questionType)
                return (
                  <div key={i} className='flex items-start gap-2 rounded-xl border border-violet-100 bg-white p-3'>
                    <span className='shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-black text-white'>
                      Q{i + 1}
                    </span>
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-black ${tc.color}`}>
                      {tc.label}
                    </span>
                    <div className='flex-1 text-xs text-gray-700 font-medium leading-relaxed line-clamp-2'>
                      {draft.prompt || '（无题干）'}
                    </div>
                  </div>
                )
              })}
              <button
                onClick={handleConfirmBulk}
                className='w-full text-sm px-5 py-2.5 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-colors'>
                确认导入 {bulkParsed.length} 题
              </button>
            </div>
          )}
        </div>
      )}

      {/* Question list */}
      <div className='p-4 md:p-5'>
        {questions.length === 0 ? (
          <div className='text-center py-16 text-gray-400 font-medium bg-gray-50 rounded-2xl border border-dashed border-gray-200'>
            暂无题目，点击&quot;新增题目&quot;或&quot;批量导入&quot;添加
          </div>
        ) : (
          <SortableList
            items={questions}
            action={handleReorderQuestions}
            className='space-y-4 flex flex-col'>
            {questions.map((q, index) => {
              const isEditing = editingQuestionId === q.id
              const tConfig = getTypeConfig(q.questionType)

              return (
                <SortableItem key={q.id} id={q.id}>
                  {isEditing ? (
                    /* ═══ Editing mode ═══ */
                    <div className={`p-4 md:p-5 rounded-2xl border-2 shadow-sm transition-all ${tConfig.color.split(' ')[0]} border-opacity-50 border-indigo-300`}>
                      <div className='flex justify-between items-center mb-4'>
                        <div className='flex items-center gap-2'>
                          <span className='px-2 py-0.5 rounded text-[10px] font-black bg-gray-900 text-white animate-pulse tracking-wider'>
                            编辑中 Q{index + 1}
                          </span>
                          <QuestionTypeBadge type={q.questionType} />
                        </div>
                        <ActionInterceptor>
                          <button
                            onClick={() => setEditingQuestionId(null)}
                            className='text-xs bg-gray-900 text-white px-5 py-2 rounded-lg font-bold hover:bg-gray-800 shadow-sm transition-colors'>
                            完成
                          </button>
                        </ActionInterceptor>
                      </div>

                      <ActionInterceptor className='space-y-4'>
                        {/* 语境句 - 听力题不显示 */}
                        {q.questionType !== 'LISTENING' && (
                          <div>
                            <label className='text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1 block'>
                              语境句
                            </label>
                            <textarea
                              value={q.contextSentence || ''}
                              onChange={e => handleUpdateQuestion(q.id, 'contextSentence', e.target.value)}
                              className='w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none h-20 shadow-sm'
                              placeholder='请输入这道题的完整语境句'
                            />
                          </div>
                        )}

                        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                          {(q.questionType === 'PRONUNCIATION' ||
                            q.questionType === 'SYNONYM_REPLACEMENT' ||
                            q.questionType === 'WORD_DISTINCTION') && (
                            <div>
                              <label className='text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1 block'>
                                目标词
                              </label>
                              <input
                                type='text'
                                value={q.targetWord || ''}
                                onChange={e => handleUpdateQuestion(q.id, 'targetWord', e.target.value)}
                                className='w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-sm'
                                placeholder='例如：合宿'
                              />
                            </div>
                          )}

                          <div className={
                            q.questionType !== 'PRONUNCIATION' &&
                            q.questionType !== 'SYNONYM_REPLACEMENT' &&
                            q.questionType !== 'WORD_DISTINCTION'
                              ? 'md:col-span-2'
                              : ''
                          }>
                            <label className='text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1 block'>
                              题干
                            </label>
                            <input
                              type='text'
                              value={q.prompt || ''}
                              onChange={e => handleUpdateQuestion(q.id, 'prompt', e.target.value)}
                              className='w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm'
                              placeholder={q.questionType === 'LISTENING' ? '可留空（纯听力时不显示题干）' : '例如：划线部分的读音是？'}
                            />
                          </div>
                        </div>

                        <div>
                          <div className='mb-4 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3'>
                            <label className='mb-2 block text-xs font-black text-cyan-900'>
                              快速填写题目与选项
                            </label>
                            <textarea
                              value={quickOptionInputs[q.id] || ''}
                              onChange={event =>
                                handleQuickOptionInput(q.id, event.target.value)
                              }
                              rows={3}
                              placeholder={'题干（可选）\n1. 选项一  2. 选项二  3. 选项三  4. 选项四'}
                              className='w-full resize-y rounded-lg border border-cyan-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-cyan-300'
                            />
                            {quickOptionInputs[q.id] ? (
                              <p className={`mt-2 text-xs font-semibold ${
                                parseMultiQuizText(quickOptionInputs[q.id]).length > 0
                                  ? 'text-cyan-700'
                                  : 'text-amber-700'
                              }`}>
                                {parseMultiQuizText(quickOptionInputs[q.id]).length > 0
                                  ? '已自动填入下方选项。'
                                  : '尚未识别到完整的 4 个选项。'}
                              </p>
                            ) : null}
                          </div>

                          <div className='flex items-center justify-between mb-1.5'>
                            <label className='text-[10px] font-black text-gray-500 uppercase tracking-wider'>
                              选项（点击单选框设置正确答案）
                            </label>
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
                          {!isAudioOnly(q.id) ? (
                            <div className='mb-3 flex flex-wrap items-center gap-2'>
                              <span className='text-xs font-semibold text-slate-500'>正确答案</span>
                              {[1, 2, 3, 4].map((number, optionIndex) => (
                                <button
                                  key={number}
                                  type='button'
                                  onClick={() =>
                                    handleUpdateOption(
                                      q.id,
                                      optionIndex,
                                      'isCorrect',
                                      true,
                                    )
                                  }
                                  className={`h-8 min-w-8 rounded-lg px-2 text-xs font-black transition ${
                                    q.options[optionIndex]?.isCorrect
                                      ? 'bg-cyan-600 text-white'
                                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                  }`}>
                                  {number}
                                </button>
                              ))}
                            </div>
                          ) : null}
                          <div className='mb-3 grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr]'>
                            <CustomSelect
                              value={q.optionLabelFormat || 'numeric'}
                              onChange={e =>
                                handleUpdateQuestion(
                                  q.id,
                                  'optionLabelFormat',
                                  e.target.value,
                                )
                              }
                              className='h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold'>
                              <option value='numeric'>1、2、3、4（日语默认）</option>
                              <option value='upper-alpha'>A、B、C、D</option>
                              <option value='circled-number'>①、②、③、④</option>
                              <option value='katakana'>ア、イ、ウ、エ</option>
                              <option value='custom'>自定义</option>
                            </CustomSelect>
                            {q.optionLabelFormat === 'custom' ? (
                              <input
                                value={q.customOptionLabels || ''}
                                onChange={e =>
                                  handleUpdateQuestion(
                                    q.id,
                                    'customOptionLabels',
                                    e.target.value,
                                  )
                                }
                                placeholder='例如：Ⅰ|Ⅱ|Ⅲ|Ⅳ'
                                className='h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold'
                              />
                            ) : (
                              <p className='self-center text-xs text-gray-400'>
                                序号只影响显示，不改变答案数据。
                              </p>
                            )}
                          </div>
                          <div className='grid grid-cols-1 md:grid-cols-2 gap-2.5'>
                            {q.options?.map((opt, i) => (
                              <div
                                key={opt.id}
                                className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors ${opt.isCorrect ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-white border-gray-200 shadow-sm'}`}>
                                <input
                                  type='radio'
                                  checked={opt.isCorrect}
                                  onChange={() => handleUpdateOption(q.id, i, 'isCorrect', true)}
                                  className='w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer'
                                />
                                <span className='text-sm font-black text-gray-300'>
                                  {formatOptionLabel(
                                    i,
                                    normalizeOptionLabelFormat(
                                      q.optionLabelFormat,
                                      'numeric',
                                    ),
                                    parseCustomOptionLabels(q.customOptionLabels),
                                  )}
                                </span>
                                {!isAudioOnly(q.id) && (
                                  <input
                                    type='text'
                                    value={opt.text}
                                    onChange={e => handleUpdateOption(q.id, i, 'text', e.target.value)}
                                    className='flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-800 outline-none'
                                    placeholder='输入选项'
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className='text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1 block'>
                            解析说明
                          </label>
                          <textarea
                            value={q.explanation || ''}
                            onChange={e => handleUpdateQuestion(q.id, 'explanation', e.target.value)}
                            className='w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none h-16'
                            placeholder='输入解析，用户作答后可见'
                          />
                        </div>
                      </ActionInterceptor>
                    </div>
                  ) : (
                    /* ═══ Display mode ═══ */
                    <div className='bg-white p-4 md:p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group relative'>
                      <div className='flex justify-between items-start mb-3 gap-2'>
                        <div className='flex items-center gap-2.5 flex-wrap'>
                          <ActionInterceptor>
                            <DragHandle />
                          </ActionInterceptor>
                          <span className='bg-gray-800 text-white text-[10px] font-black px-2 py-0.5 rounded tracking-wider'>
                            Q{index + 1}
                          </span>
                          <QuestionTypeBadge type={q.questionType} />
                        </div>
                        <div className='flex gap-2 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity'>
                          <ActionInterceptor>
                            <button
                              onClick={() => setEditingQuestionId(q.id)}
                              className='text-xs text-indigo-500 hover:text-indigo-700 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg'>
                              编辑
                            </button>
                          </ActionInterceptor>
                          <ActionInterceptor>
                            <button
                              onClick={() => void handleRemoveQuestion(q.id, index)}
                              className='rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100'>
                              移除
                            </button>
                          </ActionInterceptor>
                        </div>
                      </div>

                      <div className='pl-7'>
                        {/* 语境句 - 听力题不显示 */}
                        {q.questionType !== 'LISTENING' && (
                          <div className='text-sm text-gray-800 font-bold leading-relaxed mb-1.5'>
                            {q.contextSentence || (
                              <span className='text-red-400 italic font-medium text-xs'>未设置语境句</span>
                            )}
                          </div>
                        )}
                        {(q.prompt || q.targetWord) && (
                          <div className='text-xs text-gray-500 font-medium mb-3 flex items-center gap-2'>
                            {q.targetWord && (
                              <span className='bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 rounded font-bold'>
                                划线词: {q.targetWord}
                              </span>
                            )}
                            {q.prompt}
                          </div>
                        )}
                        {isAudioOnly(q.id) && (
                          <div className='mb-3'>
                            <span className='rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700'>
                              纯听力选项
                            </span>
                          </div>
                        )}
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-2 mt-3'>
                          {q.options?.map((opt, i) => (
                            <div
                              key={opt.id}
                              className={`text-xs p-2.5 rounded-lg border flex justify-between items-center ${opt.isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-600 font-medium'}`}>
                              <span>
                                <span className='opacity-50 mr-1'>
                                  {formatOptionLabel(
                                    i,
                                    normalizeOptionLabelFormat(
                                      q.optionLabelFormat,
                                      'numeric',
                                    ),
                                    parseCustomOptionLabels(q.customOptionLabels),
                                  )}.
                                </span>{' '}
                                {isAudioOnly(q.id) ? '' : opt.text}
                              </span>
                              {opt.isCorrect && <span className='text-emerald-500 font-black'>✅</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </SortableItem>
              )
            })}
          </SortableList>
        )}
      </div>
    </section>
  )
}
