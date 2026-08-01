'use client'

import { useRef, useState } from 'react'

import type {
  ArticleFormState,
  ArticleImportedQuestionDraft,
  ArticlePreviewRow,
  ParsedQuizDraft,
  QuizFormState,
  UploadCenterTab,
  UploadCollectionLite,
} from '../types'

export function useUploadCenterState(
  dbCollections: UploadCollectionLite[],
  initialTab: UploadCenterTab = 'audio',
) {
  const [localCollections, setLocalCollections] = useState(dbCollections)
  const activeTab = initialTab
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [articleForm, setArticleForm] = useState<ArticleFormState>({
    paperId: dbCollections[0]?.id || '',
    title: '',
    description: '',
    content: '',
    language: dbCollections[0]?.language || '',
    examLevel: dbCollections[0]?.examLevel || '',
  })
  const [articleQuestions, setArticleQuestions] = useState<
    ArticleImportedQuestionDraft[]
  >([])
  const [articleQuickInput, setArticleQuickInput] = useState('')
  const [articleParsedPreviewRows, setArticleParsedPreviewRows] = useState<
    ArticlePreviewRow[]
  >([])
  const [articleParsedDrafts, setArticleParsedDrafts] = useState<
    ArticleImportedQuestionDraft[]
  >([])
  const articleTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [quizForm, setQuizForm] = useState<QuizFormState>({
    collectionId: dbCollections[0]?.id || '',
    questionType: 'PRONUNCIATION',
    contextSentence: '',
    targetWord: '',
    prompt: '',
    explanation: '',
    language: dbCollections[0]?.language || '',
    examLevel: dbCollections[0]?.examLevel || '',
    options: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
  })
  const [quickInput, setQuickInput] = useState('')
  const [bulkQuickInput, setBulkQuickInput] = useState('')
  const [bulkParsedQuestions, setBulkParsedQuestions] = useState<
    ParsedQuizDraft[]
  >([])
  const [bulkEditingIndex, setBulkEditingIndex] = useState(0)
  const [sortSequence, setSortSequence] = useState<number[]>([])
  const quizContextTextareaRef = useRef<HTMLTextAreaElement>(null)
  const bulkContextTextareaRef = useRef<HTMLTextAreaElement>(null)

  return {
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
  }
}

export function useCollectionCreatorState(defaultLevelId: string) {
  const [isCreating, setIsCreating] = useState(false)
  const [newCatData, setNewCatData] = useState({
    collectionType: defaultLevelId,
    name: '',
  })
  const [isSavingCat, setIsSavingCat] = useState(false)

  const resetNameOnly = () =>
    setNewCatData(previous => ({
      ...previous,
      name: '',
    }))

  return {
    isCreating,
    setIsCreating,
    newCatData,
    setNewCatData,
    isSavingCat,
    setIsSavingCat,
    resetNameOnly,
  }
}
