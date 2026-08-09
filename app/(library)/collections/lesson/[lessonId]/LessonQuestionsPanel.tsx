// app/collections/lesson/[lessonId]/LessonQuestionsPanel.tsx
'use client'

import { useState, useEffect } from 'react'
import type { QuestionType } from '@prisma/client'

import {
  SortableList,
  SortableItem,
  DragHandle,
  ActionInterceptor,
} from '@/app/(library)/collections/DndSystem'
import { updateLessonQuestions } from '@/modules/content/actions/materials'
import { updateSortOrder } from '@/modules/practice/actions/questions'
import { useDialog } from '@/context/DialogContext'
import CustomSelect from '@/components/ui/CustomSelect'
import {
  formatOptionLabel,
  normalizeOptionLabelFormat,
  parseCustomOptionLabels,
  type OptionLabelFormat,
} from '@/utils/questions/optionLabels'
import { getQuestionTypeLabel } from '@/utils/questions/typeLabels'

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

// ─── Helpers ───

const CIRCLED_NUM_TO_INDEX: Record<string, number> = {
  '①': 0, '②': 1, '③': 2, '④': 3,
}

const getTypeConfig = (type: string) => {
  switch (type) {
    case 'LISTENING':
      return { label: getQuestionTypeLabel(type), color: 'bg-cyan-50 text-cyan-700 border-cyan-100' }
    case 'PRONUNCIATION':
      return { label: getQuestionTypeLabel(type), color: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
    case 'SYNONYM_REPLACEMENT':
      return { label: getQuestionTypeLabel(type), color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100' }
    case 'FILL_BLANK':
      return { label: getQuestionTypeLabel(type), color: 'bg-indigo-50 text-indigo-700 border-indigo-100' }
    case 'GRAMMAR':
      return { label: getQuestionTypeLabel(type), color: 'bg-sky-50 text-sky-700 border-sky-100' }
    case 'WORD_DISTINCTION':
      return { label: getQuestionTypeLabel(type), color: 'bg-teal-50 text-teal-700 border-teal-100' }
    case 'SORTING':
      return { label: getQuestionTypeLabel(type), color: 'bg-orange-50 text-orange-700 border-orange-100' }
    case 'READING_COMPREHENSION':
      return { label: getQuestionTypeLabel(type), color: 'bg-purple-50 text-purple-700 border-purple-100' }
    default:
      return { label: '普通题', color: 'bg-gray-50 text-gray-700 border-gray-100' }
  }
}

// ─── Text parser (subset of UploadCenterUI parseMultiQuizText) ───

const detectQuestionType = (
  prompt: string,
  options: string[] = [],
): QuestionType => {
  const text = `${prompt}\n${options.join('\n')}`
  const isSorting = /★|＊/.test(text)
  const isFillBlank =
    /[（(][\s　]*[）)]|__{2,}|～|\[\d+\]|［\d+］|【\d+】|「\d+」|『\d+』/.test(prompt)
  const grammarHint = /文法|語法|语法|助詞|助词|接続|接续|活用/.test(prompt)
  const compactPrompt = prompt.replace(/\s+/g, '').trim()
  const sentenceLikeOptionCount = options.filter(
    item => item.length >= 10 || /[。！？.!?]/.test(item),
  ).length
  const isWordDistinction =
    compactPrompt.length > 0 &&
    compactPrompt.length <= 8 &&
    /[\u3040-\u30ff\u4e00-\u9fff]/.test(compactPrompt) &&
    !/[。！？.!?]/.test(compactPrompt) &&
    options.length === 4 &&
    sentenceLikeOptionCount >= 3

  if (isSorting) return 'SORTING'
  if (isFillBlank) return 'FILL_BLANK'
  if (isWordDistinction) return 'WORD_DISTINCTION'
  if (grammarHint) return 'GRAMMAR'
  return 'PRONUNCIATION'
}

const inferTargetWord = (
  questionType: QuestionType,
  prompt: string,
) => {
  if (
    questionType !== 'WORD_DISTINCTION' &&
    questionType !== 'PRONUNCIATION' &&
    questionType !== 'SYNONYM_REPLACEMENT'
  ) return ''
  const normalized = prompt
    .replace(/^\s*\[?\d+\]?\s*[：:．.、)\-]\s*/, '')
    .trim()
  if (!normalized) return ''
  if (questionType === 'WORD_DISTINCTION') {
    return normalized.split(/[\s　]/)[0] || normalized
  }
  return ''
}

const parseOptionLine = (rawLine: string) => {
  const line = rawLine.trim()
  if (!line) return null
  const digit = line.match(/^([1-4])[．.、)\s]+([\s\S]*)$/)
  if (digit) return { index: Number(digit[1]) - 1, text: (digit[2] || '').trim() }
  const circled = line.match(/^([①②③④])[ \t　]*([\s\S]*)$/)
  if (circled) return { index: CIRCLED_NUM_TO_INDEX[circled[1]], text: (circled[2] || '').trim() }
  const alpha = line.match(/^([A-Da-d])[．.、)\s]+([\s\S]*)$/)
  if (alpha) return { index: alpha[1].toUpperCase().charCodeAt(0) - 65, text: (alpha[2] || '').trim() }
  return null
}

const parseInlineOptionSet = (rawLine: string) => {
  const line = rawLine.trim()
  if (!line) return null
  const markerToIndex: Record<string, number> = {
    '1': 0, '2': 1, '3': 2, '4': 3,
    '①': 0, '②': 1, '③': 2, '④': 3,
    A: 0, B: 1, C: 2, D: 3,
  }
  const markerRegex = /(^|[\s　])([1-4①②③④A-Da-d])[．.、，:：)\-]?\s*/g
  const markers: Array<{ start: number; end: number; index: number }> = []
  let match: RegExpExecArray | null
  while ((match = markerRegex.exec(line)) !== null) {
    const marker = match[2].toUpperCase()
    const mapped = markerToIndex[marker]
    if (mapped === undefined) continue
    markers.push({ start: match.index + match[1].length, end: markerRegex.lastIndex, index: mapped })
  }
  if (markers.length < 4) return null
  for (let i = 0; i <= markers.length - 4; i += 1) {
    const window = markers.slice(i, i + 4)
    if (window[0].index !== 0 || window[1].index !== 1 || window[2].index !== 2 || window[3].index !== 3) continue
    const prompt = line.slice(0, window[0].start).trim()
    const options = window.map((curr, idx) => {
      const next = window[idx + 1]
      return line.slice(curr.end, next ? next.start : line.length).trim()
    })
    if (options.every(Boolean)) return { prompt, options }
  }
  return null
}

const parseQuestionHeaderLine = (rawLine: string) => {
  const line = rawLine.trim()
  if (!line) return { isHeader: false, text: '' }
  const patterns = [
    /^\s*[（(]?\d+[）)]?[．.、，:：)\-]\s*([\s\S]*)$/,
    /^\s*第\s*\d+\s*[题題問]\s*[：:.\\-、，]?\s*([\s\S]*)$/,
    /^\s*[Qq]\s*\d+\s*[：:.\\-、，]?\s*([\s\S]*)$/,
  ]
  for (const pattern of patterns) {
    const matched = line.match(pattern)
    if (matched) return { isHeader: true, text: (matched[1] || '').trim() }
  }
  return { isHeader: false, text: line }
}

type ParsedDraft = {
  questionType: QuestionType
  prompt: string
  contextSentence: string
  targetWord: string
  explanation: string
  options: { text: string; isCorrect: boolean }[]
}

const parseMultiQuizText = (input: string): ParsedDraft[] => {
  const lines = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const results: ParsedDraft[] = []
  let promptLines: string[] = []
  let options = ['', '', '', '']
  let seenOption = false
  let lastOptionIndex = -1

  const flushIfReady = () => {
    const prompt = promptLines.join('\n').trim()
    const normalized = options.map(item => item.trim())
    if (!normalized.every(Boolean)) return false
    const qType = detectQuestionType(prompt, normalized)
    results.push({
      questionType: qType,
      prompt,
      contextSentence: prompt,
      targetWord: inferTargetWord(qType, prompt),
      explanation: '',
      options: normalized.map((text, idx) => ({ text, isCorrect: idx === 0 })),
    })
    promptLines = []
    options = ['', '', '', '']
    seenOption = false
    lastOptionIndex = -1
    return true
  }

  lines.forEach(rawLine => {
    const line = rawLine.trim()
    if (!line) { flushIfReady(); return }

    const inlineSet = parseInlineOptionSet(line)
    if (inlineSet) {
      if (inlineSet.prompt && !/^\s*\[?\d+\]?\s*[：:．.、)\-]?\s*$/.test(inlineSet.prompt)) {
        if (!seenOption && promptLines.length === 0) {
          const header = parseQuestionHeaderLine(inlineSet.prompt)
          promptLines.push(header.isHeader ? header.text : inlineSet.prompt)
        } else {
          promptLines.push(inlineSet.prompt)
        }
      }
      const questionText = promptLines.join('\n').trim() || inlineSet.prompt
      const qType = detectQuestionType(questionText, inlineSet.options)
      results.push({
        questionType: qType, prompt: questionText, contextSentence: questionText,
        targetWord: inferTargetWord(qType, questionText), explanation: '',
        options: inlineSet.options.map((text, idx) => ({ text, isCorrect: idx === 0 })),
      })
      promptLines = []; options = ['', '', '', '']; seenOption = false; lastOptionIndex = -1
      return
    }

    if (!seenOption && promptLines.length === 0) {
      const header = parseQuestionHeaderLine(line)
      if (header.isHeader) { if (header.text) promptLines.push(header.text); return }
    }

    const optLine = parseOptionLine(line)
    if (optLine) {
      // If option index 0 appears when we already have options, flush first
      if (optLine.index === 0 && seenOption) {
        flushIfReady()
        // Check if this line is actually a question header
        const header = parseQuestionHeaderLine(line)
        if (header.isHeader) { if (header.text) promptLines.push(header.text); return }
      }
      seenOption = true
      lastOptionIndex = optLine.index
      options[optLine.index] = optLine.text
      if (options.every(item => item.trim().length > 0)) flushIfReady()
      return
    }

    if (!seenOption) { promptLines.push(line); return }
    if (lastOptionIndex >= 0 && lastOptionIndex < options.length) {
      options[lastOptionIndex] = `${options[lastOptionIndex]} ${line}`.trim()
    }
  })
  flushIfReady()
  return results
}

// ─── Component ───

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
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [questions, setQuestions] = useState<EditableQuestion[]>(initialQuestions)
  const [listeningSectionNumber, setListeningSectionNumber] = useState(
    defaultListeningSectionNumber ||
      initialQuestions.find(question => question.listeningSectionNumber)
        ?.listeningSectionNumber ||
      '',
  )
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkParsed, setBulkParsed] = useState<ParsedDraft[]>([])
  const [audioOnlyFlags, setAudioOnlyFlags] = useState<Record<string, boolean>>({})

  // Initialize audioOnly flags from existing data
  useEffect(() => {
    const flags: Record<string, boolean> = {}
    initialQuestions.forEach(q => {
      if (q.questionType === 'LISTENING' && q.options.every(o => !o.text.trim())) {
        flags[q.id] = true
      }
    })
    setAudioOnlyFlags(flags)
  }, [initialQuestions])

  // ─── Add single question ───
  const createDefaultOptions = () => [
    { id: `opt_${Date.now()}_1`, text: '选项 1', isCorrect: true },
    { id: `opt_${Date.now()}_2`, text: '选项 2', isCorrect: false },
    { id: `opt_${Date.now()}_3`, text: '选项 3', isCorrect: false },
    { id: `opt_${Date.now()}_4`, text: '选项 4', isCorrect: false },
  ]

  const handleAddNewQuestion = () => {
    const newQ: EditableQuestion = {
      id: `new_${Date.now()}`,
      questionType: 'LISTENING' as QuestionType,
      contextSentence: '',
      targetWord: '',
      prompt: '',
      explanation: '',
      listeningSectionNumber,
      optionLabelFormat: 'numeric',
      customOptionLabels: '',
      options: createDefaultOptions(),
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
    setQuestions(questions.map(q => (q.id === id ? { ...q, [field]: value } : q)))
    setIsDirty(true)
  }

  const handleUpdateOption = (qId: string, optIndex: number, field: 'text' | 'isCorrect', value: string | boolean) => {
    setQuestions(
      questions.map(q => {
        if (q.id !== qId) return q
        const newOptions = [...q.options]
        if (field === 'isCorrect') {
          newOptions.forEach((o, i) => (o.isCorrect = i === optIndex))
        } else {
          newOptions[optIndex] = { ...newOptions[optIndex], text: String(value) }
        }
        return { ...q, options: newOptions }
      }),
    )
    setIsDirty(true)
  }

  const handleReorderQuestions = async (orderedIds: string[]) => {
    const reordered = orderedIds
      .map(id => questions.find(q => q.id === id))
      .filter((item): item is EditableQuestion => Boolean(item))
    setQuestions(reordered)
    setIsDirty(true)
    await updateSortOrder('Question', orderedIds)
    return { success: true }
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
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider ${tConfig.color}`}>
                            {tConfig.label}
                          </span>
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
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider ${tConfig.color}`}>
                            {tConfig.label}
                          </span>
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
