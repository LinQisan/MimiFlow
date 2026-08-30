'use client'

import type { RefObject } from 'react'
import CustomSelect from '@/components/ui/CustomSelect'
import { MIN_QUESTION_OPTION_COUNT } from '@/modules/questions/domain/editor'
import type { ParsedQuizDraft } from '../types'
import {
  supportsSeparateQuestionContext,
  usesExplicitQuestionTargetWord,
} from '@/modules/practice/domain/question-text'

type Props = {
  bulkQuickInput: string
  setBulkQuickInput: (value: string) => void
  handleBulkQuickParse: () => void
  isSubmitting: boolean
  bulkParsedQuestions: ParsedQuizDraft[]
  handleBulkQuizSave: () => Promise<void>
  bulkEditingIndex: number
  setBulkEditingIndex: (index: number) => void
  handleBulkRemoveQuestion: (index: number) => void
  handleBulkPromptChange: (index: number, value: string) => void
  handleBulkExplanationChange: (index: number, value: string) => void
  bulkContextTextareaRef: RefObject<HTMLTextAreaElement | null>
  handleBulkContextSentenceChange: (index: number, value: string) => void
  handleBulkPickTargetWordFromSelection: () => void
  handleBulkTargetWordChange: (index: number, value: string) => void
  handleBulkSortingOptionClick: (
    questionIndex: number,
    optionIndex: number,
  ) => void
  handleBulkSortingReset: (questionIndex: number) => void
  setBulkCorrectOption: (questionIndex: number, optionIndex: number) => void
  handleBulkOptionTextChange: (
    questionIndex: number,
    optionIndex: number,
    value: string,
  ) => void
  handleBulkAddOption: (questionIndex: number) => void
  handleBulkRemoveOption: (questionIndex: number, optionIndex: number) => void
  questionTypeLabel: string
}

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
  handleBulkPromptChange,
  handleBulkExplanationChange,
  bulkContextTextareaRef,
  handleBulkContextSentenceChange,
  handleBulkPickTargetWordFromSelection,
  handleBulkTargetWordChange,
  handleBulkSortingOptionClick,
  handleBulkSortingReset,
  setBulkCorrectOption,
  handleBulkOptionTextChange,
  handleBulkAddOption,
  handleBulkRemoveOption,
  questionTypeLabel,
}: Props) {
  const currentQuestion = bulkParsedQuestions[bulkEditingIndex]
  const canPickTargetWord = currentQuestion
    ? usesExplicitQuestionTargetWord(currentQuestion.questionType)
    : false
  const canUseSeparateContext = currentQuestion
    ? supportsSeparateQuestionContext(currentQuestion.questionType)
    : false
  const hasIncompleteSorting = bulkParsedQuestions.some(
    question =>
      question.questionType === 'SORTING' &&
      (question.sortingOrder?.length || 0) !== question.options.length,
  )

  return (
    <section aria-labelledby='bulk-import-heading'>
      <div className='py-6'>
        <label
          id='bulk-import-heading'
          className='mb-3 block text-sm font-bold text-slate-900'>
          粘贴题目（单题或多题）
        </label>
        <textarea
          value={bulkQuickInput}
          onChange={event => setBulkQuickInput(event.target.value)}
          rows={7}
          placeholder={'粘贴一题或多题，系统会自动识别数量\n支持 1．题干、1/①/A 选项以及 **目标词**'}
          className='w-full resize-y border border-slate-300 bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200'
        />
        <div className='mt-3 flex flex-wrap items-center gap-3'>
          <button
            type='button'
            onClick={handleBulkQuickParse}
            className='bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700'>
            识别题目
          </button>
          <button
            type='button'
            disabled={
              isSubmitting ||
              bulkParsedQuestions.length === 0 ||
              hasIncompleteSorting
            }
            title={
              hasIncompleteSorting ? '请先为所有问题6设置正确语序' : undefined
            }
            onClick={() => void handleBulkQuizSave()}
            className='border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40'>
            {isSubmitting ? '保存中…' : `保存 ${bulkParsedQuestions.length} 题`}
          </button>
          {bulkParsedQuestions.length > 0 ? (
            <span className='text-xs font-semibold text-slate-500'>
              {bulkParsedQuestions.length === 1
                ? '已识别为单题'
                : `已识别为 ${bulkParsedQuestions.length} 题`}
            </span>
          ) : null}
        </div>
      </div>

      {currentQuestion ? (
        <div className='border-t border-slate-200 pt-6'>
          <div className='border-b border-slate-200 pb-3 md:hidden'>
            <CustomSelect
              value={String(bulkEditingIndex)}
              onChange={event =>
                setBulkEditingIndex(Number(event.target.value))
              }
              aria-label='选择要编辑的题目'
              className='h-10 w-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700'>
              {bulkParsedQuestions.map((_, questionIndex) => (
                <option key={`bulk-question-option-${questionIndex}`} value={questionIndex}>
                  第 {questionIndex + 1} 题
                </option>
              ))}
            </CustomSelect>
          </div>
          <div className='hidden items-center gap-1 overflow-x-auto border-b border-slate-200 md:flex'>
            {bulkParsedQuestions.map((_, questionIndex) => (
              <button
                key={`bulk-question-${questionIndex}`}
                type='button'
                onClick={() => setBulkEditingIndex(questionIndex)}
                aria-current={bulkEditingIndex === questionIndex ? 'step' : undefined}
                title={questionTypeLabel}
                className={`shrink-0 !rounded-none border-b-2 px-3 py-2.5 text-xs font-bold outline-none transition-colors focus-visible:border-slate-950 focus-visible:text-slate-950 ${
                  bulkEditingIndex === questionIndex
                    ? 'border-slate-900 text-slate-950'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}>
                {questionIndex + 1}
              </button>
            ))}
          </div>

          <div className='py-6'>
            <div className='mb-5 flex items-center justify-between gap-3'>
              <div>
                <span className='text-sm font-black text-slate-950'>
                  第 {bulkEditingIndex + 1} 题
                </span>
                <span className='ml-2 text-xs font-semibold text-slate-400'>
                  {questionTypeLabel}
                </span>
              </div>
              <button
                type='button'
                onClick={() => handleBulkRemoveQuestion(bulkEditingIndex)}
                className='px-2 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50'>
                删除
              </button>
            </div>

            <div>
              <label className='block'>
                <span className='mb-2 block text-xs font-bold text-slate-500'>
                  题干
                </span>
                <input
                  value={currentQuestion.prompt}
                  onChange={event =>
                    handleBulkPromptChange(bulkEditingIndex, event.target.value)
                  }
                  className='h-11 w-full border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200'
                />
              </label>
            </div>

            {canUseSeparateContext ? (
            <label className='mt-5 block'>
              <span className='block text-xs font-bold text-slate-700'>
                题目原句（可选）
              </span>
              <span className='mt-1 block text-xs leading-5 text-slate-500'>
                题干不是完整句子时填写；题干已包含原句则留空。
              </span>
              <textarea
                ref={bulkContextTextareaRef}
                value={currentQuestion.contextSentence}
                onChange={event =>
                  handleBulkContextSentenceChange(
                    bulkEditingIndex,
                    event.target.value,
                  )
                }
                rows={2}
                className='mt-3 w-full !resize-none !rounded-none border-0 border-b border-slate-300 bg-transparent px-0 py-3 text-sm outline-none transition-colors focus:border-slate-950 focus:ring-0'
                placeholder='填写题目实际出现的完整句子'
              />
            </label>
            ) : null}

            {canPickTargetWord ? (
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                {canUseSeparateContext ? (
                <button
                  type='button'
                  onClick={handleBulkPickTargetWordFromSelection}
                  className='h-9 border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-slate-500'>
                  设为目标词
                </button>
                ) : null}
                <input
                  value={currentQuestion.targetWord || ''}
                  onChange={event =>
                    handleBulkTargetWordChange(
                      bulkEditingIndex,
                      event.target.value,
                    )
                  }
                  placeholder={
                    currentQuestion.questionType === 'PRONUNCIATION'
                      ? '填写题干中需要标注的汉字'
                      : '填写题干中需要替换的词'
                  }
                  className='h-9 min-w-48 flex-1 border border-slate-300 px-3 text-sm outline-none focus:ring-2 focus:ring-slate-200'
                />
              </div>
            ) : null}

            {currentQuestion.questionType === 'SORTING' ? (
              <div className='mt-5 border-y border-slate-200 py-4'>
                <div className='mb-3 flex items-center justify-between gap-3'>
                  <span className='text-xs font-bold text-slate-700'>
                    按正确语序点击选项
                  </span>
                  {(currentQuestion.sortingOrder?.length || 0) > 0 ? (
                    <button
                      type='button'
                      onClick={() => handleBulkSortingReset(bulkEditingIndex)}
                      className='text-xs font-semibold text-slate-500 hover:text-slate-900'>
                      重置
                    </button>
                  ) : null}
                </div>
                <div className='flex flex-wrap gap-2'>
                  {currentQuestion.options.map((option, optionIndex) => {
                    const position =
                      (currentQuestion.sortingOrder || []).indexOf(optionIndex)
                    return (
                      <button
                        key={`sorting-order-${bulkEditingIndex}-${optionIndex}`}
                        type='button'
                        disabled={position >= 0 || !option.text.trim()}
                        onClick={() =>
                          handleBulkSortingOptionClick(
                            bulkEditingIndex,
                            optionIndex,
                          )
                        }
                        className='border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 disabled:bg-slate-100 disabled:text-slate-400'>
                        {position >= 0 ? `${position + 1}. ` : ''}
                        {option.text || `选项 ${optionIndex + 1}`}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className='mt-6 flex justify-end border-t border-slate-200 pt-5'>
              <button
                type='button'
                onClick={() => handleBulkAddOption(bulkEditingIndex)}
                className='px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100'>
                ＋ 添加选项
              </button>
            </div>
            <div className='mt-2 divide-y divide-slate-200 border-y border-slate-200'>
              {currentQuestion.options.map((option, optionIndex) => (
                <div
                  key={`bulk-option-${bulkEditingIndex}-${optionIndex}`}
                  className='flex items-center gap-3 py-3'>
                  <input
                    type='radio'
                    checked={option.isCorrect}
                    onChange={() =>
                      setBulkCorrectOption(bulkEditingIndex, optionIndex)
                    }
                    aria-label={`将选项 ${optionIndex + 1} 设为正确答案`}
                    className='shrink-0 accent-slate-900'
                  />
                  <span className='w-5 shrink-0 text-xs font-black text-slate-400'>
                    {optionIndex + 1}
                  </span>
                  <input
                    value={option.text}
                    onChange={event =>
                      handleBulkOptionTextChange(
                        bulkEditingIndex,
                        optionIndex,
                        event.target.value,
                      )
                    }
                    placeholder='选项内容'
                    className='min-w-0 flex-1 border-0 bg-transparent px-0 py-2 text-sm outline-none focus:ring-0'
                  />
                  <button
                    type='button'
                    disabled={
                      currentQuestion.options.length <=
                      MIN_QUESTION_OPTION_COUNT
                    }
                    onClick={() =>
                      handleBulkRemoveOption(bulkEditingIndex, optionIndex)
                    }
                    aria-label={`删除选项 ${optionIndex + 1}`}
                    className='shrink-0 px-2 py-1 text-xs font-bold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-25'>
                    删除
                  </button>
                </div>
              ))}
            </div>
            <label className='mt-6 block'>
              <span className='mb-2 block text-xs font-bold text-slate-500'>
                解析（可选）
              </span>
              <textarea
                value={currentQuestion.explanation}
                onChange={event =>
                  handleBulkExplanationChange(
                    bulkEditingIndex,
                    event.target.value,
                  )
                }
                rows={2}
                className='w-full resize-y border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200'
                placeholder='可补充解题思路或易错点'
              />
            </label>
          </div>
        </div>
      ) : null}
    </section>
  )
}
