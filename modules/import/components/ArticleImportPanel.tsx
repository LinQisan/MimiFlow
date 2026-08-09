'use client'

import type { Dispatch, FormEvent, ReactNode, RefObject, SetStateAction } from 'react'

import { rebuildFillBlankPromptFromQuestion } from '../domain/article-question-builder'
import type {
  ArticleFormState,
  ArticleImportedQuestionDraft,
  ArticlePreviewRow,
} from '../types'

export default function ArticleImportPanel({
  articleForm,
  setArticleForm,
  articleQuestions,
  setArticleQuestions,
  articleTextareaRef,
  collectionSelector,
  handleMakeBlank,
  handleParseCardOptions,
  articleQuickInput,
  setArticleQuickInput,
  handleArticleAddQuestion,
  articleParsedDrafts,
  handleConfirmArticlePreviewImport,
  articleParsedPreviewRows,
  isSubmitting,
  handleArticleSubmit,
  onRemoveQuestion,
}: {
  articleForm: ArticleFormState
  setArticleForm: Dispatch<SetStateAction<ArticleFormState>>
  articleQuestions: ArticleImportedQuestionDraft[]
  setArticleQuestions: Dispatch<SetStateAction<ArticleImportedQuestionDraft[]>>
  articleTextareaRef: RefObject<HTMLTextAreaElement | null>
  collectionSelector: ReactNode
  handleMakeBlank: () => void
  handleParseCardOptions: (questionIndex: number, text: string) => void
  articleQuickInput: string
  setArticleQuickInput: (value: string) => void
  handleArticleAddQuestion: () => void
  articleParsedDrafts: ArticleImportedQuestionDraft[]
  handleConfirmArticlePreviewImport: () => void
  articleParsedPreviewRows: ArticlePreviewRow[]
  isSubmitting: boolean
  handleArticleSubmit: (event: FormEvent) => Promise<void>
  onRemoveQuestion: (index: number) => void
}) {
  return (
    <form
      onSubmit={handleArticleSubmit}
      className='animate-in space-y-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_-32px_rgba(15,23,42,0.5)] fade-in slide-in-from-bottom-4 duration-500 md:p-8'>
      <div className='space-y-1'>
        <h2 className='text-xl font-black text-gray-900 md:text-2xl'>
          导入阅读文章
        </h2>
        <p className='text-sm text-gray-500'>
          先录入文章正文，再按需补充内容理解题并保存。
        </p>
      </div>

      <section className='space-y-5 border border-gray-200 bg-gray-50/30 p-4 md:p-5'>
        {collectionSelector}

        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          <label className='block text-sm font-bold text-gray-700'>
            语言
            <input
              type='text'
              value={articleForm.language}
              onChange={e =>
                setArticleForm({
                  ...articleForm,
                  language: e.target.value,
                })
              }
              className='mt-2 w-full border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500'
              placeholder='例如：ja / en / zh'
            />
          </label>
          <label className='block text-sm font-bold text-gray-700'>
            等级
            <input
              type='text'
              value={articleForm.examLevel}
              onChange={e =>
                setArticleForm({
                  ...articleForm,
                  examLevel: e.target.value,
                })
              }
              className='mt-2 w-full border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500'
              placeholder='例如：N1 / B2'
            />
          </label>
        </div>

        <div>
          <label className='block text-sm font-bold text-gray-700 mb-2'>
            文章标题
          </label>
          <input
            type='text'
            value={articleForm.title}
            onChange={e =>
              setArticleForm({ ...articleForm, title: e.target.value })
            }
            className='w-full px-4 py-3 border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none'
            placeholder='例如：2023 年 7 月 N1 阅读（可留空）'
          />
        </div>

        <div>
          <div className='mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
            <label className='text-sm font-bold text-gray-700'>
              正文内容
              <span className='ml-2 text-xs font-normal text-gray-400'>
                建议粘贴纯文本
              </span>
            </label>
            <button
              type='button'
              onClick={handleMakeBlank}
              className='inline-flex items-center justify-center border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 transition-[background-color,border-color,color,transform] hover:bg-blue-100 active:scale-95'>
              划词生成文章穴埋め
            </button>
          </div>
          <textarea
            required
            ref={articleTextareaRef}
            value={articleForm.content}
            onChange={e =>
              setArticleForm({ ...articleForm, content: e.target.value })
            }
            rows={10}
            className='w-full p-5 border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed resize-y'
            placeholder='在此粘贴文章正文'
          />
        </div>
      </section>

      <section className='space-y-5 border border-blue-100 bg-blue-50/40 p-4 md:p-5'>
        <div>
          <h3 className='text-base font-black text-blue-900 md:text-lg'>
            読解题目（可选）
          </h3>
          <p className='mt-1 text-xs text-blue-700'>
            可通过划词自动生成，也可粘贴 1.2.3.4 格式快速导入。
          </p>
        </div>

        {articleQuestions.length > 0 && (
          <div className='mb-6 space-y-4'>
            {articleQuestions.map((q, qIndex) => (
              <div
                key={qIndex}
                className='bg-white p-4 border border-blue-100 relative transition-colors'>
                <button
                  type='button'
                  onClick={() => onRemoveQuestion(qIndex)}
                  className='absolute right-4 top-4 border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 hover:text-red-700'>
                  移除题目
                </button>

                <div className='mb-3 pr-16 text-sm font-bold text-blue-900'>
                  第 {qIndex + 1} 题：
                  {q.questionType === 'FILL_BLANK' ? (
                    <span className='ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs font-normal text-blue-600'>
                      文章穴埋め
                    </span>
                  ) : null}
                  <div className='mt-2 text-gray-700 font-medium leading-relaxed bg-gray-50 p-2 border border-gray-100'>
                    {q.prompt}
                  </div>
                </div>

                <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                  {q.options.map((opt, optIndex: number) => (
                    <div
                      key={optIndex}
                      className='flex min-w-0 items-center gap-2 border border-gray-200 bg-white px-2.5 py-2 text-sm'>
                      <input
                        type='radio'
                        checked={opt.isCorrect}
                        onChange={() => {
                          setArticleQuestions(prev =>
                            prev.map((question, questionIndex) => {
                              if (questionIndex !== qIndex)
                                return question
                              const nextQuestion = {
                                ...question,
                                options: question.options.map(
                                  (option, i) => ({
                                    ...option,
                                    isCorrect: i === optIndex,
                                  }),
                                ),
                              }
                              return rebuildFillBlankPromptFromQuestion(
                                nextQuestion,
                              )
                            }),
                          )
                        }}
                        className='text-blue-600 focus:ring-blue-500 shrink-0 cursor-pointer'
                      />
                      <input
                        type='text'
                        value={opt.text}
                        onChange={e => {
                          setArticleQuestions(prev =>
                            prev.map((question, questionIndex) => {
                              if (questionIndex !== qIndex)
                                return question
                              const nextQuestion = {
                                ...question,
                                options: question.options.map(
                                  (option, i) =>
                                    i === optIndex
                                      ? {
                                          ...option,
                                          text: e.target.value,
                                        }
                                      : option,
                                ),
                              }
                              return rebuildFillBlankPromptFromQuestion(
                                nextQuestion,
                              )
                            }),
                          )
                        }}
                        placeholder={`选项 ${optIndex + 1}`}
                        className={`min-w-0 flex-1 rounded-md border px-3 py-2 transition-colors ${opt.isCorrect ? 'border-blue-400 bg-blue-50 font-bold text-blue-700 ' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-300'} outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </div>
                  ))}
                </div>

                <div className='mt-4 pt-3 border-t border-gray-100'>
                  <input
                    type='text'
                    placeholder='在此粘贴 1. 2. 3. 4. 选项文本，系统将自动拆分并匹配正确答案。'
                    onChange={e => {
                      handleParseCardOptions(qIndex, e.target.value)
                      e.target.value = ''
                    }}
                    className='w-full px-4 py-2 text-xs bg-blue-50/50 hover:bg-blue-50 border border-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white text-blue-700 placeholder-blue-300 transition-colors'
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className='border border-blue-100 bg-white p-4'>
          <label className='text-sm font-black text-blue-900 mb-2 block'>
            快速添加内容理解题
          </label>
          <textarea
            value={articleQuickInput}
            onChange={e => setArticleQuickInput(e.target.value)}
            rows={3}
            placeholder='粘贴含 1. 2. 3. 4. 选项的题目文本'
            className='w-full px-4 py-3 border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none resize-y text-sm bg-white mb-3'
          />
          <button
            type='button'
            onClick={handleArticleAddQuestion}
            className='bg-white text-blue-600 border border-blue-200 font-bold px-4 py-2 hover:bg-blue-100 transition-colors text-sm '>
            识别预览
          </button>
          {articleParsedDrafts.length > 0 && (
            <button
              type='button'
              onClick={handleConfirmArticlePreviewImport}
              className='ml-2 bg-blue-600 text-white border border-blue-600 font-bold px-4 py-2 hover:bg-blue-700 transition-colors text-sm'>
              确认导入（{articleParsedDrafts.length}）
            </button>
          )}

          {articleParsedPreviewRows.length > 0 && (
            <div className='mt-4 overflow-x-auto border border-blue-100'>
              {articleParsedPreviewRows.some(
                row => row.isDuplicateToken,
              ) && (
                <div className='border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700'>
                  检测到重号：同一占位符在正文中出现多次，已标红。请先修正编号再导入。
                </div>
              )}
              <table className='min-w-full text-left text-xs'>
                <thead className='bg-blue-50 text-blue-900'>
                  <tr>
                    <th className='px-3 py-2 font-bold'>Q序号</th>
                    <th className='px-3 py-2 font-bold'>
                      命中文章占位符
                    </th>
                    <th className='px-3 py-2 font-bold'>生成题干</th>
                  </tr>
                </thead>
                <tbody>
                  {articleParsedPreviewRows.map((row, index) => (
                    <tr
                      key={`article-preview-${index}`}
                      className={`border-t ${
                        row.isDuplicateToken
                          ? 'border-rose-100 bg-rose-50/70'
                          : 'border-blue-100'
                      }`}>
                      <td className='px-3 py-2 font-semibold text-gray-700'>
                        {row.serial}
                      </td>
                      <td
                        className={`px-3 py-2 font-semibold ${
                          row.isDuplicateToken ||
                          row.placeholderToken === '未命中'
                            ? 'text-rose-600'
                            : 'text-blue-700'
                        }`}>
                        {row.isDuplicateToken
                          ? `${row.placeholderToken}（重号）`
                          : row.placeholderToken}
                      </td>
                      <td className='px-3 py-2 text-gray-700'>
                        {row.generatedPrompt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <button
        disabled={isSubmitting}
        type='submit'
        className='w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 transition-colors disabled:opacity-50 shadow-blue-200 text-lg'>
        {isSubmitting ? '保存中...' : '保存文章与题目'}
      </button>
    </form>
  )
}
