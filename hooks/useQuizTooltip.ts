'use client'

import { useState } from 'react'
import { saveVocabulary } from '@/app/actions/content'

type TooltipSaveState =
  | 'idle'
  | 'saving'
  | 'success'
  | 'already_exists'
  | 'error'

type TooltipState = {
  word: string
  x: number
  y: number
  isTop: boolean
  questionId: string
  contextSentence: string
}

type VocabularyMeta = {
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

const splitListInput = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const createUpdatedVocabularyMeta = ({
  current,
  questionId,
  word,
  pronunciations,
  partsOfSpeech,
  meanings,
  saveWithPronunciation,
  saveWithMeaning,
}: {
  current: Record<string, Record<string, VocabularyMeta>>
  questionId: string
  word: string
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  saveWithPronunciation: boolean
  saveWithMeaning: boolean
}) => {
  const existingMeta = current[questionId]?.[word] || {
    pronunciations: [],
    partsOfSpeech: [],
    meanings: [],
  }

  return {
    ...current,
    [questionId]: {
      ...(current[questionId] || {}),
      [word]: {
        pronunciations: saveWithPronunciation ? pronunciations : [],
        partsOfSpeech:
          partsOfSpeech.length > 0 ? partsOfSpeech : existingMeta.partsOfSpeech,
        meanings: saveWithMeaning ? meanings : [],
      },
    },
  }
}

export function useQuizTooltip(
  initialVocabularyMetaMap: Record<string, Record<string, VocabularyMeta>>,
) {
  const [activeTooltip, setActiveTooltip] = useState<TooltipState | null>(null)
  const [saveState, setSaveState] = useState<TooltipSaveState>('idle')
  const [saveWithPronunciation, setSaveWithPronunciation] = useState(false)
  const [saveWithMeaning, setSaveWithMeaning] = useState(false)
  const [tooltipPronunciation, setTooltipPronunciation] = useState('')
  const [tooltipPartOfSpeech, setTooltipPartOfSpeech] = useState('')
  const [tooltipMeaning, setTooltipMeaning] = useState('')
  const [
    localVocabularyMetaMapByQuestion,
    setLocalVocabularyMetaMapByQuestion,
  ] = useState(initialVocabularyMetaMap)

  /**
   * 打开工具条（选择文本后）
   */
  const openTooltip = (tooltip: TooltipState) => {
    setActiveTooltip(tooltip)
    setSaveState('idle')
    setTooltipPronunciation('')
    setTooltipPartOfSpeech('')
    setTooltipMeaning('')
    setSaveWithPronunciation(false)
    setSaveWithMeaning(false)
  }

  /**
   * 关闭工具条
   */
  const closeTooltip = () => {
    setActiveTooltip(null)
    setSaveState('idle')
  }

  /**
   * 保存词汇
   */
  const saveVocab = async () => {
    if (!activeTooltip) return

    try {
      setSaveState('saving')

      const partsOfSpeech = splitListInput(tooltipPartOfSpeech)
      const meanings = splitListInput(tooltipMeaning)
      const pronunciations = splitListInput(tooltipPronunciation)

      await saveVocabulary(
        activeTooltip.word,
        activeTooltip.contextSentence,
        'QUIZ_QUESTION',
        activeTooltip.questionId,
        pronunciations[0] || undefined,
        pronunciations,
        meanings,
        partsOfSpeech[0] || undefined,
        partsOfSpeech,
      )

      setLocalVocabularyMetaMapByQuestion(prev =>
        createUpdatedVocabularyMeta({
          current: prev,
          questionId: activeTooltip.questionId,
          word: activeTooltip.word,
          pronunciations,
          partsOfSpeech,
          meanings,
          saveWithPronunciation,
          saveWithMeaning,
        }),
      )

      setSaveState('success')
      window.getSelection()?.removeAllRanges()
      setTimeout(() => {
        closeTooltip()
      }, 700)
    } catch (error) {
      console.error(error)
      setSaveState('error')
    }
  }

  /**
   * 重置
   */
  const reset = () => {
    setActiveTooltip(null)
    setSaveState('idle')
    setTooltipPronunciation('')
    setTooltipPartOfSpeech('')
    setTooltipMeaning('')
    setSaveWithPronunciation(false)
    setSaveWithMeaning(false)
  }

  return {
    // 状态
    activeTooltip,
    saveState,
    saveWithPronunciation,
    saveWithMeaning,
    tooltipPronunciation,
    tooltipPartOfSpeech,
    tooltipMeaning,
    localVocabularyMetaMapByQuestion,

    // 更新方法
    setActiveTooltip,
    setSaveState,
    setSaveWithPronunciation,
    setSaveWithMeaning,
    setTooltipPronunciation,
    setTooltipPartOfSpeech,
    setTooltipMeaning,
    setLocalVocabularyMetaMapByQuestion,

    // 业务逻辑
    openTooltip,
    closeTooltip,
    saveVocab,
    reset,
  }
}
