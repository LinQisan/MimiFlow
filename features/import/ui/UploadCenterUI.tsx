// app/admin/upload/UploadCenterUI.tsx
'use client'

import React, { useMemo } from 'react'
import UploadForm from '@/features/import/ui/UploadForm'
import AudioTimingStudio from '@/features/import/ui/AudioTimingStudio'
import CollectionBrowserSelect, {
  type CollectionBrowserOption,
} from '@/components/manage/import/CollectionBrowserSelect'
import { useDialog } from '@/context/DialogContext'
import { toCollectionBrowserOptions } from '@/components/manage/import/collectionBrowserOptions'
import CustomSelect from '@/components/ui/CustomSelect'
import {
  detectQuestionType,
  inferTargetWord,
  parseMultiQuizText,
} from '@/modules/import/domain/quiz-text-parser'
import {
  buildArticleQuestionsFromQuickInput,
  extractSentenceAroundIndex,
  rebuildFillBlankPromptFromQuestion,
} from '@/modules/import/domain/article-question-builder'
import {
  useCollectionCreatorState,
  useUploadCenterState,
} from '@/modules/import/hooks/useUploadCenterState'
import type {
  ParsedQuizDraft,
  UploadCollectionLite,
  UploadLevelLite,
  UploadCenterTab,
} from '@/modules/import/types'
import BulkQuizPanel from '@/modules/import/components/BulkQuizPanel'
import ArticleImportPanel from '@/modules/import/components/ArticleImportPanel'
import { useUploadCenterMutations } from '@/features/import/hooks/useUploadMutations'

interface Props {
  dbLevels: UploadLevelLite[]
  dbCollections: UploadCollectionLite[]
  initialTab?: UploadCenterTab
}



export default function UploadCenterUI({
  dbLevels,
  dbCollections,
  initialTab = 'audio',
}: Props) {
  const dialog = useDialog()
  const { createArticle, createQuizQuestion, createCategory } =
    useUploadCenterMutations()
  const {
    quizEntryMode,
    setQuizEntryMode,
    localCollections,
    setLocalCollections,
    activeTab,
    isSubmitting,
    setIsSubmitting,
    articleForm,
    setArticleForm,
    articleQuestions,
    setArticleQuestions,
    articleQuickInput,
    setArticleQuickInput,
    articleParsedPreviewRows,
    setArticleParsedPreviewRows,
    articleParsedDrafts,
    setArticleParsedDrafts,
    articleTextareaRef,
    quizForm,
    setQuizForm,
    quickInput,
    setQuickInput,
    bulkQuickInput,
    setBulkQuickInput,
    bulkParsedQuestions,
    setBulkParsedQuestions,
    bulkEditingIndex,
    setBulkEditingIndex,
    sortSequence,
    setSortSequence,
    quizContextTextareaRef,
    bulkContextTextareaRef,
  } = useUploadCenterState(dbCollections, initialTab)

  const collectionOptions: CollectionBrowserOption[] = useMemo(
    () => toCollectionBrowserOptions(localCollections),
    [localCollections],
  )


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

    // 精准截取包含该词的“单句”（不跨句）
    const contextSentence = extractSentenceAroundIndex(
      fullText,
      start,
      Math.max(1, end - start),
    )

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
      const currentCorrectOpt = newQs[qIndex].options.find(o => o.isCorrect)
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
      newQs[qIndex] = rebuildFillBlankPromptFromQuestion(newQs[qIndex])

      setArticleQuestions(newQs)
    } else {
      void dialog.alert('解析失败：未识别到 1. 2. 3. 4. 选项格式。')
    }
  }
  // ================= 提交处理 =================

  const handleArticleAddQuestion = () => {
    if (!articleQuickInput.trim()) return

    const { drafts, previewRows } =
      buildArticleQuestionsFromQuickInput(
        articleQuickInput,
        articleForm.content,
      )
    if (drafts.length === 0) {
      void dialog.alert('解析失败，请检查是否包含 1. 2. 3. 4. 四个选项。')
      return
    }

    setArticleParsedDrafts(drafts)
    setArticleParsedPreviewRows(previewRows)
    dialog.toast(`已识别 ${drafts.length} 道题，请先确认预览`, {
      tone: 'success',
    })
  }

  const handleConfirmArticlePreviewImport = () => {
    if (articleParsedDrafts.length === 0) return
    if (articleParsedPreviewRows.some(row => row.isDuplicateToken)) {
      void dialog.alert('检测到重号占位符，请先修正文中的重复编号后再导入。')
      return
    }
    const blankTokenRegex =
      /\[\d+\]|［\d+］|\(\d+\)|（\d+）|【\d+】|「\d+」|『\d+』|__{2,}|[＿_]{2,}|[（(][\s　]*[）)]|～/

    const importedStartIndex = articleQuestions.length
    let nextContent = articleForm.content
    const normalizedDrafts = articleParsedDrafts.map((draft, idx) => {
      const nextDraft = { ...draft }
      delete nextDraft.__previewToken
      delete nextDraft.__previewDuplicateToken

      if (draft.questionType !== 'FILL_BLANK') {
        return nextDraft
      }
      const sequenceNo = importedStartIndex + idx + 1
      const nextToken = `[${sequenceNo}]`
      const correctText =
        draft.options.find(option => option.isCorrect)?.text?.trim() || ''
      const matchedToken = (draft.__previewToken || '').trim()

      if (matchedToken && nextContent.includes(matchedToken)) {
        nextContent = nextContent.replace(matchedToken, nextToken)
      }

      let nextContextSentence = (draft.contextSentence || '').trim()
      if (matchedToken && nextContextSentence.includes(matchedToken)) {
        nextContextSentence = nextContextSentence.replace(
          matchedToken,
          nextToken,
        )
      } else if (blankTokenRegex.test(nextContextSentence)) {
        nextContextSentence = nextContextSentence.replace(
          blankTokenRegex,
          nextToken,
        )
      }

      const nextPrompt =
        correctText && blankTokenRegex.test(nextContextSentence)
          ? nextContextSentence.replace(blankTokenRegex, correctText)
          : draft.prompt

      return {
        ...nextDraft,
        contextSentence: nextContextSentence,
        prompt: nextPrompt,
      }
    })

    setArticleForm(prev => ({ ...prev, content: nextContent }))
    setArticleQuestions(prev => [...prev, ...normalizedDrafts])
    setArticleQuickInput('')
    setArticleParsedDrafts([])
    setArticleParsedPreviewRows([])
    dialog.toast(`已导入 ${articleParsedDrafts.length} 道阅读题`, {
      tone: 'success',
    })
  }

  const handleArticleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    const res = await createArticle({
      ...articleForm,
      level: articleForm.examLevel,
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
    const res = await createQuizQuestion({
      ...quizForm,
      paperId: quizForm.collectionId,
      level: quizForm.examLevel,
    })
    await dialog.alert(res.message)
    if (res.success) {
      setQuickInput('')
      setQuizForm(prev => ({
        ...prev,
        contextSentence: '',
        targetWord: '',
        prompt: '',
        explanation: '',
        options: prev.options.map((_, i) => ({ text: '', isCorrect: i === 0 })),
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
      const detectedType = detectQuestionType(questionText, [
        match[2].trim(),
        match[3].trim(),
        match[4].trim(),
        match[5].trim(),
      ])
      const inferredTargetWord = inferTargetWord(detectedType, questionText)

      setSortSequence([])
      setQuizForm(prev => ({
        ...prev,
        questionType: detectedType,
        prompt: questionText,
        contextSentence: questionText,
        targetWord: inferredTargetWord,
        options: [
          { text: match[2].trim(), isCorrect: prev.options[0].isCorrect },
          { text: match[3].trim(), isCorrect: prev.options[1].isCorrect },
          { text: match[4].trim(), isCorrect: prev.options[2].isCorrect },
          { text: match[5].trim(), isCorrect: prev.options[3].isCorrect },
        ],
      }))
    }
  }

  const handleBulkQuickParse = () => {
    const parsed = parseMultiQuizText(bulkQuickInput)
    setBulkParsedQuestions(parsed)
    if (parsed.length === 0) {
      void dialog.alert('未识别到完整题目。请检查是否包含每题 4 个选项。')
      return
    }
    // 同步首题到单题编辑区，方便立刻校对
    setQuizForm(prev => ({
      ...prev,
      questionType: parsed[0].questionType,
      prompt: parsed[0].prompt,
      contextSentence: parsed[0].contextSentence,
      targetWord: parsed[0].targetWord || '',
      explanation: parsed[0].explanation,
      options: parsed[0].options,
    }))
    setBulkEditingIndex(0)
    dialog.toast(`已识别 ${parsed.length} 题`, { tone: 'success' })
  }

  const handleBulkPromptChange = (index: number, value: string) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              prompt: value,
              contextSentence: value || item.contextSentence,
            }
          : item,
      ),
    )
  }

  const handleBulkContextSentenceChange = (index: number, value: string) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, contextSentence: value } : item,
      ),
    )
  }

  const handleBulkTargetWordChange = (index: number, value: string) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, targetWord: value.trim() } : item,
      ),
    )
  }

  const handleBulkPickTargetWordFromSelection = () => {
    const textarea = bulkContextTextareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    if (start === end) {
      void dialog.alert('请先在当前题的语境句中划选目标词。')
      return
    }
    const selected = textarea.value.slice(start, end).trim()
    if (!selected) return
    handleBulkTargetWordChange(bulkEditingIndex, selected)
    dialog.toast(`已设置第 ${bulkEditingIndex + 1} 题目标词：${selected}`, {
      tone: 'success',
    })
  }

  const handleBulkOptionTextChange = (
    qIndex: number,
    optionIndex: number,
    value: string,
  ) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) => {
        if (i !== qIndex) return item
        return {
          ...item,
          options: item.options.map((opt, idx) =>
            idx === optionIndex ? { ...opt, text: value } : opt,
          ),
        }
      }),
    )
  }

  const setBulkCorrectOption = (qIndex: number, optionIndex: number) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) => {
        if (i !== qIndex) return item
        return {
          ...item,
          options: item.options.map((opt, idx) => ({
            ...opt,
            isCorrect: idx === optionIndex,
          })),
        }
      }),
    )
  }

  const handleBulkQuestionTypeChange = (
    qIndex: number,
    questionType: ParsedQuizDraft['questionType'],
  ) => {
    setBulkParsedQuestions(prev =>
      prev.map((item, i) => (i === qIndex ? { ...item, questionType } : item)),
    )
  }

  const handleBulkRemoveQuestion = (qIndex: number) => {
    setBulkParsedQuestions(prev => {
      const next = prev.filter((_, i) => i !== qIndex)
      setBulkEditingIndex(current => {
        if (next.length === 0) return 0
        if (qIndex < current) return current - 1
        if (qIndex === current) return Math.min(current, next.length - 1)
        return current
      })
      return next
    })
  }

  const handleBulkQuizSave = async () => {
    if (bulkParsedQuestions.length === 0) {
      await dialog.alert('请先点击“识别多题”。')
      return
    }
    if (!quizForm.collectionId) {
      await dialog.alert('请先选择所属集合。')
      return
    }

    setIsSubmitting(true)
    let successCount = 0
    const failed: Array<{ index: number; message: string }> = []

    for (let i = 0; i < bulkParsedQuestions.length; i += 1) {
      const draft = bulkParsedQuestions[i]
      const res = await createQuizQuestion({
        paperId: quizForm.collectionId,
        questionType: draft.questionType,
        contextSentence: draft.contextSentence,
        targetWord: draft.targetWord || '',
        prompt: draft.prompt,
        explanation: draft.explanation,
        language: quizForm.language,
        level: quizForm.examLevel,
        options: draft.options,
      })
      if (res.success) {
        successCount += 1
      } else {
        failed.push({ index: i + 1, message: res.message || '保存失败' })
      }
    }

    setIsSubmitting(false)

    if (failed.length === 0) {
      setBulkQuickInput('')
      setBulkParsedQuestions([])
      setQuickInput('')
      setQuizForm(prev => ({
        ...prev,
        contextSentence: '',
        targetWord: '',
        prompt: '',
        explanation: '',
        options: prev.options.map((_, idx) => ({
          text: '',
          isCorrect: idx === 0,
        })),
      }))
      await dialog.alert(`批量保存成功，共 ${successCount} 题。`)
      return
    }

    const preview = failed
      .slice(0, 5)
      .map(item => `第 ${item.index} 题：${item.message}`)
      .join('\n')
    await dialog.alert(
      `已保存 ${successCount} 题，失败 ${failed.length} 题。\n${preview}${failed.length > 5 ? '\n…' : ''}`,
    )
  }

  const setCorrectOption = (index: number) => {
    setQuizForm(prev => {
      const newOptions = prev.options.map((opt, i) => ({
        ...opt,
        isCorrect: i === index,
      }))
      const newContextSentence = prev.contextSentence

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
    quizForm.prompt.trim().length > 0 ||
    quizForm.contextSentence.trim().length > 0

  const renderTargetWordPreview = (sentence: string, targetWord: string) => {
    if (!targetWord || !sentence.includes(targetWord))
      return sentence || '（语境句预览）'
    const index = sentence.indexOf(targetWord)
    const before = sentence.slice(0, index)
    const after = sentence.slice(index + targetWord.length)
    return (
      <>
        {before}
        <span className='border-b-2 border-blue-500 font-semibold text-blue-700'>
          {targetWord}
        </span>
        {after}
      </>
    )
  }

  const handlePickTargetWordFromSelection = () => {
    const textarea = quizContextTextareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    if (start === end) {
      void dialog.alert('请先在“语境句”中用鼠标划选一个目标词。')
      return
    }
    const selected = textarea.value.slice(start, end).trim()
    if (!selected) return
    setQuizForm(prev => ({ ...prev, targetWord: selected }))
    dialog.toast(`已设置目标词：${selected}`, { tone: 'success' })
  }

  const applyArticleCollection = (collectionId: string) => {
    const matched = localCollections.find(item => item.id === collectionId)
    setArticleForm(prev => ({
      ...prev,
      paperId: collectionId,
      language: matched?.language || '',
      examLevel: matched?.examLevel || '',
    }))
  }

  const applyQuizCollection = (collectionId: string) => {
    const matched = localCollections.find(item => item.id === collectionId)
    setQuizForm(prev => ({
      ...prev,
      collectionId,
      language: matched?.language || '',
      examLevel: matched?.examLevel || '',
    }))
  }

  const CollectionSelector = ({
    value,
    onChange,
    hint,
  }: {
    value: string
    onChange: (val: string) => void
    hint?: string
  }) => {
    const {
      isCreating,
      setIsCreating,
      newCatData,
      setNewCatData,
      isSavingCat,
      setIsSavingCat,
      resetNameOnly,
    } = useCollectionCreatorState(dbLevels[0]?.id || '')

    const handleSaveCategory = async () => {
      if (!newCatData.name.trim()) {
        await dialog.alert('集合名称不能为空。')
        return
      }
      setIsSavingCat(true)

      const res = await createCategory({
        ...newCatData,
        materialType:
          activeTab === 'article' ? 'READING' : 'VOCAB_GRAMMAR',
      })
      if (res.success && res.paper) {
        const createdCollection: UploadCollectionLite = {
          id: res.paper.id,
          name: res.paper.name,
          parentId: null,
          sortOrder: 0,
          collectionType: res.paper.collectionType,
          acceptedMaterialTypes: res.paper.acceptedMaterialTypes,
          level: { title: res.paper.level.title },
          lessons: [],
        }
        setLocalCollections(prev => [createdCollection, ...prev])
        onChange(res.paper.id)
        setIsCreating(false)
        resetNameOnly()
      } else {
        await dialog.alert(res.message || '创建失败')
      }
      setIsSavingCat(false)
    }

    return (
      <div className='mb-6 border border-slate-200 bg-white p-4 transition-colors duration-300 md:p-5'>
        <div className='mb-3 flex items-center justify-between'>
          <label className='block text-sm font-bold text-slate-900'>
            所属集合
          </label>
          <button
            type='button'
            onClick={() => setIsCreating(!isCreating)}
            className='border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900'>
            {isCreating ? '取消新建' : '新建集合'}
          </button>
        </div>

        {!isCreating ? (
          <CollectionBrowserSelect
            value={value}
            onChange={onChange}
            options={collectionOptions}
            placeholder='无可用集合，请先新建'
            recentKey='manage.upload.collection.recent'
          />
        ) : (
          <div className='animate-in slide-in-from-top-2 flex flex-col gap-3 border border-slate-200 bg-slate-50 p-4 fade-in'>
            <div className='flex flex-col gap-2 md:flex-row md:gap-3'>
              <div className='w-full md:w-1/3'>
                <CustomSelect
                  value={newCatData.collectionType}
                  onChange={e =>
                    setNewCatData({ ...newCatData, collectionType: e.target.value })
                  }
                  className='h-full w-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100'>
                  {dbLevels.map(lvl => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.title}
                    </option>
                  ))}
                </CustomSelect>
                <p className='mt-2 text-xs font-semibold text-slate-500'>
                  选择这个集合之后主要放在哪里使用。
                </p>
              </div>
              <input
                type='text'
                value={newCatData.name}
                onChange={e =>
                  setNewCatData({ ...newCatData, name: e.target.value })
                }
                placeholder='集合名称，例如：2025-07 N1 真题'
                className='flex-1 border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-100'
              />
            </div>
            <button
              type='button'
              onClick={handleSaveCategory}
              disabled={isSavingCat}
              className='w-full border border-slate-200 bg-slate-900 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50'>
              {isSavingCat ? '创建中...' : '确认创建并使用该集合'}
            </button>
          </div>
        )}
        {hint && !isCreating ? (
          <p className='mt-3 text-xs leading-5 text-slate-500'>{hint}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <div className='w-full'>
        {activeTab === 'audio' && (
          <div className='animate-in slide-in-from-bottom-4 fade-in duration-500'>
            <UploadForm levels={dbLevels} papers={dbCollections} />
          </div>
        )}

        {activeTab === 'timed-audio' && (
          <div className='animate-in slide-in-from-bottom-4 fade-in duration-500'>
            <AudioTimingStudio collections={dbCollections} />
          </div>
        )}

        {activeTab === 'media' && (
          <div className='animate-in slide-in-from-bottom-4 fade-in duration-500'>
            <UploadForm
              levels={dbLevels}
              papers={dbCollections}
              variant='media-subtitle'
            />
          </div>
        )}

        {activeTab === 'article' && (
          <ArticleImportPanel
            articleForm={articleForm}
            setArticleForm={setArticleForm}
            articleQuestions={articleQuestions}
            setArticleQuestions={setArticleQuestions}
            articleTextareaRef={articleTextareaRef}
            collectionSelector={
              <CollectionSelector
                value={articleForm.paperId}
                onChange={applyArticleCollection}
                hint='仅显示可承载阅读文章的集合。综合系列可以同时包含文章与跟读，学习入口仍按材料类型分别展示。'
              />
            }
            handleMakeBlank={handleMakeBlank}
            handleParseCardOptions={handleParseCardOptions}
            articleQuickInput={articleQuickInput}
            setArticleQuickInput={setArticleQuickInput}
            handleArticleAddQuestion={handleArticleAddQuestion}
            articleParsedDrafts={articleParsedDrafts}
            handleConfirmArticlePreviewImport={handleConfirmArticlePreviewImport}
            articleParsedPreviewRows={articleParsedPreviewRows}
            isSubmitting={isSubmitting}
            handleArticleSubmit={handleArticleSubmit}
            onRemoveQuestion={async questionIndex => {
              const confirmed = await dialog.confirm(
                `确认移除第 ${questionIndex + 1} 题吗？`,
                {
                  title: '移除题目',
                  confirmText: '移除',
                  danger: true,
                },
              )
              if (!confirmed) return
              setArticleQuestions(previous =>
                previous.filter((_, index) => index !== questionIndex),
              )
            }}
          />
        )}

        {/* ================= 3. 题目上传视图 (代码未改动) ================= */}
        {activeTab === 'quiz' && (
          <form
            onSubmit={event => {
              if (quizEntryMode === 'bulk') {
                event.preventDefault()
                return
              }
              void handleQuizSubmit(event)
            }}
            className='animate-in space-y-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_-32px_rgba(15,23,42,0.5)] fade-in slide-in-from-bottom-4 duration-500 md:p-8'>
            <div className='space-y-1'>
              <h2 className='text-xl font-black text-gray-900 md:text-2xl'>
                导入练习题
              </h2>
              <p className='text-sm text-gray-500'>
                可先粘贴整题自动解析，再做少量校对后保存。
              </p>
            </div>

            <CollectionSelector
              value={quizForm.collectionId}
              onChange={applyQuizCollection}
            />

            <div
              role='tablist'
              aria-label='题目录入方式'
              className='grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1'>
              <button
                type='button'
                role='tab'
                aria-selected={quizEntryMode === 'bulk'}
                onClick={() => setQuizEntryMode('bulk')}
                className={`rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                  quizEntryMode === 'bulk'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                批量粘贴
              </button>
              <button
                type='button'
                role='tab'
                aria-selected={quizEntryMode === 'single'}
                onClick={() => setQuizEntryMode('single')}
                className={`rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                  quizEntryMode === 'single'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                单题录入
              </button>
            </div>

            <details className='group rounded-lg border border-slate-200 bg-slate-50'>
              <summary className='flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 marker:content-none'>
                补充语言与等级
                <span className='text-xs font-normal text-slate-400 group-open:hidden'>
                  可选
                </span>
                <span className='hidden text-xs font-normal text-slate-400 group-open:inline'>
                  收起
                </span>
              </summary>
              <div className='grid grid-cols-1 gap-3 border-t border-slate-200 p-4 md:grid-cols-2'>
              <label className='block text-sm font-bold text-gray-700'>
                语言
                <input
                  type='text'
                  value={quizForm.language}
                  onChange={e =>
                    setQuizForm({
                      ...quizForm,
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
                  value={quizForm.examLevel}
                  onChange={e =>
                    setQuizForm({
                      ...quizForm,
                      examLevel: e.target.value,
                    })
                  }
                  className='mt-2 w-full border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500'
                  placeholder='例如：N1 / B2'
                />
              </label>
              </div>
            </details>

            {quizEntryMode === 'bulk' ? (
              <BulkQuizPanel
              bulkQuickInput={bulkQuickInput}
              setBulkQuickInput={setBulkQuickInput}
              handleBulkQuickParse={handleBulkQuickParse}
              isSubmitting={isSubmitting}
              bulkParsedQuestions={bulkParsedQuestions}
              handleBulkQuizSave={handleBulkQuizSave}
              bulkEditingIndex={bulkEditingIndex}
              setBulkEditingIndex={setBulkEditingIndex}
              handleBulkRemoveQuestion={handleBulkRemoveQuestion}
              handleBulkQuestionTypeChange={handleBulkQuestionTypeChange}
              handleBulkPromptChange={handleBulkPromptChange}
              bulkContextTextareaRef={bulkContextTextareaRef}
              handleBulkContextSentenceChange={handleBulkContextSentenceChange}
              handleBulkPickTargetWordFromSelection={
                handleBulkPickTargetWordFromSelection
              }
              handleBulkTargetWordChange={handleBulkTargetWordChange}
              setBulkCorrectOption={setBulkCorrectOption}
              handleBulkOptionTextChange={handleBulkOptionTextChange}
              />
            ) : (
              <>
            <section className='border border-blue-100 bg-blue-50/50 p-4 shadow-inner md:p-5'>
              <label className='mb-2 block text-sm font-black text-blue-900'>
                快速粘贴（推荐）
              </label>
              <p className='mb-3 text-xs leading-relaxed text-blue-700'>
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
                className='w-full px-4 py-3 border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none resize-y text-sm bg-white'
              />

              {quizForm.questionType !== 'SORTING' && (
                <div className='mt-4 border border-blue-100 bg-white/75 p-3'>
                  <span className='mb-2 block text-xs font-bold tracking-wide text-blue-800'>
                    正确答案
                  </span>
                  <div className='flex flex-wrap gap-2'>
                    {[1, 2, 3, 4].map((num, idx) => (
                      <button
                        key={num}
                        type='button'
                        onClick={() => setCorrectOption(idx)}
                        className={`h-9 min-w-9 px-3 text-sm font-black transition-colors ${quizForm.options[idx].isCorrect ? 'bg-blue-500 text-white shadow-blue-200' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
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
              <div className='border border-gray-200 bg-gray-50/40 p-4'>
                <label className='mb-2 block text-sm font-bold text-gray-700'>
                  题型选择
                </label>
                <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
                  {[
                    { value: 'PRONUNCIATION', label: '漢字読み' },
                    { value: 'SYNONYM_REPLACEMENT', label: '言い換え類義' },
                    { value: 'WORD_DISTINCTION', label: '用法' },
                    { value: 'GRAMMAR', label: '文脈・文法選択' },
                    { value: 'SORTING', label: '文の組み立て' },
                  ].map(type => (
                    <button
                      key={type.value}
                      type='button'
                      onClick={() => {
                        setSortSequence([])
                        setQuizForm({ ...quizForm, questionType: type.value })
                      }}
                      className={`border px-3 py-2 text-sm font-bold transition-colors ${
                        quizForm.questionType === type.value
                          ? 'border-blue-300 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}>
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className='border border-gray-200 bg-gray-50/40 p-4'>
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
                  className='w-full border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'
                  placeholder='例如：チームの(　　　)を強めよう。（可留空）'
                />
              </div>
            </section>

            <section className='border border-blue-100 bg-blue-50/40 p-4'>
              {quizForm.questionType === 'SORTING' && (
                <div className='mb-4 border border-orange-200 bg-orange-50 p-4'>
                  <label className='mb-2 block text-sm font-bold text-orange-800'>
                    排序设置：按正确语序依次点击 4 个选项
                  </label>
                  <div className='flex flex-wrap gap-2 mb-4'>
                    {quizForm.options.map((opt, i) => {
                      const isClicked = sortSequence.includes(i)
                      const orderNum = sortSequence.indexOf(i) + 1
                      return (
                        <button
                          key={`sort-option-${opt.text || 'empty'}-${i}`}
                          type='button'
                          disabled={isClicked || !opt.text}
                          onClick={() => handleSortClick(i)}
                          className={`relative px-4 py-2 font-bold transition-colors ${isClicked ? 'bg-orange-200 text-orange-500 opacity-50' : 'bg-white text-orange-600 border border-orange-200 hover:bg-orange-100'}`}>
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
                    <div className='text-sm text-blue-600 font-bold flex justify-between items-center'>
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
              <label className='mb-2 block text-sm font-bold text-blue-900'>
                语境句
              </label>
              <p className='mb-2 text-xs text-blue-700'>
                用于生词与复习展示，建议填写完整句子。
              </p>
              <textarea
                ref={quizContextTextareaRef}
                value={quizForm.contextSentence}
                onChange={e =>
                  setQuizForm({ ...quizForm, contextSentence: e.target.value })
                }
                rows={2}
                className='w-full border border-blue-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500'
                placeholder='例如：チームの結束を強めよう。（可留空）'
              />
              {(quizForm.questionType === 'PRONUNCIATION' ||
                quizForm.questionType === 'SYNONYM_REPLACEMENT' ||
                quizForm.questionType === 'WORD_DISTINCTION') && (
                <div className='mt-3 border border-blue-200 bg-white p-3'>
                  <div className='mb-2 flex flex-wrap items-center gap-2'>
                    <button
                      type='button'
                      onClick={handlePickTargetWordFromSelection}
                      className='h-9 border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100'>
                      从语境句划词设为读音目标
                    </button>
                    <input
                      type='text'
                      value={quizForm.targetWord}
                      onChange={e =>
                        setQuizForm({
                          ...quizForm,
                          targetWord: e.target.value.trim(),
                        })
                      }
                      placeholder='或手动输入目标词'
                      className='h-9 min-w-0 flex-1 border border-blue-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500'
                    />
                  </div>
                  <div className='text-sm leading-relaxed text-gray-700'>
                    {renderTargetWordPreview(
                      quizForm.contextSentence,
                      quizForm.targetWord,
                    )}
                  </div>
                </div>
              )}
              {!quizHasQuestionContent && (
                <div className='mt-3 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800'>
                  请先补充题目内容，再保存题目。可在“快速粘贴”“题目呈现”或“语境句”任一处输入。
                </div>
              )}
            </section>

            <section className='border border-gray-200 bg-gray-50/40 p-4 md:p-5'>
              <label className='mb-3 block text-sm font-bold text-gray-700'>
                选项设置
              </label>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                {quizForm.options.map((opt, idx) => (
                  <div
                    key={`option-editor-${opt.text || 'empty'}-${idx}`}
                    className='flex min-w-0 items-center gap-3 border border-gray-200 bg-white px-3 py-2.5'>
                    <input
                      type='radio'
                      name='correctOption'
                      checked={opt.isCorrect}
                      onChange={() => setCorrectOption(idx)}
                      className='w-5 h-5 text-blue-600 focus:ring-blue-500 border-gray-300'
                    />
                    <input
                      type='text'
                      value={opt.text}
                      onChange={e => {
                        const newOptions = [...quizForm.options]
                        newOptions[idx].text = e.target.value
                        setQuizForm({ ...quizForm, options: newOptions })
                      }}
                      className='min-w-0 flex-1 border border-gray-200 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500'
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
                className='w-full px-4 py-3 border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50'
                placeholder='可补充解题思路或易错点。'
              />
            </section>

            <button
              disabled={isSubmitting || !quizHasQuestionContent}
              type='submit'
              className='w-full bg-blue-600 py-4 font-black text-white transition-colors hover:bg-blue-700 disabled:opacity-50'>
              {isSubmitting
                ? '保存中...'
                : quizHasQuestionContent
                  ? '保存当前单题'
                  : '请先填写题目内容'}
            </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
