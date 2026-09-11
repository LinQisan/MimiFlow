'use client'

import type {
  Dispatch,
  FormEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react'
import { useRef, useState } from 'react'

import { rebuildFillBlankPromptFromQuestion } from '../domain/article-question-builder'
import type { ArticleFormState, ArticleImportedQuestionDraft } from '../types'
import {
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
} from '@/utils/questions/editorOptions'
import {
  getReadingQuestionSection,
  PAPER_READING_QUESTION_TYPES,
  type PaperReadingQuestionType,
} from '@/modules/questions/domain/paper-editor'
import { toggleUnderlineSelection } from '@/utils/text/underlineMarkup'
import {
  parseArticleContentBlocks,
  renderSafeArticleContentBlocksHtml,
} from '@/modules/reading/domain/article-blocks'
import { escapeHtml } from '@/utils/language/japaneseRuby'
import {
  ARTICLE_TABLE_TEMPLATE,
  insertArticleFootnote,
} from '@/modules/reading/domain/article-editing'
import ArticleBodyPreview from '@/modules/reading/components/ArticleBodyPreview'
import DatePicker from '@/components/ui/DatePicker'
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
} from '@/modules/reading/domain/news-metadata'

const STRUCTURED_QUESTION_PATTERN = /(?:^|\n)\s*\|.+\|\s*$/m
const ARTICLE_FILL_BLANK_TOKEN_PATTERN =
  /\[\d+\]|［\d+］|\(\d+\)|（\d+）|【\d+】|「\d+」|『\d+』|__{2,}|[＿_]{2,}|[（(][\s　]*[）)]|～/g

const extractFillBlankTokens = (text: string) =>
  text.match(ARTICLE_FILL_BLANK_TOKEN_PATTERN) || []

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
  isSubmitting,
  handleArticleSubmit,
  onRemoveQuestion,
  onUnderlineSelectionMissing,
  onFootnoteSelectionMissing,
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
  handleParseCardOptions: (questionIndex: number, text: string) => boolean
  articleQuickInput: string
  setArticleQuickInput: (value: string) => void
  handleArticleAddQuestion: () => void
  isSubmitting: boolean
  handleArticleSubmit: (event: FormEvent) => Promise<void>
  onRemoveQuestion: (index: number) => void
  onUnderlineSelectionMissing: () => void
  onFootnoteSelectionMissing: () => void
}) {
  const [contentView, setContentView] = useState<'edit' | 'preview'>('edit')
  const [optionQuickInputs, setOptionQuickInputs] = useState<
    Record<number, string>
  >({})
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
  const fillBlankPreviewTokens = [
    ...articleQuestions
      .filter((question) =>
        ['FILL_BLANK', 'TOEIC_TEXT_COMPLETION'].includes(question.questionType),
      )
      .flatMap((question) =>
        extractFillBlankTokens(question.contextSentence || question.prompt),
      ),
  ]

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

  const insertFootnote = () => {
    const textarea = articleTextareaRef.current
    if (!textarea) return
    const result = insertArticleFootnote(
      articleForm.content,
      textarea.selectionStart,
      textarea.selectionEnd,
    )
    if (!result.changed) {
      onFootnoteSelectionMissing()
      return
    }

    setArticleForm((previous) => ({ ...previous, content: result.text }))
    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.cursor, result.cursor)
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
                  <legend className="mb-2 text-sm font-bold text-slate-900">
                    类型
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {NEWS_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={articleForm.newsType === option.value}
                        onClick={() =>
                          onNewsMetadataChange({ newsType: option.value })
                        }
                        className={`rounded-xl border px-3 py-3 text-left transition ${articleForm.newsType === option.value ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}
                      >
                        <span className="block text-sm font-bold">
                          {option.label}
                        </span>
                        <span className="mt-1 block text-[11px] font-medium opacity-65">
                          {option.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-sm font-bold text-slate-900">
                    来源
                  </legend>
                  <div className="flex gap-2">
                    {NEWS_SOURCE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={articleForm.newsSource === option.value}
                        onClick={() =>
                          onNewsMetadataChange({ newsSource: option.value })
                        }
                        className={`rounded-full border px-4 py-2 text-xs font-bold ${articleForm.newsSource === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {articleForm.newsType === 'column' ? (
                  <fieldset>
                    <legend className="mb-2 text-sm font-bold text-slate-900">
                      专栏
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {NEWS_COLUMN_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={articleForm.newsColumn === option.value}
                          onClick={() =>
                            onNewsMetadataChange({
                              newsColumn: option.value,
                              newsSource: option.source,
                            })
                          }
                          className={`rounded-full border px-4 py-2 text-xs font-bold ${articleForm.newsColumn === option.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-500'}`}
                        >
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
                <div className="text-xs font-bold text-slate-500">
                  <span className="flex items-center justify-between gap-3">
                    <span>日期</span>
                    <span className="font-medium tabular-nums text-slate-400">
                      {formatNewsDate(articleForm.publishedDate) ||
                        '自动使用今天'}
                    </span>
                  </span>
                  <DatePicker
                    value={articleForm.publishedDate}
                    onChange={(publishedDate) =>
                      setArticleForm((previous) => ({
                        ...previous,
                        publishedDate,
                      }))
                    }
                    aria-label="新闻日期"
                    className="mt-1.5"
                  />
                </div>
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
                    {!morningEditionLocked &&
                    articleForm.newsSource === '日経' &&
                    articleForm.newsType !== 'news' ? (
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
                    {NEWS_SECTION_OPTIONS.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                  {frontPageSectionLocked ? (
                    <span className="mt-1.5 block text-[11px] font-medium text-slate-400">
                      已自动对应一面
                    </span>
                  ) : null}
                </label>
                <label className="text-xs font-bold text-slate-500">
                  主题{' '}
                  <span className="font-medium text-slate-400">（可选）</span>
                  <input
                    type="text"
                    list="news-topic-options"
                    value={articleForm.newsTopic}
                    onChange={(event) =>
                      onNewsMetadataChange({ newsTopic: event.target.value })
                    }
                    placeholder="例：AI / 教育"
                    className="mt-1.5 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                  <datalist id="news-topic-options">
                    {NEWS_TOPIC_OPTIONS.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </label>
              </div>
            ) : null}
          </div>
        )}

        <div className="border-b border-slate-200 py-6">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-900">正文</span>
              <div className="flex border border-slate-200 bg-white p-0.5">
                {(['edit', 'preview'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={contentView === mode}
                    onClick={() => setContentView(mode)}
                    className={`px-2.5 py-1 text-[11px] font-semibold transition ${
                      contentView === mode
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {mode === 'edit' ? '编辑' : '预览'}
                  </button>
                ))}
              </div>
            </div>
            {contentView === 'edit' ? (
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
                <button
                  type="button"
                  onClick={insertFootnote}
                  className="px-2 py-1 text-xs font-bold text-slate-500 transition-colors hover:text-slate-950"
                >
                  插入注解
                </button>
                {isPaperCollection &&
                (paperQuestionType === 'FILL_BLANK' ||
                  paperQuestionType === 'TOEIC_TEXT_COMPLETION') ? (
                  <button
                    type="button"
                    onClick={handleMakeBlank}
                    className="px-2 py-1 text-xs font-bold text-slate-500 transition-colors hover:text-slate-950"
                  >
                    {fixedQuestionTypeLabel
                      ? '选中文字生成填空'
                      : '插入完形填空'}
                  </button>
                ) : null}
              </div>
            ) : (
              <span className="text-xs text-slate-400">
                预览正文、問題7填空、下划线、表格与注解效果
              </span>
            )}
          </div>
          <p className="mb-2 text-[11px] leading-5 text-slate-400">
            格式：<code className="text-slate-600">++下划线++</code>
            <span className="mx-2 text-slate-300">·</span>
            <code className="text-slate-600">正文[^1]</code>
            <span className="mx-1">对应</span>
            <code className="text-slate-600">[^1]: 注解内容</code>
            <span className="mx-2 text-slate-300">·</span>
            表格使用 <code className="text-slate-600">|</code> 分隔
          </p>
          {contentView === 'edit' ? (
            <textarea
              required
              ref={articleTextareaRef}
              value={articleForm.content}
              onChange={(e) =>
                setArticleForm({ ...articleForm, content: e.target.value })
              }
              rows={10}
              className="w-full resize-y border border-slate-300 bg-white px-4 py-3 leading-7 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              placeholder="支持正文[^1] 与 [^1]: 注解内容；表格使用 | 分隔"
            />
          ) : (
            <div className="overflow-hidden border border-slate-300">
              <ArticleBodyPreview
                text={articleForm.content}
                className="min-h-[18rem]"
                fillBlankTokens={fillBlankPreviewTokens}
              />
            </div>
          )}
          <p className="mt-2 text-xs leading-5 text-slate-400">
            粘贴已有脚注格式或选中文字插入注解，保存后会在正文显示注号，并在文末生成注解。
          </p>
          {isPaperCollection && paperQuestionType === 'FILL_BLANK' ? (
            <div className="mt-3 border-l-2 border-slate-900 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
              <strong className="block text-slate-900">完形填空插入方法</strong>
              在正文中选中正确答案，点击“插入完形填空”。系统会把原文替换为
              <code className="mx-1 text-slate-900">[1]</code>
              并自动建立题目、保留完整原句、把选中文字设为正确答案；随后只需补充干扰项。连续生成会自动编号，切换到“预览”可检查填空位置。
            </div>
          ) : null}
        </div>
      </section>

      {isPaperCollection ? (
        <section className="py-6">
          <h3 className="mb-4 text-sm font-bold text-slate-900">题目</h3>

          {articleQuestions.length > 0 && (
            <div className="mb-6 border-t border-slate-200">
              {articleQuestions.map((q, qIndex) => (
                <div key={qIndex} className="border-b border-slate-200">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-3">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-sm font-bold text-slate-900">
                        题目 {qIndex + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
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
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveQuestion(qIndex)}
                      className="shrink-0 px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50"
                    >
                      删除
                    </button>
                  </div>

                  <div className="space-y-5 py-4">
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <label
                          htmlFor={`article-question-prompt-${qIndex}`}
                          className="text-xs font-semibold text-slate-600"
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
                        className="w-full resize-y border border-slate-200 bg-white p-3 text-sm font-medium leading-relaxed text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                      />
                      <StructuredQuestionPreview
                        text={q.contextSentence.trim() || q.prompt.trim()}
                      />
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

                    <section className="!rounded-none border-0">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
                        <div>
                          <h4 className="text-xs font-bold text-slate-700">
                            选项 · {q.options.length}
                          </h4>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            选择圆点设置正确答案
                          </p>
                        </div>
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
                          className="ui-btn ui-btn-sm"
                        >
                          添加选项
                        </button>
                      </div>
                      <div className="divide-y divide-slate-200">
                        {q.options.map((opt, optIndex: number) => (
                          <div
                            key={optIndex}
                            className={`flex min-h-12 min-w-0 items-center gap-2 border-l-[3px] px-3 text-sm transition-colors ${
                              opt.isCorrect
                                ? 'border-l-slate-900 bg-slate-50'
                                : 'border-l-transparent bg-white hover:bg-slate-50/60'
                            }`}
                          >
                            <input
                              type="radio"
                              checked={opt.isCorrect}
                              onChange={() => {
                                setArticleQuestions((prev) =>
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
                              className="shrink-0 cursor-pointer accent-slate-900"
                            />
                            <span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">
                              {optIndex + 1}
                            </span>
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) => {
                                setArticleQuestions((prev) =>
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
                              className="shrink-0 px-2 py-1 text-base font-medium text-slate-300 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-25"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>

                    <div className="grid gap-2 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <textarea
                        value={optionQuickInputs[qIndex] || ''}
                        onChange={(event) =>
                          setOptionQuickInputs((previous) => ({
                            ...previous,
                            [qIndex]: event.target.value,
                          }))
                        }
                        rows={2}
                        placeholder={
                          '粘贴选项，例如：\n1　正确答案　2　干扰项A　3　干扰项B　4　干扰项C'
                        }
                        className="w-full resize-y border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const text = optionQuickInputs[qIndex] || ''
                          if (!handleParseCardOptions(qIndex, text)) return
                          setOptionQuickInputs((previous) => ({
                            ...previous,
                            [qIndex]: '',
                          }))
                        }}
                        className="ui-btn ui-btn-sm"
                      >
                        识别选项
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-slate-200 pt-5">
            <label className="mb-2 block text-sm font-bold text-slate-900">
              {paperQuestionType === 'FILL_BLANK'
                ? '完形题批量录入（問題7）'
                : '批量粘贴'}
            </label>
            {paperQuestionType === 'FILL_BLANK' ? (
              <p className="mb-3 text-xs leading-5 text-slate-500">
                正文使用 <code>[1]</code>、<code>[2]</code>
                标记空位；下方题号可以是 41、42
                等原试卷编号。系统忽略题号差异，按粘贴顺序依次连接正文中的第1、第2个空位；已有完形题会直接补全选项，不会重复新增。默认把每题第1项设为正确答案，连接后仍可调整。
              </p>
            ) : null}
            <textarea
              value={articleQuickInput}
              onChange={(e) => setArticleQuickInput(e.target.value)}
              rows={3}
              placeholder={
                paperQuestionType === 'FILL_BLANK'
                  ? '例如：\n[1]\n1　正しい答え\n2　選択肢A\n3　選択肢B\n4　選択肢C\n\n[2]\n1　正しい答え\n2　選択肢A\n3　選択肢B\n4　選択肢C'
                  : '粘贴含至少 2 个带序号选项的题目文本'
              }
              className="mb-3 w-full resize-y border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <button
              type="button"
              onClick={handleArticleAddQuestion}
              className="border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-slate-500"
            >
              {paperQuestionType === 'FILL_BLANK'
                ? '识别并连接完形题'
                : '识别并加入阅读题'}
            </button>
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
