'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// 🌟 复用拖拽系统
import {
  SortableList,
  SortableItem,
  DragHandle,
  ActionInterceptor,
} from '@/app/admin/level/DndSystem'
import { updateSortOrder } from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'

// 题型样式映射字典
const getTypeConfig = (type: string) => {
  switch (type) {
    case 'PRONUNCIATION':
      return {
        label: '读音题',
        color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      }
    case 'FILL_BLANK':
      return {
        label: '填空题',
        color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
      }
    case 'SORTING':
      return {
        label: '排序题',
        color: 'bg-orange-50 text-orange-700 border-orange-100',
      }
    case 'READING_COMPREHENSION':
      return {
        label: '阅读题',
        color: 'bg-purple-50 text-purple-700 border-purple-100',
      }
    default:
      return {
        label: '普通题',
        color: 'bg-gray-50 text-gray-700 border-gray-100',
      }
  }
}

export default function EditQuizUI({ quiz }: { quiz: any }) {
  const dialog = useDialog()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)

  const [title, setTitle] = useState(quiz.title || '')
  const [questions, setQuestions] = useState<any[]>(quiz.questions || [])

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null,
  )
  const [showAddMenu, setShowAddMenu] = useState(false)

  // ================= 1. 新增题目 =================
  const createDefaultOptions = () => [
    { id: `opt_${Date.now()}_1`, text: '选项 A', isCorrect: true },
    { id: `opt_${Date.now()}_2`, text: '选项 B', isCorrect: false },
    { id: `opt_${Date.now()}_3`, text: '选项 C', isCorrect: false },
    { id: `opt_${Date.now()}_4`, text: '选项 D', isCorrect: false },
  ]

  const handleAddNewQuestion = (
    type: 'PRONUNCIATION' | 'FILL_BLANK' | 'SORTING' | 'READING_COMPREHENSION',
  ) => {
    let defaultPrompt = '请选择正确的答案'
    if (type === 'PRONUNCIATION') defaultPrompt = '划线部分的读音是？'
    if (type === 'SORTING')
      defaultPrompt = '请将下列选项排序，选出星号(★)处的词。'

    const newQ = {
      id: `new_${Date.now()}`,
      questionType: type,
      contextSentence: '',
      targetWord: '',
      prompt: defaultPrompt,
      explanation: '',
      options: createDefaultOptions(),
    }
    setQuestions([...questions, newQ])
    setEditingQuestionId(newQ.id)
    setShowAddMenu(false)
  }

  // ================= 2. 更新与排序 =================
  const handleUpdateQuestion = (id: string, field: string, value: any) => {
    setQuestions(
      questions.map(q => (q.id === id ? { ...q, [field]: value } : q)),
    )
  }

  const handleUpdateOption = (
    qId: string,
    optIndex: number,
    field: string,
    value: any,
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
      .filter(Boolean)
    setQuestions(reordered)
    await updateSortOrder('Question', orderedIds)
    return { success: true }
  }

  const handleSaveQuiz = async () => {
    setIsSaving(true)
    setTimeout(() => {
      void dialog.alert('题库标题、题目及解析已保存成功！(UI演示)')
      setIsSaving(false)
    }, 800)
  }

  return (
    <div className='p-4 md:p-8 max-w-250 mx-auto pb-32 animate-in fade-in duration-500 relative'>
      {/* ================= 🌟 极简吸顶头部 ================= */}
      <div className='mb-8 flex flex-col md:flex-row md:items-start justify-between gap-4 sticky top-0 bg-white/95 backdrop-blur-md z-40 py-5 -mx-4 px-4 border-b border-gray-100 shadow-sm'>
        <div className='flex items-start gap-3 flex-1'>
          {/* 返回按钮 */}
          <Link
            href={`/admin/level/${quiz.category?.levelId}`}
            className='mt-2 p-2 bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-full transition-colors shrink-0'
            title='返回列表'>
            <svg
              className='w-5 h-5'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2.5}
                d='M10 19l-7-7m0 0l7-7m-7 7h18'
              />
            </svg>
          </Link>

          <div className='flex-1'>
            {/* 信息徽章 */}
            <div className='flex items-center gap-2 mb-1.5 ml-1'>
              <span className='text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded border border-gray-200'>
                ID: {quiz.id}
              </span>
              <span className='text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100'>
                共 {questions.length} 道题
              </span>
            </div>

            {/* 🌟 Notion风格的无边框大标题输入框 */}
            <input
              type='text'
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder='输入题库名称...'
              className='w-full text-2xl md:text-3xl font-black bg-transparent border-none outline-none focus:ring-0 p-0 pl-1 text-gray-900 placeholder-gray-300 transition-all'
            />
          </div>
        </div>

        {/* 保存按钮 */}
        <button
          onClick={handleSaveQuiz}
          disabled={isSaving}
          className='mt-1 px-8 py-3 bg-gray-900 text-white font-black rounded-xl hover:bg-gray-800 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2 shrink-0'>
          {isSaving ? '正在保存中...' : '💾 保存题库'}
        </button>
      </div>

      {/* ================= 右侧：题目管理区 (现在占据 100% 宽度) ================= */}
      <div className='w-full bg-gray-50/50 rounded-3xl border border-gray-200 p-5 md:p-8 flex flex-col shadow-sm'>
        <div className='flex items-center justify-between mb-8 shrink-0 relative'>
          <h2 className='text-xl font-black text-gray-800 flex items-center gap-2'>
            <span className='text-2xl'>📝</span> 题目列表
          </h2>

          {/* 带下拉菜单的新增按钮 */}
          <div className='relative z-20'>
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className='text-sm px-5 py-2.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors flex items-center gap-2 shadow-sm'>
              + 新增题目{' '}
              <svg
                className='w-4 h-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'>
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M19 9l-7 7-7-7'
                />
              </svg>
            </button>

            {showAddMenu && (
              <>
                <div
                  className='fixed inset-0'
                  onClick={() => setShowAddMenu(false)}></div>
                <div className='absolute right-0 top-full mt-2 w-40 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-in fade-in slide-in-from-top-2'>
                  <button
                    onClick={() =>
                      handleAddNewQuestion('READING_COMPREHENSION')
                    }
                    className='w-full text-left px-3 py-2.5 hover:bg-purple-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    📄 普通题
                  </button>
                  <button
                    onClick={() => handleAddNewQuestion('PRONUNCIATION')}
                    className='w-full text-left px-3 py-2.5 hover:bg-emerald-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    🗣️ 读音题
                  </button>
                  <button
                    onClick={() => handleAddNewQuestion('FILL_BLANK')}
                    className='w-full text-left px-3 py-2.5 hover:bg-indigo-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    ✍️ 填空题
                  </button>
                  <button
                    onClick={() => handleAddNewQuestion('SORTING')}
                    className='w-full text-left px-3 py-2.5 hover:bg-orange-50 rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2'>
                    ✨ 星号排序
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className='flex-1'>
          {questions.length === 0 ? (
            <div className='text-center py-24 text-gray-400 font-medium bg-white rounded-3xl border border-dashed border-gray-200'>
              本题库还是空的，点击右上角新建题目吧！
            </div>
          ) : (
            <SortableList
              items={questions}
              action={handleReorderQuestions}
              className='space-y-5 flex flex-col pb-10'>
              {questions.map((q: any, index: number) => {
                const isEditing = editingQuestionId === q.id
                const tConfig = getTypeConfig(q.questionType)

                return (
                  <SortableItem key={q.id} id={q.id}>
                    {isEditing ? (
                      // ================= 🌟 内联编辑状态 (Inline Edit) =================
                      <div
                        className={`p-5 md:p-6 rounded-3xl border-2 shadow-sm group relative cursor-default transition-all ${tConfig.color.split(' ')[0]} border-opacity-50 border-indigo-300`}>
                        <div className='flex justify-between items-center mb-5'>
                          <div className='flex items-center gap-2.5'>
                            <span className='px-2.5 py-1 rounded text-[10px] font-black bg-gray-900 text-white animate-pulse tracking-wider'>
                              编辑中 Q{index + 1}
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded text-[10px] font-black border uppercase tracking-wider ${tConfig.color}`}>
                              {tConfig.label}
                            </span>
                          </div>
                          <ActionInterceptor>
                            <button
                              onClick={() => setEditingQuestionId(null)}
                              className='text-xs bg-gray-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-gray-800 shadow-sm transition-colors'>
                              完成编辑
                            </button>
                          </ActionInterceptor>
                        </div>

                        <ActionInterceptor className='space-y-5'>
                          {/* 完整语境句子 */}
                          <div>
                            <label className='text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5 block'>
                              完整语境 (Context Sentence)
                            </label>
                            <textarea
                              value={q.contextSentence || ''}
                              onChange={e =>
                                handleUpdateQuestion(
                                  q.id,
                                  'contextSentence',
                                  e.target.value,
                                )
                              }
                              className='w-full p-4 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none h-20 shadow-sm'
                              placeholder='请输入这道题的完整原文句子...'
                            />
                          </div>

                          <div className='grid grid-cols-1 md:grid-cols-2 gap-5'>
                            {/* 读音题专属：目标词 */}
                            {q.questionType === 'PRONUNCIATION' && (
                              <div>
                                <label className='text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5 block'>
                                  划线目标词 (Target Word)
                                </label>
                                <input
                                  type='text'
                                  value={q.targetWord || ''}
                                  onChange={e =>
                                    handleUpdateQuestion(
                                      q.id,
                                      'targetWord',
                                      e.target.value,
                                    )
                                  }
                                  className='w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-sm'
                                  placeholder='例如：合宿'
                                />
                              </div>
                            )}

                            {/* 题干提问 */}
                            <div
                              className={
                                q.questionType !== 'PRONUNCIATION'
                                  ? 'md:col-span-2'
                                  : ''
                              }>
                              <label className='text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5 block'>
                                提问 / 题干要求 (Prompt)
                              </label>
                              <input
                                type='text'
                                value={q.prompt || ''}
                                onChange={e =>
                                  handleUpdateQuestion(
                                    q.id,
                                    'prompt',
                                    e.target.value,
                                  )
                                }
                                className='w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm'
                                placeholder='例如：划线部分的读音是？'
                              />
                            </div>
                          </div>

                          {/* 选项区 */}
                          <div>
                            <label className='text-[10px] font-black text-gray-500 uppercase tracking-wider mb-2 block'>
                              选项设置 (点击单选框设为正确答案)
                            </label>
                            <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                              {q.options?.map((opt: any, i: number) => (
                                <div
                                  key={opt.id}
                                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${opt.isCorrect ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-white border-gray-200 shadow-sm'}`}>
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
                                    className='w-5 h-5 text-emerald-600 focus:ring-emerald-500 cursor-pointer'
                                  />
                                  <span className='text-sm font-black text-gray-300'>
                                    {String.fromCharCode(65 + i)}
                                  </span>
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
                                    placeholder={`输入选项`}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 题目解析 */}
                          <div>
                            <label className='text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5 block'>
                              题目解析 (Explanation)
                            </label>
                            <textarea
                              value={q.explanation || ''}
                              onChange={e =>
                                handleUpdateQuestion(
                                  q.id,
                                  'explanation',
                                  e.target.value,
                                )
                              }
                              className='w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none h-20'
                              placeholder='输入解析，用户做完题后可见...'
                            />
                          </div>
                        </ActionInterceptor>
                      </div>
                    ) : (
                      // ================= 🌟 正常展示状态 (View Mode) =================
                      <div className='bg-white p-5 md:p-6 rounded-3xl border border-gray-100 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group relative'>
                        <div className='flex justify-between items-start mb-4 gap-2'>
                          <div className='flex items-center gap-3 flex-wrap'>
                            <ActionInterceptor>
                              <DragHandle />
                            </ActionInterceptor>
                            <span className='bg-gray-800 text-white text-[10px] font-black px-2 py-0.5 rounded tracking-wider'>
                              Q{index + 1}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider ${tConfig.color}`}>
                              {tConfig.label}
                            </span>
                          </div>
                          <div className='flex gap-2.5 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity'>
                            <ActionInterceptor>
                              <button
                                onClick={() => setEditingQuestionId(q.id)}
                                className='text-xs text-indigo-500 hover:text-indigo-700 font-bold bg-indigo-50 px-4 py-2 rounded-xl'>
                                ✏️ 编辑
                              </button>
                            </ActionInterceptor>
                            <ActionInterceptor>
                              <button
                                onClick={() =>
                                  setQuestions(
                                    questions.filter(item => item.id !== q.id),
                                  )
                                }
                                className='text-xs text-red-400 hover:text-red-600 font-bold bg-red-50 px-4 py-2 rounded-xl'>
                                🗑️ 删除
                              </button>
                            </ActionInterceptor>
                          </div>
                        </div>

                        <div className='pl-8'>
                          {/* 语境展示 */}
                          <div className='text-base text-gray-800 font-bold leading-relaxed mb-2'>
                            {q.contextSentence || (
                              <span className='text-red-400 italic font-medium text-sm'>
                                未设置语境句子...
                              </span>
                            )}
                          </div>

                          {/* 题干提示 */}
                          {(q.prompt || q.targetWord) && (
                            <div className='text-xs text-gray-500 font-medium mb-5 flex items-center gap-2'>
                              {q.targetWord && (
                                <span className='bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 rounded font-bold'>
                                  划线词: {q.targetWord}
                                </span>
                              )}
                              {q.prompt}
                            </div>
                          )}

                          {/* 选项展示 (Grid排列) */}
                          <div className='grid grid-cols-1 md:grid-cols-2 gap-3 mt-4'>
                            {q.options?.map((opt: any, i: number) => (
                              <div
                                key={opt.id}
                                className={`text-sm p-3 rounded-xl border flex justify-between items-center ${opt.isCorrect ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-bold shadow-sm' : 'bg-gray-50 border-gray-100 text-gray-600 font-medium'}`}>
                                <span>
                                  <span className='opacity-50 mr-1'>
                                    {String.fromCharCode(65 + i)}.
                                  </span>{' '}
                                  {opt.text}
                                </span>
                                {opt.isCorrect && (
                                  <span className='text-emerald-500 font-black'>
                                    ✅
                                  </span>
                                )}
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
      </div>
    </div>
  )
}
