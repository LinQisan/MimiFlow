'use client'

import { useRef, useState } from 'react'
import type { CollectionType } from '@prisma/client'
import { useRouter } from 'next/navigation'
import DatePicker from '@/components/ui/DatePicker'
import CustomSelect from '@/components/ui/CustomSelect'
import Link from 'next/link'

import {
  SortableList,
  SortableItem,
  DragHandle,
  ActionInterceptor,
} from '@/modules/content/collections/components/DndSystem'
import {
  moveReadingMaterialToPaper,
  updateArticleWithQuestions,
} from '@/modules/content/actions/materials'
import { uploadAudioFileAdmin } from '@/modules/media/audio/manage-actions'
import ManageAudioPlayer from '@/modules/listening/components/ManageAudioPlayer'
import { updateSortOrder } from '@/modules/practice/actions/questions'
import { useDialog } from '@/context/DialogContext'
import { getQuestionTypeLabel } from '@/utils/questions/typeLabels'
import {
  createQuestionOption,
} from '@/modules/questions/domain/editor'
import {
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
} from '@/utils/questions/editorOptions'
import {
  ARTICLE_TABLE_TEMPLATE,
  insertArticleFootnote,
  insertArticleText,
} from '@/modules/reading/domain/article-editing'
import {
  parseArticleContentBlocks,
  renderSafeArticleContentBlocksHtml,
} from '@/modules/reading/domain/article-blocks'
import { escapeHtml } from '@/utils/language/japaneseRuby'
import {
  renderUnderlineMarkup,
  toggleUnderlineSelection,
} from '@/utils/text/underlineMarkup'
import ArticleBodyPreview from '@/modules/reading/components/ArticleBodyPreview'

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

type ArticleSibling = {
  id: string
  title: string
  questionCount: number
}

function PaperReadingNavigator({
  paperTitle,
  currentId,
  siblings,
  returnHref,
}: {
  paperTitle: string
  currentId: string
  siblings: ArticleSibling[]
  returnHref?: string
}) {
  const currentIndex = Math.max(
    0,
    siblings.findIndex(item => item.id === currentId),
  )
  const current = siblings[currentIndex]
  const buildHref = (id: string) => {
    const base = `/manage/reading/${encodeURIComponent(id)}`
    return returnHref
      ? `${base}?returnTo=${encodeURIComponent(returnHref)}`
      : base
  }

  return (
    <nav
      aria-label='同一试卷阅读题导航'
      className='border-b border-slate-200 py-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-[10px] font-bold tracking-[0.12em] text-slate-400'>
            试卷阅读导航
          </p>
          <p className='mt-1 truncate text-sm font-semibold text-slate-900'>
            {paperTitle || '当前试卷'}
            <span className='ml-2 font-normal text-slate-400'>
              {currentIndex + 1}/{siblings.length}
            </span>
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {currentIndex > 0 ? (
            <Link
              href={buildHref(siblings[currentIndex - 1].id)}
              className='ui-btn ui-btn-sm'>
              ← 上一篇
            </Link>
          ) : null}
          {currentIndex < siblings.length - 1 ? (
            <Link
              href={buildHref(siblings[currentIndex + 1].id)}
              className='ui-btn ui-btn-sm'>
              下一篇 →
            </Link>
          ) : null}
        </div>
      </div>

      <div className='mt-3 grid grid-cols-7 gap-1.5 sm:grid-cols-10 lg:grid-cols-13'>
        {siblings.map((item, index) => {
          const active = item.id === currentId
          const label = `第${index + 1}篇：${item.title}，${item.questionCount}题`
          const content = (
            <>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <span
                className={`text-[9px] font-medium ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                {item.questionCount}题
              </span>
            </>
          )
          const className = `flex h-11 flex-col items-center justify-center border text-xs font-semibold tabular-nums transition ${
            active
              ? 'cursor-default border-slate-950 bg-slate-950 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-500 hover:text-slate-950'
          }`

          return active ? (
            <span
              key={item.id}
              aria-current='page'
              aria-label={label}
              title={`${item.title} · ${item.questionCount}题`}
              className={className}>
              {content}
            </span>
          ) : (
            <Link
              key={item.id}
              href={buildHref(item.id)}
              prefetch={false}
              aria-label={label}
              title={`${item.title} · ${item.questionCount}题`}
              className={className}>
              {content}
            </Link>
          )
        })}
      </div>
      <p className='mt-2 truncate text-xs text-slate-500'>
        当前：{current?.title || '阅读材料'}
      </p>
    </nav>
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
  newsSection?: string | null
  audioFile?: string | null
  questions?: ArticleQuestion[]
  category?: {
    levelId?: string | null
    title?: string | null
    collectionType?: CollectionType | null
    siblings?: ArticleSibling[]
  } | null
}

export default function EditArticleUI({
  article,
  returnHref,
  moveTargets = [],
}: {
  article: EditableArticle
  returnHref?: string
  moveTargets?: Array<{ id: string; title: string; level: string | null }>
}) {
  const dialog = useDialog()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [moveTargetId, setMoveTargetId] = useState('')
  const articleTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const backHref =
    returnHref ||
    (article.category?.collectionType === 'PAPER' && article.category.levelId
      ? `/manage/practice/${article.category.levelId}`
      : '/manage/reading')
  const backLabel = returnHref
    ? returnHref.startsWith('/manage/practice/')
      ? '返回试卷'
      : '返回阅读'
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
  const [newsSection, setNewsSection] = useState(article.newsSection || '')
  const [audioFile, setAudioFile] = useState(article.audioFile || '')
  const [pendingAudioFile, setPendingAudioFile] = useState<File | null>(null)
  const [contentView, setContentView] = useState<'edit' | 'preview'>('edit')
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

  const handleInsertFootnote = () => {
    const textarea = articleTextareaRef.current
    if (!textarea) return
    const result = insertArticleFootnote(
      content,
      textarea.selectionStart,
      textarea.selectionEnd,
    )
    if (!result.changed) {
      dialog.toast('请先选择需要添加注解的词语或短句。', {
        tone: 'error',
      })
      return
    }
    setContent(result.text)
    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.cursor, result.cursor)
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
        newsSection,
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

  const handleMoveToPaper = async () => {
    const sourcePaperId = article.category?.levelId || ''
    const target = moveTargets.find(item => item.id === moveTargetId)
    if (!article.id || !sourcePaperId || !target || isMoving) return
    const confirmed = await dialog.confirm(
      `将整篇文章及其 ${questions.length} 道题移动到“${target.title}”？`,
      { title: '移动到其他试卷', confirmText: '移动' },
    )
    if (!confirmed) return

    setIsMoving(true)
    try {
      const result = await moveReadingMaterialToPaper({
        materialId: article.id,
        sourcePaperId,
        targetPaperId: target.id,
      })
      dialog.toast(result.message, {
        tone: result.success ? 'success' : 'error',
      })
      if (!result.success) return
      setMoveTargetId('')
      router.refresh()
    } finally {
      setIsMoving(false)
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 pb-12 md:px-8">
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-slate-200 bg-stone-50/95 py-4 backdrop-blur md:top-[4.5rem]">
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
              className="mt-1 block w-full border-0 bg-transparent p-0 text-xl font-bold tracking-tight text-slate-950 outline-none placeholder:text-slate-300 focus:ring-0 md:text-2xl"
            />
            {isPaperArticle ? (
              <div className='mt-1 flex flex-wrap items-center gap-2'>
                <p className='text-xs text-slate-400'>
                  {article.category?.title || '真题试卷'} · 阅读正文与题目编辑
                </p>
                {moveTargets.length > 0 ? (
                  <div className='flex items-center gap-1.5'>
                    <CustomSelect
                      value={moveTargetId}
                      onChange={event => setMoveTargetId(event.target.value)}
                      aria-label='移动到其他试卷'
                      disabled={isMoving}
                      className='h-7 max-w-48 border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 outline-none focus:border-slate-400'>
                      <option value=''>移动到其他试卷…</option>
                      {moveTargets.map(target => (
                        <option key={target.id} value={target.id}>
                          {target.level ? `${target.level} · ` : ''}
                          {target.title}
                        </option>
                      ))}
                    </CustomSelect>
                    <button
                      type='button'
                      onClick={() => void handleMoveToPaper()}
                      disabled={!moveTargetId || isMoving || isSaving}
                      className='h-7 border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40'>
                      {isMoving ? '移动中…' : '移动'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
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

        {isPaperArticle &&
        article.id &&
        (article.category?.siblings?.length || 0) > 1 ? (
          <PaperReadingNavigator
            paperTitle={article.category?.title || ''}
            currentId={article.id}
            siblings={article.category?.siblings || []}
            returnHref={returnHref}
          />
        ) : null}

        {!isPaperArticle ? (
          <section className="py-5">
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
                <DatePicker
                  value={publishedDate}
                  onChange={setPublishedDate}
                  aria-label="日期"
                />
                <CustomSelect
                  value={edition}
                  onChange={(event) => setEdition(event.target.value)}
                  aria-label="刊别"
                  className="border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                >
                  <option value="">刊别</option>
                  <option value="MORNING">朝刊</option>
                  <option value="EVENING">夕刊</option>
                  <option value="FLASH">速報</option>
                </CustomSelect>
                <input
                  value={newsSection}
                  onChange={(event) => setNewsSection(event.target.value)}
                  placeholder="版面，例如：12面"
                  aria-label="版面"
                  className="border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
                />
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="py-5">
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
          className={`grid gap-8 py-6 ${
            isPaperArticle
              ? editingQuestionId
                ? 'lg:grid-cols-[minmax(0,1.05fr)_minmax(30rem,0.95fr)]'
                : 'lg:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.85fr)]'
              : ''
          }`}
        >
          <section className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className='flex items-center gap-3'>
                <h2 className="text-sm font-bold">正文</h2>
                <div className='flex border border-slate-200 bg-white p-0.5'>
                  {(['edit', 'preview'] as const).map(mode => (
                    <button
                      key={mode}
                      type='button'
                      aria-pressed={contentView === mode}
                      onClick={() => setContentView(mode)}
                      className={`px-2.5 py-1 text-[11px] font-semibold transition ${
                        contentView === mode
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}>
                      {mode === 'edit' ? '编辑' : '预览'}
                    </button>
                  ))}
                </div>
              </div>
              {contentView === 'edit' ? (
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
                <button
                  type="button"
                  onClick={handleInsertFootnote}
                  className="px-2 py-1 text-xs font-semibold text-slate-500 transition hover:text-slate-950"
                >
                  插入注解
                </button>
                {isPaperArticle ? (
                  <button
                    type="button"
                    onClick={handleCreateBlankQuestion}
                    className="px-2 py-1 text-xs font-semibold text-slate-500 transition hover:text-slate-950"
                  >
                    插入完形填空
                  </button>
                ) : null}
              </div>
              ) : (
                <span className='text-xs text-slate-400'>
                  预览正文、下划线、表格与脚注效果
                </span>
              )}
            </div>
            <p className='mb-2 text-[11px] leading-5 text-slate-400'>
              格式：<code className='text-slate-600'>++下划线++</code>
              <span className='mx-2 text-slate-300'>·</span>
              <code className='text-slate-600'>正文[^1]</code>
              <span className='mx-1'>对应</span>
              <code className='text-slate-600'>[^1]: 注解内容</code>
              <span className='mx-2 text-slate-300'>·</span>
              表格使用 <code className='text-slate-600'>|</code> 分隔
            </p>
            {contentView === 'edit' ? (
              <textarea
                ref={articleTextareaRef}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="支持 Markdown 式脚注：正文[^1]，文末 [^1]: 注解内容；表格使用 | 分隔"
                className="min-h-[68vh] w-full resize-y border border-slate-300 bg-white px-5 py-4 text-base leading-8 text-slate-800 outline-none selection:bg-slate-200 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            ) : (
              <div className='overflow-hidden border border-slate-200'>
                <ArticleBodyPreview text={content} />
              </div>
            )}
          </section>

          {isPaperArticle ? (
            <section className="min-w-0 lg:pl-8">
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
                        <div className="py-4">
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
                            <ActionInterceptor className='block w-full'>
                              <div className='mt-4 pt-4'>
                                <label className='block'>
                                  <span className='flex items-center justify-between gap-3 text-xs font-semibold text-slate-500'>
                                    <span>题干内容</span>
                                    <span className='font-normal tabular-nums text-slate-400'>
                                      {(question.prompt || '').length} 字
                                    </span>
                                  </span>
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
                                    className='mt-1 min-h-24 w-full resize-y border-x-0 border-t-0 border-b border-slate-300 bg-transparent px-0 py-3 text-base leading-7 text-slate-900 outline-none transition focus:border-slate-900 focus:ring-0'
                                    placeholder="输入题干"
                                  />
                                </label>
                                <div className="mt-6 flex items-center justify-between gap-3">
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
                                <div className="mt-2">
                                  {question.options.map(
                                    (option, optionIndex) => (
                                      <div
                                        key={option.id}
                                        className="group flex items-center gap-3 py-3"
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
                                          className="min-w-0 flex-1 border-0 bg-transparent px-0 py-1 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-300 focus:ring-0"
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
                                          className="text-xs font-semibold text-slate-400 transition hover:text-rose-600 disabled:opacity-25"
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
