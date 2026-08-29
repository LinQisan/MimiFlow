// app/admin/upload/UploadCenterUI.tsx
'use client'

import React, { useEffect, useMemo } from 'react'
import type { MaterialType } from '@prisma/client'
import UploadForm from '@/features/import/ui/UploadForm'
import CollectionBrowserSelect, {
  type CollectionBrowserOption,
} from '@/components/manage/import/CollectionBrowserSelect'
import { useDialog } from '@/context/DialogContext'
import { toCollectionBrowserOptions } from '@/components/manage/import/collectionBrowserOptions'
import CustomSelect from '@/components/ui/CustomSelect'
import { parseMultiQuizText } from '@/modules/import/domain/quiz-text-parser'
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
  ArticleImportedQuestionDraft,
  ArticlePreviewRow,
  ParsedQuizDraft,
  UploadCollectionLite,
  UploadLevelLite,
  UploadCenterTab,
} from '@/modules/import/types'
import BulkQuizPanel from '@/modules/import/components/BulkQuizPanel'
import ArticleImportPanel from '@/modules/import/components/ArticleImportPanel'
import { useUploadCenterMutations } from '@/features/import/hooks/useUploadMutations'
import {
  MIN_QUESTION_OPTION_COUNT,
  removeQuestionOptionAt,
} from '@/features/questions/domain/editor'
import {
  getImportQuestionTypeLabel,
  IMPORT_QUESTION_TYPES,
} from '@/modules/import/domain/question-type-options'
import {
  parseSortingPrompt,
  supportsSeparateQuestionContext,
  usesExplicitQuestionTargetWord,
} from '@/modules/practice/domain/question-text'
import type { PaperReadingQuestionType } from '@/features/questions/domain/paper-editor'
import {
  findNewsCollectionId,
  getNewsTypeLabel,
  isAutomaticMorningEdition,
  isAutomaticFrontPageSection,
  supportsBreakingEdition,
  todayForDateInput,
  toLegacyNewsSeries,
} from '@/features/reading/domain/news-metadata'

interface Props {
  dbLevels: UploadLevelLite[]
  dbCollections: UploadCollectionLite[]
  initialTab?: UploadCenterTab
  initialMaterialType?: MaterialType
  language?: string
  collectionScope?: 'paper' | 'material'
  defaultQuestionType?: string
  toeicPartLabel?: string
  defaultListeningSectionNumber?: string
  listeningSectionLabel?: string
}

interface CollectionSelectorProps {
  value: string
  onChange: (value: string) => void
  hint?: string
  dbLevels: UploadLevelLite[]
  collectionScope: 'paper' | 'material'
  activeTab: UploadCenterTab
  language: string
  collectionOptions: CollectionBrowserOption[]
  setLocalCollections: React.Dispatch<
    React.SetStateAction<UploadCollectionLite[]>
  >
}

function CollectionSelector({
  value,
  onChange,
  hint,
  dbLevels,
  collectionScope,
  activeTab,
  language,
  collectionOptions,
  setLocalCollections,
}: CollectionSelectorProps) {
  const dialog = useDialog()
  const { createCategory } = useUploadCenterMutations()
  const {
    isCreating,
    setIsCreating,
    newCatData,
    setNewCatData,
    isSavingCat,
    setIsSavingCat,
    resetNameOnly,
  } = useCollectionCreatorState(dbLevels[0]?.id || '')
  const destinationName = collectionScope === 'paper' ? '试卷' : '资料集'

  const handleSaveCategory = async () => {
    if (!newCatData.name.trim()) {
      await dialog.alert(`请填写${destinationName}名称。`)
      return
    }
    setIsSavingCat(true)

    const res = await createCategory({
      ...newCatData,
      language,
      materialType: activeTab === 'article' ? 'READING' : 'VOCAB_GRAMMAR',
    })
    if (res.success && res.paper) {
      const createdCollection: UploadCollectionLite = {
        id: res.paper.id,
        name: res.paper.name,
        parentId: null,
        sortOrder: 0,
        collectionType: res.paper.collectionType,
        acceptedMaterialTypes: res.paper.acceptedMaterialTypes,
        language,
        level: { title: res.paper.level.title },
        lessons: [],
      }
      setLocalCollections((previous) => [createdCollection, ...previous])
      onChange(res.paper.id)
      setIsCreating(false)
      resetNameOnly()
    } else {
      await dialog.alert(res.message || '创建失败')
    }
    setIsSavingCat(false)
  }

  const isFlatCollection = activeTab === 'quiz' || activeTab === 'article'

  return (
    <div
      className={
        isFlatCollection
          ? 'border-b border-slate-200 pb-6'
          : 'mb-6 border border-slate-200 bg-white p-4 transition-colors duration-300 md:p-5'
      }
    >
      <div className="mb-3 flex items-center justify-between">
        <label className="block text-sm font-bold text-slate-900">
          {collectionScope === 'paper' ? '所属试卷' : '保存位置'}
        </label>
        <button
          type="button"
          onClick={() => setIsCreating(!isCreating)}
          className="border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          {isCreating ? '取消' : `新建${destinationName}`}
        </button>
      </div>

      {!isCreating ? (
        <CollectionBrowserSelect
          value={value}
          onChange={onChange}
          options={collectionOptions}
          placeholder={`请选择${destinationName}`}
          recentKey="manage.upload.collection.recent"
        />
      ) : (
        <div className="animate-in slide-in-from-top-2 flex flex-col gap-3 border-t border-slate-200 bg-slate-50/60 p-4 fade-in">
          <div className="flex flex-col gap-2 md:flex-row md:gap-3">
            <div
              className={
                collectionScope === 'paper' ? 'hidden' : 'w-full md:w-1/3'
              }
            >
              <CustomSelect
                value={newCatData.collectionType}
                onChange={(event) =>
                  setNewCatData({
                    ...newCatData,
                    collectionType: event.target.value,
                  })
                }
                className="h-full w-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
              >
                {dbLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.title}
                  </option>
                ))}
              </CustomSelect>
            </div>
            <input
              type="text"
              value={newCatData.name}
              onChange={(event) =>
                setNewCatData({ ...newCatData, name: event.target.value })
              }
              placeholder={
                collectionScope === 'paper'
                  ? language === 'en'
                    ? '试卷名称，例如：TOEIC 模拟题 01'
                    : '试卷名称，例如：2025-07 N1 真题'
                  : '资料集名称，例如：日本新闻'
              }
              className="flex-1 border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveCategory}
            disabled={isSavingCat}
            className="w-full border border-slate-200 bg-slate-900 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            {isSavingCat ? '创建中...' : `创建并选择此${destinationName}`}
          </button>
        </div>
      )}
      {hint && !isCreating ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">{hint}</p>
      ) : null}
    </div>
  )
}

export default function UploadCenterUI({
  dbLevels,
  dbCollections,
  initialTab = 'audio',
  initialMaterialType = 'LISTENING',
  language = 'ja',
  collectionScope = 'material',
  defaultQuestionType,
  toeicPartLabel,
  defaultListeningSectionNumber,
  listeningSectionLabel,
}: Props) {
  const dialog = useDialog()
  const defaultArticleSourceKind =
    collectionScope === 'material' && initialMaterialType === 'READING'
      ? 'NEWS'
      : 'ARTICLE'
  const { createArticle, createQuizQuestion } = useUploadCenterMutations()
  const {
    quizEntryMode,
    articleQuestionType,
    setArticleQuestionType,
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
  } = useUploadCenterState(
    dbCollections,
    initialTab,
    defaultQuestionType,
    defaultArticleSourceKind,
  )

  const collectionOptions: CollectionBrowserOption[] = useMemo(
    () => toCollectionBrowserOptions(localCollections),
    [localCollections],
  )
  const selectedArticleCollection = localCollections.find(
    (collection) => collection.id === articleForm.paperId,
  )
  const isPaperArticleCollection =
    selectedArticleCollection?.collectionType === 'PAPER'
  const selectedNewsCollectionId = findNewsCollectionId(localCollections, {
    source: articleForm.newsSource,
    column: articleForm.newsColumn,
  })
  const selectedNewsCollection = localCollections.find(
    (collection) => collection.id === selectedNewsCollectionId,
  )

  useEffect(() => {
    if (
      activeTab !== 'article' ||
      articleForm.sourceKind !== 'NEWS' ||
      articleForm.publishedDate
    )
      return
    setArticleForm((previous) => ({
      ...previous,
      publishedDate: todayForDateInput(),
    }))
  }, [
    activeTab,
    articleForm.publishedDate,
    articleForm.sourceKind,
    setArticleForm,
  ])

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
    if (!selectedWord) {
      void dialog.alert('请选择实际文字，不能只选择空白。')
      return
    }

    // 精准截取包含该词的“单句”（不跨句）
    const contextSentence = extractSentenceAroundIndex(
      fullText,
      start,
      Math.max(1, end - start),
    )
    const blankToken = `[${articleQuestions.length + 1}]`
    const sentenceStart = fullText.lastIndexOf(contextSentence, start)
    const localSelectionStart = Math.max(0, start - sentenceStart)
    const localSelectionEnd = Math.max(localSelectionStart, end - sentenceStart)
    const blankContextSentence =
      sentenceStart >= 0
        ? contextSentence.slice(0, localSelectionStart) +
          blankToken +
          contextSentence.slice(localSelectionEnd)
        : contextSentence.replace(selectedWord, blankToken)
    const nextArticleText =
      fullText.slice(0, start) + blankToken + fullText.slice(end)

    // 自动创建新题目
    const newQuestion = {
      questionType: articleQuestionType,
      prompt: contextSentence,
      contextSentence: blankContextSentence,
      explanation: '',
      options: [
        { text: selectedWord, isCorrect: true }, // 🌟 选中的词自动变成正确选项
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
        { text: '', isCorrect: false },
      ],
    }

    setArticleQuestions((prev) => [...prev, newQuestion])
    setArticleForm((prev) => ({ ...prev, content: nextArticleText }))

    // 取消选中状态，方便继续选下一个词
    textarea.selectionStart = textarea.selectionEnd
    textarea.focus()
  }

  // ================= 🌟 3. 新增：单题专属的选项解析魔法 =================
  const handleParseCardOptions = (qIndex: number, text: string) => {
    if (!text.trim()) return false
    const draft = parseMultiQuizText(text)[0]

    if (draft && draft.options.length >= MIN_QUESTION_OPTION_COUNT) {
      const newOptionsTexts = draft.options.map((option) => option.text)

      const newQs = [...articleQuestions]

      // 🌟 自动寻的魔法：寻找哪个新选项包含了我们刚才“划词”选中的正确答案
      const currentCorrectOpt = newQs[qIndex].options.find((o) => o.isCorrect)
      const correctText = currentCorrectOpt ? currentCorrectOpt.text : ''

      let newCorrectIdx = newOptionsTexts.findIndex(
        (t) =>
          t === correctText ||
          t.includes(correctText) ||
          correctText.includes(t),
      )
      if (newCorrectIdx === -1) newCorrectIdx = 0 // 如果找不到完美匹配，兜底选第1个

      // 按粘贴内容覆盖这道题自己的选项集合
      newQs[qIndex].options = newOptionsTexts.map((txt, idx) => ({
        text: txt,
        isCorrect: idx === newCorrectIdx,
      }))
      newQs[qIndex] = rebuildFillBlankPromptFromQuestion(newQs[qIndex])

      setArticleQuestions(newQs)
      return true
    } else {
      void dialog.alert('解析失败：请至少提供 2 个带序号的选项。')
      return false
    }
  }
  // ================= 提交处理 =================

  const commitArticleDrafts = (
    drafts: ArticleImportedQuestionDraft[],
    previewRows: ArticlePreviewRow[],
    options?: { linkExistingFillBlanksByOrder?: boolean },
  ) => {
    if (drafts.length === 0) return false
    if (previewRows.some((row) => row.isDuplicateToken)) {
      void dialog.alert('检测到重号占位符，请先修正文中的重复编号后再导入。')
      return false
    }
    const blankTokenRegex =
      /\[\d+\]|［\d+］|\(\d+\)|（\d+）|【\d+】|「\d+」|『\d+』|__{2,}|[＿_]{2,}|[（(][\s　]*[）)]|～/

    const existingFillBlankIndexes = options?.linkExistingFillBlanksByOrder
      ? articleQuestions.flatMap((question, index) =>
          question.questionType === 'FILL_BLANK' ? [index] : [],
        )
      : []
    const linkedDraftCount = Math.min(
      existingFillBlankIndexes.length,
      drafts.length,
    )
    const draftsToAppend = drafts.slice(linkedDraftCount)
    const importedStartIndex = articleQuestions.length
    let nextContent = articleForm.content
    const normalizedDrafts = draftsToAppend.map((draft, idx) => {
      const nextDraft = { ...draft }
      delete nextDraft.__previewToken
      delete nextDraft.__previewDuplicateToken

      if (
        draft.questionType !== 'FILL_BLANK' &&
        draft.questionType !== 'TOEIC_TEXT_COMPLETION'
      ) {
        return nextDraft
      }
      const sequenceNo = importedStartIndex + idx + 1
      const nextToken = `[${sequenceNo}]`
      const correctText =
        draft.options.find((option) => option.isCorrect)?.text?.trim() || ''
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

    setArticleForm((prev) => ({ ...prev, content: nextContent }))
    setArticleQuestions((prev) => {
      const next = [...prev]
      for (let index = 0; index < linkedDraftCount; index += 1) {
        const questionIndex = existingFillBlankIndexes[index]
        const existingQuestion = next[questionIndex]
        const importedQuestion = drafts[index]
        next[questionIndex] = rebuildFillBlankPromptFromQuestion({
          ...existingQuestion,
          options: importedQuestion.options,
          explanation:
            importedQuestion.explanation || existingQuestion.explanation,
        })
      }
      return [...next, ...normalizedDrafts]
    })
    setArticleQuickInput('')
    return true
  }

  const handleArticleAddQuestion = () => {
    if (!articleQuickInput.trim()) return

    const shouldMatchFillBlanksByOrder =
      articleQuestionType === 'FILL_BLANK' ||
      articleQuestionType === 'TOEIC_TEXT_COMPLETION'

    const { drafts, previewRows } = buildArticleQuestionsFromQuickInput(
      articleQuickInput,
      articleForm.content,
      {
        questionType: articleQuestionType,
        matchFillBlanksByOrder: shouldMatchFillBlanksByOrder,
      },
    )
    if (drafts.length === 0) {
      void dialog.alert('解析失败，请检查每题是否至少包含 2 个选项。')
      return
    }

    const normalizedDrafts = isPaperArticleCollection
      ? drafts.map((draft) => ({
          ...draft,
          questionType: articleQuestionType,
        }))
      : drafts

    if (shouldMatchFillBlanksByOrder) {
      const unmatchedCount = previewRows.filter(
        (row) => row.placeholderToken === '未命中',
      ).length
      if (unmatchedCount > 0) {
        void dialog.alert(
          `正文中的空位数量不足，还有 ${unmatchedCount} 道题无法对应。请先在正文中插入足够的完形填空。`,
        )
        return
      }
      if (
        commitArticleDrafts(normalizedDrafts, previewRows, {
          linkExistingFillBlanksByOrder: true,
        })
      ) {
        dialog.toast(`已按正文顺序连接 ${normalizedDrafts.length} 道完形题`, {
          tone: 'success',
        })
      }
      return
    }

    if (commitArticleDrafts(normalizedDrafts, previewRows)) {
      dialog.toast(`已加入 ${normalizedDrafts.length} 道阅读题`, {
        tone: 'success',
      })
    }
  }

  const handleArticleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (articleForm.sourceKind === 'NEWS') {
      if (
        !articleForm.newsType ||
        !articleForm.newsSource ||
        !articleForm.newsSection.trim()
      ) {
        await dialog.alert('请完整选择新闻类型、来源和版面。')
        return
      }
      if (articleForm.newsType === 'column' && !articleForm.newsColumn) {
        await dialog.alert('请选择专栏名称。')
        return
      }
    }
    setIsSubmitting(true)
    const submissionSeries =
      articleForm.sourceKind === 'NEWS'
        ? toLegacyNewsSeries(articleForm.newsType, articleForm.newsColumn)
        : ''
    const submissionCollectionId =
      findNewsCollectionId(localCollections, {
        source: articleForm.newsSource,
        column: articleForm.newsColumn,
      }) || articleForm.paperId
    const res = await createArticle({
      ...articleForm,
      paperId: submissionCollectionId,
      newsSeries: submissionSeries,
      pageNumber: articleForm.newsSection,
      questionType: articleQuestionType,
      questions: articleQuestions,
    })
    await dialog.alert(res.message)
    if (res.success) {
      setArticleForm((prev) => ({
        ...prev,
        title: '',
        description: '',
        content: '',
        paperId: defaultArticleSourceKind === 'NEWS' ? '' : prev.paperId,
        sourceKind: defaultArticleSourceKind,
        publishedDate:
          defaultArticleSourceKind === 'NEWS' ? todayForDateInput() : '',
        edition: '',
        newsSeries: '',
        pageNumber: '',
        newsSource: '',
        newsType: '',
        newsSection: '',
        newsColumn: '',
        newsTopic: '',
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
        '请先填写题目内容再保存。\n可选方式：\n1) 使用“快速粘贴”自动解析\n2) 填写题干\n3) 题干不是完整句子时，补充题目原句',
      )
      return
    }
    setIsSubmitting(true)
    const res = await createQuizQuestion({
      ...quizForm,
      paperId: quizForm.collectionId,
    })
    await dialog.alert(res.message)
    if (res.success) {
      setQuickInput('')
      setQuizForm((prev) => ({
        ...prev,
        contextSentence: '',
        targetWord: '',
        sortingOrder: [],
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
    const draft = parseMultiQuizText(text)[0]

    if (draft && draft.options.length >= MIN_QUESTION_OPTION_COUNT) {
      setSortSequence([])
      setQuizForm((prev) => {
        const questionType = (defaultQuestionType ||
          prev.questionType) as ParsedQuizDraft['questionType']
        return {
          ...prev,
          questionType,
          prompt: draft.prompt,
          contextSentence: supportsSeparateQuestionContext(questionType)
            ? draft.contextSentence
            : '',
          targetWord: usesExplicitQuestionTargetWord(questionType)
            ? draft.targetWord || ''
            : '',
          sortingOrder:
            questionType === 'SORTING' ? draft.sortingOrder || [] : [],
          options: draft.options.map((option, index) => ({
            text: option.text,
            isCorrect: prev.options[index]?.isCorrect ?? index === 0,
          })),
        }
      })
    }
  }

  const handleBulkQuickParse = () => {
    const questionType = (defaultQuestionType ||
      quizForm.questionType) as ParsedQuizDraft['questionType']
    const parsed = parseMultiQuizText(bulkQuickInput).map((draft) => ({
      ...draft,
      questionType,
      contextSentence: supportsSeparateQuestionContext(questionType)
        ? draft.contextSentence
        : '',
      targetWord: usesExplicitQuestionTargetWord(questionType)
        ? draft.targetWord || ''
        : '',
      sortingOrder: questionType === 'SORTING' ? draft.sortingOrder || [] : [],
    }))
    setBulkParsedQuestions(parsed)
    if (parsed.length === 0) {
      void dialog.alert('未识别到完整题目。请检查每题是否至少包含 2 个选项。')
      return
    }
    // 同步首题到单题编辑区，方便立刻校对
    setQuizForm((prev) => ({
      ...prev,
      questionType: parsed[0].questionType,
      prompt: parsed[0].prompt,
      contextSentence: parsed[0].contextSentence,
      targetWord: parsed[0].targetWord || '',
      sortingOrder: parsed[0].sortingOrder || [],
      explanation: parsed[0].explanation,
      options: parsed[0].options,
    }))
    setBulkEditingIndex(0)
    dialog.toast(`已识别 ${parsed.length} 题`, { tone: 'success' })
  }

  const handleBulkPromptChange = (index: number, value: string) => {
    setBulkParsedQuestions((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              prompt: value,
              contextSentence: supportsSeparateQuestionContext(
                item.questionType,
              )
                ? value || item.contextSentence
                : '',
            }
          : item,
      ),
    )
  }

  const handleBulkExplanationChange = (index: number, value: string) => {
    setBulkParsedQuestions((previous) =>
      previous.map((question, questionIndex) =>
        questionIndex === index
          ? { ...question, explanation: value }
          : question,
      ),
    )
  }

  const handleBulkContextSentenceChange = (index: number, value: string) => {
    setBulkParsedQuestions((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, contextSentence: value } : item,
      ),
    )
  }

  const handleBulkTargetWordChange = (index: number, value: string) => {
    setBulkParsedQuestions((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, targetWord: value.trim() } : item,
      ),
    )
  }

  const handleBulkSortingOptionClick = (
    questionIndex: number,
    optionIndex: number,
  ) => {
    setBulkParsedQuestions((previous) =>
      previous.map((question, index) => {
        if (index !== questionIndex || question.questionType !== 'SORTING')
          return question
        const currentOrder = question.sortingOrder || []
        if (currentOrder.includes(optionIndex)) return question
        const sortingOrder = [...currentOrder, optionIndex]
        const starIndex = Math.max(
          0,
          parseSortingPrompt(question.prompt).starIndex,
        )
        return {
          ...question,
          contextSentence: '',
          sortingOrder,
          options: question.options.map((option, currentIndex) => ({
            ...option,
            isCorrect:
              sortingOrder.length === question.options.length &&
              currentIndex === sortingOrder[starIndex],
          })),
        }
      }),
    )
  }

  const handleBulkSortingReset = (questionIndex: number) => {
    setBulkParsedQuestions((previous) =>
      previous.map((question, index) =>
        index === questionIndex
          ? {
              ...question,
              sortingOrder: [],
              options: question.options.map((option, optionIndex) => ({
                ...option,
                isCorrect: optionIndex === 0,
              })),
            }
          : question,
      ),
    )
  }

  const handleBulkPickTargetWordFromSelection = () => {
    const textarea = bulkContextTextareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    if (start === end) {
      void dialog.alert('请先在当前题的“题目原句”中划选目标词。')
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
    setBulkParsedQuestions((prev) =>
      prev.map((item, i) => {
        if (i !== qIndex) return item
        return {
          ...item,
          sortingOrder: [],
          options: item.options.map((opt, idx) =>
            idx === optionIndex ? { ...opt, text: value } : opt,
          ),
        }
      }),
    )
  }

  const setBulkCorrectOption = (qIndex: number, optionIndex: number) => {
    setBulkParsedQuestions((prev) =>
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

  const handleBulkAddOption = (qIndex: number) => {
    setBulkParsedQuestions((previous) =>
      previous.map((question, index) =>
        index === qIndex
          ? {
              ...question,
              sortingOrder: [],
              options: [...question.options, { text: '', isCorrect: false }],
            }
          : question,
      ),
    )
  }

  const handleBulkRemoveOption = (qIndex: number, optionIndex: number) => {
    setBulkParsedQuestions((previous) =>
      previous.map((question, index) =>
        index === qIndex
          ? {
              ...question,
              sortingOrder: [],
              options: removeQuestionOptionAt(question.options, optionIndex),
            }
          : question,
      ),
    )
  }

  const handleQuizQuestionTypeChange = (
    questionType: ParsedQuizDraft['questionType'],
  ) => {
    setSortSequence([])
    setQuizForm((previous) => ({
      ...previous,
      questionType,
      contextSentence: supportsSeparateQuestionContext(questionType)
        ? previous.contextSentence
        : '',
      targetWord: usesExplicitQuestionTargetWord(questionType)
        ? previous.targetWord
        : '',
      sortingOrder: questionType === 'SORTING' ? previous.sortingOrder : [],
    }))
    setBulkParsedQuestions((prev) =>
      prev.map((item) => ({
        ...item,
        questionType,
        contextSentence: supportsSeparateQuestionContext(questionType)
          ? item.contextSentence
          : '',
        targetWord: usesExplicitQuestionTargetWord(questionType)
          ? item.targetWord
          : '',
        sortingOrder: questionType === 'SORTING' ? item.sortingOrder || [] : [],
      })),
    )
  }

  const handleBulkRemoveQuestion = (qIndex: number) => {
    setBulkParsedQuestions((prev) => {
      const next = prev.filter((_, i) => i !== qIndex)
      setBulkEditingIndex((current) => {
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
      await dialog.alert('请先点击“识别题目”。')
      return
    }
    if (!quizForm.collectionId) {
      await dialog.alert(
        collectionScope === 'paper'
          ? '请先选择所属试卷。'
          : '请先选择保存位置。',
      )
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
        sortingOrder: draft.sortingOrder || [],
        prompt: draft.prompt,
        explanation: draft.explanation,
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
      setQuizForm((prev) => ({
        ...prev,
        contextSentence: '',
        targetWord: '',
        sortingOrder: [],
        prompt: '',
        explanation: '',
        options: prev.options.map((_, idx) => ({
          text: '',
          isCorrect: idx === 0,
        })),
      }))
      await dialog.alert(`保存成功，共 ${successCount} 题。`)
      return
    }

    const preview = failed
      .slice(0, 5)
      .map((item) => `第 ${item.index} 题：${item.message}`)
      .join('\n')
    await dialog.alert(
      `已保存 ${successCount} 题，失败 ${failed.length} 题。\n${preview}${failed.length > 5 ? '\n…' : ''}`,
    )
  }

  const setCorrectOption = (index: number) => {
    setQuizForm((prev) => {
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

    if (newSeq.length === quizForm.options.length) {
      setQuizForm((prev) => {
        const starSlotIndex = Math.max(
          0,
          parseSortingPrompt(prev.prompt).starIndex,
        )

        const correctOptionIndex = newSeq[starSlotIndex]
        const newOptions = prev.options.map((opt, i) => ({
          ...opt,
          isCorrect: i === correctOptionIndex,
        }))

        return {
          ...prev,
          options: newOptions,
          contextSentence: '',
          sortingOrder: newSeq,
        }
      })
    }
  }
  const handleSortReset = () => {
    setSortSequence([])
    setQuizForm((previous) => ({
      ...previous,
      sortingOrder: [],
      options: previous.options.map((option, index) => ({
        ...option,
        isCorrect: index === 0,
      })),
    }))
  }
  const quizHasQuestionContent =
    quizForm.prompt.trim().length > 0 ||
    quizForm.contextSentence.trim().length > 0
  const quizSupportsSeparateContext = supportsSeparateQuestionContext(
    quizForm.questionType,
  )
  const quizUsesTargetWord = usesExplicitQuestionTargetWord(
    quizForm.questionType,
  )
  const quizSortingReady =
    quizForm.questionType !== 'SORTING' ||
    quizForm.sortingOrder.length === quizForm.options.length

  const renderTargetWordPreview = (sentence: string, targetWord: string) => {
    if (!targetWord || !sentence.includes(targetWord))
      return sentence || '（题目原句预览）'
    const index = sentence.indexOf(targetWord)
    const before = sentence.slice(0, index)
    const after = sentence.slice(index + targetWord.length)
    return (
      <>
        {before}
        <span className="border-b-2 border-blue-500 font-semibold text-blue-700">
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
      void dialog.alert('请先在“题目原句”中用鼠标划选一个目标词。')
      return
    }
    const selected = textarea.value.slice(start, end).trim()
    if (!selected) return
    setQuizForm((prev) => ({ ...prev, targetWord: selected }))
    dialog.toast(`已设置目标词：${selected}`, { tone: 'success' })
  }

  const applyArticleCollection = (collectionId: string) => {
    setArticleForm((prev) => ({
      ...prev,
      paperId: collectionId,
    }))
  }

  const applyNewsMetadata = (patch: Partial<typeof articleForm>) => {
    setArticleForm((previous) => {
      const nextSource = patch.newsSource ?? previous.newsSource
      const newsColumn =
        patch.newsType && patch.newsType !== 'column'
          ? ''
          : patch.newsColumn !== undefined
            ? patch.newsColumn
            : nextSource === '日経' && previous.newsColumn === '天声人語'
              ? ''
              : nextSource === '朝日' && previous.newsColumn === '春秋'
                ? ''
                : previous.newsColumn
      const next = { ...previous, ...patch, newsColumn }
      const automaticMorning = isAutomaticMorningEdition({
        source: next.newsSource,
        type: next.newsType,
        column: next.newsColumn,
      })
      return {
        ...next,
        newsSection: isAutomaticFrontPageSection({
          type: next.newsType,
          column: next.newsColumn,
        })
          ? '一面'
          : next.newsSection,
        edition: automaticMorning
          ? 'MORNING'
          : next.edition === 'FLASH' &&
              !supportsBreakingEdition({
                source: next.newsSource,
                type: next.newsType,
              })
            ? ''
            : next.edition,
      }
    })
  }

  const applyArticleQuestionType = (questionType: PaperReadingQuestionType) => {
    setArticleQuestionType(questionType)
    setArticleQuestions((previous) =>
      previous.map((question) => ({ ...question, questionType })),
    )
  }

  const applyQuizCollection = (collectionId: string) => {
    setQuizForm((prev) => ({
      ...prev,
      collectionId,
    }))
  }

  return (
    <div className="space-y-6">
      <div className="w-full">
        {activeTab === 'audio' && (
          <div className="animate-in slide-in-from-bottom-4 fade-in duration-500">
            <UploadForm
              levels={dbLevels}
              papers={dbCollections}
              defaultMaterialType={initialMaterialType}
              defaultLanguage={language}
              collectionScope={collectionScope}
              defaultQuestionType={defaultQuestionType}
              toeicPartLabel={toeicPartLabel}
              defaultListeningSectionNumber={defaultListeningSectionNumber}
              listeningSectionLabel={listeningSectionLabel}
            />
          </div>
        )}

        {activeTab === 'media' && (
          <div className="animate-in slide-in-from-bottom-4 fade-in duration-500">
            <UploadForm
              levels={dbLevels}
              papers={dbCollections}
              variant="media-subtitle"
              defaultLanguage={language}
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
              articleForm.sourceKind === 'NEWS' &&
              articleForm.newsSource &&
              selectedNewsCollection ? (
                <div className="border-b border-slate-200 pb-6">
                  <span className="block text-sm font-bold text-slate-900">
                    已选择
                  </span>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white">
                      {articleForm.newsSource} ·{' '}
                      {getNewsTypeLabel(articleForm.newsType)}
                      {articleForm.newsColumn
                        ? ` · ${articleForm.newsColumn}`
                        : ''}
                    </span>
                    <span className="text-xs text-slate-500">
                      将按所选新闻信息保存
                    </span>
                  </div>
                </div>
              ) : articleForm.sourceKind === 'NEWS' ? (
                <div className="border-b border-slate-200 pb-6">
                  <span className="block text-sm font-bold text-slate-900">
                    新闻保存位置
                  </span>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    请在下方选择类型与来源，系统会自动匹配保存位置。
                  </p>
                </div>
              ) : (
                <CollectionSelector
                  value={articleForm.paperId}
                  onChange={applyArticleCollection}
                  dbLevels={dbLevels}
                  collectionScope={collectionScope}
                  activeTab={activeTab}
                  language={language}
                  collectionOptions={collectionOptions}
                  setLocalCollections={setLocalCollections}
                />
              )
            }
            isPaperCollection={isPaperArticleCollection}
            paperQuestionType={articleQuestionType}
            fixedQuestionTypeLabel={toeicPartLabel}
            onPaperQuestionTypeChange={applyArticleQuestionType}
            onNewsMetadataChange={applyNewsMetadata}
            handleMakeBlank={handleMakeBlank}
            handleParseCardOptions={handleParseCardOptions}
            articleQuickInput={articleQuickInput}
            setArticleQuickInput={setArticleQuickInput}
            handleArticleAddQuestion={handleArticleAddQuestion}
            isSubmitting={isSubmitting}
            handleArticleSubmit={handleArticleSubmit}
            onUnderlineSelectionMissing={() =>
              void dialog.alert('请先选中需要加下划线的文字。')
            }
            onFootnoteSelectionMissing={() =>
              void dialog.alert('请先选择需要添加注解的词语或短句。')
            }
            onRemoveQuestion={async (questionIndex) => {
              const confirmed = await dialog.confirm(
                `确认移除第 ${questionIndex + 1} 题吗？`,
                {
                  title: '移除题目',
                  confirmText: '移除',
                  danger: true,
                },
              )
              if (!confirmed) return
              setArticleQuestions((previous) =>
                previous.filter((_, index) => index !== questionIndex),
              )
            }}
          />
        )}

        {activeTab === 'quiz' && (
          <form
            onSubmit={(event) => {
              if (quizEntryMode === 'bulk') {
                event.preventDefault()
                return
              }
              void handleQuizSubmit(event)
            }}
            className="animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <h2 className="sr-only">导入练习题</h2>

            <CollectionSelector
              value={quizForm.collectionId}
              onChange={applyQuizCollection}
              dbLevels={dbLevels}
              collectionScope={collectionScope}
              activeTab={activeTab}
              language={language}
              collectionOptions={collectionOptions}
              setLocalCollections={setLocalCollections}
            />

            <section className="border-b border-slate-200 py-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">题型</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    粘贴一题或多题后自动识别并进入校对
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {toeicPartLabel ||
                    getImportQuestionTypeLabel(
                      quizForm.questionType as ParsedQuizDraft['questionType'],
                    )}
                </span>
              </div>
              {toeicPartLabel ? (
                <div className="border-b border-slate-950 px-1 py-3 text-sm font-bold text-slate-950">
                  {toeicPartLabel}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-3">
                  {IMPORT_QUESTION_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      aria-pressed={quizForm.questionType === type.value}
                      onClick={() => handleQuizQuestionTypeChange(type.value)}
                      className={`!rounded-none border-b px-1 py-2.5 text-left text-sm font-bold outline-none transition-colors focus-visible:border-slate-950 focus-visible:text-slate-950 ${
                        quizForm.questionType === type.value
                          ? 'border-slate-950 text-slate-950'
                          : 'border-slate-200 text-slate-500 hover:border-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <span className="mr-1.5 text-[10px] text-slate-400">
                        問題 {type.number}
                      </span>
                      {type.label}
                    </button>
                  ))}
                </div>
              )}
            </section>

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
                handleBulkPromptChange={handleBulkPromptChange}
                handleBulkExplanationChange={handleBulkExplanationChange}
                bulkContextTextareaRef={bulkContextTextareaRef}
                handleBulkContextSentenceChange={
                  handleBulkContextSentenceChange
                }
                handleBulkPickTargetWordFromSelection={
                  handleBulkPickTargetWordFromSelection
                }
                handleBulkTargetWordChange={handleBulkTargetWordChange}
                handleBulkSortingOptionClick={handleBulkSortingOptionClick}
                handleBulkSortingReset={handleBulkSortingReset}
                setBulkCorrectOption={setBulkCorrectOption}
                handleBulkOptionTextChange={handleBulkOptionTextChange}
                handleBulkAddOption={handleBulkAddOption}
                handleBulkRemoveOption={handleBulkRemoveOption}
                questionTypeLabel={
                  toeicPartLabel ||
                  getImportQuestionTypeLabel(
                    quizForm.questionType as ParsedQuizDraft['questionType'],
                  )
                }
              />
            ) : (
              <>
                <section className="border-b border-slate-200 py-6">
                  <label className="mb-2 block text-sm font-black text-slate-900">
                    快速粘贴
                  </label>
                  <textarea
                    value={quickInput}
                    onChange={(e) => handleQuickParse(e.target.value)}
                    rows={3}
                    placeholder="在此粘贴整题文本"
                    className="w-full resize-y border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />

                  {quizForm.questionType !== 'SORTING' && (
                    <div className="mt-4">
                      <span className="mb-2 block text-xs font-bold tracking-wide text-slate-500">
                        正确答案
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {quizForm.options.map((_, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setCorrectOption(idx)}
                            className={`h-9 min-w-9 px-3 text-sm font-black transition-colors ${quizForm.options[idx].isCorrect ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-600 hover:border-slate-500'}`}
                          >
                            {idx + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section className="border-b border-slate-200 py-6">
                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    题目呈现
                  </label>
                  <input
                    type="text"
                    value={quizForm.prompt}
                    onChange={(e) =>
                      setQuizForm({ ...quizForm, prompt: e.target.value })
                    }
                    className="w-full border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="例如：チームの(　　　)を強めよう。（可留空）"
                  />
                </section>

                {quizSupportsSeparateContext ||
                quizUsesTargetWord ||
                quizForm.questionType === 'SORTING' ? (
                  <section className="border-b border-slate-200 py-6">
                    {quizForm.questionType === 'SORTING' && (
                      <div className="mb-4 border border-orange-200 bg-orange-50 p-4">
                        <label className="mb-2 block text-sm font-bold text-orange-800">
                          排序设置：按正确语序依次点击全部选项
                        </label>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {quizForm.options.map((opt, i) => {
                            const isClicked = sortSequence.includes(i)
                            const orderNum = sortSequence.indexOf(i) + 1
                            return (
                              <button
                                key={`sort-option-${i}`}
                                type="button"
                                disabled={isClicked || !opt.text}
                                onClick={() => handleSortClick(i)}
                                className={`relative px-4 py-2 font-bold transition-colors ${isClicked ? 'bg-orange-200 text-orange-500 opacity-50' : 'bg-white text-orange-600 border border-orange-200 hover:bg-orange-100'}`}
                              >
                                {opt.text || `选项 ${i + 1}`}
                                {isClicked && (
                                  <span className="absolute -top-2 -right-2 w-5 h-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                                    {orderNum}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                        {sortSequence.length === quizForm.options.length ? (
                          <div className="text-sm text-blue-600 font-bold flex justify-between items-center">
                            <span>已保存正确语序和星号答案。</span>
                            <button
                              type="button"
                              onClick={handleSortReset}
                              className="text-orange-500 underline"
                            >
                              重置顺序
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-orange-500">
                            还需点击{' '}
                            {quizForm.options.length - sortSequence.length}{' '}
                            个选项
                          </div>
                        )}
                      </div>
                    )}
                    {quizSupportsSeparateContext ? (
                      <>
                        <label className="block text-sm font-bold text-slate-900">
                          题目原句（可选）
                        </label>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          题干不是完整句子时填写；题干已包含原句则留空。
                        </p>
                        <textarea
                          ref={quizContextTextareaRef}
                          value={quizForm.contextSentence}
                          onChange={(e) =>
                            setQuizForm({
                              ...quizForm,
                              contextSentence: e.target.value,
                            })
                          }
                          rows={2}
                          className="mt-3 w-full !resize-none !rounded-none border-0 border-b border-slate-300 bg-transparent px-0 py-3 outline-none transition-colors focus:border-slate-950 focus:ring-0"
                          placeholder="填写题目实际出现的完整句子"
                        />
                      </>
                    ) : null}
                    {quizUsesTargetWord && (
                      <div className="mt-3">
                        <label className="mb-2 block text-xs font-bold text-slate-600">
                          目标词
                        </label>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {quizSupportsSeparateContext ? (
                            <button
                              type="button"
                              onClick={handlePickTargetWordFromSelection}
                              className="h-9 border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100"
                            >
                              从原句划词设为目标词
                            </button>
                          ) : null}
                          <input
                            type="text"
                            value={quizForm.targetWord}
                            onChange={(e) =>
                              setQuizForm({
                                ...quizForm,
                                targetWord: e.target.value.trim(),
                              })
                            }
                            placeholder={
                              quizForm.questionType === 'PRONUNCIATION'
                                ? '填写题干中需要标注的汉字'
                                : '填写题干中需要替换的词'
                            }
                            className="h-9 min-w-0 flex-1 border border-blue-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="text-sm leading-relaxed text-gray-700">
                          {renderTargetWordPreview(
                            quizSupportsSeparateContext
                              ? quizForm.contextSentence
                              : quizForm.prompt,
                            quizForm.targetWord,
                          )}
                        </div>
                      </div>
                    )}
                    {!quizHasQuestionContent && (
                      <div className="mt-3 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        请先填写题干，或补充题目原句。
                      </div>
                    )}
                  </section>
                ) : null}

                <section className="border-b border-slate-200 py-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-sm font-bold text-gray-700">
                      选项设置（{quizForm.options.length} 个，最少{' '}
                      {MIN_QUESTION_OPTION_COUNT} 个）
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setSortSequence([])
                        setQuizForm((previous) => ({
                          ...previous,
                          sortingOrder: [],
                          options: [
                            ...previous.options,
                            { text: '', isCorrect: false },
                          ],
                        }))
                      }}
                      className="border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                    >
                      + 添加选项
                    </button>
                  </div>
                  <div className="divide-y divide-slate-200 border-y border-slate-200">
                    {quizForm.options.map((opt, idx) => (
                      <div
                        key={`option-editor-${idx}`}
                        className="flex min-w-0 items-center gap-3 py-3"
                      >
                        <input
                          type="radio"
                          name="correctOption"
                          checked={opt.isCorrect}
                          onChange={() => setCorrectOption(idx)}
                          className="w-5 h-5 text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => {
                            setSortSequence([])
                            setQuizForm((previous) => ({
                              ...previous,
                              sortingOrder: [],
                              options: previous.options.map(
                                (option, optionIndex) =>
                                  optionIndex === idx
                                    ? { ...option, text: e.target.value }
                                    : option,
                              ),
                            }))
                          }}
                          className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 outline-none focus:ring-0"
                          placeholder={`选项 ${idx + 1}`}
                        />
                        <button
                          type="button"
                          disabled={
                            quizForm.options.length <= MIN_QUESTION_OPTION_COUNT
                          }
                          onClick={() => {
                            setSortSequence([])
                            setQuizForm((previous) => ({
                              ...previous,
                              sortingOrder: [],
                              options: removeQuestionOptionAt(
                                previous.options,
                                idx,
                              ),
                            }))
                          }}
                          aria-label={`删除选项 ${idx + 1}`}
                          className="shrink-0 px-2 py-1 text-xs font-bold text-rose-500 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-25"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="py-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    解析（可选）
                  </label>
                  <textarea
                    value={quizForm.explanation}
                    onChange={(e) =>
                      setQuizForm({ ...quizForm, explanation: e.target.value })
                    }
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50"
                    placeholder="可补充解题思路或易错点。"
                  />
                </section>

                <button
                  disabled={
                    isSubmitting || !quizHasQuestionContent || !quizSortingReady
                  }
                  type="submit"
                  className="w-full bg-slate-900 py-3.5 font-black text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
                >
                  {isSubmitting
                    ? '保存中...'
                    : !quizSortingReady
                      ? '请先设置正确语序'
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
