'use client'

import { useEffect, useState } from 'react'
import { annotateJapaneseText } from '@/utils/japaneseRuby'

const SHOW_KEY = 'mimiflow_show_pronunciation'
const SHOW_MEANING_KEY = 'mimiflow_show_meaning'

const loadShowPronunciation = () => {
  if (typeof window === 'undefined') return true
  const raw = localStorage.getItem(SHOW_KEY)
  return raw == null ? true : raw === '1'
}

export function useShowPronunciation() {
  const [showPronunciation, setShowPronunciationState] = useState(true)

  useEffect(() => {
    setShowPronunciationState(loadShowPronunciation())
  }, [])

  const setShowPronunciation = (value: boolean) => {
    setShowPronunciationState(value)
    if (typeof window !== 'undefined') {
      localStorage.setItem(SHOW_KEY, value ? '1' : '0')
    }
  }

  return {
    showPronunciation,
    setShowPronunciation,
  }
}

const loadShowMeaning = () => {
  if (typeof window === 'undefined') return true
  const raw = localStorage.getItem(SHOW_MEANING_KEY)
  return raw == null ? true : raw === '1'
}

export function useShowMeaning() {
  const [showMeaning, setShowMeaningState] = useState(true)

  useEffect(() => {
    setShowMeaningState(loadShowMeaning())
  }, [])

  const setShowMeaning = (value: boolean) => {
    setShowMeaningState(value)
    if (typeof window !== 'undefined') {
      localStorage.setItem(SHOW_MEANING_KEY, value ? '1' : '0')
    }
  }

  return {
    showMeaning,
    setShowMeaning,
  }
}

export const hasJapanese = (text: string) => /[\u3040-\u30ff\u4e00-\u9fff]/.test(text)

export const annotateJapaneseHtml = (
  html: string,
  pronMap: Record<string, string>,
  enabled: boolean,
) => {
  if (!enabled) return html
  const chunks = html.split(/(<[^>]+>)/g)
  const next = chunks.map(chunk => {
    if (chunk.startsWith('<') && chunk.endsWith('>')) return chunk
    return annotateJapaneseText(chunk, pronMap)
  })
  return next.join('')
}
