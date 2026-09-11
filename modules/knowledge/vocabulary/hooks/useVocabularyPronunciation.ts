'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCurrentUser } from '@/context/UserContext'
import type { SudachiLexeme } from '@/modules/language/domain/sudachi'
import { usePronunciationSource } from '@/modules/language/hooks/usePronunciationSource'
import { hasJapanese } from '@/modules/language/domain/text'
import type { VocabItem } from '@/modules/knowledge/vocabulary/types'
import {
  isPronunciationUpToDate,
  type VocabularyPronunciationData,
} from '@/modules/knowledge/vocabulary/domain/pronunciation'

export function useVocabularyPronunciation(
  visibleList: VocabItem[],
  isJapaneseVocabularyGroup: boolean,
  options?: {
    onBatchResolved?: (result: {
      vocabularies: Record<string, VocabularyPronunciationData>
      sentences: Record<string, VocabularyPronunciationData>
    }) => void
  },
) {
  const currentUser = useCurrentUser()
  const [sudachiLexicon] = useState<
    Record<string, SudachiLexeme>
  >({})
  // Direct render does not wait for Sudachi online state; available is immediately true for Japanese content
  const [sudachiAvailable, setSudachiAvailable] = useState(true)
  const { pronunciationSource, setPronunciationSource } =
    usePronunciationSource(sudachiAvailable, {
      initialSource: 'sudachi',
    })

  const hasJapaneseTexts = useMemo(() => {
    if (!isJapaneseVocabularyGroup) return false
    return visibleList.some(vocab => hasJapanese(vocab.word))
  }, [isJapaneseVocabularyGroup, visibleList])

  // Only identify cache misses on the CURRENT page (at most 30 items)
  const { missingVocabIds, missingSentenceIds } = useMemo(() => {
    if (!isJapaneseVocabularyGroup) {
      return { missingVocabIds: [], missingSentenceIds: [] }
    }
    const missingVocabs: string[] = []
    const missingSentences: string[] = []

    for (const vocab of visibleList) {
      if (hasJapanese(vocab.word) && !isPronunciationUpToDate(vocab)) {
        missingVocabs.push(vocab.id)
      }
      const sentenceItems = [
        ...(vocab.sentences || []),
        ...(vocab.wordbookSources || []).flatMap(source => source.sentences),
        ...(vocab.senses || []).flatMap(sense => sense.examples),
      ]
      for (const sentence of sentenceItems) {
        if (
          hasJapanese(sentence.text) &&
          sentence.id &&
          !isPronunciationUpToDate(sentence)
        ) {
          missingSentences.push(sentence.id)
        }
      }
    }

    return {
      missingVocabIds: Array.from(new Set(missingVocabs)),
      missingSentenceIds: Array.from(new Set(missingSentences)),
    }
  }, [isJapaneseVocabularyGroup, visibleList])

  const missKey = useMemo(
    () => `${missingVocabIds.join(',')}:${missingSentenceIds.join(',')}`,
    [missingVocabIds, missingSentenceIds],
  )

  useEffect(() => {
    // If no misses on current page, NEVER fetch: POST count = 0
    if (missingVocabIds.length === 0 && missingSentenceIds.length === 0) {
      return
    }

    const controller = new AbortController()

    // ONE single batch request for all misses on current page, sending only IDs
    void fetch('/api/pronunciation/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vocabularyIds: missingVocabIds,
        sentenceIds: missingSentenceIds,
      }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) return null
        return (await response.json()) as {
          available?: boolean
          vocabularies?: Record<string, VocabularyPronunciationData>
          sentences?: Record<string, VocabularyPronunciationData>
        }
      })
      .then(result => {
        if (!result?.available) return
        setSudachiAvailable(true)
        if (options?.onBatchResolved && (result.vocabularies || result.sentences)) {
          options.onBatchResolved({
            vocabularies: result.vocabularies || {},
            sentences: result.sentences || {},
          })
        }
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, missKey])

  return {
    hasJapaneseTexts,
    pronunciationSource,
    setPronunciationSource,
    sudachiAvailable,
    sudachiLexicon,
  }
}
