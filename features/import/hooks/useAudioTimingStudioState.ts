'use client'

import { useCallback, useMemo, useReducer, type SetStateAction } from 'react'

import type {
  AudioTimingStatus,
  SubtitleLine,
  UploadCollectionLite,
  WaveformClickMode,
} from '../domain/audio-timing'

type AudioTimingStudioState = {
  collectionMode: 'existing' | 'new'
  collectionId: string
  collectionName: string
  audioFile: File | null
  audioUrl: string
  peaks: number[]
  duration: number
  currentTime: number
  pendingStart: number | null
  draftText: string
  manualStart: string
  manualEnd: string
  lines: SubtitleLine[]
  title: string
  chapterName: string
  description: string
  source: string
  language: string
  difficulty: string
  tags: string
  status: AudioTimingStatus
  isDecoding: boolean
  windowSeconds: number
  viewStart: number
  followPlayhead: boolean
  waveformClickMode: WaveformClickMode
}

type StateKey = keyof AudioTimingStudioState
type StateAction = {
  [Key in StateKey]: {
    key: Key
    value: SetStateAction<AudioTimingStudioState[Key]>
  }
}[StateKey]

function reducer(state: AudioTimingStudioState, action: StateAction) {
  const current = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value
  return { ...state, [action.key]: next }
}

export function useAudioTimingStudioState(collections: UploadCollectionLite[]) {
  const [state, dispatch] = useReducer(reducer, {
    collectionMode: collections.length > 0 ? 'existing' : 'new',
    collectionId: collections[0]?.id || '',
    collectionName: '',
    audioFile: null,
    audioUrl: '',
    peaks: [],
    duration: 0,
    currentTime: 0,
    pendingStart: null,
    draftText: '',
    manualStart: '0.00',
    manualEnd: '0.00',
    lines: [],
    title: '',
    chapterName: '',
    description: '',
    source: '',
    language: '',
    difficulty: '',
    tags: '',
    status: { type: 'idle', message: '' },
    isDecoding: false,
    windowSeconds: 20,
    viewStart: 0,
    followPlayhead: true,
    waveformClickMode: 'seek',
  })

  const setter = useCallback(
    <Key extends StateKey>(key: Key) =>
      (value: SetStateAction<AudioTimingStudioState[Key]>) =>
        dispatch({ key, value } as StateAction),
    [],
  )
  const setters = useMemo(
    () => ({
      setCollectionMode: setter('collectionMode'),
      setCollectionId: setter('collectionId'),
      setCollectionName: setter('collectionName'),
      setAudioFile: setter('audioFile'),
      setAudioUrl: setter('audioUrl'),
      setPeaks: setter('peaks'),
      setDuration: setter('duration'),
      setCurrentTime: setter('currentTime'),
      setPendingStart: setter('pendingStart'),
      setDraftText: setter('draftText'),
      setManualStart: setter('manualStart'),
      setManualEnd: setter('manualEnd'),
      setLines: setter('lines'),
      setTitle: setter('title'),
      setChapterName: setter('chapterName'),
      setDescription: setter('description'),
      setSource: setter('source'),
      setLanguage: setter('language'),
      setDifficulty: setter('difficulty'),
      setTags: setter('tags'),
      setStatus: setter('status'),
      setIsDecoding: setter('isDecoding'),
      setWindowSeconds: setter('windowSeconds'),
      setViewStart: setter('viewStart'),
      setFollowPlayhead: setter('followPlayhead'),
      setWaveformClickMode: setter('waveformClickMode'),
    }),
    [setter],
  )

  return {
    ...state,
    ...setters,
  }
}
