'use client'

import { useRef, useState } from 'react'
import type { CollectionType } from '@prisma/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import {
  SortableList,
  SortableItem,
  DragHandle,
  ActionInterceptor,
} from '@/features/collections/ui/DndSystem'
import { updateArticleWithQuestions } from '@/modules/content/actions/materials'
import { uploadAudioFileAdmin } from '@/features/audio/manage-actions'
import ManageAudioPlayer from '@/features/listening/ui/ManageAudioPlayer'
import { updateSortOrder } from '@/modules/practice/actions/questions'
import { useDialog } from '@/context/DialogContext'
import { getQuestionTypeLabel } from '@/utils/questions/typeLabels'
import {
  createQuestionOption,
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
} from '@/features/questions/domain/editor'
import {
  ARTICLE_TABLE_TEMPLATE,
  insertArticleText,
} from '@/features/reading/domain/article-editing'
import {
  parseArticleContentBlocks,
  renderSafeArticleContentBlocksHtml,
} from '@/features/reading/domain/article-blocks'
import { escapeHtml } from '@/utils/language/japaneseRuby'
import {
  renderUnderlineMarkup,
  toggleUnderlineSelection,
} from '@/utils/text/underlineMarkup'

const splitIntoSentences = (text: string) => {
  if (!text) return []
  const regex = /[^。！？.!?\n]+[。！？.!?\n]*/g
  return text.match(regex) || [text]
}

function ArticleQuestionPreview({ text }: { text: string }) {
  const safeText = escapeHtml(text)
  const html = renderUnderlineMarkup(
    renderSafeArticleContentBlocksHtml(
      parseArticleContentBlocks(
        safeText
          .split(/\n\s*\n/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean),
      ),
    ),
  )

  return (
    <div
      className="reading-passage-body text-sm font-semibold leading-6 text-slate-800"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

type QuestionOption = {
  id: string
  text: string
  isCorrect: boolean
}

type ArticleQuestion = {
  id: string
  questionType: string
  prompt: string | null
  options: QuestionOption[]
  contextSentence?: string | null
}

type EditableArticle = {
  id?: string
  title?: string | null
  content?: string | null
  sourceKind?: string | null
  publishedDate?: string | null
  edition?: string | null
  pageNumber?: string | null
  audioFile?: string | null
  questions?: ArticleQuestion[]
  category?: {
    levelId?: string | null
    collectionType?: CollectionType | null
  } | null
}

export default function EditArticleUI({
  article,
  returnHref,
}: {
  article: EditableArticle
  returnHref?: string
}) {
  const dialog = useDialog()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const articleTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const backHref =
    returnHref ||
    (article.category?.collectionType === 'PAPER' && article.category.levelId
      ? `/manage/practice/${article.category.levelId}`
      : '/manage/reading')
  const backLabel = returnHref
    ? '返回阅读'
    : article.category?.collectionType === 'PAPER'
      ? '返回试卷'
      : '返回阅读'

  const [title, setTitle] = useState(article.title || '')
  const [content, setContent] = useState(article.content || '')
  const [sourceKind, setSourceKind] = useState(
    article.sourceKind === 'NEWS' ? 'NEWS' : 'ARTICLE',
  )
  const [publishedDate, setPublishedDate] = useState(
    article.publishedDate || '',
  )
  const [edition, setEdition] = useState(article.edition || '')
  const [pageNumber, setPageNumber] = useState(article.pageNumber || '')
  const [audioFile, setAudioFile] = useState(article.audioFile || '')
  const [pendingAudioFile, setPendingAudioFile] = useState<File | null>(null)
  const [questions, setQuestions] = useState<ArticleQuestion[]>(
    article.questions || [],
  )
  const isPaperArticle = article.category?.collectionType === 'PAPER'

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null,
  )

  const createDefaultOptions = () => [
    { id: `opt_${Date.now()}_1`, text: '选项 A', isCorrect: true },
    { id: `opt_${Date.now()}_2`, text: '选项 B', isCorrect: false },
    { id: `opt_${Date.now()}_3`, text: '选项 C', isCorrect: false },
    { id: `opt_${Date.now()}_4`, text: '选项 D', isCorrect: false },
  ]

  const handleAddNewQuestion = (
    type: 'READING_COMPREHENSION' | 'FILL_BLANK',
  ) => {
    const newQ = {
      id: `new_${Date.now()}`,
      questionType: type,
      prompt:
        type === 'READING_COMPREHENSION'
          ? '请根据文章内容选择正确答案'
          : '请根据语境填入合适的词汇',
      options: createDefaultOptions(),
    }
    setQuestions([...questions, newQ])
    setEditingQuestionId(newQ.id)
  }

  const handleCreateBlankQuestion = () => {
    const textarea = articleTextareaRef.current
    if (!textarea) return
    const selectedText = content
      .slice(textarea.selectionStart, textarea.selectionEnd)
      .trim()
    if (!selectedText || selectedText.length >= 50) {
      dialog.toast('请先在正文中选择需要设为空格的文字。', {
        tone: 'error',
      })
      return
    }
    const sentences = splitIntoSentences(content)
    const targetSentence =
      sentences.find((s: string) =>
        s.toLowerCase().includes(selectedText.toLowerCase()),
      ) || content

    const newQuestion = {
      id: `sel_${Date.now()}`,
      questionType: 'FILL_BLANK',
      prompt: targetSentence.trim(),
      contextSentence: targetSentence.trim(),
      options: [
        { id: `opt_${Date.now()}_1`, text: selectedText, isCorrect: true },
        { id: `opt_${Date.now()}_2`, text: '干扰项1', isCorrect: false },
        { id: `opt_${Date.now()}_3`, text: '干扰项2', isCorrect: false },
        { id: `opt_${Date.now()}_4`, text: '干扰项3', isCorrect: false },
      ],
    }

    setQuestions([...questions, newQuestion])
    setEditingQuestionId(newQuestion.id)
  }

  const handleToggleUnderline = () => {
    const textarea = articleTextareaRef.current
    if (!textarea) return
    const result = toggleUnderlineSelection(
      content,
      textarea.selectionStart,
      textarea.selectionEnd,
    )
    if (!result.changed) {
      dialog.toast('请先选择需要加下划线的文字。', { tone: 'error' })
      return
    }
    setContent(result.text)
    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  const handleInsertTable = () => {
    const textarea = articleTextareaRef.current
    const result = insertArticleText(
      content,
      ARTICLE_TABLE_TEMPLATE,
      textarea?.selectionStart ?? content.length,
      textarea?.selectionEnd ?? content.length,
    )
    setContent(result.text)
    window.requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(result.cursor, result.cursor)
    })
  }

  const handleUpdateQuestion = (id: string, field: string, value: unknown) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
    )
  }

  const handleUpdateOption = (
    qId: string,
    optIndex: number,
    field: keyof QuestionOption,
    value: QuestionOption[keyof QuestionOption],
  ) => {
    setQuestions(
      questions.map((q) => {
        if (q.id !== qId) return q
        const newOptions = [...q.options]
        if (field === 'isCorrect') {
          newOptions.forEach((o, i) => (o.isCorrect = i === optIndex))
        } else {
          newOptions[optIndex] = { ...newOptions[optIndex], [field]: value }
        }
        return { ...q, options: newOptions }
      }),
    )
  }

  const handleAddOption = (questionId: string) => {
    setQuestions((current) =>
      current.map((question) =>
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
    setQuestions((current) =>
      current.map((question) =>
        question.id === questionId
          ? {
              ...question,
              options: removeQuestionOptionAt(question.options, optionIndex),
            }
          : question,
      ),
    )
  }

  const handleReorderQuestions = async (orderedIds: string[]) => {
    const reordered = orderedIds
      .map((id) => questions.find((q) => q.id === id))
      .filter((item): item is ArticleQuestion => Boolean(item))
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
    setQuestions((prev) => prev.filter((item) => item.id !== questionId))
    if (editingQuestionId === questionId) {
      setEditingQuestionId(null)
    }
  }

  const handleSaveArticle = async () => {
    setIsSaving(true)
    try {
      let nextAudioFile = audioFile
      if (pendingAudioFile) {
        const formData = new FormData()
        formData.set('audioFile', pendingAudioFile)
        formData.set('folder', 'reading')
        const uploadResult = await uploadAudioFileAdmin(formData)
        if (
          !uploadResult.success ||
          !('path' in uploadResult) ||
          !uploadResult.path
        ) {
          dialog.toast(uploadResult.message || '音频上传失败', {
            tone: 'error',
          })
          return
        }
        nextAudioFile = uploadResult.path
      }

      const result = await updateArticleWithQuestions({
        passageId: article.id || '',
        title,
        content,
        sourceKind,
        publishedDate,
        edition,
        pageNumber,
        audioFile: nextAudioFile,
        questions: questions.map((question) => ({
          id: question.id,
          questionType: question.questionType,
          prompt: question.prompt,
          contextSentence: question.contextSentence || '',
          options: question.options.map((option) => ({
            id: option.id,
            text: option.text,
            isCorrect: option.isCorrect,
          })),
        })),
      })
      if (result.success) {
        setAudioFile(nextAudioFile)
        setPendingAudioFile(null)
        if (audioInputRef.current) audioInputRef.current.value = ''
        dialog.toast(isPaperArticle ? '文章与题目已保存' : '文章已保存', {
          tone: 'success',
        })
        router.refresh()
      } else {
        dialog.toast(result.message || '保存失败', { tone: 'error' })
      }
    } catch {
      dialog.toast('保存失败，请重试', { tone: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 pb-12 md:px-6">
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-slate-200 bg-stone-50/95 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <Link
              href={backHref}
              className="text-xs font-semibold text-slate-500 transition hover:text-slate-950"
            >
              ← {backLabel}
            </Link>
            <input
              type="text"
              aria-label="文章标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="文章标题"
              className="mt-1 block w-full border-0 bg-transparent p-0 text-xl font-black tracking-tight text-slate-950 outline-none placeholder:text-slate-300 focus:ring-0 md:text-2xl"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveArticle}
            disabled={isSaving}
            className="ui-btn ui-btn-primary h-10 shrink-0 px-5 disabled:opacity-50"
          >
            {isSaving ? '保存中' : '保存'}
          </button>
        </header>

        {!isPaperArticle ? (
          <section className="border-b border-slate-200 py-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {(
                [
                  ['ARTICLE', '文章'],
                  ['NEWS', '新闻'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sourceKind === value}
                  onClick={() => setSourceKind(value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                    sourceKind === value
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {sourceKind === 'NEWS' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  type="date"
                  value={publishedDate}
                  onChange={(event) => setPublishedDate(event.target.value)}
                  aria-label="日期"
                  className="border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                />
                <select
                  value={edition}
                  onChange={(event) => setEdition(event.target.value)}
                  aria-label="刊别"
                  className="border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                >
                  <option value="">刊别</option>
                  <option value="MORNING">朝刊</option>
                  <option value="EVENING">夕刊</option>
                  <option value="FLASH">速報</option>
                </select>
                <input
                  value={pageNumber}
                  onChange={(event) => setPageNumber(event.target.value)}
                  placeholder="版面，例如：12面"
                  aria-label="版面"
                  className="border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                />
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="border-b border-slate-200 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">文章音频</h2>
              <p className="mt-1 text-xs text-slate-500">
                上传全文朗读；支持 MP3、M4A、WAV、OGG、AAC、FLAC 和 WebM。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,audio/aac,audio/flac,audio/webm,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm"
                aria-label="上传文章音频"
                onChange={(event) =>
                  setPendingAudioFile(event.currentTarget.files?.[0] || null)
                }
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="ui-btn ui-btn-sm">
                {audioFile || pendingAudioFile ? '替换音频' : '选择音频'}
              </button>
              {pendingAudioFile ? (
                <button
                  type="button"
                  onClick={() => {
                    setPendingAudioFile(null)
                    if (audioInputRef.current) audioInputRef.current.value = ''
                  }}
                  className="ui-btn ui-btn-sm">
                  取消选择
                </button>
              ) : audioFile ? (
                <button
                  type="button"
                  onClick={() => setAudioFile('')}
                  className="ui-btn ui-btn-sm text-rose-600">
                  移除音频
                </button>
              ) : null}
            </div>
          </div>

          {pendingAudioFile ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold">{pendingAudioFile.name}</p>
              <p className="mt-1 text-xs text-slate-400">
                {(pendingAudioFile.size / 1024 / 1024).toFixed(1)} MB · 保存文章时上传
              </p>
            </div>
          ) : audioFile ? (
            <div className="mt-4 max-w-2xl">
              <ManageAudioPlayer src={audioFile} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">尚未上传音频。</p>
          )}
        </section>

        <div
          className={`grid gap-8 py-6 ${isPaperArticle ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.85fr)]' : ''}`}
        >
          <section className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold">正文</h2>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={handleInsertTable}
                  className="px-2 py-1 text-xs font-semibold text-slate-500 transition hover:text-slate-950"
                >
                  插入表格
                </button>
                <span className="h-4 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={handleToggleUnderline}
                  className="px-2 py-1 text-xs font-semibold text-slate-500 transition hover:text-slate-950"
                >
                  添加/取消下划线
                </button>
                {isPaperArticle ? (
                  <button
                    type="button"
                    onClick={handleCreateBlankQuestion}
                    className="px-2 py-1 text-xs font-semibold text-slate-500 transition hover:text-slate-950"
                  >
                    生成問題7填空
                  </button>
                ) : null}
              </div>
            </div>
            <textarea
              ref={articleTextareaRef}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="粘贴正文；表格使用 | 分隔"
              className="min-h-[68vh] w-full resize-y border border-slate-300 bg-white px-5 py-4 text-base leading-8 text-slate-800 outline-none selection:bg-slate-200 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </section>

          {isPaperArticle ? (
            <section className="min-w-0 lg:border-l lg:border-slate-200 lg:pl-8">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold">题目 {questions.length}</h2>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      handleAddNewQuestion('READING_COMPREHENSION')
                    }
                    className="text-xs font-semibold text-slate-500 hover:text-slate-950"
                  >
                    + 阅读题
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddNewQuestion('FILL_BLANK')}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-950"
                  >
                    + 問題7
                  </button>
                </div>
              </div>

              {questions.length === 0 ? (
                <p className="border-y border-slate-200 py-8 text-sm text-slate-400">
                  暂无题目
                </p>
              ) : (
                <SortableList
                  items={questions}
                  action={handleReorderQuestions}
                  className="flex flex-col border-y border-slate-200"
                >
                  {questions.map((question, index) => {
                    const isEditing = editingQuestionId === question.id
                    return (
                      <SortableItem key={question.id} id={question.id}>
                        <div className="border-b border-slate-200 py-4 last:border-b-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2 text-xs">
                              <ActionInterceptor>
                                <DragHandle />
                              </ActionInterceptor>
                              <strong className="text-slate-900">
                                {index + 1}
                              </strong>
                              <span className="truncate font-semibold text-slate-400">
                                {getQuestionTypeLabel(question.questionType)}
                              </span>
                            </div>
                            <ActionInterceptor>
                              <div className="flex shrink-0 items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingQuestionId(
                                      isEditing ? null : question.id,
                                    )
                                  }
                                  className="text-xs font-semibold text-slate-500 hover:text-slate-950"
                                >
                                  {isEditing ? '完成' : '编辑'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleRemoveQuestion(
                                      question.id,
                                      index,
                                    )
                                  }
                                  className="text-xs font-semibold text-rose-500 hover:text-rose-700"
                                >
                                  删除
                                </button>
                              </div>
                            </ActionInterceptor>
                          </div>

                          {isEditing ? (
                            <ActionInterceptor>
                              <div className="mt-4 bg-slate-100/70 px-3 py-4">
                                <label className="text-xs font-semibold text-slate-500">
                                  题干
                                  <textarea
                                    value={question.prompt ?? ''}
                                    onChange={(event) =>
                                      handleUpdateQuestion(
                                        question.id,
                                        'prompt',
                                        event.target.value,
                                      )
                                    }
                                    rows={3}
                                    className="mt-1 w-full resize-y border border-slate-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                                    placeholder="输入题干"
                                  />
                                </label>
                                <div className="mt-4 flex items-center justify-between gap-3">
                                  <span className="text-xs font-semibold text-slate-500">
                                    选项 {question.options.length}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddOption(question.id)}
                                    className="text-xs font-semibold text-slate-500 hover:text-slate-950"
                                  >
                                    + 添加选项
                                  </button>
                                </div>
                                <div className="mt-2 border-t border-slate-200">
                                  {question.options.map(
                                    (option, optionIndex) => (
                                      <div
                                        key={option.id}
                                        className="flex items-center gap-2 border-b border-slate-200 py-2"
                                      >
                                        <input
                                          type="radio"
                                          checked={option.isCorrect}
                                          onChange={() =>
                                            handleUpdateOption(
                                              question.id,
                                              optionIndex,
                                              'isCorrect',
                                              true,
                                            )
                                          }
                                          aria-label={`设为正确答案 ${optionIndex + 1}`}
                                        />
                                        <input
                                          type="text"
                                          value={option.text}
                                          onChange={(event) =>
                                            handleUpdateOption(
                                              question.id,
                                              optionIndex,
                                              'text',
                                              event.target.value,
                                            )
                                          }
                                          className="min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none focus:ring-0"
                                        />
                                        <button
                                          type="button"
                                          disabled={
                                            question.options.length <=
                                            MIN_QUESTION_OPTION_COUNT
                                          }
                                          onClick={() =>
                                            handleRemoveOption(
                                              question.id,
                                              optionIndex,
                                            )
                                          }
                                          aria-label={`删除选项 ${optionIndex + 1}`}
                                          className="text-xs font-semibold text-rose-500 disabled:opacity-25"
                                        >
                                          删除
                                        </button>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            </ActionInterceptor>
                          ) : (
                            <div className="mt-3">
                              {question.prompt ? (
                                <ArticleQuestionPreview
                                  text={question.prompt}
                                />
                              ) : (
                                <p className="text-sm text-slate-400">
                                  （无题干）
                                </p>
                              )}
                              <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                                {question.options.map((option, optionIndex) => (
                                  <p
                                    key={option.id}
                                    className={`text-xs leading-5 ${
                                      option.isCorrect
                                        ? 'font-bold text-slate-950'
                                        : 'text-slate-500'
                                    }`}
                                  >
                                    {optionIndex + 1}. {option.text}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </SortableItem>
                    )
                  })}
                </SortableList>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  )
}
