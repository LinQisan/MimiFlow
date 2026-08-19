'use client'

import type {
  Dispatch,
  FormEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react'
import { useRef } from 'react'

import { rebuildFillBlankPromptFromQuestion } from '../domain/article-question-builder'
import type {
  ArticleFormState,
  ArticleImportedQuestionDraft,
  ArticlePreviewRow,
} from '../types'
import {
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
} from '@/features/questions/domain/editor'
import {
  getReadingQuestionSection,
  PAPER_READING_QUESTION_TYPES,
  type PaperReadingQuestionType,
} from '@/features/questions/domain/paper-editor'
import { toggleUnderlineSelection } from '@/utils/text/underlineMarkup'
import {
  parseArticleContentBlocks,
  renderSafeArticleContentBlocksHtml,
} from '@/features/reading/domain/article-blocks'
import { escapeHtml } from '@/utils/language/japaneseRuby'
import { ARTICLE_TABLE_TEMPLATE } from '@/features/reading/domain/article-editing'
import {
  formatNewsDate,
  NEWS_COLUMN_OPTIONS,
  NEWS_EDITION_OPTIONS,
  NEWS_SECTION_OPTIONS,
  NEWS_SOURCE_OPTIONS,
  NEWS_TOPIC_OPTIONS,
  NEWS_TYPE_OPTIONS,
  isAutomaticMorningEdition,
  isAutomaticFrontPageSection,
  supportsBreakingEdition,
} from '@/features/reading/domain/news-metadata'

const STRUCTURED_QUESTION_PATTERN = /(?:^|\n)\s*\|.+\|\s*$/m

function StructuredQuestionPreview({ text }: { text: string }) {
  if (!STRUCTURED_QUESTION_PATTERN.test(text)) return null
  const safeText = escapeHtml(text)
  const html = renderSafeArticleContentBlocksHtml(
    parseArticleContentBlocks(
      safeText
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean),
    ),
  )

  return (
    <div className="mt-3 border-y border-slate-200 py-3">
      <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-400">
        显示预览
      </p>
      <div
        className="reading-passage-body text-sm font-normal leading-7 text-slate-700"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

export default function ArticleImportPanel({
  articleForm,
  setArticleForm,
  articleQuestions,
  setArticleQuestions,
  articleTextareaRef,
  collectionSelector,
  isPaperCollection,
  paperQuestionType,
  fixedQuestionTypeLabel,
  onPaperQuestionTypeChange,
  onNewsMetadataChange,
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
  onUnderlineSelectionMissing,
}: {
  articleForm: ArticleFormState
  setArticleForm: Dispatch<SetStateAction<ArticleFormState>>
  articleQuestions: ArticleImportedQuestionDraft[]
  setArticleQuestions: Dispatch<SetStateAction<ArticleImportedQuestionDraft[]>>
  articleTextareaRef: RefObject<HTMLTextAreaElement | null>
  collectionSelector: ReactNode
  isPaperCollection: boolean
  paperQuestionType: PaperReadingQuestionType
  fixedQuestionTypeLabel?: string
  onPaperQuestionTypeChange: (value: PaperReadingQuestionType) => void
  onNewsMetadataChange: (value: Partial<ArticleFormState>) => void
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
  onUnderlineSelectionMissing: () => void
}) {
  const questionPromptRefs = useRef<Record<number, HTMLTextAreaElement | null>>(
    {},
  )
  const morningEditionLocked = isAutomaticMorningEdition({
    source: articleForm.newsSource,
    type: articleForm.newsType,
    column: articleForm.newsColumn,
  })
  const frontPageSectionLocked = isAutomaticFrontPageSection({
    type: articleForm.newsType,
    column: articleForm.newsColumn,
  })
  const breakingEditionSupported = supportsBreakingEdition({
    source: articleForm.newsSource,
    type: articleForm.newsType,
  })

  const applyUnderline = (
    textarea: HTMLTextAreaElement | null,
    updateText: (text: string) => void,
  ) => {
    if (!textarea) return
    const result = toggleUnderlineSelection(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
    )
    if (!result.changed) {
      onUnderlineSelectionMissing()
      return
    }
    updateText(result.text)
    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  const insertArticleTemplate = (template: string) => {
    const textarea = articleTextareaRef.current
    const current = articleForm.content
    const start = textarea?.selectionStart ?? current.length
    const end = textarea?.selectionEnd ?? current.length
    const before = current.slice(0, start)
    const after = current.slice(end)
    const prefix = before && !before.endsWith('\n\n') ? '\n\n' : ''
    const suffix = after && !after.startsWith('\n\n') ? '\n\n' : ''
    const inserted = `${prefix}${template}${suffix}`
    const next = `${before}${inserted}${after}`
    const cursor = before.length + inserted.length

    setArticleForm((previous) => ({ ...previous, content: next }))
    window.requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <form
      onSubmit={handleArticleSubmit}
      className="animate-in fade-in slide-in-from-bottom-4 duration-500"
    >
      <h2 className="sr-only">新增阅读内容</h2>

      <section>
        {collectionSelector}

        {isPaperCollection ? (
          <div className="border-b border-slate-200 py-6">
            <span className="mb-3 block text-sm font-bold text-slate-900">
              题型
            </span>
            {fixedQuestionTypeLabel ? (
              <div className="border-b border-slate-950 px-1 py-3 text-sm font-bold text-slate-950">
                {fixedQuestionTypeLabel}
              </div>
            ) : (
              <div role="group" aria-label="试卷题型" className="space-y-5">
                {[
                  {
                    label: '文法',
                    types: PAPER_READING_QUESTION_TYPES.filter(
                      (type) =>
                        type.sectionNumber === 7 &&
                        !type.value.startsWith('TOEIC_'),
                    ),
                  },
                  {
                    label: '読解',
                    types: PAPER_READING_QUESTION_TYPES.filter(
                      (type) =>
                        type.sectionNumber >= 8 &&
                        !type.value.startsWith('TOEIC_'),
                    ),
                  },
                ].map((group) => (
                  <div key={group.label}>
                    <span className="block text-xs font-bold tracking-wide text-slate-400">
                      {group.label}
                    </span>
                    <div className="grid gap-x-6 sm:grid-cols-2">
                      {group.types.map((type) => (
                        <button
                          key={type.value}
                          type="button"
                          aria-pressed={paperQuestionType === type.value}
                          onClick={() => onPaperQuestionTypeChange(type.value)}
                          className={`flex !rounded-none border-b px-1 py-3 text-left text-sm transition-colors ${
                            paperQuestionType === type.value
                              ? 'border-slate-950 text-slate-950'
                              : 'border-slate-200 text-slate-500 hover:border-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <span className="mr-2 text-xs font-bold text-slate-400">
                            問題 {type.sectionNumber}
                          </span>
                          <span className="font-semibold">{type.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="border-b border-slate-200 py-6">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-bold text-slate-900">
                内容类型
              </span>
              {(
                [
                  ['ARTICLE', '文章'],
                  ['NEWS', '新闻'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={articleForm.sourceKind === value}
                  onClick={() =>
                    setArticleForm((previous) => ({
                      ...previous,
                      sourceKind: value,
                    }))
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    articleForm.sourceKind === value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {articleForm.sourceKind === 'NEWS' ? (
              <div className="mb-6 space-y-5">
                <fieldset>
                  <legend className="mb-2 text-sm font-bold text-slate-900">类型</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {NEWS_TYPE_OPTIONS.map(option => (
                      <button key={option.value} type="button"
                        aria-pressed={articleForm.newsType === option.value}
                        onClick={() => onNewsMetadataChange({ newsType: option.value })}
                        className={`rounded-xl border px-3 py-3 text-left transition ${articleForm.newsType === option.value ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>
                        <span className="block text-sm font-bold">{option.label}</span>
                        <span className="mt-1 block text-[11px] font-medium opacity-65">{option.description}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-sm font-bold text-slate-900">来源</legend>
                  <div className="flex gap-2">
                    {NEWS_SOURCE_OPTIONS.map(option => (
                      <button key={option.value} type="button"
                        aria-pressed={articleForm.newsSource === option.value}
                        onClick={() => onNewsMetadataChange({ newsSource: option.value })}
                        className={`rounded-full border px-4 py-2 text-xs font-bold ${articleForm.newsSource === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {articleForm.newsType === 'column' ? (
                  <fieldset>
                    <legend className="mb-2 text-sm font-bold text-slate-900">专栏</legend>
                    <div className="flex flex-wrap gap-2">
                      {NEWS_COLUMN_OPTIONS.map(option => (
                        <button key={option.value} type="button"
                          aria-pressed={articleForm.newsColumn === option.value}
                          onClick={() => onNewsMetadataChange({ newsColumn: option.value, newsSource: option.source })}
                          className={`rounded-full border px-4 py-2 text-xs font-bold ${articleForm.newsColumn === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>
                          {option.value} · {option.source}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
              </div>
            ) : null}

            <label className="mb-2 block text-sm font-bold text-gray-700">
              {articleForm.sourceKind === 'NEWS' ? '新闻标题' : '文章标题'}
            </label>
            <input
              type="text"
              required={articleForm.sourceKind === 'NEWS'}
              value={articleForm.title}
              onChange={(e) =>
                setArticleForm({ ...articleForm, title: e.target.value })
              }
              className="w-full border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder={
                articleForm.sourceKind === 'NEWS'
                  ? '新闻标题'
                  : '文章标题（可选）'
              }
            />

            {articleForm.sourceKind === 'NEWS' ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-500">
                  <span className="flex items-center justify-between gap-3">
                    <span>日期</span>
                    <span className="font-medium tabular-nums text-slate-400">
                      {formatNewsDate(articleForm.publishedDate) || '自动使用今天'}
                    </span>
                  </span>
                  <input
                    type="date"
                    value={articleForm.publishedDate}
                    onChange={(event) =>
                      setArticleForm((previous) => ({
                        ...previous,
                        publishedDate: event.target.value,
                      }))
                    }
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold tabular-nums text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <fieldset>
                  <legend className="mb-1.5 text-xs font-bold text-slate-500">
                    刊面
                  </legend>
                  <div className="flex flex-wrap items-center gap-2">
                    {NEWS_EDITION_OPTIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        disabled={
                          (morningEditionLocked && value !== 'MORNING') ||
                          (value === 'FLASH' && !breakingEditionSupported)
                        }
                        aria-pressed={articleForm.edition === value}
                        onClick={() =>
                          onNewsMetadataChange({
                            edition: articleForm.edition === value ? '' : value,
                          })
                        }
                        className={`rounded-full border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${
                          articleForm.edition === value
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    {morningEditionLocked ? (
                      <span className="text-[11px] font-medium text-slate-400">
                        已自动对应朝刊
                      </span>
                    ) : null}
                    {!morningEditionLocked && articleForm.newsSource === '日経' && articleForm.newsType !== 'news' ? (
                      <span className="text-[11px] font-medium text-slate-400">
                        速報仅用于日経普通新闻
                      </span>
                    ) : null}
                  </div>
                </fieldset>
                <label className="text-xs font-bold text-slate-500">
                  版面
                  <input
                    type="text"
                    required
                    readOnly={frontPageSectionLocked}
                    list="news-section-options"
                    value={articleForm.newsSection}
                    onChange={(event) =>
                      onNewsMetadataChange({ newsSection: event.target.value })
                    }
                    placeholder="例：経済"
                    className="mt-1.5 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                  <datalist id="news-section-options">
                    {NEWS_SECTION_OPTIONS.map(option => <option key={option} value={option} />)}
                  </datalist>
                  {frontPageSectionLocked ? (
                    <span className="mt-1.5 block text-[11px] font-medium text-slate-400">
                      已自动对应一面
                    </span>
                  ) : null}
                </label>
                <label className="text-xs font-bold text-slate-500">
                  主题 <span className="font-medium text-slate-400">（可选）</span>
                  <input type="text" list="news-topic-options" value={articleForm.newsTopic}
                    onChange={event => onNewsMetadataChange({ newsTopic: event.target.value })}
                    placeholder="例：AI / 教育"
                    className="mt-1.5 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
                  <datalist id="news-topic-options">
                    {NEWS_TOPIC_OPTIONS.map(option => <option key={option} value={option} />)}
                  </datalist>
                </label>
              </div>
            ) : null}
          </div>
        )}

        <div className="border-b border-slate-200 py-6">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <label className="text-sm font-bold text-slate-900">正文</label>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => insertArticleTemplate(ARTICLE_TABLE_TEMPLATE)}
                className="px-2 py-1 text-xs font-bold text-slate-500 transition-colors hover:text-slate-950"
              >
                插入表格
              </button>
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <button
                type="button"
                onClick={() =>
                  applyUnderline(articleTextareaRef.current, (text) =>
                    setArticleForm((previous) => ({
                      ...previous,
                      content: text,
                    })),
                  )
                }
                className="px-2 py-1 text-xs font-bold text-slate-500 transition-colors hover:text-slate-950"
              >
                添加/取消下划线
              </button>
              {isPaperCollection &&
              (!fixedQuestionTypeLabel ||
                paperQuestionType === 'TOEIC_TEXT_COMPLETION') ? (
                <button
                  type="button"
                  onClick={handleMakeBlank}
                  className="px-2 py-1 text-xs font-bold text-slate-500 transition-colors hover:text-slate-950"
                >
                  {fixedQuestionTypeLabel ? '生成填空' : '生成問題7填空'}
                </button>
              ) : null}
            </div>
          </div>
          <textarea
            required
            ref={articleTextareaRef}
            value={articleForm.content}
            onChange={(e) =>
              setArticleForm({ ...articleForm, content: e.target.value })
            }
            rows={10}
            className="w-full resize-y border border-slate-300 bg-white px-4 py-3 leading-7 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            placeholder="粘贴正文；表格使用 | 分隔"
          />
          <p className="mt-2 text-xs leading-5 text-slate-400">
            仅表格会转换为结构化显示；其他文字保留原始内容与换行。
          </p>
        </div>
      </section>

      {isPaperCollection ? (
        <section className="py-6">
          <h3 className="mb-4 text-sm font-bold text-slate-900">题目</h3>

          {articleQuestions.length > 0 && (
            <div className="mb-6 border-t border-slate-200">
              {articleQuestions.map((q, qIndex) => (
                <div
                  key={qIndex}
                  className="relative border-b border-slate-200 py-5"
                >
                  <button
                    type="button"
                    onClick={() => onRemoveQuestion(qIndex)}
                    className="absolute right-0 top-5 px-2 py-1 text-xs font-bold text-rose-500 hover:text-rose-700"
                  >
                    删除
                  </button>

                  <div className="mb-3 pr-16 text-sm font-bold text-slate-900">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span>
                        {(() => {
                          const section = getReadingQuestionSection(
                            q.questionType,
                          )
                          return (
                            fixedQuestionTypeLabel ||
                            `問題${section.sectionNumber}｜${section.title}`
                          )
                        })()}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        本文章第 {qIndex + 1} 题
                      </span>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <label
                          htmlFor={`article-question-prompt-${qIndex}`}
                          className="text-xs font-semibold text-slate-500"
                        >
                          题干
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            applyUnderline(
                              questionPromptRefs.current[qIndex],
                              (text) =>
                                setArticleQuestions((previous) =>
                                  previous.map((question, questionIndex) =>
                                    questionIndex === qIndex
                                      ? {
                                          ...question,
                                          prompt: text,
                                          contextSentence:
                                            question.contextSentence.trim() ===
                                            question.prompt.trim()
                                              ? ''
                                              : question.contextSentence,
                                        }
                                      : question,
                                  ),
                                ),
                            )
                          }
                          className="px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-950"
                        >
                          添加/取消下划线
                        </button>
                      </div>
                      <textarea
                        id={`article-question-prompt-${qIndex}`}
                        ref={(element) => {
                          questionPromptRefs.current[qIndex] = element
                        }}
                        value={q.prompt}
                        onChange={(event) =>
                          setArticleQuestions((previous) =>
                            previous.map((question, questionIndex) =>
                              questionIndex === qIndex
                                ? {
                                    ...question,
                                    prompt: event.target.value,
                                    contextSentence:
                                      question.contextSentence.trim() ===
                                      question.prompt.trim()
                                        ? ''
                                        : question.contextSentence,
                                  }
                                : question,
                            ),
                          )
                        }
                        rows={2}
                        placeholder="输入题干"
                        className="w-full resize-y border border-slate-300 bg-white px-3 py-2 text-sm font-medium leading-relaxed text-slate-700 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      />
                      <StructuredQuestionPreview
                        text={q.contextSentence.trim() || q.prompt.trim()}
                      />
                    </div>
                  </div>

                  {!isPaperCollection ? (
                    <div
                      role="group"
                      aria-label={`第 ${qIndex + 1} 题题型`}
                      className="mb-4 flex border-b border-slate-200"
                    >
                      {(
                        [
                          ['FILL_BLANK', '問題 7｜文章の文法'],
                          ['READING_COMPREHENSION', '問題 8｜内容理解'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={q.questionType === value}
                          onClick={() =>
                            setArticleQuestions((previous) =>
                              previous.map((question, questionIndex) =>
                                questionIndex === qIndex
                                  ? { ...question, questionType: value }
                                  : question,
                              ),
                            )
                          }
                          className={`!rounded-none border-b-2 px-3 py-2 text-xs font-bold transition-colors ${
                            q.questionType === value
                              ? 'border-slate-950 text-slate-950'
                              : 'border-transparent text-slate-400 hover:text-slate-700'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500">
                      {q.options.length} 个选项
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setArticleQuestions((previous) =>
                          previous.map((question, questionIndex) =>
                            questionIndex === qIndex
                              ? {
                                  ...question,
                                  options: [
                                    ...question.options,
                                    { text: '', isCorrect: false },
                                  ],
                                }
                              : question,
                          ),
                        )
                      }
                      className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-950"
                    >
                      + 添加选项
                    </button>
                  </div>
                  <div className="divide-y divide-slate-200 border-y border-slate-200">
                    {q.options.map((opt, optIndex: number) => (
                      <div
                        key={optIndex}
                        className="flex min-w-0 items-center gap-3 py-3 text-sm"
                      >
                        <input
                          type="radio"
                          checked={opt.isCorrect}
                          onChange={() => {
                            setArticleQuestions((prev) =>
                              prev.map((question, questionIndex) => {
                                if (questionIndex !== qIndex) return question
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
                          className="text-blue-600 focus:ring-blue-500 shrink-0 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => {
                            setArticleQuestions((prev) =>
                              prev.map((question, questionIndex) => {
                                if (questionIndex !== qIndex) return question
                                const nextQuestion = {
                                  ...question,
                                  options: question.options.map((option, i) =>
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
                          className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 text-slate-700 outline-none focus:ring-0"
                        />
                        <button
                          type="button"
                          disabled={
                            q.options.length <= MIN_QUESTION_OPTION_COUNT
                          }
                          onClick={() =>
                            setArticleQuestions((previous) =>
                              previous.map((question, questionIndex) =>
                                questionIndex === qIndex
                                  ? rebuildFillBlankPromptFromQuestion({
                                      ...question,
                                      options: removeQuestionOptionAt(
                                        question.options,
                                        optIndex,
                                      ),
                                    })
                                  : question,
                              ),
                            )
                          }
                          aria-label={`删除选项 ${optIndex + 1}`}
                          className="shrink-0 px-2 py-1 text-xs font-bold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-25"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3">
                    <input
                      type="text"
                      placeholder="在此粘贴带序号的选项文本，系统将自动拆分并匹配正确答案。"
                      onChange={(e) => {
                        handleParseCardOptions(qIndex, e.target.value)
                        e.target.value = ''
                      }}
                      className="w-full border-0 border-b border-slate-300 bg-transparent px-1 py-2 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-600"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-slate-200 pt-5">
            <label className="mb-2 block text-sm font-bold text-slate-900">
              批量粘贴
            </label>
            <textarea
              value={articleQuickInput}
              onChange={(e) => setArticleQuickInput(e.target.value)}
              rows={3}
              placeholder="粘贴含至少 2 个带序号选项的题目文本"
              className="mb-3 w-full resize-y border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <button
              type="button"
              onClick={handleArticleAddQuestion}
              className="border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-slate-500"
            >
              识别预览
            </button>
            {articleParsedDrafts.length > 0 && (
              <button
                type="button"
                onClick={handleConfirmArticlePreviewImport}
                className="ml-2 border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                确认导入（{articleParsedDrafts.length}）
              </button>
            )}

            {articleParsedPreviewRows.length > 0 && (
              <div className="mt-4 overflow-x-auto border border-blue-100">
                {articleParsedPreviewRows.some(
                  (row) => row.isDuplicateToken,
                ) && (
                  <div className="border-b border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    检测到重号：同一占位符在正文中出现多次，已标红。请先修正编号再导入。
                  </div>
                )}
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-blue-50 text-blue-900">
                    <tr>
                      <th className="px-3 py-2 font-bold">Q序号</th>
                      <th className="px-3 py-2 font-bold">命中文章占位符</th>
                      <th className="px-3 py-2 font-bold">生成题干</th>
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
                        }`}
                      >
                        <td className="px-3 py-2 font-semibold text-gray-700">
                          {row.serial}
                        </td>
                        <td
                          className={`px-3 py-2 font-semibold ${
                            row.isDuplicateToken ||
                            row.placeholderToken === '未命中'
                              ? 'text-rose-600'
                              : 'text-blue-700'
                          }`}
                        >
                          {row.isDuplicateToken
                            ? `${row.placeholderToken}（重号）`
                            : row.placeholderToken}
                        </td>
                        <td className="min-w-[24rem] px-3 py-2 text-gray-700">
                          {STRUCTURED_QUESTION_PATTERN.test(
                            row.generatedPrompt,
                          ) ? (
                            <StructuredQuestionPreview
                              text={row.generatedPrompt}
                            />
                          ) : (
                            row.generatedPrompt
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <button
        disabled={isSubmitting}
        type="submit"
        className="ml-auto flex min-h-11 min-w-40 items-center justify-center bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {isSubmitting
          ? '保存中...'
          : isPaperCollection
            ? '保存文章与题目'
            : '保存文章'}
      </button>
    </form>
  )
}
