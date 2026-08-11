'use client'

import {
  useCallback,
  useMemo,
  useReducer,
  useRef,
  type SetStateAction,
} from 'react'
import type { MaterialType } from '#prisma-client'

import type { LastUploadResult, PickedFileMeta, UploadStatus } from '../types'

type AudioUploadState = {
  mode: 'existing' | 'new'
  selectedPaperId: string
  selectedLevelId: string
  status: UploadStatus
  lastUpload: LastUploadResult | null
  title: string
  audioFile: string
  audioSourceType: 'manual' | 'existing' | 'upload'
  existingAudioFiles: string[]
  selectedAudioFolder: string
  audioListLoading: boolean
  audioUploadFileNames: string[]
  paperName: string
  materialLanguage: string
  materialChapterName: string
  materialType: MaterialType
  subtitleNoAudio: boolean
  subtitleSourceType: 'MOVIE' | 'TV'
  subtitleWorkTitle: string
  subtitleSeason: string
  subtitleEpisode: string
  isDragging: boolean
  isAudioDragging: boolean
  pickedAssFiles: PickedFileMeta[]
  selectedFileNames: string[]
  assAudioOverrides: Record<string, string>
  addQuestions: boolean
  pastedAssSubtitle: string
  subtitleCopyState: 'idle' | 'copied' | 'error'
  selectedPaperIds: string[]
}

type AudioUploadAction = {
  [Key in keyof AudioUploadState]: {
    key: Key
    value: SetStateAction<AudioUploadState[Key]>
  }
}[keyof AudioUploadState]

function reducer(state: AudioUploadState, action: AudioUploadAction) {
  const current = state[action.key]
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value
  return { ...state, [action.key]: next }
}

export function useAudioUploadState(
  hasPapers: boolean,
  defaultMaterialType: MaterialType = 'LISTENING',
) {
  const [state, dispatch] = useReducer(reducer, {
    mode: hasPapers ? 'existing' : 'new',
    selectedPaperId: '',
    selectedLevelId: '',
    status: { type: 'idle', message: '' },
    lastUpload: null,
    title: '',
    audioFile: '',
    audioSourceType: 'manual',
    existingAudioFiles: [],
    selectedAudioFolder: '',
    audioListLoading: false,
    audioUploadFileNames: [],
    paperName: '',
    materialLanguage: '',
    materialChapterName: '',
    materialType: defaultMaterialType,
    subtitleNoAudio: false,
    subtitleSourceType: 'MOVIE',
    subtitleWorkTitle: '',
    subtitleSeason: '',
    subtitleEpisode: '',
    isDragging: false,
    isAudioDragging: false,
    pickedAssFiles: [],
    selectedFileNames: [],
    assAudioOverrides: {},
    addQuestions: true,
    pastedAssSubtitle: '',
    subtitleCopyState: 'idle',
    selectedPaperIds: [],
  })
  const setter = useCallback(
    <Key extends keyof AudioUploadState>(key: Key) =>
      (value: SetStateAction<AudioUploadState[Key]>) =>
        dispatch({ key, value } as AudioUploadAction),
    [],
  )

  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  // A setter created inline on every render changes effect dependencies and can
  // repeatedly reload the entire audio catalogue. Keep the complete setter map
  // stable for the lifetime of this hook.
  const setters = useMemo(
    () => ({
      setMode: setter('mode'),
      setSelectedPaperId: setter('selectedPaperId'),
      setSelectedLevelId: setter('selectedLevelId'),
      setStatus: setter('status'),
      setLastUpload: setter('lastUpload'),
      setTitle: setter('title'),
      setAudioFile: setter('audioFile'),
      setAudioSourceType: setter('audioSourceType'),
      setExistingAudioFiles: setter('existingAudioFiles'),
      setSelectedAudioFolder: setter('selectedAudioFolder'),
      setAudioListLoading: setter('audioListLoading'),
      setAudioUploadFileNames: setter('audioUploadFileNames'),
      setPaperName: setter('paperName'),
      setMaterialLanguage: setter('materialLanguage'),
      setMaterialChapterName: setter('materialChapterName'),
      setMaterialType: setter('materialType'),
      setSubtitleNoAudio: setter('subtitleNoAudio'),
      setSubtitleSourceType: setter('subtitleSourceType'),
      setSubtitleWorkTitle: setter('subtitleWorkTitle'),
      setSubtitleSeason: setter('subtitleSeason'),
      setSubtitleEpisode: setter('subtitleEpisode'),
      setIsDragging: setter('isDragging'),
      setIsAudioDragging: setter('isAudioDragging'),
      setPickedAssFiles: setter('pickedAssFiles'),
      setSelectedFileNames: setter('selectedFileNames'),
      setAssAudioOverrides: setter('assAudioOverrides'),
      setAddQuestions: setter('addQuestions'),
      setPastedAssSubtitle: setter('pastedAssSubtitle'),
      setSubtitleCopyState: setter('subtitleCopyState'),
      setSelectedPaperIds: setter('selectedPaperIds'),
    }),
    [setter],
  )

  return {
    ...state,
    ...setters,
    fileInputRef,
    audioInputRef,
  }
}
