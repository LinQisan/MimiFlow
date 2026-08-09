'use client'

import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  type SetStateAction,
} from 'react'

import type {
  ArticleFormState,
  ArticleImportedQuestionDraft,
  ArticlePreviewRow,
  ParsedQuizDraft,
  QuizFormState,
  UploadCenterTab,
  UploadCollectionLite,
} from '../types'

type UploadCenterState = {
  quizEntryMode: 'bulk' | 'single'
  localCollections: UploadCollectionLite[]
  isSubmitting: boolean
  articleForm: ArticleFormState
  articleQuestions: ArticleImportedQuestionDraft[]
  articleQuickInput: string
  articleParsedPreviewRows: ArticlePreviewRow[]
  articleParsedDrafts: ArticleImportedQuestionDraft[]
  quizForm: QuizFormState
  quickInput: string
  bulkQuickInput: string
  bulkParsedQuestions: ParsedQuizDraft[]
  bulkEditingIndex: number
  sortSequence: number[]
}

type UploadCenterAction = {
  [Key in keyof UploadCenterState]: {
    key: Key
    value: SetStateAction<UploadCenterState[Key]>
  }
}[keyof UploadCenterState]

function uploadCenterReducer(state: UploadCenterState, action: UploadCenterAction) {
  const current = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value
  return { ...state, [action.key]: next }
}

export function useUploadCenterState(
  dbCollections: UploadCollectionLite[],
  initialTab: UploadCenterTab = 'audio',
) {
  const activeTab = initialTab
  const [state, dispatch] = useReducer(uploadCenterReducer, {
    quizEntryMode: 'bulk',
    localCollections: dbCollections,
    isSubmitting: false,
    articleForm: {
      paperId: dbCollections[0]?.id || '',
      title: '',
      description: '',
      content: '',
      language: dbCollections[0]?.language || '',
      examLevel: dbCollections[0]?.examLevel || '',
    },
    articleQuestions: [],
    articleQuickInput: '',
    articleParsedPreviewRows: [],
    articleParsedDrafts: [],
    quizForm: {
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
    },
    quickInput: '',
    bulkQuickInput: '',
    bulkParsedQuestions: [],
    bulkEditingIndex: 0,
    sortSequence: [],
  })
  const setter = useCallback(
    <Key extends keyof UploadCenterState>(key: Key) =>
      (value: SetStateAction<UploadCenterState[Key]>) =>
        dispatch({ key, value } as UploadCenterAction),
    [],
  )
  const articleTextareaRef = useRef<HTMLTextAreaElement>(null)
  const quizContextTextareaRef = useRef<HTMLTextAreaElement>(null)
  const bulkContextTextareaRef = useRef<HTMLTextAreaElement>(null)
  const setters = useMemo(
    () => ({
      setQuizEntryMode: setter('quizEntryMode'),
      setLocalCollections: setter('localCollections'),
      setIsSubmitting: setter('isSubmitting'),
      setArticleForm: setter('articleForm'),
      setArticleQuestions: setter('articleQuestions'),
      setArticleQuickInput: setter('articleQuickInput'),
      setArticleParsedPreviewRows: setter('articleParsedPreviewRows'),
      setArticleParsedDrafts: setter('articleParsedDrafts'),
      setQuizForm: setter('quizForm'),
      setQuickInput: setter('quickInput'),
      setBulkQuickInput: setter('bulkQuickInput'),
      setBulkParsedQuestions: setter('bulkParsedQuestions'),
      setBulkEditingIndex: setter('bulkEditingIndex'),
      setSortSequence: setter('sortSequence'),
    }),
    [setter],
  )

  return {
    ...state,
    ...setters,
    activeTab,
    articleTextareaRef,
    quizContextTextareaRef,
    bulkContextTextareaRef,
  }
}

export function useCollectionCreatorState(defaultLevelId: string) {
  const [state, dispatch] = useReducer(
    (
      current: {
        isCreating: boolean
        newCatData: { collectionType: string; name: string }
        isSavingCat: boolean
      },
      patch: Partial<typeof current>,
    ) => ({ ...current, ...patch }),
    {
      isCreating: false,
      newCatData: { collectionType: defaultLevelId, name: '' },
      isSavingCat: false,
    },
  )
  const setIsCreating = (value: SetStateAction<boolean>) =>
    dispatch({
      isCreating:
        typeof value === 'function' ? value(state.isCreating) : value,
    })
  const setNewCatData = (
    value: SetStateAction<{ collectionType: string; name: string }>,
  ) =>
    dispatch({
      newCatData:
        typeof value === 'function' ? value(state.newCatData) : value,
    })
  const setIsSavingCat = (value: SetStateAction<boolean>) =>
    dispatch({
      isSavingCat:
        typeof value === 'function' ? value(state.isSavingCat) : value,
    })

  const resetNameOnly = () =>
    setNewCatData(previous => ({
      ...previous,
      name: '',
    }))

  return {
    isCreating: state.isCreating,
    setIsCreating,
    newCatData: state.newCatData,
    setNewCatData,
    isSavingCat: state.isSavingCat,
    setIsSavingCat,
    resetNameOnly,
  }
}
