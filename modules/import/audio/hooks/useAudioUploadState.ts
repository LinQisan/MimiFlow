'use client'

import { useRef, useState } from 'react'
import type { MaterialType } from '@prisma/client'

import type { LastUploadResult, PickedFileMeta, UploadStatus } from '../types'

export function useAudioUploadState(hasPapers: boolean) {
  const [mode, setMode] = useState<'existing' | 'new'>(
    hasPapers ? 'existing' : 'new',
  )
  const [selectedPaperId, setSelectedPaperId] = useState('')
  const [selectedLevelId, setSelectedLevelId] = useState('')

  const [status, setStatus] = useState<UploadStatus>({
    type: 'idle',
    message: '',
  })
  const [lastUpload, setLastUpload] = useState<LastUploadResult | null>(null)

  const [title, setTitle] = useState('')
  const [audioFile, setAudioFile] = useState('')
  const [audioSourceType, setAudioSourceType] = useState<
    'manual' | 'existing' | 'upload'
  >('manual')
  const [existingAudioFiles, setExistingAudioFiles] = useState<string[]>([])
  const [selectedAudioFolder, setSelectedAudioFolder] = useState('')
  const [audioListLoading, setAudioListLoading] = useState(false)
  const [audioUploadFileNames, setAudioUploadFileNames] = useState<string[]>([])
  const [paperName, setPaperName] = useState('')
  const [materialDescription, setMaterialDescription] = useState('')
  const [materialTranscript, setMaterialTranscript] = useState('')
  const [materialSource, setMaterialSource] = useState('')
  const [materialLanguage, setMaterialLanguage] = useState('')
  const [materialTags, setMaterialTags] = useState('')
  const [materialDifficulty, setMaterialDifficulty] = useState('')
  const [materialChapterName, setMaterialChapterName] = useState('')
  const [materialType, setMaterialType] = useState<MaterialType>('LISTENING')
  const [subtitleNoAudio, setSubtitleNoAudio] = useState(false)
  const [subtitleSourceType, setSubtitleSourceType] = useState<'MOVIE' | 'TV'>(
    'MOVIE',
  )
  const [subtitleWorkTitle, setSubtitleWorkTitle] = useState('')
  const [subtitleSeason, setSubtitleSeason] = useState('')
  const [subtitleEpisode, setSubtitleEpisode] = useState('')

  const [isDragging, setIsDragging] = useState(false)
  const [isAudioDragging, setIsAudioDragging] = useState(false)
  const [pickedAssFiles, setPickedAssFiles] = useState<PickedFileMeta[]>([])
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([])
  const [assAudioOverrides, setAssAudioOverrides] = useState<
    Record<string, string>
  >({})
  const [addQuestions, setAddQuestions] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  return {
    mode,
    setMode,
    selectedPaperId,
    setSelectedPaperId,
    selectedLevelId,
    setSelectedLevelId,
    status,
    setStatus,
    lastUpload,
    setLastUpload,
    title,
    setTitle,
    audioFile,
    setAudioFile,
    audioSourceType,
    setAudioSourceType,
    existingAudioFiles,
    setExistingAudioFiles,
    selectedAudioFolder,
    setSelectedAudioFolder,
    audioListLoading,
    setAudioListLoading,
    audioUploadFileNames,
    setAudioUploadFileNames,
    paperName,
    setPaperName,
    materialDescription,
    setMaterialDescription,
    materialTranscript,
    setMaterialTranscript,
    materialSource,
    setMaterialSource,
    materialLanguage,
    setMaterialLanguage,
    materialTags,
    setMaterialTags,
    materialDifficulty,
    setMaterialDifficulty,
    materialChapterName,
    setMaterialChapterName,
    materialType,
    setMaterialType,
    subtitleNoAudio,
    setSubtitleNoAudio,
    subtitleSourceType,
    setSubtitleSourceType,
    subtitleWorkTitle,
    setSubtitleWorkTitle,
    subtitleSeason,
    setSubtitleSeason,
    subtitleEpisode,
    setSubtitleEpisode,
    isDragging,
    setIsDragging,
    isAudioDragging,
    setIsAudioDragging,
    pickedAssFiles,
    setPickedAssFiles,
    selectedFileNames,
    setSelectedFileNames,
    assAudioOverrides,
    setAssAudioOverrides,
    addQuestions,
    setAddQuestions,
    fileInputRef,
    audioInputRef,
  }
}

