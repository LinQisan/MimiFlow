// app/collections/lesson/[lessonId]/LessonQuestionsPanel.tsx
'use client'

import type { QuestionType } from '@prisma/client'
import Image from 'next/image'

import {
  SortableList,
  SortableItem,
  DragHandle,
  ActionInterceptor,
} from '@/features/collections/ui/DndSystem'
import { useDialog } from '@/context/DialogContext'
import CustomSelect from '@/components/ui/CustomSelect'
import ToggleSwitch from '@/components/ToggleSwitch'
import {
  formatOptionLabel,
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
  type OptionLabelFormat,
} from '@/utils/questions/optionLabels'
import { parseMultiQuizText } from '@/modules/import/domain/quiz-text-parser'
import {
  createDefaultQuestionOptions,
  createQuestionOption,
  getQuestionEditorTypeConfig as getTypeConfig,
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
  updateQuestionField,
  updateQuestionOption,
} from '@/features/questions/domain/editor'
import { useQuestionListEditorState } from '@/features/questions/hooks/useQuestionListEditorState'
import { useQuestionEditorMutations } from '@/features/questions/hooks/useQuestionEditorMutations'
import { useLessonQuestionPageState } from '@/features/questions/hooks/useQuestionEditorPageState'
import QuestionTypeBadge from '@/features/questions/components/QuestionTypeBadge'
import {
  supportsSeparateQuestionContext,
  usesExplicitQuestionTargetWord,
} from '@/modules/practice/domain/question-text'
import { getToeicPartByQuestionType } from '@/features/questions/domain/toeic'
import ListeningOptionQuickInput from '@/features/questions/components/ListeningOptionQuickInput'

// ─── Types ───

type EditableOption = {
  id: string
  text: string
  imageUrl?: string | null
  isCorrect: boolean
}

type EditableQuestion = {
  id: string
  questionType: QuestionType
  optionKind?: 'text' | 'image'
  contextSentence: string
  targetWord?: string | null
  sortingOrder?: number[]
  prompt?: string | null
  explanation?: string | null
  listeningSectionNumber?: string | null
  optionLabelFormat: OptionLabelFormat
  customOptionLabels: string
  shuffleOptions: boolean
  sourceFileName?: string | null
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
  appearance = 'default',
  draftMode = false,
  language = 'ja',
  defaultQuestionType,
  toeicPartLabel,
  listeningSectionLabel,
  batchFileNames = [],
}: {
  lessonId: string
  initialQuestions: EditableQuestion[]
  defaultListeningSectionNumber?: string
  appearance?: 'default' | 'practice' | 'import'
  draftMode?: boolean
  language?: string
  defaultQuestionType?: QuestionType | string
  toeicPartLabel?: string
  listeningSectionLabel?: string
  batchFileNames?: string[]
}) {
  const practiceAppearance = appearance === 'practice'
  const importAppearance = appearance === 'import'
  const isToeicImport = importAppearance && language === 'en'
  const hasFixedListeningSection =
    importAppearance &&
    Boolean(defaultListeningSectionNumber && listeningSectionLabel)
  const toeicQuestionType = (defaultQuestionType ||
    'TOEIC_PHOTOGRAPH') as QuestionType
  const toeicPart = getToeicPartByQuestionType(toeicQuestionType)
  const batchMode = draftMode && batchFileNames.length > 1
  const defaultQuestionsPerMaterial =
    toeicQuestionType === 'TOEIC_CONVERSATIONS' ||
    toeicQuestionType === 'TOEIC_TALKS'
      ? 3
      : 1
  const createDraftQuestion = (
    sourceFileName: string | null = null,
    sequence = 0,
  ): EditableQuestion => {
    const id = `new_${Date.now()}_${sequence}`
    const defaultOptionCount =
      toeicQuestionType === 'TOEIC_QUESTION_RESPONSE'
        ? 3
        : Number(defaultListeningSectionNumber) === 4
          ? 3
          : 4
    return {
      id,
      questionType: (isToeicImport
        ? toeicQuestionType
        : 'LISTENING') as QuestionType,
      optionKind: 'text',
      contextSentence: '',
      targetWord: '',
      sortingOrder: [],
      prompt: '',
      explanation: '',
      listeningSectionNumber: defaultListeningSectionNumber,
      optionLabelFormat: isToeicImport ? 'upper-alpha' : 'numeric',
      customOptionLabels: '',
      shuffleOptions:
        !isToeicImport && Number(defaultListeningSectionNumber) !== 3,
      sourceFileName,
      options: createDefaultQuestionOptions(
        `${id}_opt`,
        Array.from({ length: defaultOptionCount }, () => ''),
      ),
    }
  }
  const initialEditorQuestions =
    initialQuestions.length > 0 || !batchMode
      ? initialQuestions
      : batchFileNames.flatMap((fileName, fileIndex) =>
          Array.from({ length: defaultQuestionsPerMaterial }, (_, index) =>
            createDraftQuestion(
              fileName,
              fileIndex * defaultQuestionsPerMaterial + index,
            ),
          ),
        )
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
  } = useQuestionListEditorState<EditableQuestion>(initialEditorQuestions)
  const initialSectionNumber =
    defaultListeningSectionNumber ||
      initialQuestions.find(question => question.listeningSectionNumber)
        ?.listeningSectionNumber ||
      (isToeicImport ? String(toeicPart?.part || 1) : '')
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
    questionsPerMaterial,
    setQuestionsPerMaterial,
  } = useLessonQuestionPageState(
    initialSectionNumber,
    defaultQuestionsPerMaterial,
  )

  // ─── Add single question ───
  const handleAddNewQuestion = () => {
    const id = `new_${Date.now()}_single`
    const defaultOptionCount =
      toeicQuestionType === 'TOEIC_QUESTION_RESPONSE'
        ? 3
        : Number(listeningSectionNumber) === 4
          ? 3
          : 4
    const newQ: EditableQuestion = {
      id,
      questionType: (isToeicImport
        ? toeicQuestionType
        : 'LISTENING') as QuestionType,
      optionKind: 'text',
      contextSentence: '',
      targetWord: '',
      sortingOrder: [],
      prompt: '',
      explanation: '',
      listeningSectionNumber,
      optionLabelFormat: isToeicImport ? 'upper-alpha' : 'numeric',
      customOptionLabels: '',
      shuffleOptions: !isToeicImport && Number(listeningSectionNumber) !== 3,
      sourceFileName: null,
      options: createDefaultQuestionOptions(
        `${id}_opt`,
        Array.from(
          { length: defaultOptionCount },
          () => '',
        ),
      ),
    }
    setQuestions([...questions, newQ])
    if (toeicQuestionType === 'TOEIC_QUESTION_RESPONSE') {
      setAudioOnlyFlags(current => ({ ...current, [id]: true }))
    }
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

  const handleImagePaste = (
    event: React.ClipboardEvent<HTMLDivElement>,
    inputName: string,
  ) => {
    const imageItem = Array.from(event.clipboardData.items).find(
      item => item.kind === 'file' && item.type.startsWith('image/'),
    )
    if (!imageItem) return

    const image = imageItem.getAsFile()
    if (!image) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) {
      event.preventDefault()
      dialog.toast('剪贴板图片仅支持 JPG、PNG 或 WebP', { tone: 'error' })
      return
    }

    const input = event.currentTarget.querySelector<HTMLInputElement>(
      `input[name="${inputName}"]`,
    )
    if (!input) return

    event.preventDefault()
    const extension =
      image.type === 'image/jpeg'
        ? 'jpg'
        : image.type === 'image/webp'
          ? 'webp'
          : 'png'
    const clipboardImage = new File([image], `clipboard.${extension}`, {
      type: image.type,
      lastModified: Date.now(),
    })
    const transfer = new DataTransfer()
    transfer.items.add(clipboardImage)
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    dialog.toast('已读取剪贴板图片', { tone: 'success' })
  }

  const isAudioOnly = (questionId: string) => Boolean(audioOnlyFlags[questionId])

  const isImageOptionQuestion = (question: EditableQuestion) =>
    question.optionKind === 'image' ||
    question.options.some(option => Boolean(option.imageUrl))

  const handleOptionKindChange = (
    questionId: string,
    optionKind: 'text' | 'image',
  ) => {
    setQuestions(current =>
      current.map(question =>
        question.id === questionId
          ? { ...question, optionKind }
          : question,
      ),
    )
    if (optionKind === 'image') {
      setAudioOnlyFlags(current => ({ ...current, [questionId]: false }))
    }
    setIsDirty(true)
  }

  // ─── Bulk import ───
  const handleParseBulk = () => {
    const parsed = parseMultiQuizText(bulkText)
    setBulkParsed(parsed)
    if (parsed.length === 0) {
      void dialog.alert('未解析到有效题目，请检查格式。')
      return
    }
    if (
      batchMode &&
      parsed.length !== batchFileNames.length * questionsPerMaterial
    ) {
      void dialog.alert(
        `当前有 ${batchFileNames.length} 份材料，每份 ${questionsPerMaterial} 题，应填写 ${batchFileNames.length * questionsPerMaterial} 道题；目前识别到 ${parsed.length} 道。`,
      )
    }
  }

  const handleConfirmBulk = () => {
    if (
      batchMode &&
      bulkParsed.length !== batchFileNames.length * questionsPerMaterial
    ) {
      void dialog.alert('题目数量与批量材料数量不一致，请调整后重新解析。')
      return
    }
    const newQuestions: EditableQuestion[] = bulkParsed.map((draft, i) => ({
      id: `bulk_${Date.now()}_${i}`,
      questionType: (isToeicImport
        ? toeicQuestionType
        : 'LISTENING') as QuestionType,
      optionKind: 'text',
      contextSentence: draft.contextSentence,
      targetWord: draft.targetWord || '',
      sortingOrder: draft.sortingOrder || [],
      prompt: draft.prompt,
      explanation: draft.explanation,
      listeningSectionNumber,
      optionLabelFormat: isToeicImport ? 'upper-alpha' : 'numeric',
      customOptionLabels: '',
      shuffleOptions:
        !isToeicImport && Number(listeningSectionNumber) !== 3,
      sourceFileName: batchMode
        ? batchFileNames[Math.floor(i / questionsPerMaterial)]
        : null,
      options: draft.options.map((opt, j) => ({
        id: `bulkopt_${Date.now()}_${i}_${j}`,
        text: opt.text,
        isCorrect: opt.isCorrect,
      })),
    }))
    setQuestions(prev => (batchMode ? newQuestions : [...prev, ...newQuestions]))
    setIsDirty(true)
    setBulkText('')
    setBulkParsed([])
    setShowBulkImport(false)
    dialog.toast(`已导入 ${newQuestions.length} 道题目`, { tone: 'success' })
  }

  const handleQuestionsPerMaterialChange = (nextCount: number) => {
    setQuestionsPerMaterial(nextCount)
    setQuestions(current =>
      batchFileNames.flatMap((fileName, fileIndex) => {
        const existing = current.filter(
          question => question.sourceFileName === fileName,
        )
        return Array.from({ length: nextCount }, (_, questionIndex) =>
          existing[questionIndex]
            ? existing[questionIndex]
            : {
                ...createDraftQuestion(
                  fileName,
                  fileIndex * nextCount + questionIndex,
                ),
                listeningSectionNumber,
              },
        )
      }),
    )
    setBulkParsed([])
    setIsDirty(true)
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
    setIsDirty(true)
  }

  const handleRecognizedOptions = (
    questionId: string,
    optionTexts: string[],
  ) => {
    setQuestions(current =>
      current.map(question => {
        if (question.id !== questionId) return question
        const currentCorrectIndex = Math.max(
          0,
          question.options.findIndex(option => option.isCorrect),
        )
        const correctIndex = Math.min(
          currentCorrectIndex,
          optionTexts.length - 1,
        )
        return {
          ...question,
          optionKind: 'text',
          options: optionTexts.map((text, index) => ({
            id:
              question.options[index]?.id ||
              `${question.id}_recognized_${index + 1}`,
            text,
            imageUrl: null,
            isCorrect: index === correctIndex,
          })),
        }
      }),
    )
    setAudioOnlyFlags(current => ({ ...current, [questionId]: false }))
    setIsDirty(true)
    dialog.toast(`已识别 ${optionTexts.length} 个选项`, { tone: 'success' })
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
    setIsDirty(true)
  }

  const handleReorderQuestions = async (orderedIds: string[]) => {
    const reordered = orderedIds
      .map(id => questions.find(q => q.id === id))
      .filter((item): item is EditableQuestion => Boolean(item))
    setQuestions(reordered)
    setIsDirty(true)
    if (draftMode) return { success: true as const }
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
          optionKind: q.optionKind || (isImageOptionQuestion(q) ? 'image' : 'text'),
          contextSentence: q.contextSentence || '',
          targetWord: q.targetWord || '',
          sortingOrder: q.sortingOrder || [],
          prompt: q.prompt || '',
          explanation: q.explanation || '',
          optionLabelFormat: q.optionLabelFormat || 'numeric',
          customOptionLabels: q.customOptionLabels || '',
          shuffleOptions: q.shuffleOptions,
          options: (q.options || []).map(opt => ({
            id: opt.id,
            text: opt.text || '',
            imageUrl: opt.imageUrl || null,
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
    <section
      className={
        practiceAppearance
          ? 'mt-0 overflow-hidden rounded-2xl border border-slate-200 bg-white'
          : importAppearance
            ? 'mt-0 border-b border-slate-200 py-5'
          : 'mt-4 rounded-2xl border border-gray-200 bg-white shadow-sm'
      }>
      {draftMode ? (
        <input
          type='hidden'
          name='listeningQuestionsJson'
          value={JSON.stringify({
            listeningSectionNumber,
            listeningSectionTitle: listeningSectionLabel || '',
            questions,
          })}
        />
      ) : null}
      {/* Header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-b ${
          importAppearance ? 'px-0 pb-4' : 'p-4 md:p-5'
        } ${
          practiceAppearance
            ? 'border-slate-100 bg-white shadow-none'
            : importAppearance
              ? 'border-slate-200 bg-transparent'
            : 'rounded-t-2xl border-gray-100 bg-white shadow-sm'
        }`}>
        <div className='flex items-center gap-3'>
          <h2 className={`${importAppearance ? 'text-base' : 'text-lg'} font-bold tracking-tight text-slate-950`}>
            {importAppearance
              ? '添加题目'
              : practiceAppearance
                ? '题目'
                : '听力题目'}
          </h2>
          {batchMode ? (
            <span className='text-xs font-semibold text-slate-500'>
              {batchFileNames.length} 份材料 · 同一题型
            </span>
          ) : null}
          {questions.length > 0 ? (
            <span
              className={
                practiceAppearance
                  ? 'rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600'
                  : importAppearance
                    ? 'text-xs font-semibold text-slate-400'
                    : 'rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700'
              }>
              {questions.length} 题
            </span>
          ) : null}
          {isDirty && (
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                draftMode
                  ? 'border-slate-200 bg-slate-50 text-slate-500'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}>
              {draftMode ? '待导入' : '未保存'}
            </span>
          )}
        </div>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          {!isToeicImport && !hasFixedListeningSection ? (
          <label className='flex h-8 items-center gap-1.5 px-1 text-xs font-bold text-slate-500'>
            <span>問題</span>
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
              className='!h-8 !min-h-0 !w-10 !rounded-none border-0 border-b border-slate-300 bg-transparent px-1 py-0 text-center text-sm font-black leading-none text-slate-900 outline-none focus:border-slate-900 focus:ring-0'
              placeholder='1'
            />
          </label>
          ) : (
            <span className='text-xs font-bold text-slate-500'>
              {listeningSectionLabel ||
                toeicPartLabel ||
                'Part 1 · Photographs'}
            </span>
          )}
          {batchMode ? (
            <label className='flex h-8 items-center gap-1.5 text-xs font-bold text-slate-500'>
              <span>每份</span>
              <CustomSelect
                value={String(questionsPerMaterial)}
                onChange={event =>
                  handleQuestionsPerMaterialChange(Number(event.target.value))
                }
                aria-label='每份材料题数'
                className='h-8 w-20 border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700'>
                {[1, 2, 3, 4, 5].map(count => (
                  <option key={count} value={count}>
                    {count} 题
                  </option>
                ))}
              </CustomSelect>
            </label>
          ) : null}
          {!isToeicImport || batchMode ? (
            <button
              type='button'
              onClick={() => setShowBulkImport(!showBulkImport)}
              className={practiceAppearance || importAppearance
                ? 'ui-btn ui-btn-sm'
                : 'ui-btn ui-btn-sm border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'}>
              批量填写
            </button>
          ) : null}

          {!batchMode ? (
            <button
              type='button'
              onClick={handleAddNewQuestion}
              className='ui-btn ui-btn-sm flex items-center gap-1.5'>
              <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2.5} d='M12 4v16m8-8H4' />
              </svg>
              新增
            </button>
          ) : null}

          {!draftMode ? (
            <button
              type='button'
              onClick={handleSave}
              className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'
              disabled={isSaving || questions.length === 0 || !isDirty}>
              {isSaving ? '保存中...' : '保存'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Bulk import panel */}
      {showBulkImport && (
        <div className={importAppearance
          ? 'space-y-3 border-y border-slate-200 py-5'
          : 'space-y-3 border-b border-slate-100 bg-slate-50 p-4 md:p-5'}>
          <div className='flex items-center justify-between'>
            <div>
              <p className='text-sm font-bold text-slate-800'>批量填写题目</p>
              {batchMode ? (
                <p className='mt-1 text-xs text-slate-500'>
                  按上方文件顺序分配，共需{' '}
                  {batchFileNames.length * questionsPerMaterial} 道题
                </p>
              ) : null}
            </div>
            <button onClick={() => { setShowBulkImport(false); setBulkParsed([]) }}
              className='text-xs text-gray-400 hover:text-gray-600'>关闭</button>
          </div>
          <textarea
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            rows={8}
            className={`w-full resize-none border border-slate-200 bg-white p-3 text-sm font-medium outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 ${importAppearance ? '!rounded-none' : 'rounded-xl'}`}
            placeholder={'粘贴题目文本，支持自动识别题型\n\n格式示例：\n1. 合宿の（　）を決めましょう。\n1 ひにち\n2 ひづけ\n3 にちじ\n4 にっき'}
          />
          <div className='flex items-center justify-between'>
            <button
              onClick={handleParseBulk}
              disabled={!bulkText.trim()}
              className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
              解析预览
            </button>
            {bulkParsed.length > 0 && (
              <span className='text-xs font-bold text-slate-600'>
                已解析 {bulkParsed.length} 道题
              </span>
            )}
          </div>
          {bulkParsed.length > 0 && (
            <div className='space-y-2 max-h-60 overflow-y-auto'>
              {bulkParsed.map((draft, i) => {
                const tc = getTypeConfig(draft.questionType)
                return (
                  <div key={i} className={importAppearance
                    ? 'flex items-start gap-2 border-b border-slate-200 py-3'
                    : 'flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3'}>
                    <span className={`shrink-0 bg-gray-800 px-1.5 py-0.5 text-[10px] font-black text-white ${importAppearance ? '' : 'rounded'}`}>
                      Q{i + 1}
                    </span>
                    <span className={`shrink-0 border px-1.5 py-0.5 text-[10px] font-black ${importAppearance ? '' : 'rounded'} ${tc.color}`}>
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
                className='ui-btn ui-btn-primary w-full'>
                确认导入 {bulkParsed.length} 题
              </button>
            </div>
          )}
        </div>
      )}

      {/* Question list */}
      <div className={importAppearance ? 'p-0' : 'p-4 md:p-5'}>
        {questions.length === 0 ? (
          <div className={`flex min-h-24 items-center justify-center px-4 py-6 text-center text-sm font-medium text-slate-400 ${importAppearance ? 'border-y border-slate-200' : 'bg-slate-50'}`}>
            点击“新增”开始填写
          </div>
        ) : (
          <SortableList
            items={questions}
            action={handleReorderQuestions}
            className='flex flex-col space-y-3'>
            {questions.map((q, index) => {
              const isEditing = batchMode || editingQuestionId === q.id
              const compactBatchAnswerEditor =
                batchMode && q.questionType === 'TOEIC_QUESTION_RESPONSE'
              const tConfig = getTypeConfig(q.questionType)
              const imageOptions = isImageOptionQuestion(q)

              return (
                <SortableItem key={q.id} id={q.id}>
                  {isEditing ? (
                    /* ═══ Editing mode ═══ */
                    <div className={importAppearance ? 'bg-transparent' : 'border-y border-slate-300 bg-white'}>
                      <div className={`flex items-center justify-between gap-3 border-b border-slate-200 ${importAppearance ? 'bg-transparent px-0 py-3' : 'bg-white px-1 py-2.5 md:px-2'}`}>
                        <div className='flex min-w-0 items-center gap-2'>
                          <span className='text-sm font-black text-slate-900'>
                            题目 {index + 1}
                          </span>
                          {q.sourceFileName ? (
                            <span className='max-w-64 truncate text-xs font-semibold text-slate-500'>
                              {q.sourceFileName}
                            </span>
                          ) : null}
                          <span className='text-xs font-semibold text-slate-400'>
                            {tConfig.label}
                          </span>
                        </div>
                        {!batchMode &&
                        !(draftMode && q.questionType === 'TOEIC_PHOTOGRAPH') ? (
                          <ActionInterceptor>
                            <button
                              onClick={() => setEditingQuestionId(null)}
                              className='ui-btn ui-btn-sm'>
                              收起
                            </button>
                          </ActionInterceptor>
                        ) : null}
                      </div>

                      {compactBatchAnswerEditor ? (
                        <div className='flex flex-wrap items-center gap-3 border-b border-slate-200 py-3'>
                          <span className='mr-1 text-xs font-semibold text-slate-500'>
                            正确答案
                          </span>
                          <div className='flex items-center gap-2'>
                            {q.options.map((opt, optionIndex) => {
                              const optionLabel = String.fromCharCode(
                                65 + optionIndex,
                              )

                              return (
                                <button
                                  key={opt.id}
                                  type='button'
                                  aria-label={`题目 ${index + 1} 正确答案 ${optionLabel}`}
                                  aria-pressed={opt.isCorrect}
                                  onClick={() =>
                                    handleUpdateOption(
                                      q.id,
                                      optionIndex,
                                      'isCorrect',
                                      true,
                                    )
                                  }
                                  className={`flex h-10 min-w-12 items-center justify-center border px-4 text-sm font-bold transition-colors ${
                                    opt.isCorrect
                                      ? 'border-slate-900 bg-slate-900 text-white'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900'
                                  }`}>
                                  {optionLabel}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className={importAppearance ? 'space-y-5 py-4' : 'space-y-5 p-4 md:p-5'}>
                        {q.questionType === 'TOEIC_PHOTOGRAPH' ? (
                          <div
                            tabIndex={0}
                            onPaste={event =>
                              handleImagePaste(
                                event,
                                `listeningQuestionImage_${index}`,
                              )
                            }
                            className='border-b border-slate-200 pb-5 outline-none focus:border-slate-400'>
                            <label className='mb-2 block text-xs font-semibold text-slate-600'>
                              题目图片
                            </label>
                            <input
                              type='file'
                              name={`listeningQuestionImage_${index}`}
                              accept='image/jpeg,image/png,image/webp'
                              required={draftMode}
                              className='block w-full border border-slate-200 bg-white p-2 text-sm text-slate-600 file:mr-3 file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white'
                            />
                            <p className='mt-2 text-xs text-slate-400'>
                              选择文件，或点击此区域后按 ⌘V / Ctrl+V 粘贴图片。
                            </p>
                          </div>
                        ) : null}
                        {/* 语境句 - 听力题不显示 */}
                        {q.questionType !== 'LISTENING' &&
                          q.questionType !== 'TOEIC_PHOTOGRAPH' &&
                          supportsSeparateQuestionContext(q.questionType) && (
                          <div>
                            <label className='mb-1.5 block text-xs font-semibold text-slate-600'>
                              语境句（可选）
                            </label>
                            <textarea
                              value={q.contextSentence || ''}
                              onChange={e => handleUpdateQuestion(q.id, 'contextSentence', e.target.value)}
                              className='h-20 w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                              placeholder='仅在内容与题干不同时填写'
                            />
                          </div>
                        )}

                        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                          {usesExplicitQuestionTargetWord(q.questionType) && (
                            <div>
                              <label className='mb-1.5 block text-xs font-semibold text-slate-600'>
                                目标词
                              </label>
                              <input
                                type='text'
                                value={q.targetWord || ''}
                                onChange={e => handleUpdateQuestion(q.id, 'targetWord', e.target.value)}
                                className='w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-medium outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                                placeholder='例如：合宿'
                              />
                            </div>
                          )}

                          <div className={
                            !usesExplicitQuestionTargetWord(q.questionType)
                              ? 'md:col-span-2'
                              : ''
                          }>
                            <label className='mb-1.5 block text-xs font-semibold text-slate-600'>
                              题干
                            </label>
                            <input
                              type='text'
                              value={q.prompt || ''}
                              onChange={e => handleUpdateQuestion(q.id, 'prompt', e.target.value)}
                              className='w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-medium outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                              placeholder={q.questionType === 'LISTENING' || q.questionType === 'TOEIC_PHOTOGRAPH' ? '可留空' : '例如：划线部分的读音是？'}
                            />
                          </div>
                        </div>

                        <section className='!rounded-none border-0'>
                          <div className='flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5'>
                            <div>
                              <h4 className='text-xs font-bold text-slate-700'>
                                选项 · {q.options.length}
                              </h4>
                              <p className='mt-0.5 text-[11px] text-slate-400'>
                                选择圆点设置正确答案
                              </p>
                            </div>
                            <div className='flex flex-wrap items-center gap-2'>
                              {draftMode && language === 'ja' && q.questionType === 'LISTENING' ? (
                                <div className='flex border border-slate-200 bg-white p-0.5'>
                                  {(['text', 'image'] as const).map(optionKind => (
                                    <button
                                      key={optionKind}
                                      type='button'
                                      onClick={() => handleOptionKindChange(q.id, optionKind)}
                                      className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                                        imageOptions === (optionKind === 'image')
                                          ? 'bg-slate-900 text-white'
                                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                      }`}>
                                      {optionKind === 'text' ? '文字选项' : '图片选项'}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                              <button
                                type='button'
                                onClick={() => handleAddOption(q.id)}
                                className='ui-btn ui-btn-sm'>
                                添加选项
                              </button>
                            </div>
                          </div>
                          <div className='flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2'>
                            <div className='w-full sm:w-48'>
                              <CustomSelect
                                value={q.optionLabelFormat || 'numeric'}
                                onChange={e =>
                                  handleUpdateQuestion(
                                    q.id,
                                    'optionLabelFormat',
                                    e.target.value,
                                  )
                                }
                                aria-label='选项序号'
                                className='h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700'>
                                <option value='numeric'>序号：1、2、3、4</option>
                                <option value='upper-alpha'>序号：A、B、C、D</option>
                                <option value='circled-number'>序号：①、②、③、④</option>
                                <option value='katakana'>序号：ア、イ、ウ、エ</option>
                                <option value='custom'>自定义序号</option>
                              </CustomSelect>
                            </div>
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
                                placeholder='Ⅰ|Ⅱ|Ⅲ|Ⅳ'
                                aria-label='自定义选项序号'
                                className='h-8 min-w-44 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400'
                              />
                            ) : null}
                            <div className='ml-auto flex items-center gap-2'>
                              <ToggleSwitch
                                label='选项乱序'
                                checked={
                                  Number(listeningSectionNumber) !== 3 &&
                                  q.shuffleOptions
                                }
                                disabled={Number(listeningSectionNumber) === 3}
                                onChange={checked => {
                                  setQuestions(current =>
                                    current.map(question =>
                                      question.id === q.id
                                        ? { ...question, shuffleOptions: checked }
                                        : question,
                                    ),
                                  )
                                  setIsDirty(true)
                                }}
                              />
                              {(q.questionType === 'LISTENING' ||
                                q.questionType === 'TOEIC_PHOTOGRAPH') &&
                                !imageOptions && (
                                <ToggleSwitch
                                  label='纯听力选项'
                                  checked={isAudioOnly(q.id)}
                                  onChange={checked =>
                                    handleToggleAudioOnly(q.id, checked)
                                  }
                                />
                              )}
                            </div>
                          </div>
                          {draftMode &&
                          language === 'ja' &&
                          q.questionType === 'LISTENING' &&
                          !imageOptions ? (
                            <ListeningOptionQuickInput
                              onRecognize={options =>
                                handleRecognizedOptions(q.id, options)
                              }
                            />
                          ) : null}
                          <div className='divide-y divide-slate-200'>
                            {q.options?.map((opt, i) => (
                              <div
                                key={opt.id}
                                className={`flex min-h-12 items-center gap-2 border-l-[3px] px-3 transition-colors ${
                                  opt.isCorrect
                                    ? 'border-l-slate-900 bg-slate-50'
                                    : 'border-l-transparent bg-white hover:bg-slate-50/60'
                                }`}>
                                <input
                                  type='radio'
                                  name={`correct-option-${q.id}`}
                                  aria-label={`设为正确答案 ${i + 1}`}
                                  checked={opt.isCorrect}
                                  onChange={() => handleUpdateOption(q.id, i, 'isCorrect', true)}
                                  className='h-4 w-4 shrink-0 cursor-pointer accent-slate-900'
                                />
                                <span className='w-5 shrink-0 text-center text-xs font-bold text-slate-400'>
                                  {formatOptionLabel(
                                    i,
                                    normalizeOptionLabelFormat(
                                      q.optionLabelFormat,
                                      'numeric',
                                    ),
                                    parseCustomOptionLabels(q.customOptionLabels),
                                  )}
                                </span>
                                {imageOptions ? (
                                  <div
                                    tabIndex={0}
                                    onPaste={event =>
                                      handleImagePaste(
                                        event,
                                        `listeningQuestionOptionImage_${index}_${i}`,
                                      )
                                    }
                                    className='min-w-0 flex-1 py-2 outline-none focus:bg-slate-50'>
                                    {draftMode ? (
                                      <>
                                        <input
                                          type='file'
                                          name={`listeningQuestionOptionImage_${index}_${i}`}
                                          accept='image/jpeg,image/png,image/webp'
                                          required={!opt.imageUrl}
                                          className='block w-full text-xs text-slate-500 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-700 hover:file:bg-slate-200'
                                        />
                                        <p className='mt-1 text-[11px] text-slate-400'>
                                          选择图片，或聚焦此处后粘贴
                                        </p>
                                      </>
                                    ) : opt.imageUrl ? (
                                      <Image
                                        src={opt.imageUrl}
                                        alt={`选项 ${i + 1}`}
                                        width={320}
                                        height={180}
                                        unoptimized
                                        className='max-h-36 w-auto max-w-full object-contain'
                                      />
                                    ) : (
                                      <span className='text-xs text-slate-400'>未上传图片</span>
                                    )}
                                  </div>
                                ) : !isAudioOnly(q.id) ? (
                                  <input
                                    type='text'
                                    value={opt.text}
                                    onChange={e => handleUpdateOption(q.id, i, 'text', e.target.value)}
                                    className='min-w-0 flex-1 !rounded-none border-0 bg-transparent py-2 text-sm font-medium text-slate-800 outline-none focus:ring-0'
                                    placeholder='输入选项'
                                  />
                                ) : null}
                                <button
                                  type='button'
                                  disabled={q.options.length <= MIN_QUESTION_OPTION_COUNT}
                                  onClick={() => handleRemoveOption(q.id, i)}
                                  aria-label={`删除选项 ${i + 1}`}
                                  className='shrink-0 rounded-md px-2 py-1 text-base font-medium text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-25'>
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </section>

                        <div>
                          <label className='mb-1.5 block text-xs font-semibold text-slate-600'>
                            解析（可选）
                          </label>
                          <textarea
                            value={q.explanation || ''}
                            onChange={e => handleUpdateQuestion(q.id, 'explanation', e.target.value)}
                            className='h-20 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm font-medium outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                            placeholder='输入解析，用户作答后可见'
                          />
                        </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ═══ Display mode ═══ */
                    <div className={practiceAppearance
                      ? 'group relative rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_16px_38px_-30px_rgba(15,23,42,0.45)] md:p-5'
                      : importAppearance
                        ? 'group relative bg-white py-4'
                      : 'bg-white p-4 md:p-5 rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group relative'}>
                      <div className='flex justify-between items-start mb-3 gap-2'>
                        <div className='flex items-center gap-2.5 flex-wrap'>
                          <ActionInterceptor>
                            <DragHandle />
                          </ActionInterceptor>
                          <span className={importAppearance
                            ? 'text-sm font-bold text-slate-900'
                            : 'bg-gray-800 text-white text-[10px] font-black px-2 py-0.5 rounded tracking-wider'}>
                            {importAppearance ? index + 1 : `Q${index + 1}`}
                          </span>
                          {q.sourceFileName ? (
                            <span className='max-w-72 truncate text-xs font-semibold text-slate-500'>
                              {q.sourceFileName}
                            </span>
                          ) : null}
                          {!importAppearance ? <QuestionTypeBadge type={q.questionType} /> : null}
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
                        {(q.prompt ||
                          (usesExplicitQuestionTargetWord(q.questionType) &&
                            q.targetWord)) && (
                          <div className='text-xs text-gray-500 font-medium mb-3 flex items-center gap-2'>
                            {usesExplicitQuestionTargetWord(q.questionType) &&
                              q.targetWord && (
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
                        <div className={importAppearance
                          ? imageOptions
                            ? 'mt-3 grid grid-cols-2 gap-3 md:grid-cols-4'
                            : 'mt-3 divide-y divide-slate-200 border-y border-slate-200'
                          : 'mt-3 grid grid-cols-1 gap-2 md:grid-cols-2'}>
                          {q.options?.map((opt, i) => (
                            <div
                              key={opt.id}
                              className={importAppearance
                                ? imageOptions
                                  ? `relative flex min-h-28 items-center justify-center border p-2 text-xs ${opt.isCorrect ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'}`
                                  : `flex items-center justify-between px-1 py-3 text-xs ${opt.isCorrect ? 'font-bold text-emerald-800' : 'font-medium text-gray-600'}`
                                : `flex items-center justify-between rounded-lg border p-2.5 text-xs ${opt.isCorrect ? 'border-emerald-200 bg-emerald-50 font-bold text-emerald-800 shadow-sm' : 'border-gray-100 bg-gray-50 font-medium text-gray-600'}`}>
                              {imageOptions && opt.imageUrl ? (
                                <Image
                                  src={opt.imageUrl}
                                  alt={`选项 ${i + 1}`}
                                  width={320}
                                  height={180}
                                  unoptimized
                                  className='max-h-32 w-full object-contain'
                                />
                              ) : (
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
                              )}
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
