'use client'

import type { RefObject } from 'react'
import type { ParsedQuizDraft } from '../types'
import CustomSelect from '@/components/ui/CustomSelect'

export default function BulkQuizPanel({
  bulkQuickInput,
  setBulkQuickInput,
  handleBulkQuickParse,
  isSubmitting,
  bulkParsedQuestions,
  handleBulkQuizSave,
  bulkEditingIndex,
  setBulkEditingIndex,
  handleBulkRemoveQuestion,
  handleBulkQuestionTypeChange,
  handleBulkPromptChange,
  bulkContextTextareaRef,
  handleBulkContextSentenceChange,
  handleBulkPickTargetWordFromSelection,
  handleBulkTargetWordChange,
  setBulkCorrectOption,
  handleBulkOptionTextChange,
}: {
  bulkQuickInput: string
  setBulkQuickInput: (value: string) => void
  handleBulkQuickParse: () => void
  isSubmitting: boolean
  bulkParsedQuestions: ParsedQuizDraft[]
  handleBulkQuizSave: () => Promise<void>
  bulkEditingIndex: number
  setBulkEditingIndex: (index: number) => void
  handleBulkRemoveQuestion: (index: number) => void
  handleBulkQuestionTypeChange: (index: number, value: ParsedQuizDraft['questionType']) => void
  handleBulkPromptChange: (index: number, value: string) => void
  bulkContextTextareaRef: RefObject<HTMLTextAreaElement | null>
  handleBulkContextSentenceChange: (index: number, value: string) => void
  handleBulkPickTargetWordFromSelection: () => void
  handleBulkTargetWordChange: (index: number, value: string) => void
  setBulkCorrectOption: (questionIndex: number, optionIndex: number) => void
  handleBulkOptionTextChange: (questionIndex: number, optionIndex: number, value: string) => void
}) {
  return (
<section className='border border-blue-100 bg-blue-50/40 p-4 md:p-5'>
      <label className='mb-2 block text-sm font-black text-blue-900'>
        批量粘贴多题（智能识别）
      </label>
      <p className='mb-3 text-xs leading-relaxed text-blue-700'>
        一次粘贴多题文本，系统会按“题干 + 4 个选项”自动拆分。 支持
        `1.2.3.4`、`①②③④`、`A.B.C.D` 选项标记。
      </p>
      <textarea
        value={bulkQuickInput}
        onChange={e => setBulkQuickInput(e.target.value)}
        rows={7}
        placeholder='在此粘贴多道题目（题与题之间建议空一行）'
        className='w-full resize-y border border-blue-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500'
      />
      <div className='mt-3 flex flex-wrap items-center gap-2'>
        <button
          type='button'
          onClick={handleBulkQuickParse}
          className='bg-white border border-blue-200 px-4 py-2 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100'>
          识别多题
        </button>
        <button
          type='button'
          disabled={isSubmitting || bulkParsedQuestions.length === 0}
          onClick={() => void handleBulkQuizSave()}
          className='bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50'>
          {isSubmitting
            ? '批量保存中...'
            : `批量保存（${bulkParsedQuestions.length}）`}
        </button>
        {bulkParsedQuestions.length > 0 && (
          <span className='text-xs font-semibold text-blue-700'>
            已识别 {bulkParsedQuestions.length}{' '}
            题（可在下方逐题校对后再保存）
          </span>
        )}
      </div>

      {bulkParsedQuestions.length > 0 && (
        <div className='mt-4 border-t border-blue-200 pt-4'>
          <div className='mb-3 flex gap-2 overflow-x-auto pb-1'>
            {bulkParsedQuestions.map((_, qIndex) => (
              <button
                key={`bulk-tab-${qIndex}`}
                type='button'
                onClick={() => setBulkEditingIndex(qIndex)}
                className={`h-8 shrink-0 border px-3 text-xs font-bold transition-colors ${
                  bulkEditingIndex === qIndex
                    ? 'border-blue-300 bg-blue-100 text-blue-800'
                    : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
                }`}>
                第 {qIndex + 1} 题
              </button>
            ))}
          </div>

          {bulkParsedQuestions[bulkEditingIndex] && (
            <div className='border border-blue-200 bg-white p-3'>
              <div className='mb-2 flex items-center justify-between gap-2'>
                <span className='text-sm font-bold text-blue-800'>
                  当前编辑：第 {bulkEditingIndex + 1} 题
                </span>
                <button
                  type='button'
                  onClick={() =>
                    handleBulkRemoveQuestion(bulkEditingIndex)
                  }
                  className='border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50'>
                  删除
                </button>
              </div>

              <div className='grid grid-cols-1 gap-2 md:grid-cols-[140px_1fr]'>
                <CustomSelect
                  value={
                    bulkParsedQuestions[bulkEditingIndex].questionType
                  }
                  onChange={e =>
                    handleBulkQuestionTypeChange(
                      bulkEditingIndex,
                      e.target.value as ParsedQuizDraft['questionType'],
                    )
                  }
                  className='h-10 border border-blue-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-400'>
                  <option value='PRONUNCIATION'>读音题</option>
                  <option value='SYNONYM_REPLACEMENT'>
                    近义词替换题
                  </option>
                  <option value='WORD_DISTINCTION'>单词辨析题</option>
                  <option value='GRAMMAR'>语法题</option>
                  <option value='SORTING'>排序题</option>
                </CustomSelect>
                <input
                  value={bulkParsedQuestions[bulkEditingIndex].prompt}
                  onChange={e =>
                    handleBulkPromptChange(
                      bulkEditingIndex,
                      e.target.value,
                    )
                  }
                  placeholder='题干'
                  className='h-10 border border-blue-200 bg-white px-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-400'
                />
              </div>

              <div className='mt-2'>
                <textarea
                  ref={bulkContextTextareaRef}
                  value={
                    bulkParsedQuestions[bulkEditingIndex]
                      .contextSentence
                  }
                  onChange={e =>
                    handleBulkContextSentenceChange(
                      bulkEditingIndex,
                      e.target.value,
                    )
                  }
                  rows={2}
                  className='w-full border border-blue-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400'
                  placeholder='语境句（建议完整句子）'
                />
              </div>

              {(bulkParsedQuestions[bulkEditingIndex].questionType ===
                'PRONUNCIATION' ||
                bulkParsedQuestions[bulkEditingIndex].questionType ===
                  'SYNONYM_REPLACEMENT' ||
                bulkParsedQuestions[bulkEditingIndex].questionType ===
                  'WORD_DISTINCTION') && (
                <div className='mt-2 flex flex-wrap items-center gap-2'>
                  <button
                    type='button'
                    onClick={handleBulkPickTargetWordFromSelection}
                    className='h-9 border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100'>
                    划词设目标词
                  </button>
                  <input
                    value={
                      bulkParsedQuestions[bulkEditingIndex]
                        .targetWord || ''
                    }
                    onChange={e =>
                      handleBulkTargetWordChange(
                        bulkEditingIndex,
                        e.target.value,
                      )
                    }
                    placeholder='目标词（前台下划线显示）'
                    className='h-9 min-w-0 flex-1 border border-blue-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-400'
                  />
                </div>
              )}

              <div className='mt-2 grid grid-cols-1 gap-2 md:grid-cols-2'>
                {bulkParsedQuestions[bulkEditingIndex].options.map(
                  (opt, optIndex) => (
                    <label
                      key={`bulk-q-${bulkEditingIndex}-opt-${optIndex}`}
                      className='flex items-center gap-2 border border-gray-200 px-2.5 py-2'>
                      <input
                        type='radio'
                        checked={opt.isCorrect}
                        onChange={() =>
                          setBulkCorrectOption(
                            bulkEditingIndex,
                            optIndex,
                          )
                        }
                        className='shrink-0'
                      />
                      <input
                        value={opt.text}
                        onChange={e =>
                          handleBulkOptionTextChange(
                            bulkEditingIndex,
                            optIndex,
                            e.target.value,
                          )
                        }
                        placeholder={`选项 ${optIndex + 1}`}
                        className='min-w-0 flex-1 border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-400'
                      />
                    </label>
                  ),
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
