'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

import {
  SortableList,
  SortableItem,
  DragHandle,
  ActionInterceptor,
} from '@/app/manage/level/DndSystem'
import { updateSortOrder } from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'

const splitIntoSentences = (text: string) => {
  if (!text) return []
  const regex = /[^。！？.!?\n]+[。！？.!?\n]*/g
  return text.match(regex) || [text]
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
  title?: string | null
  content?: string | null
  questions?: ArticleQuestion[]
  category?: {
    levelId?: string | null
  } | null
}

export default function EditArticleUI({ article }: { article: EditableArticle }) {
  const dialog = useDialog()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

  const [title, setTitle] = useState(article.title || '')
  const [content, setContent] = useState(article.content || '')
  const [questions, setQuestions] = useState<ArticleQuestion[]>(
    article.questions || [],
  )

  const [selection, setSelection] = useState<{
    text: string
    x: number
    y: number
  } | null>(null)

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null,
  )

  const [showAddMenu, setShowAddMenu] = useState(false)

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
    setShowAddMenu(false)
  }

  // ================= 划词生成填空题 =================
  const handleMouseUp = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (isMobile) return

    const textarea = e.target as HTMLTextAreaElement
    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    if (start !== end) {
      const selectedText = textarea.value.substring(start, end).trim()
      if (selectedText.length > 0 && selectedText.length < 50) {
        setSelection({ text: selectedText, x: e.clientX, y: e.clientY })
        return
      }
    }
    setSelection(null)
  }

  const handleCreateBlankQuestion = () => {
    if (!selection) return
    const sentences = splitIntoSentences(content)
    const targetSentence =
      sentences.find((s: string) =>
        s.toLowerCase().includes(selection.text.toLowerCase()),
      ) || content

    const newQuestion = {
      id: `sel_${Date.now()}`,
      questionType: 'FILL_BLANK',
      prompt: targetSentence.trim(),
      contextSentence: targetSentence.trim(),
      options: [
        { id: `opt_${Date.now()}_1`, text: selection.text, isCorrect: true },
        { id: `opt_${Date.now()}_2`, text: '干扰项1', isCorrect: false },
        { id: `opt_${Date.now()}_3`, text: '干扰项2', isCorrect: false },
        { id: `opt_${Date.now()}_4`, text: '干扰项3', isCorrect: false },
      ],
    }

    setQuestions([...questions, newQuestion])
    setEditingQuestionId(newQuestion.id)
    setSelection(null)
  }

  const handleUpdateQuestion = (id: string, field: string, value: unknown) => {
    setQuestions(
      questions.map(q => (q.id === id ? { ...q, [field]: value } : q)),
    )
  }

  const handleUpdateOption = (
    qId: string,
    optIndex: number,
    field: keyof QuestionOption,
    value: QuestionOption[keyof QuestionOption],
  ) => {
    setQuestions(
      questions.map(q => {
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

  const handleReorderQuestions = async (orderedIds: string[]) => {
    const reordered = orderedIds
      .map(id => questions.find(q => q.id === id))
      .filter((item): item is ArticleQuestion => Boolean(item))
    setQuestions(reordered)
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
    if (editingQuestionId === questionId) {
      setEditingQuestionId(null)
    }
  }

  const handleSaveArticle = async () => {
    setIsSaving(true)
    setTimeout(() => {
      dialog.toast('文章与题目已保存', { tone: 'success' })
      setIsSaving(false)
    }, 800)
  }

  return (
    <div className='relative mx-auto max-w-7xl animate-in px-3 pb-28 pt-3 fade-in duration-500 md:px-8 md:pb-32 md:pt-6'>
      {selection && !isMobile && (
        <div
          className='fixed z-[100] flex items-center gap-3 rounded-2xl bg-gray-900 px-4 py-2.5 text-white shadow-2xl shadow-indigo-500/10 animate-in zoom-in-95 duration-200'
          style={{ top: selection.y - 65, left: selection.x - 50 }}>
          <span className='text-sm font-bold max-w-30 truncate text-indigo-100'>
            "{selection.text}"
          </span>
          <div className='w-px h-5 bg-gray-700'></div>
          <button
            onClick={handleCreateBlankQuestion}
            className='text-xs font-bold text-indigo-300 hover:text-indigo-100 whitespace-nowrap active:scale-95 transition-all'>
            + 设为填空题
          </button>
        </div>
      )}

      <div className='sticky top-3 z-40 mb-6 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:px-5'>
        <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
          <div>
          <Link
            href={`/manage/level/${article.category?.levelId}`}
            className='mb-2 inline-flex rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-100'>
            返回分组
          </Link>
          <h1 className='text-3xl font-black text-gray-900 flex items-center gap-3'>
            <input
              type='text'
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder='输入文章标题...'
              className='w-full text-xl md:text-2xl font-black bg-transparent border-none outline-none focus:ring-0 p-0 text-gray-800 placeholder-gray-300'
            />
          </h1>
        </div>
        <button
          onClick={handleSaveArticle}
          disabled={isSaving}
          className='inline-flex items-center justify-center rounded-xl bg-indigo-600 px-7 py-3 text-sm font-black text-white transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-50'>
          {isSaving ? '正在保存...' : '保存修改'}
        </button>
      </div>
      </div>

      <div className='flex flex-col lg:flex-row gap-6 md:gap-8 items-start relative z-10'>
        {/* 左侧：文章正文 */}
        <div className='w-full lg:flex-3 flex flex-col gap-6 relative'>
          <div className='bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[70vh]'>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              onMouseUp={handleMouseUp}
              placeholder='在此粘贴文章正文... (电脑端可划选文字出题)'
              className='flex-1 w-full p-6 bg-white border-none outline-none resize-none focus:ring-0 text-gray-700 leading-loose text-base md:text-lg custom-scrollbar selection:bg-indigo-200 selection:text-indigo-900'
            />
          </div>
          <p className='absolute -bottom-5.5 left-3 z-20 text-xs font-bold text-indigo-500'>
            可在正文中划词，快速生成填空题。
          </p>
        </div>

        {/* 右侧：题目管理区 */}
        <div className='w-full lg:flex-2 bg-white rounded-3xl border border-gray-200 p-5 md:p-6 lg:sticky lg:top-[12vh] max-h-[85vh] flex flex-col shadow-sm'>
          <div className='flex items-center justify-between mb-6 shrink-0 relative'>
            <h2 className='text-xl font-black text-gray-800 flex items-center gap-2'>
              关联题目{' '}
              <span className='text-gray-400 font-medium text-sm'>
                ({questions.length})
              </span>
            </h2>

            <div className='relative'>
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className='text-xs px-4 py-2.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors flex items-center gap-1.5'>
                + 新增题目
              </button>

              {showAddMenu && (
                <>
                  <div
                    className='fixed inset-0 z-40'
                    onClick={() => setShowAddMenu(false)}></div>
                  <div className='absolute right-0 top-full mt-2 w-36 bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-50 animate-in fade-in slide-in-from-top-2'>
                    <button
                      onClick={() =>
                        handleAddNewQuestion('READING_COMPREHENSION')
                      }
                      className='w-full text-left px-3 py-2.5 hover:bg-gray-50 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-2'>
                      阅读理解
                    </button>
                    <button
                      onClick={() => handleAddNewQuestion('FILL_BLANK')}
                      className='w-full text-left px-3 py-2.5 hover:bg-gray-50 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-2'>
                      填空题
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className='flex-1 overflow-y-auto pr-2 custom-scrollbar'>
            {questions.length === 0 ? (
              <div className='text-center py-16 text-gray-400 font-medium bg-white rounded-2xl border border-dashed border-gray-200'>
                暂无题目，可通过新增或划词快速创建。
              </div>
            ) : (
              <SortableList
                items={questions}
                action={handleReorderQuestions}
                className='space-y-4 flex flex-col pb-10'>
                {questions.map((q, index: number) => {
                  const isEditing = editingQuestionId === q.id

                  return (
                    <SortableItem key={q.id} id={q.id}>
                      {isEditing ? (
                        <div className='bg-indigo-50/50 p-4.5 rounded-2xl border border-indigo-200 shadow-inner group relative cursor-default'>
                          <div className='flex justify-between items-center mb-3'>
                            <div className='flex items-center gap-2.5'>
                              <span className='px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500 text-white animate-pulse'>
                                编辑中 Q{index + 1}
                              </span>
                            </div>
                            <ActionInterceptor>
                              <button
                                onClick={() => setEditingQuestionId(null)}
                                className='text-xs bg-indigo-600 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-indigo-700 shadow-sm transition-colors'>
                                完成
                              </button>
                            </ActionInterceptor>
                          </div>

                          <ActionInterceptor>
                            <textarea
                              value={q.prompt ?? ''}
                              onChange={e =>
                                handleUpdateQuestion(
                                  q.id,
                                  'prompt',
                                  e.target.value,
                                )
                              }
                              className='w-full p-3 bg-white border border-indigo-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 mb-3 resize-none h-20'
                              placeholder='输入题干...'
                            />
                            <div className='space-y-2'>
                              {q.options?.map((opt, i: number) => (
                                <div
                                  key={opt.id}
                                  className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${opt.isCorrect ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-indigo-100'}`}>
                                  <input
                                    type='radio'
                                    checked={opt.isCorrect}
                                    onChange={() =>
                                      handleUpdateOption(
                                        q.id,
                                        i,
                                        'isCorrect',
                                        true,
                                      )
                                    }
                                    className='w-4 h-4 text-emerald-600 focus:ring-emerald-500 cursor-pointer'
                                  />
                                  <input
                                    type='text'
                                    value={opt.text}
                                    onChange={e =>
                                      handleUpdateOption(
                                        q.id,
                                        i,
                                        'text',
                                        e.target.value,
                                      )
                                    }
                                    className='flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold text-gray-800 outline-none'
                                  />
                                </div>
                              ))}
                            </div>
                          </ActionInterceptor>
                        </div>
                      ) : (
                        <div className='bg-white p-4.5 rounded-2xl border border-gray-100 shadow-sm hover:border-indigo-200 transition-colors group relative'>
                          <div className='flex justify-between items-start mb-3 gap-2'>
                            <div className='flex items-center gap-2.5 flex-wrap'>
                              <ActionInterceptor>
                                <DragHandle />
                              </ActionInterceptor>
                              <span className='bg-gray-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded'>
                                Q{index + 1}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${q.questionType === 'FILL_BLANK' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-purple-50 border-purple-100 text-purple-700'}`}>
                                {q.questionType === 'FILL_BLANK'
                                  ? '填空题'
                                  : '阅读题'}
                              </span>
                            </div>
                            <div className='flex gap-2.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity'>
                              <ActionInterceptor>
                                <button
                                  onClick={() => setEditingQuestionId(q.id)}
                                  className='text-xs text-indigo-500 hover:text-indigo-700 font-bold bg-indigo-50 px-2.5 py-1 rounded-md'>
                                  编辑
                                </button>
                              </ActionInterceptor>
                              <ActionInterceptor>
                                <button
                                  onClick={() =>
                                    void handleRemoveQuestion(q.id, index)
                                  }
                                  className='rounded-md border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 hover:text-red-700'>
                                  移除题目
                                </button>
                              </ActionInterceptor>
                            </div>
                          </div>

                          <p className='text-sm text-gray-800 font-bold leading-relaxed mb-3 line-clamp-3'>
                            {q.prompt || '（无题干）'}
                          </p>

                          <div className='space-y-1.5'>
                            {q.options?.map((opt, i: number) => (
                              <div
                                key={opt.id}
                                className={`text-xs p-2 rounded-lg border ${opt.isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                                {String.fromCharCode(65 + i)}. {opt.text}
                                {opt.isCorrect && (
                                  <span className='float-right text-emerald-600 font-black'>
                                    正确
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </SortableItem>
                  )
                })}
              </SortableList>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
