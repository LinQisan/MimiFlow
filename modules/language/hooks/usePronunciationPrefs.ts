'use client'

import { useEffect, useState } from 'react'
import {
  readUserStorageValue,
  useCurrentUser,
  userStorageKey,
} from '@/context/UserContext'

const SHOW_KEY = 'mimiflow_show_pronunciation'
const SHOW_MEANING_KEY = 'mimiflow_show_meaning'

const loadShowPronunciation = (userId: string) => {
  if (typeof window === 'undefined') return true
  const raw = readUserStorageValue(userId, SHOW_KEY)
  return raw == null ? true : raw === '1'
}

export function useShowPronunciation() {
  const currentUser = useCurrentUser()
  const storageKey = userStorageKey(currentUser.id, SHOW_KEY)
  const [showPronunciation, setShowPronunciationState] = useState(true)

  useEffect(() => {
    setShowPronunciationState(loadShowPronunciation(currentUser.id))
  }, [currentUser.id])

  const setShowPronunciation = (value: boolean) => {
    setShowPronunciationState(value)
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, value ? '1' : '0')
    }
  }

  return {
    showPronunciation,
    setShowPronunciation,
  }
}

const loadShowMeaning = (userId: string) => {
  if (typeof window === 'undefined') return true
  const raw = readUserStorageValue(userId, SHOW_MEANING_KEY)
  return raw == null ? true : raw === '1'
}

export function useShowMeaning() {
  const currentUser = useCurrentUser()
  const storageKey = userStorageKey(currentUser.id, SHOW_MEANING_KEY)
  const [showMeaning, setShowMeaningState] = useState(true)

  useEffect(() => {
    setShowMeaningState(loadShowMeaning(currentUser.id))
  }, [currentUser.id])

  const setShowMeaning = (value: boolean) => {
    setShowMeaningState(value)
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, value ? '1' : '0')
    }
  }

  return {
    showMeaning,
    setShowMeaning,
  }
}
