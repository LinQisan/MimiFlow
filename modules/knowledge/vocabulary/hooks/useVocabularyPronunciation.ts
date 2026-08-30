'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  readUserStorageValue,
  useCurrentUser,
  userStorageKey,
} from '@/context/UserContext'
import type { SudachiLexeme } from '@/modules/language/domain/sudachi'
import {
  PRONUNCIATION_SOURCE_STORAGE_KEY,
  type PronunciationSource,
} from '@/components/ui/PronunciationSourceSelector'
import { hasJapanese } from '@/hooks/usePronunciationPrefs'
import type { VocabItem } from '@/modules/knowledge/vocabulary/types'

export function useVocabularyPronunciation(
  visibleList: VocabItem[],
  isJapaneseVocabularyGroup: boolean,
) {
  const currentUser = useCurrentUser()
  const pronunciationStorageKey = userStorageKey(
    currentUser.id,
    PRONUNCIATION_SOURCE_STORAGE_KEY,
  )
  const [pronunciationSource, setPronunciationSourceState] =
    useState<PronunciationSource>('personal')
  const [sudachiLexicon, setSudachiLexicon] = useState<
    Record<string, SudachiLexeme>
  >({})
  const [sudachiAvailable, setSudachiAvailable] = useState(false)
  const pronunciationTexts = useMemo(() => {
    if (!isJapaneseVocabularyGroup) return []
    return Array.from(
      new Set(
        visibleList.flatMap(vocab => [
          vocab.word,
          ...(vocab.sentences || []).map(sentence => sentence.text),
        ]),
      ),
    )
      .filter(text => hasJapanese(text))
      .slice(0, 600)
  }, [isJapaneseVocabularyGroup, visibleList])
  const pronunciationTextKey = useMemo(
    () => pronunciationTexts.join('\u0000'),
    [pronunciationTexts],
  )

  useEffect(() => {
    const stored = readUserStorageValue(
      currentUser.id,
      PRONUNCIATION_SOURCE_STORAGE_KEY,
    )
    if (stored === 'personal') setPronunciationSourceState('personal')
  }, [currentUser.id])

  useEffect(() => {
    if (pronunciationTexts.length === 0) {
      setSudachiLexicon({})
      setSudachiAvailable(false)
      return
    }
    const controller = new AbortController()
    setSudachiLexicon({})
    setSudachiAvailable(false)

    void fetch('/api/pronunciation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: pronunciationTexts }),
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) return null
        return (await response.json()) as {
          available?: boolean
          lexicon?: Record<string, SudachiLexeme>
        }
      })
      .then(result => {
        if (!result?.available) return
        setSudachiLexicon(result.lexicon || {})
        setSudachiAvailable(true)
        const stored = readUserStorageValue(
          currentUser.id,
          PRONUNCIATION_SOURCE_STORAGE_KEY,
        )
        if (stored !== 'personal') setPronunciationSourceState('sudachi')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
      })

    return () => controller.abort()
  }, [currentUser.id, pronunciationTextKey, pronunciationTexts])

  const setPronunciationSource = (source: PronunciationSource) => {
    if (source === 'sudachi' && !sudachiAvailable) return
    setPronunciationSourceState(source)
    window.localStorage.setItem(pronunciationStorageKey, source)
  }

  return {
    hasJapaneseTexts: pronunciationTexts.length > 0,
    pronunciationSource,
    setPronunciationSource,
    sudachiAvailable,
    sudachiLexicon,
  }
}
