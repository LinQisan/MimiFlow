// app/admin/upload/UploadCenterUI.tsx
'use client'

import React, { useState, useRef } from 'react'
import Link from 'next/link'
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
      <div className='mb-6 bg-indigo-50/50 p-4 md:p-5 rounded-2xl border border-indigo-100 transition-all duration-300'>
        <div className='flex justify-between items-center mb-3'>
          <label className='block text-sm font-bold text-indigo-900'>
            所属试卷 / 课程包
          </label>
          <button
            type='button'
            onClick={() => setIsCreating(!isCreating)}
            className='text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white px-3 py-1.5 rounded-lg border border-indigo-200 shadow-sm transition-colors'>
            {isCreating ? '取消新建' : '➕ 新建一套'}
          </button>
        </div>

        {!isCreating ? (
          <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className='w-full px-4 py-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium'>
            {localCategories.length === 0 && (
              <option value=''>无可用分类，请先新建</option>
            )}
            {localCategories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.level?.title} - {cat.name}
              </option>
            ))}
          </select>
        ) : (
          <div className='bg-white p-4 rounded-xl border border-indigo-200 shadow-sm flex flex-col gap-3 animate-in fade-in slide-in-from-top-2'>
            <div className='flex gap-3'>
              <select
                value={newCatData.levelId}
                onChange={e =>
                  setNewCatData({ ...newCatData, levelId: e.target.value })
                }
                className='w-1/3 px-3 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm'>
                {dbLevels.map(lvl => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.title}
                  </option>
                ))}
              </select>
              <input
                type='text'
                value={newCatData.name}
                onChange={e =>
                  setNewCatData({ ...newCatData, name: e.target.value })
                }
                placeholder='试卷名称，如：2025年7月 N1真题'
                className='flex-1 px-3 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm'
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
    <div className='min-h-screen bg-gray-50 p-6 md:p-12'>
      <div className='max-w-4xl mx-auto'>
        <h1 className='text-3xl font-bold text-gray-800 mb-8'>
          📥 全局语料录入中心
        </h1>

        <div className='flex space-x-2 bg-gray-200/50 p-1.5 rounded-2xl mb-8 w-fit overflow-x-auto'>
          <button
            onClick={() => setActiveTab('audio')}
            className={`px-6 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap ${activeTab === 'audio' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            🎧 听力与跟读 (ASS)
          </button>
          <button
            onClick={() => setActiveTab('article')}
            className={`px-6 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap ${activeTab === 'article' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            📄 阅读文章
          </button>
          <button
            onClick={() => setActiveTab('quiz')}
            className={`px-6 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 whitespace-nowrap ${activeTab === 'quiz' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            📝 题库录入
          </button>
        </div>

        {activeTab === 'audio' && (
          <div className='bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-500'>
            <h2 className='text-xl font-bold mb-2'>🎬 上传新听力/跟读</h2>
            <p className='text-gray-500 mb-6 text-sm'>
              填写题目信息并上传 .ass
              文件，系统将自动进行时间轴智能排版并存入数据库。
            </p>
            <UploadForm levels={dbLevels} categories={dbCategories} />
          </div>
        )}

        {activeTab === 'article' && (
          <form
            onSubmit={handleArticleSubmit}
            className='bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500'>
            <div className='space-y-6'>
              <h3 className='text-xl font-black text-gray-800 border-b pb-4'>
                📄 第一步：录入文章正文
              </h3>
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
                  required
                  type='text'
                  value={articleForm.title}
                  onChange={e =>
                    setArticleForm({ ...articleForm, title: e.target.value })
                  }
                  className='w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none'
                  placeholder='例如：2023年7月 N1 阅读长篇'
                />
              </div>

              <div>
                {/* 🌟 3. 新增：划词出题魔法按钮区 */}
                <div className='flex justify-between items-end mb-2'>
                  <label className='text-sm font-bold text-gray-700'>
                    正文内容{' '}
                    <span className='text-xs font-normal text-gray-400 ml-2'>
                      请保持纯净文本，切勿手动打括号挖空
                    </span>
                  </label>
                  <button
                    type='button'
                    onClick={handleMakeBlank}
                    className='bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95'>
                    ✨ 划词一键生成填空题
                  </button>
                </div>
                <textarea
                  required
                  ref={articleTextareaRef} // 🌟 必须绑定这个 Ref
                  value={articleForm.content}
                  onChange={e =>
                    setArticleForm({ ...articleForm, content: e.target.value })
                  }
                  rows={10}
                  className='w-full p-5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed resize-y'
                  placeholder='在这里粘贴最纯净的文章正文...'
                />
              </div>
            </div>

            <div className='space-y-6 bg-gray-50/50 p-6 rounded-2xl border border-gray-200'>
              <h3 className='text-xl font-black text-gray-800 border-b border-gray-200 pb-4'>
                📝 第二步：关联阅读题 (可选)
              </h3>

              {/* 已录入的题目列表 */}
              {articleQuestions.length > 0 && (
                <div className='space-y-4 mb-6'>
                  {articleQuestions.map((q, qIndex) => (
                    <div
                      key={qIndex}
                      className='bg-white p-4 rounded-xl border border-indigo-100 shadow-sm relative transition-all'>
                      <button
                        type='button'
                        onClick={() =>
                          setArticleQuestions(prev =>
                            prev.filter((_, i) => i !== qIndex),
                          )
                        }
                        className='absolute top-4 right-4 text-red-400 hover:text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded transition-colors'>
                        删除此题
                      </button>

                      <div className='font-bold text-sm text-indigo-900 mb-3 pr-16'>
                        第 {qIndex + 1} 题：
                        {q.questionType === 'FILL_BLANK' ? (
                          <span className='bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-xs font-normal ml-2'>
                            完形填空
                          </span>
                        ) : null}
                        <div className='mt-2 text-gray-700 font-medium leading-relaxed bg-gray-50 p-2 rounded-lg border border-gray-100'>
                          {q.prompt}
                        </div>
                      </div>

                      {/* 渲染 4 个选项 */}
                      <div className='grid grid-cols-2 gap-3'>
                        {q.options.map((opt: any, optIndex: number) => (
                          <div
                            key={optIndex}
                            className='flex items-center gap-2 text-sm'>
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
                              className={`flex-1 px-3 py-2 rounded-md border transition-colors ${opt.isCorrect ? 'border-green-400 bg-green-50 font-bold text-green-700 shadow-sm' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-indigo-300'} outline-none focus:ring-2 focus:ring-indigo-500`}
                            />
                          </div>
                        ))}
                      </div>

                      {/* 🌟 新增：单题专属的快捷粘贴框！ */}
                      <div className='mt-4 pt-3 border-t border-gray-100'>
                        <input
                          type='text'
                          placeholder='✨ 快捷填充：在此粘贴 1. 2. 3. 4. 选项文本，系统将自动拆分并寻找正确答案...'
                          onChange={e => {
                            handleParseCardOptions(qIndex, e.target.value)
                            e.target.value = '' // 解析完立刻清空输入框
                          }}
                          className='w-full px-4 py-2 text-xs bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white text-indigo-700 placeholder-indigo-300 transition-all'
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className='bg-indigo-50 p-5 rounded-xl border border-indigo-100'>
                <label className='text-sm font-black text-indigo-900 mb-2 block'>
                  ⚡ 快捷添加常规阅读题 (1. 2. 3. 4.)
                </label>
                <textarea
                  value={articleQuickInput}
                  onChange={e => setArticleQuickInput(e.target.value)}
                  rows={3}
                  placeholder='粘贴带有 1. 2. 3. 4. 选项的题目文本...'
                  className='w-full px-4 py-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm bg-white mb-3'
                />
                <button
                  type='button'
                  onClick={handleArticleAddQuestion}
                  className='bg-white text-indigo-600 border border-indigo-200 font-bold px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors text-sm shadow-sm'>
                  + 识别并加入本篇文章
                </button>
              </div>
            </div>

            <button
              disabled={isSubmitting}
              type='submit'
              className='w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-indigo-200 text-lg'>
              {isSubmitting ? '正在打包上传...' : '🚀 确认发布文章及题目'}
            </button>
          </form>
        )}

        {/* ================= 3. 题目上传视图 (代码未改动) ================= */}
        {activeTab === 'quiz' && (
          // ... (维持你原有的代码逻辑不变) ...
          <form
            onSubmit={handleQuizSubmit}
            className='bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500'>
            <CategorySelector
              value={quizForm.categoryId}
              onChange={val => setQuizForm({ ...quizForm, categoryId: val })}
            />

            <div className='bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 shadow-inner'>
              <label className='text-sm font-black text-indigo-900 mb-2 flex items-center gap-2'>
                <span>⚡</span> 智能快捷录入 (推荐)
              </label>
              <p className='text-xs text-indigo-600 mb-3'>
                直接粘贴真题（自动拆分题干与选项），例如：
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
                placeholder='在此处粘贴完整题目文本...'
                className='w-full px-4 py-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none resize-y text-sm bg-white'
              />

              {quizForm.questionType !== 'SORTING' && (
                <div className='mt-4 flex items-center gap-3'>
                  <span className='text-sm font-bold text-indigo-900'>
                    正确答案是：
                  </span>
                  <div className='flex gap-2'>
                    {[1, 2, 3, 4].map((num, idx) => (
                      <button
                        key={num}
                        type='button'
                        onClick={() => setCorrectOption(idx)}
                        className={`w-8 h-8 rounded-lg font-black text-sm transition-all ${quizForm.options[idx].isCorrect ? 'bg-green-500 text-white shadow-md shadow-green-200 scale-110' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}>
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className='flex items-center gap-4 py-2'>
              <div className='flex-1 h-px bg-gray-100'></div>
              <span className='text-xs font-bold text-gray-300'>
                下方为解析结果，可手动微调
              </span>
              <div className='flex-1 h-px bg-gray-100'></div>
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label className='block text-sm font-bold text-gray-700 mb-2'>
                  题型
                </label>
                <select
                  value={quizForm.questionType}
                  onChange={e =>
                    setQuizForm({ ...quizForm, questionType: e.target.value })
                  }
                  className='w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50'>
                  <option value='PRONUNCIATION'>读音题 (选假名)</option>
                  <option value='FILL_BLANK'>填空题 (选词汇)</option>
                  <option value='SORTING'>排列题 (选星号处)</option>
                </select>
              </div>
              {quizForm.questionType === 'SORTING' && (
                <div className='bg-orange-50 p-5 rounded-2xl border border-orange-200 mb-6'>
                  <label className='block text-sm font-bold text-orange-800 mb-2'>
                    🧩 智能排序：请按正确语序，依次点击下方 4 个选项
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
                        ✅ 语序组装完成！系统已自动提取星号答案与完整句子。
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
              <div>
                <label className='text-sm font-bold text-gray-700 mb-2 flex items-center gap-2'>
                  题目呈现{' '}
                  <span className='text-xs text-gray-400 font-normal bg-gray-100 px-1.5 py-0.5 rounded'>
                    前台做题时显示 (Prompt)
                  </span>
                </label>
                <input
                  required
                  type='text'
                  value={quizForm.prompt}
                  onChange={e =>
                    setQuizForm({ ...quizForm, prompt: e.target.value })
                  }
                  className='w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50'
                  placeholder='例如：チームの(　　　)を強めよう。'
                />
              </div>
            </div>

            <div>
              <label className='text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2'>
                完整语境句子{' '}
                <span className='text-xs text-indigo-500 font-normal bg-indigo-100 px-1.5 py-0.5 rounded'>
                  存入生词本/复习库时显示 (Context)
                </span>
              </label>
              <textarea
                required
                value={quizForm.contextSentence}
                onChange={e =>
                  setQuizForm({ ...quizForm, contextSentence: e.target.value })
                }
                rows={2}
                className='w-full px-4 py-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-indigo-50/30'
                placeholder='例如：チームの結束を強めよう。'
              />
            </div>

            <div className='bg-gray-50 p-5 rounded-2xl border border-gray-100'>
              <label className='block text-sm font-bold text-gray-700 mb-4'>
                设定选项
              </label>
              <div className='space-y-3'>
                {quizForm.options.map((opt, idx) => (
                  <div key={idx} className='flex items-center gap-3'>
                    <input
                      type='radio'
                      name='correctOption'
                      checked={opt.isCorrect}
                      onChange={() => setCorrectOption(idx)}
                      className='w-5 h-5 text-indigo-600 focus:ring-indigo-500 border-gray-300'
                    />
                    <input
                      required
                      type='text'
                      value={opt.text}
                      onChange={e => {
                        const newOptions = [...quizForm.options]
                        newOptions[idx].text = e.target.value
                        setQuizForm({ ...quizForm, options: newOptions })
                      }}
                      className='flex-1 px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white'
                      placeholder={`选项 ${idx + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className='block text-sm font-bold text-gray-700 mb-2'>
                题目解析 (可选)
              </label>
              <textarea
                value={quizForm.explanation}
                onChange={e =>
                  setQuizForm({ ...quizForm, explanation: e.target.value })
                }
                rows={2}
                className='w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50'
              />
            </div>

            <button
              disabled={isSubmitting}
              type='submit'
              className='w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-indigo-200'>
              {isSubmitting ? '保存中...' : '录入题目'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
