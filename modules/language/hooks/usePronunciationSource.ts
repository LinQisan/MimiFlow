'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  readUserStorageValue,
  useCurrentUser,
  userStorageKey,
} from '@/context/UserContext'
import {
  PRONUNCIATION_SOURCE_STORAGE_KEY,
  type PronunciationSource,
} from '@/components/ui/PronunciationSourceSelector'
import { resolvePronunciationSource } from './pronunciationSource'

/**
 * Single owner of the `sudachi | personal` pronunciation preference.
 *
 * Replaces the four copy-pasted `useState + localStorage` blocks in
 * ArticleReaderClient, PracticePlayer, AudioPlayer and
 * useVocabularyPronunciation. Behavior is unchanged: user-scoped storage key,
 * `'personal'` opt-out respected, auto-upgrade to `'sudachi'` once data
 * arrives. Pass `disabled` for modes that must keep their SSR default
 * (e.g. the ebook reader, which never consults stored preference).
 */
export function usePronunciationSource(
  available: boolean,
  options?: {
    initialSource?: PronunciationSource
    disabled?: boolean
  },
) {
  const currentUser = useCurrentUser()
  const initialSource = options?.initialSource ?? 'personal'
  const disabled = options?.disabled ?? false
  const storageKey = userStorageKey(
    currentUser.id,
    PRONUNCIATION_SOURCE_STORAGE_KEY,
  )
  const [pronunciationSource, setPronunciationSourceState] =
    useState<PronunciationSource>(() => {
      if (disabled) return initialSource
      const stored = readUserStorageValue(
        currentUser.id,
        PRONUNCIATION_SOURCE_STORAGE_KEY,
      )
      return resolvePronunciationSource(stored, available, initialSource)
    })

  useEffect(() => {
    if (disabled) return
    const stored = readUserStorageValue(
      currentUser.id,
      PRONUNCIATION_SOURCE_STORAGE_KEY,
    )
    // Explicit opt-out always wins. Otherwise upgrade to automatic reading as
    // soon as data is ready — but NEVER downgrade on transient unavailability
    // (refetch/StrictMode remount briefly flips `available` false; the old
    // copy-pasted blocks had the same upgrade-only behavior).
    if (stored === 'personal') {
      setPronunciationSourceState(prev => (prev === 'personal' ? prev : 'personal'))
    } else if (available) {
      setPronunciationSourceState(prev => (prev === 'sudachi' ? prev : 'sudachi'))
    }
  }, [available, currentUser.id, disabled])

  const setPronunciationSource = useCallback(
    (source: PronunciationSource) => {
      if (source === 'sudachi' && !available) return
      setPronunciationSourceState(source)
      window.localStorage.setItem(storageKey, source)
    },
    [available, storageKey],
  )

  return { pronunciationSource, setPronunciationSource }
}
