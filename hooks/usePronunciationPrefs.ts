'use client'

import { useEffect, useState } from 'react'
import { annotateJapaneseText, buildJapaneseRubyHtml } from '@/utils/language/japaneseRuby'

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

type VocabularyMetaLike = {
  meanings?: string[]
}

type SentenceMeaningRef = {
  sentence: string
  meaningIndex: number | null
}

type AnnotateMetaOptions = {
  showMeaning?: boolean
  vocabularyMetaMap?: Record<string, VocabularyMetaLike>
  sentenceMeaningMap?: Record<string, SentenceMeaningRef[]>
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const normalizeComparable = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()

const isSentenceBoundary = (char: string) =>
  /[。！？!?；;\n]/.test(char)

const extractSentenceContext = (text: string, start: number, length: number) => {
  let left = start
  while (left > 0 && !isSentenceBoundary(text[left - 1])) left -= 1

  let right = start + length
  while (right < text.length && !isSentenceBoundary(text[right])) right += 1

  return text.slice(left, right).trim()
}

const resolveMeaningText = (
  word: string,
  sentenceContext: string,
  options: AnnotateMetaOptions,
) => {
  const meanings = (options.vocabularyMetaMap?.[word]?.meanings || [])
    .map(item => item.trim())
    .filter(Boolean)
  if (meanings.length === 0) return ''

  const refs = options.sentenceMeaningMap?.[word] || []
  if (refs.length > 0 && sentenceContext) {
    const normalizedContext = normalizeComparable(sentenceContext)
    const matched = refs
      .filter(
        ref =>
          Number.isInteger(ref.meaningIndex) &&
          ref.meaningIndex != null &&
          ref.meaningIndex >= 0,
      )
      .map(ref => {
        const normalizedSentence = normalizeComparable(ref.sentence || '')
        const hit =
          normalizedSentence &&
          normalizedContext &&
          (normalizedContext.includes(normalizedSentence) ||
            normalizedSentence.includes(normalizedContext))
        const score = Math.abs(normalizedSentence.length - normalizedContext.length)
        return { ref, hit, score }
      })
      .filter(item => item.hit)
      .sort((a, b) => a.score - b.score)[0]

    if (matched?.ref.meaningIndex != null) {
      const idx = matched.ref.meaningIndex
      if (idx >= 0 && idx < meanings.length) return meanings[idx]
    }
  }

  return meanings.join('；')
}

const annotateChunkWithMeta = (
  text: string,
  pronMap: Record<string, string>,
  pronunciationEnabled: boolean,
  options: AnnotateMetaOptions,
) => {
  if (!text) return ''
  const showMeaning = Boolean(options.showMeaning)
  const meaningWords = showMeaning
    ? Object.entries(options.vocabularyMetaMap || {})
        .filter(([, meta]) => (meta.meanings || []).some(item => item.trim()))
        .map(([word]) => word)
    : []
  const pronunciationWords = pronunciationEnabled
    ? Object.entries(pronMap)
        .filter(([word, pron]) => hasJapanese(word) && Boolean((pron || '').trim()))
        .map(([word]) => word)
    : []
  const words = Array.from(new Set([...meaningWords, ...pronunciationWords])).sort(
    (a, b) => b.length - a.length,
  )

  if (words.length === 0) {
    return pronunciationEnabled ? annotateJapaneseText(text, pronMap) : escapeHtml(text)
  }

  const bestByStart = new Map<number, { word: string; length: number }>()
  for (const word of words) {
    let from = 0
    while (from < text.length) {
      const start = text.indexOf(word, from)
      if (start === -1) break
      const prev = bestByStart.get(start)
      if (!prev || word.length > prev.length) {
        bestByStart.set(start, { word, length: word.length })
      }
      from = start + 1
    }
  }

  let cursor = 0
  let html = ''
  while (cursor < text.length) {
    const match = bestByStart.get(cursor)
    if (!match) {
      html += escapeHtml(text[cursor])
      cursor += 1
      continue
    }

    const word = match.word
    const pronunciation = (pronMap[word] || '').trim()
    const baseWordHtml =
      pronunciationEnabled && pronunciation
        ? buildJapaneseRubyHtml(word, pronunciation)
        : escapeHtml(word)

    const meaningText = showMeaning
      ? resolveMeaningText(
          word,
          extractSentenceContext(text, cursor, match.length),
          options,
        )
      : ''

    if (meaningText) {
      html += `<span class="inline-flex align-baseline flex-col items-center leading-tight"><span class="inline-block">${baseWordHtml}</span><span class="mt-[1px] text-[0.64em] font-medium leading-none text-slate-500">${escapeHtml(meaningText)}</span></span>`
    } else {
      html += baseWordHtml
    }

    cursor += match.length
  }

  return html
}

export const annotateJapaneseHtml = (
  html: string,
  pronMap: Record<string, string>,
  enabled: boolean,
  options: AnnotateMetaOptions = {},
) => {
  if (!enabled && !options.showMeaning) return html
  const chunks = html.split(/(<[^>]+>)/g)
  const next = chunks.map(chunk => {
    if (chunk.startsWith('<') && chunk.endsWith('>')) return chunk
    return annotateChunkWithMeta(chunk, pronMap, enabled, options)
  })
  return next.join('')
}
