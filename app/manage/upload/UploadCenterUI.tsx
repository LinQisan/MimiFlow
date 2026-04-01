// app/admin/upload/UploadCenterUI.tsx
'use client'

import React, { useEffect, useRef, useState } from 'react'
import UploadForm from './UploadForm'
import {
  createArticle,
  createQuizQuestion,
  createCategory,
} from '@/app/actions/content'
import { useDialog } from '@/context/DialogContext'

interface Props {
  dbLevels: any[]
  dbCategories: any[]
}

function PanelDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(event.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const label = options.find(item => item.value === value)?.label || placeholder

  return (
    <div ref={wrapRef} className='relative w-full'>
      <button
        type='button'
        onClick={() => setOpen(prev => !prev)}
        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition ${
          open
            ? 'border-indigo-300 bg-white text-gray-800 ring-2 ring-indigo-100'
            : 'border-indigo-200 bg-white text-gray-700 hover:bg-indigo-50/30'
        }`}>
        <span className='truncate pr-3'>{label}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180 text-indigo-500' : ''}`}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2.5}
            d='M19 9l-7 7-7-7'
          />
        </svg>
      </button>
      {open && (
        <div className='absolute z-[90] mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-gray-100 bg-white py-1.5 shadow-xl'>
          {options.length === 0 ? (
            <div className='px-4 py-3 text-sm text-gray-400'>暂无选项</div>
          ) : (
            options.map(item => (
              <button
                key={item.value}
                type='button'
                onClick={() => {
                  onChange(item.value)
                  setOpen(false)
                }}
                className={`block w-full truncate px-4 py-2.5 text-left text-sm font-semibold transition ${
                  value === item.value
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}>
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function UploadCenterUI({ dbLevels, dbCategories }: Props) {
  const dialog = useDialog()
  const [localCategories, setLocalCategories] = useState(dbCategories)
  const [activeTab, setActiveTab] = useState<'audio' | 'article' | 'quiz'>(
    'audio',
  )
  const [isSubmitting, setIsSubmitting] = useState(false)

  // --- 文章表单状态 ---
  const [articleForm, setArticleForm] = useState({
    categoryId: dbCategories[0]?.id || '',
    title: '',
    description: '',
    content: '',
  })
  const [articleQuestions, setArticleQuestions] = useState<any[]>([])
  const [articleQuickInput, setArticleQuickInput] = useState('')

  // 🌟 1. 新增：绑定文章输入框的 Ref
  const articleTextareaRef = useRef<HTMLTextAreaElement>(null)

  const [quizForm, setQuizForm] = useState({
    categoryId: dbCategories[0]?.id || '',
    questionType: 'PRONUNCIATION',
    contextSentence: '',
    targetWord: '',
    prompt: '',
    explanation: '',
    options: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
  })
  const [quickInput, setQuickInput] = useState('')
  const [sortSequence, setSortSequence] = useState<number[]>([])

  // ================= 🌟 2. 新增：划词一键生成填空题引擎 =================
  const handleMakeBlank = () => {
    const textarea = articleTextareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd

    if (start === end) {
      void dialog.alert('请先在正文中划选你想挖空的词。')
      return
    }

    const fullText = textarea.value
    const selectedWord = fullText.substring(start, end).trim()

    // 智能寻找上下文句子边界 (向前找标点，向后找标点)
    const punctuations = ['。', '！', '？', '.', '!', '?', '\n']
    let sentenceStart = 0
    for (let i = start - 1; i >= 0; i--) {
      if (punctuations.includes(fullText[i])) {
        sentenceStart = i + 1
        break
      }
    }
    let sentenceEnd = fullText.length
    for (let i = end; i < fullText.length; i++) {
      if (punctuations.includes(fullText[i])) {
        sentenceEnd = i + 1 // 包含结尾标点符号
        break
      }
    }

    // 精准截取包含该词的单句
    const contextSentence = fullText
      .substring(sentenceStart, sentenceEnd)
      .trim()

    // 自动创建新题目
    const newQuestion = {
      questionType: 'FILL_BLANK',
      prompt: contextSentence, // 🌟 直接用原句作为锚点，配合前台的精准挖空引擎！
      contextSentence: contextSentence,
      explanation: '',
      options: [
        { text: selectedWord, isCorrect: true }, // 🌟 选中的词自动变成正确选项
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
      ],
    }

    setArticleQuestions(prev => [...prev, newQuestion])

    // 取消选中状态，方便继续选下一个词
    textarea.selectionStart = textarea.selectionEnd
    textarea.focus()
  }

  // ================= 🌟 3. 新增：单题专属的选项解析魔法 =================
  const handleParseCardOptions = (qIndex: number, text: string) => {
    if (!text.trim()) return

    // 专属的正则表达式，只提取选项，不提取题干
    const regex =
      /(?:1[．.\s]|①|１[．.\s])([\s\S]*?)(?:2[．.\s]|②|２[．.\s])([\s\S]*?)(?:3[．.\s]|③|３[．.\s])([\s\S]*?)(?:4[．.\s]|④|４[．.\s])([\s\S]*)/i
    const match = text.match(regex)

    if (match) {
      const newOptionsTexts = [
        match[1].trim(),
        match[2].trim(),
        match[3].trim(),
        match[4].trim(),
      ]

      const newQs = [...articleQuestions]

      // 🌟 自动寻的魔法：寻找哪个新选项包含了我们刚才“划词”选中的正确答案
      const currentCorrectOpt = newQs[qIndex].options.find(
        (o: any) => o.isCorrect,
      )
      const correctText = currentCorrectOpt ? currentCorrectOpt.text : ''

      let newCorrectIdx = newOptionsTexts.findIndex(
        t =>
          t === correctText ||
          t.includes(correctText) ||
          correctText.includes(t),
      )
      if (newCorrectIdx === -1) newCorrectIdx = 0 // 如果找不到完美匹配，兜底选第1个

      // 覆盖更新这道题的 4 个选项
      newQs[qIndex].options = newOptionsTexts.map((txt, idx) => ({
        text: txt,
        isCorrect: idx === newCorrectIdx,
      }))

      setArticleQuestions(newQs)
    } else {
      void dialog.alert('解析失败：未识别到 1. 2. 3. 4. 选项格式。')
    }
  }
  // ================= 提交处理 =================
  const handleArticleAddQuestion = () => {
    if (!articleQuickInput.trim()) return

    const regex =
      /([\s\S]*?)(?:1[．.\s]|①|１[．.\s])([\s\S]*?)(?:2[．.\s]|②|２[．.\s])([\s\S]*?)(?:3[．.\s]|③|３[．.\s])([\s\S]*?)(?:4[．.\s]|④|４[．.\s])([\s\S]*)/i
    const match = articleQuickInput.match(regex)

    if (match) {
      const promptText = match[1].trim()
      const detectedType = /[（(][\s　]*[）)]|__{2,}/.test(promptText)
        ? 'FILL_BLANK'
        : 'READING_COMPREHENSION'

      const newQuestion = {
        questionType: detectedType,
        prompt: promptText,
        contextSentence: promptText,
        explanation: '',
        options: [
          { text: match[2].trim(), isCorrect: true },
          { text: match[3].trim(), isCorrect: false },
          { text: match[4].trim(), isCorrect: false },
          { text: match[5].trim(), isCorrect: false },
        ],
      }

      setArticleQuestions(prev => [...prev, newQuestion])
      setArticleQuickInput('')
    } else {
      void dialog.alert('解析失败，请检查是否包含 1. 2. 3. 4. 四个选项。')
    }
  }

  const handleArticleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    const res = await createArticle({
      ...articleForm,
      questions: articleQuestions,
    })
    await dialog.alert(res.message)
    if (res.success) {
      setArticleForm(prev => ({
        ...prev,
        title: '',
        description: '',
        content: '',
      }))
      setArticleQuestions([])
    }
    setIsSubmitting(false)
  }

  const handleQuizSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const promptText = quizForm.prompt.trim()
    const contextText = quizForm.contextSentence.trim()
    if (!promptText && !contextText) {
      await dialog.alert(
        '请先填写题目内容再保存。\n可选方式：\n1) 使用“快速粘贴（推荐）”自动解析\n2) 在“题目呈现”填写题干\n3) 在“语境句”填写完整句子',
      )
      return
    }
    setIsSubmitting(true)
    const res = await createQuizQuestion(quizForm)
    await dialog.alert(res.message)
    if (res.success) {
      setQuickInput('')
      setQuizForm(prev => ({
        ...prev,
        contextSentence: '',
        targetWord: '',
        prompt: '',
        explanation: '',
        options: prev.options.map((o, i) => ({ text: '', isCorrect: i === 0 })),
      }))
    }
    setIsSubmitting(false)
  }

  const handleQuickParse = (text: string) => {
    setQuickInput(text)
    if (!text.trim()) return

    const regex =
      /([\s\S]*?)(?:1[．.\s]|①|１[．.\s])([\s\S]*?)(?:2[．.\s]|②|２[．.\s])([\s\S]*?)(?:3[．.\s]|③|３[．.\s])([\s\S]*?)(?:4[．.\s]|④|４[．.\s])([\s\S]*)/i
    const match = text.match(regex)

    if (match) {
      const questionText = match[1].trim()
      const isSorting = /★|＊/.test(questionText)
      const isFillBlank = /[（(][\s　]*[）)]|__{2,}|～/.test(questionText)
      const detectedType = isSorting
        ? 'SORTING'
        : isFillBlank
          ? 'FILL_BLANK'
          : 'PRONUNCIATION'

      setSortSequence([])
      setQuizForm(prev => ({
        ...prev,
        questionType: detectedType,
        prompt: questionText,
        contextSentence: questionText,
        options: [
          { text: match[2].trim(), isCorrect: prev.options[0].isCorrect },
          { text: match[3].trim(), isCorrect: prev.options[1].isCorrect },
          { text: match[4].trim(), isCorrect: prev.options[2].isCorrect },
          { text: match[5].trim(), isCorrect: prev.options[3].isCorrect },
        ],
      }))
    }
  }

  const setCorrectOption = (index: number) => {
    setQuizForm(prev => {
      const newOptions = prev.options.map((opt, i) => ({
        ...opt,
        isCorrect: i === index,
      }))
      let newContextSentence = prev.contextSentence

      if (prev.questionType === 'FILL_BLANK') {
        const blankRegex = /[（(][\s　]*[）)]|__{2,}|～/
        if (blankRegex.test(prev.prompt)) {
          newContextSentence = prev.prompt.replace(
            blankRegex,
            newOptions[index].text,
          )
        }
      }
      return {
        ...prev,
        options: newOptions,
        contextSentence: newContextSentence,
      }
    })
  }

  const handleSortClick = (index: number) => {
    if (sortSequence.includes(index)) return
    const newSeq = [...sortSequence, index]
    setSortSequence(newSeq)

    if (newSeq.length === 4) {
      setQuizForm(prev => {
        const parts = prev.prompt.split(/([＿_]{2,}|[★＊])/).filter(Boolean)
        let slotCount = 0
        let starSlotIndex = -1

        parts.forEach(part => {
          if (/[＿_]{2,}|[★＊]/.test(part)) {
            if (/[★＊]/.test(part)) starSlotIndex = slotCount
            slotCount++
          }
        })
        if (starSlotIndex === -1) starSlotIndex = 0

        const correctOptionIndex = newSeq[starSlotIndex]
        const newOptions = prev.options.map((opt, i) => ({
          ...opt,
          isCorrect: i === correctOptionIndex,
        }))
        const joinedOptionsText = newSeq
          .map(idx => prev.options[idx].text)
          .join('')

        const blankAreaRegex = /[＿_★＊][＿_★＊\s　]+[＿_★＊]/
        let newContextSentence = prev.prompt

        if (blankAreaRegex.test(prev.prompt)) {
          newContextSentence = prev.prompt.replace(
            blankAreaRegex,
            joinedOptionsText,
          )
        } else {
          newContextSentence = prev.prompt
            .replace(/[★＊]/, joinedOptionsText)
            .replace(/[＿_]{2,}/g, '')
        }

        return {
          ...prev,
          options: newOptions,
          contextSentence: newContextSentence,
        }
      })
    }
  }
  const quizHasQuestionContent =
    quizForm.prompt.trim().length > 0 || quizForm.contextSentence.trim().length > 0

  const CategorySelector = ({
    value,
    onChange,
  }: {
    value: string
    onChange: (val: string) => void
  }) => {
    const [isCreating, setIsCreating] = useState(false)
    const [newCatData, setNewCatData] = useState({
      levelId: dbLevels[0]?.id || '',
      name: '',
    })
    const [isSavingCat, setIsSavingCat] = useState(false)

    const handleSaveCategory = async () => {
      if (!newCatData.name.trim()) {
        await dialog.alert('试卷名称不能为空。')
        return
      }
      setIsSavingCat(true)

      const res = await createCategory(newCatData)
      if (res.success && res.category) {
        setLocalCategories(prev => [res.category, ...prev])
        onChange(res.category.id)
        setIsCreating(false)
        setNewCatData({ ...newCatData, name: '' })
      } else {
        await dialog.alert(res.message || '创建失败')
      }
      setIsSavingCat(false)
    }

    return (
      <div className='mb-6 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 md:p-5 transition-all duration-300'>
        <div className='flex justify-between items-center mb-3'>
          <label className='block text-sm font-bold text-indigo-900'>
            所属分类
          </label>
          <button
            type='button'
            onClick={() => setIsCreating(!isCreating)}
            className='rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-800'>
            {isCreating ? '取消新建' : '新建分类'}
          </button>
        </div>

        {!isCreating ? (
          <PanelDropdown
            value={value}
            onChange={onChange}
            options={localCategories.map(cat => ({
              value: cat.id,
              label: `${cat.level?.title ?? ''} · ${cat.name}`,
            }))}
            placeholder='无可用分类，请先新建'
          />
        ) : (
          <div className='animate-in slide-in-from-top-2 flex flex-col gap-3 rounded-xl border border-indigo-200 bg-white p-4 shadow-sm fade-in'>
            <div className='flex flex-col gap-2 md:flex-row md:gap-3'>
              <div className='w-full md:w-1/3'>
                <PanelDropdown
                  value={newCatData.levelId}
                  onChange={val => setNewCatData({ ...newCatData, levelId: val })}
                  options={dbLevels.map((lvl: any) => ({
                    value: lvl.id,
                    label: lvl.title,
                  }))}
                  placeholder='选择等级'
                />
              </div>
              <input
                type='text'
                value={newCatData.name}
                onChange={e =>
                  setNewCatData({ ...newCatData, name: e.target.value })
                }
                placeholder='分类名称，例如：2025-07 N1 真题'
                className='flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500'
              />
            </div>
            <button
              type='button'
              onClick={handleSaveCategory}
              disabled={isSavingCat}
              className='w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold py-2.5 rounded-lg transition-colors text-sm disabled:opacity-50'>
              {isSavingCat ? '创建中...' : '确认创建并使用'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-gray-50 p-3 md:p-12'>
      <div className='mx-auto max-w-5xl'>
        <h1 className='mb-5 text-2xl font-bold text-gray-800 md:mb-8 md:text-3xl'>
          内容录入中心
        </h1>

        <div className='mb-5 grid grid-cols-1 gap-2 rounded-2xl border border-gray-200 bg-white p-1.5 sm:grid-cols-3 md:mb-8'>
          <button
            onClick={() => setActiveTab('audio')}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${activeTab === 'audio' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
            听力语料
          </button>
          <button
            onClick={() => setActiveTab('article')}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${activeTab === 'article' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
            阅读录入
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${activeTab === 'quiz' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>
            题库录入
          </button>
        </div>

        {activeTab === 'audio' && (
          <div className='animate-in slide-in-from-bottom-4 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm fade-in duration-500 md:p-8'>
            <h2 className='mb-2 text-lg font-bold md:text-xl'>录入听力语料</h2>
            <p className='mb-4 text-sm text-gray-500 md:mb-6'>
              选择分类并上传字幕。支持手动路径、站内浏览或本地上传录音，提交后将自动保存并入库。
            </p>
            <UploadForm levels={dbLevels} categories={dbCategories} />
          </div>
        )}

        {activeTab === 'article' && (
          <form
            onSubmit={handleArticleSubmit}
            className='animate-in space-y-8 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm fade-in slide-in-from-bottom-4 duration-500 md:p-8'>
            <div className='space-y-1'>
              <h2 className='text-xl font-black text-gray-900 md:text-2xl'>
                阅读内容录入
              </h2>
              <p className='text-sm text-gray-500'>
                先录入文章正文，再按需补充阅读题并保存。
              </p>
            </div>

            <section className='space-y-5 rounded-2xl border border-gray-200 bg-gray-50/30 p-4 md:p-5'>
              <CategorySelector
                value={articleForm.categoryId}
                onChange={val =>
                  setArticleForm({ ...articleForm, categoryId: val })
                }
              />

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
                  className='w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none'
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
                    className='inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600 transition-all hover:bg-indigo-100 active:scale-95'>
                    划词生成填空题
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
                  className='w-full p-5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed resize-y'
                  placeholder='在此粘贴文章正文'
                />
              </div>
            </section>

            <section className='space-y-5 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 md:p-5'>
              <div>
                <h3 className='text-base font-black text-indigo-900 md:text-lg'>
                  阅读题（可选）
                </h3>
                <p className='mt-1 text-xs text-indigo-700'>
                  可通过划词自动生成，也可粘贴 1.2.3.4 格式快速导入。
                </p>
              </div>

              {articleQuestions.length > 0 && (
                <div className='mb-6 space-y-4'>
                  {articleQuestions.map((q, qIndex) => (
                    <div
                      key={qIndex}
                      className='bg-white p-4 rounded-xl border border-indigo-100 shadow-sm relative transition-all'>
                      <button
                        type='button'
                        onClick={async () => {
                          const confirmed = await dialog.confirm(
                            `确认移除第 ${qIndex + 1} 题吗？`,
                            {
                              title: '移除题目',
                              confirmText: '移除',
                              danger: true,
                            },
                          )
                          if (!confirmed) return
                          setArticleQuestions(prev =>
                            prev.filter((_, i) => i !== qIndex),
                          )
                        }}
                        className='absolute right-4 top-4 rounded-lg border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 hover:text-red-700'>
                        移除题目
                      </button>

                      <div className='mb-3 pr-16 text-sm font-bold text-indigo-900'>
                        第 {qIndex + 1} 题：
                        {q.questionType === 'FILL_BLANK' ? (
                          <span className='ml-2 rounded bg-indigo-50 px-2 py-0.5 text-xs font-normal text-indigo-600'>
                            填空题
                          </span>
                        ) : null}
                        <div className='mt-2 text-gray-700 font-medium leading-relaxed bg-gray-50 p-2 rounded-lg border border-gray-100'>
                          {q.prompt}
                        </div>
                      </div>

                      <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                        {q.options.map((opt: any, optIndex: number) => (
                          <div
                            key={optIndex}
                            className='flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm'>
                            <input
                              type='radio'
                              checked={opt.isCorrect}
                              onChange={() => {
                                const newQs = [...articleQuestions]
                                newQs[qIndex].options.forEach(
                                  (o: any, i: number) =>
                                    (o.isCorrect = i === optIndex),
                                )
                                setArticleQuestions(newQs)
                              }}
                              className='text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer'
                            />
                            <input
                              type='text'
                              value={opt.text}
                              onChange={e => {
                                const newQs = [...articleQuestions]
                                newQs[qIndex].options[optIndex].text =
                                  e.target.value
                                setArticleQuestions(newQs)
                              }}
                              placeholder={`选项 ${optIndex + 1}`}
                              className={`min-w-0 flex-1 rounded-md border px-3 py-2 transition-colors ${opt.isCorrect ? 'border-green-400 bg-green-50 font-bold text-green-700 shadow-sm' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-indigo-300'} outline-none focus:ring-2 focus:ring-indigo-500`}
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
                          className='w-full px-4 py-2 text-xs bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white text-indigo-700 placeholder-indigo-300 transition-all'
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className='rounded-xl border border-indigo-100 bg-white p-4'>
                <label className='text-sm font-black text-indigo-900 mb-2 block'>
                  快速添加阅读题
                </label>
                <textarea
                  value={articleQuickInput}
                  onChange={e => setArticleQuickInput(e.target.value)}
                  rows={3}
                  placeholder='粘贴含 1. 2. 3. 4. 选项的题目文本'
                  className='w-full px-4 py-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm bg-white mb-3'
                />
                <button
                  type='button'
                  onClick={handleArticleAddQuestion}
                  className='bg-white text-indigo-600 border border-indigo-200 font-bold px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors text-sm shadow-sm'>
                  识别并加入本篇文章
                </button>
              </div>
            </section>

            <button
              disabled={isSubmitting}
              type='submit'
              className='w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-indigo-200 text-lg'>
              {isSubmitting ? '保存中...' : '保存文章与题目'}
            </button>
          </form>
        )}

        {/* ================= 3. 题目上传视图 (代码未改动) ================= */}
        {activeTab === 'quiz' && (
          <form
            onSubmit={handleQuizSubmit}
            className='animate-in space-y-8 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm fade-in slide-in-from-bottom-4 duration-500 md:p-8'>
            <div className='space-y-1'>
              <h2 className='text-xl font-black text-gray-900 md:text-2xl'>
                题库题目录入
              </h2>
              <p className='text-sm text-gray-500'>
                可先粘贴整题自动解析，再做少量校对后保存。
              </p>
            </div>

            <CategorySelector
              value={quizForm.categoryId}
              onChange={val => setQuizForm({ ...quizForm, categoryId: val })}
            />

            <section className='rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-inner md:p-5'>
              <label className='mb-2 block text-sm font-black text-indigo-900'>
                快速粘贴（推荐）
              </label>
              <p className='mb-3 text-xs leading-relaxed text-indigo-700'>
                粘贴包含题干和 4 个选项的文本，系统会自动拆分并填充表单。
                <br />
                <span className='font-mono bg-white/50 px-1 rounded'>
                  友人にピアノの伴奏を頼まれた。 1．はんそう 2．ばんそう
                  3．はんそ 4．ばんそ
                </span>
              </p>
              <textarea
                value={quickInput}
                onChange={e => handleQuickParse(e.target.value)}
                rows={3}
                placeholder='在此粘贴整题文本'
                className='w-full px-4 py-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm bg-white'
              />

              {quizForm.questionType !== 'SORTING' && (
                <div className='mt-4 rounded-xl border border-indigo-100 bg-white/75 p-3'>
                  <span className='mb-2 block text-xs font-bold tracking-wide text-indigo-800'>
                    正确答案
                  </span>
                  <div className='flex flex-wrap gap-2'>
                    {[1, 2, 3, 4].map((num, idx) => (
                      <button
                        key={num}
                        type='button'
                        onClick={() => setCorrectOption(idx)}
                        className={`h-9 min-w-9 rounded-lg px-3 text-sm font-black transition-all ${quizForm.options[idx].isCorrect ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                        选项 {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <div className='flex items-center gap-4'>
              <div className='flex-1 h-px bg-gray-100'></div>
              <span className='text-xs font-bold text-gray-300'>
                解析结果可继续编辑
              </span>
              <div className='flex-1 h-px bg-gray-100'></div>
            </div>

            <section className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
              <div className='rounded-2xl border border-gray-200 bg-gray-50/40 p-4'>
                <label className='mb-2 block text-sm font-bold text-gray-700'>
                  题型选择
                </label>
                <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
                  {[
                    { value: 'PRONUNCIATION', label: '读音题' },
                    { value: 'FILL_BLANK', label: '填空题' },
                    { value: 'SORTING', label: '排序题' },
                  ].map(type => (
                    <button
                      key={type.value}
                      type='button'
                      onClick={() => {
                        setSortSequence([])
                        setQuizForm({ ...quizForm, questionType: type.value })
                      }}
                      className={`rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                        quizForm.questionType === type.value
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className='rounded-2xl border border-gray-200 bg-gray-50/40 p-4'>
                <label className='mb-2 block text-sm font-bold text-gray-700'>
                  题目呈现
                </label>
                <p className='mb-2 text-xs text-gray-500'>
                  前台做题时显示这段文字。
                </p>
                <input
                  type='text'
                  value={quizForm.prompt}
                  onChange={e =>
                    setQuizForm({ ...quizForm, prompt: e.target.value })
                  }
                  className='w-full rounded-xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500'
                  placeholder='例如：チームの(　　　)を強めよう。（可留空）'
                />
              </div>
            </section>

            <section className='rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4'>
              {quizForm.questionType === 'SORTING' && (
                <div className='mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-4'>
                  <label className='mb-2 block text-sm font-bold text-orange-800'>
                    排序设置：按正确语序依次点击 4 个选项
                  </label>
                  <div className='flex flex-wrap gap-2 mb-4'>
                    {quizForm.options.map((opt, i) => {
                      const isClicked = sortSequence.includes(i)
                      const orderNum = sortSequence.indexOf(i) + 1
                      return (
                        <button
                          key={i}
                          type='button'
                          disabled={isClicked || !opt.text}
                          onClick={() => handleSortClick(i)}
                          className={`relative px-4 py-2 rounded-lg font-bold transition-all ${isClicked ? 'bg-orange-200 text-orange-500 opacity-50' : 'bg-white text-orange-600 shadow-sm border border-orange-200 hover:bg-orange-100'}`}>
                          {opt.text || `选项 ${i + 1}`}
                          {isClicked && (
                            <span className='absolute -top-2 -right-2 w-5 h-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center'>
                              {orderNum}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {sortSequence.length === 4 ? (
                    <div className='text-sm text-green-600 font-bold flex justify-between items-center'>
                      <span>
                        语序组装完成，系统已自动提取星号答案与完整句子。
                      </span>
                      <button
                        type='button'
                        onClick={() => setSortSequence([])}
                        className='text-orange-500 underline'>
                        重置顺序
                      </button>
                    </div>
                  ) : (
                    <div className='text-xs text-orange-500'>
                        还需点击 {4 - sortSequence.length} 个选项
                      </div>
                  )}
                </div>
              )}
              <label className='mb-2 block text-sm font-bold text-indigo-900'>
                语境句
              </label>
              <p className='mb-2 text-xs text-indigo-700'>
                用于生词与复习展示，建议填写完整句子。
              </p>
              <textarea
                value={quizForm.contextSentence}
                onChange={e =>
                  setQuizForm({ ...quizForm, contextSentence: e.target.value })
                }
                rows={2}
                className='w-full rounded-xl border border-indigo-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500'
                placeholder='例如：チームの結束を強めよう。（可留空）'
              />
              {!quizHasQuestionContent && (
                <div className='mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800'>
                  请先补充题目内容，再保存题目。可在“快速粘贴”“题目呈现”或“语境句”任一处输入。
                </div>
              )}
            </section>

            <section className='rounded-2xl border border-gray-200 bg-gray-50/40 p-4 md:p-5'>
              <label className='mb-3 block text-sm font-bold text-gray-700'>
                选项设置
              </label>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                {quizForm.options.map((opt, idx) => (
                  <div
                    key={idx}
                    className='flex min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5'>
                    <input
                      type='radio'
                      name='correctOption'
                      checked={opt.isCorrect}
                      onChange={() => setCorrectOption(idx)}
                      className='w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-gray-300'
                    />
                    <input
                      type='text'
                      value={opt.text}
                      onChange={e => {
                        const newOptions = [...quizForm.options]
                        newOptions[idx].text = e.target.value
                        setQuizForm({ ...quizForm, options: newOptions })
                      }}
                      className='min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500'
                      placeholder={`选项 ${idx + 1}`}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <label className='block text-sm font-bold text-gray-700 mb-2'>
                解析（可选）
              </label>
              <textarea
                value={quizForm.explanation}
                onChange={e =>
                  setQuizForm({ ...quizForm, explanation: e.target.value })
                }
                rows={2}
                className='w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50'
                placeholder='可补充解题思路或易错点。'
              />
            </section>

            <button
              disabled={isSubmitting || !quizHasQuestionContent}
              type='submit'
              className='w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-indigo-200'>
              {isSubmitting
                ? '保存中...'
                : quizHasQuestionContent
                  ? '保存题目'
                  : '请先填写题目内容'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
