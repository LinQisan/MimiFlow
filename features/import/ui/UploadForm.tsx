'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { CollectionType, MaterialType, QuestionType } from '@prisma/client'
import CollectionBrowserSelect, {
  type CollectionBrowserOption,
} from '@/components/manage/import/CollectionBrowserSelect'
import { useDialog } from '@/context/DialogContext'
import { toCollectionBrowserOptions } from '@/components/manage/import/collectionBrowserOptions'
import SearchableDropdown from '@/modules/import/audio/components/SearchableDropdown'
import AudioMatchPreview from '@/modules/import/audio/components/AudioMatchPreview'
import CustomSelect from '@/components/ui/CustomSelect'
import {
  autoIncrementString,
  buildPickedKey,
  deriveAudioPathFromDir,
  extractAssDialoguePlainText,
  getDefaultCollectionTypeForMaterial,
  getStem,
  isCollectionTypeAllowedForMaterial,
} from '@/modules/import/audio/domain'
import { useAudioUploadState } from '@/modules/import/audio/hooks/useAudioUploadState'
import { useAudioFileCatalog } from '@/modules/import/audio/hooks/useAudioFileCatalog'
import type {
  AudioMatchPreviewRow,
  DropdownOption,
} from '@/modules/import/audio/types'
import { useUploadFormMutations } from '@/features/import/hooks/useUploadMutations'
import LessonQuestionsPanel from '@/features/collections/ui/LessonQuestionsPanel'

type Props = {
  levels: { id: string; title: string }[]
  papers: {
    id: string
    name: string
    parentId?: string | null
    sortOrder?: number
    collectionType?: CollectionType
    materialType?: MaterialType
    level: { title: string }
    lessons: {
      title: string
      audioFile: string
      chapterName: string
      materialType: MaterialType
    }[]
  }[]
  variant?: 'default' | 'media-subtitle'
  defaultMaterialType?: MaterialType
  defaultLanguage?: string
  collectionScope?: 'paper' | 'material'
  defaultQuestionType?: QuestionType | string
  defaultQuestionsPerMaterial?: number
  toeicPartLabel?: string
  defaultListeningSectionNumber?: string
  listeningSectionLabel?: string
}

export default function UploadForm({
  levels,
  papers,
  variant = 'default',
  defaultMaterialType = 'LISTENING',
  defaultLanguage = 'ja',
  collectionScope = 'material',
  defaultQuestionType,
  defaultQuestionsPerMaterial,
  toeicPartLabel,
  defaultListeningSectionNumber,
  listeningSectionLabel,
}: Props) {
  const dialog = useDialog()
  const router = useRouter()
  const { listPublicAudioFiles, uploadAssAndSaveData } =
    useUploadFormMutations()

  const {
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
    materialLanguage,
    setMaterialLanguage,
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
    pastedAssSubtitle,
    setPastedAssSubtitle,
    subtitleCopyState,
    setSubtitleCopyState,
    selectedPaperIds,
    setSelectedPaperIds,
    fileInputRef,
    audioInputRef,
  } = useAudioUploadState(
    papers.length > 0,
    defaultMaterialType,
    defaultLanguage,
  )
  const isMediaSubtitleVariant = variant === 'media-subtitle'
  const usesPracticeMaterialLayout =
    !isMediaSubtitleVariant &&
    (materialType === 'SPEAKING' || materialType === 'LISTENING')
  const usesCombinedListeningUpload =
    materialType === 'LISTENING' && audioSourceType === 'upload'
  const usesPaperDestination = collectionScope === 'paper'
  const usesAutomaticListeningTitle =
    usesPaperDestination &&
    defaultLanguage === 'ja' &&
    materialType === 'LISTENING'
  const destinationName = usesPaperDestination ? '试卷' : '学习内容'
  const isBatchAss = selectedFileNames.length > 1
  const autoSuggestedTitleRef = useRef<string | null>(null)
  const pastedSubtitleText = useMemo(
    () => extractAssDialoguePlainText(pastedAssSubtitle),
    [pastedAssSubtitle],
  )
  const pastedSubtitleLineCount = pastedSubtitleText
    ? pastedSubtitleText.split('\n').filter(Boolean).length
    : 0
  const uploadedListeningLessonId =
    lastUpload?.materialType === 'LISTENING' &&
    lastUpload.lessonIds.length === 1
      ? lastUpload.lessonIds[0]
      : null

  const findLatestLessonByMaterialType = (
    paper: Props['papers'][number] | undefined,
    type: MaterialType,
  ) => {
    if (!paper) return null
    const byType = paper.lessons.find(item => item.materialType === type)
    if (byType) return byType
    return paper.lessons[0] || null
  }

  const normalizeListeningAudioPath = (value: string) =>
    value.replace(/\.[a-z0-9]+$/i, '.mp3')

  useEffect(() => {
    if (!selectedLevelId && levels.length > 0) {
      setSelectedLevelId(levels[0].id)
    }
  }, [levels, selectedLevelId, setSelectedLevelId])

  useEffect(() => {
    if (mode !== 'new') return
    if (isCollectionTypeAllowedForMaterial(materialType, selectedLevelId))
      return
    const fallbackType = getDefaultCollectionTypeForMaterial(materialType)
    const fallback =
      levels.find(level => level.id === fallbackType) || levels[0]
    if (fallback) setSelectedLevelId(fallback.id)
  }, [levels, materialType, mode, selectedLevelId, setSelectedLevelId])

  const syncFilesToInput = (input: HTMLInputElement | null, files: File[]) => {
    if (!input) return
    const dataTransfer = new DataTransfer()
    files.forEach(file => dataTransfer.items.add(file))
    input.files = dataTransfer.files
  }

  useEffect(() => {
    if (mode === 'existing' && selectedPaperId) {
      const targetPaper = papers.find(paper => paper.id === selectedPaperId)
      if (
        targetPaper &&
        !isCollectionTypeAllowedForMaterial(
          materialType,
          String(targetPaper.collectionType || 'PAPER'),
        )
      ) {
        setSelectedPaperId('')
        return
      }
      const resolvedType = defaultMaterialType
      const latest = findLatestLessonByMaterialType(targetPaper, resolvedType)
      if (targetPaper && targetPaper.lessons.length > 0) {
        const suggestedTitle = autoIncrementString(latest?.title || '')
        autoSuggestedTitleRef.current = suggestedTitle
        setTitle(suggestedTitle)
        setAudioFile(
          normalizeListeningAudioPath(
            autoIncrementString(latest?.audioFile || ''),
          ),
        )
      } else {
        autoSuggestedTitleRef.current = null
        setTitle('')
        setAudioFile('/audios/')
      }
      setMaterialType(resolvedType)
      setMaterialChapterName('')
    }
  }, [
    materialType,
    defaultMaterialType,
    mode,
    papers,
    selectedPaperId,
    setAudioFile,
    setMaterialChapterName,
    setMaterialType,
    setSelectedPaperId,
    setTitle,
  ])

  useEffect(() => {
    const suggestedTitle = autoSuggestedTitleRef.current
    if (!isBatchAss || !suggestedTitle || title !== suggestedTitle) return

    autoSuggestedTitleRef.current = null
    setTitle('')
  }, [isBatchAss, setTitle, title])

  useEffect(() => {
    if (mode !== 'existing' || !selectedPaperId || materialType !== 'SPEAKING')
      return
    const targetPaper = papers.find(paper => paper.id === selectedPaperId)
    const latest = findLatestLessonByMaterialType(targetPaper, 'SPEAKING')
    // 自动读取同收藏夹上一条跟读材料的章节名，仅在空值时预填，避免覆盖手动输入。
    if (!materialChapterName.trim()) {
      setMaterialChapterName((latest?.chapterName || '').trim())
    }
  }, [
    mode,
    selectedPaperId,
    materialType,
    materialChapterName,
    papers,
    setMaterialChapterName,
  ])

  useEffect(() => {
    if (mode === 'new') {
      setMaterialType(defaultMaterialType)
      setMaterialChapterName('')
    }
  }, [defaultMaterialType, mode, setMaterialType, setMaterialChapterName])

  useEffect(() => {
    if (!isMediaSubtitleVariant) return
    setSubtitleNoAudio(true)
    setMaterialType('MEDIA_SUBTITLE')
    setAddQuestions(false)
  }, [
    isMediaSubtitleVariant,
    setAddQuestions,
    setMaterialType,
    setSubtitleNoAudio,
  ])

  useEffect(() => {
    setMaterialLanguage(defaultLanguage)
  }, [defaultLanguage, setMaterialLanguage])

  const {
    audioFolderMap,
    audioFolders,
    filesInSelectedFolder,
    siteAudioByStem,
    scopedAudioByStem,
  } = useAudioFileCatalog({
    enabled: audioSourceType === 'existing',
    existingAudioFiles,
    selectedAudioFolder,
    loadFiles: listPublicAudioFiles,
    setExistingAudioFiles,
    setLoading: setAudioListLoading,
  })

  const uploadedAudioByStem = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const fileName of audioUploadFileNames) {
      const stem = getStem(fileName)
      const bucket = map.get(stem) || []
      bucket.push(fileName)
      map.set(stem, bucket)
    }
    return map
  }, [audioUploadFileNames])

  const previewRows = useMemo<AudioMatchPreviewRow[]>(() => {
    return pickedAssFiles.map(file => {
      const key = buildPickedKey(file)
      const stem = getStem(file.name)
      const uploadCandidates = uploadedAudioByStem.get(stem) || []
      const scopedCandidates = scopedAudioByStem.get(stem) || []
      const siteCandidates = siteAudioByStem.get(stem) || []

      const effectiveAudioFile =
        audioSourceType === 'existing' && isBatchAss
          ? selectedAudioFolder
            ? selectedAudioFolder === '(根目录)'
              ? '/audios/'
              : `/audios/${selectedAudioFolder}/`
            : ''
          : audioFile

      const fallbackPath = deriveAudioPathFromDir(effectiveAudioFile, file.name)

      let autoValue = ''
      let autoLabel = '未匹配'

      if (uploadCandidates.length > 0 && audioSourceType === 'upload') {
        autoValue = `upload://${stem}`
        autoLabel = `上传同名：${uploadCandidates[0]}`
      } else if (scopedCandidates.length > 0) {
        autoValue = scopedCandidates[0]
        autoLabel = `当前文件夹：${scopedCandidates[0]}`
      } else if (siteCandidates.length > 0) {
        autoValue = siteCandidates[0]
        autoLabel = `站内同名：${siteCandidates[0]}`
      } else if (fallbackPath.startsWith('/audios/')) {
        autoValue = fallbackPath
        autoLabel = `路径推断：${fallbackPath}`
      }

      return {
        ...file,
        key,
        stem,
        autoValue,
        autoLabel,
        uploadCandidates,
        scopedCandidates,
        siteCandidates,
      }
    })
  }, [
    pickedAssFiles,
    uploadedAudioByStem,
    scopedAudioByStem,
    siteAudioByStem,
    audioFile,
    audioSourceType,
    isBatchAss,
    selectedAudioFolder,
  ])

  useEffect(() => {
    if (previewRows.length === 0) {
      setAssAudioOverrides({})
      return
    }

    setAssAudioOverrides(prev => {
      const next: Record<string, string> = {}
      for (const row of previewRows) {
        next[row.key] = prev[row.key] ?? row.autoValue
      }
      return next
    })
  }, [previewRows, setAssAudioOverrides])

  useEffect(() => {
    if (audioSourceType !== 'existing') return

    if (audioFolders.length === 0) {
      setSelectedAudioFolder('')
      return
    }

    if (!selectedAudioFolder || !audioFolderMap.has(selectedAudioFolder)) {
      setSelectedAudioFolder(audioFolders[0])
    }
  }, [
    audioFolderMap,
    audioFolders,
    audioSourceType,
    selectedAudioFolder,
    setSelectedAudioFolder,
  ])

  useEffect(() => {
    if (audioSourceType !== 'existing' || isBatchAss) return

    if (filesInSelectedFolder.length === 0) {
      setAudioFile('')
      return
    }

    if (!filesInSelectedFolder.includes(audioFile)) {
      setAudioFile(filesInSelectedFolder[0])
    }
  }, [
    audioFile,
    audioSourceType,
    filesInSelectedFolder,
    isBatchAss,
    setAudioFile,
  ])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (
      !isMediaSubtitleVariant &&
      mode === 'existing' &&
      selectedPaperIds.length === 0
    ) {
      setStatus({ type: 'error', message: `请选择要添加内容的${destinationName}。` })
      return
    }

    if (!isMediaSubtitleVariant && mode === 'new' && !selectedLevelId) {
      setStatus({ type: 'error', message: `请选择${destinationName}类型。` })
      return
    }

    if (!fileInputRef.current?.files?.length) {
      setStatus({
        type: 'error',
        message: '请先选择或拖拽上传至少一个 .ass 文件。',
      })
      return
    }

    if (
      isMediaSubtitleVariant &&
      subtitleSourceType === 'TV' &&
      (!subtitleSeason.trim() || !subtitleEpisode.trim())
    ) {
      setStatus({
        type: 'error',
        message: '电视剧字幕请填写季和集。',
      })
      return
    }
    if (isMediaSubtitleVariant && !subtitleWorkTitle.trim()) {
      setStatus({
        type: 'error',
        message: '请填写电影名或剧名。',
      })
      return
    }

    const effectiveAudioFile =
      audioSourceType === 'existing' && isBatchAss
        ? selectedAudioFolder
          ? selectedAudioFolder === '(根目录)'
            ? '/audios/'
            : `/audios/${selectedAudioFolder}/`
          : ''
        : audioFile

    if (
      !subtitleNoAudio &&
      !isMediaSubtitleVariant &&
      (audioSourceType === 'manual' || audioSourceType === 'existing') &&
      !effectiveAudioFile.trim()
    ) {
      setStatus({ type: 'error', message: '请先设置音频路径。' })
      return
    }

    if (
      !subtitleNoAudio &&
      !isMediaSubtitleVariant &&
      audioSourceType === 'upload' &&
      audioUploadFileNames.length === 0
    ) {
      setStatus({
        type: 'error',
        message: isBatchAss
          ? '批量导入时请先选择可配对的录音文件。'
          : '请先选择需要上传保存的录音文件。',
      })
      return
    }

    setStatus({ type: 'loading', message: '正在解析并写入...' })
    setLastUpload(null)
    const formData = new FormData(event.currentTarget)
    const result = await uploadAssAndSaveData(formData)

    setStatus({
      type: result.success ? 'success' : 'error',
      message: result.message,
    })

    if (result.success) {
      const uploadedLessonIds =
        (result as { lessonIds?: string[] }).lessonIds || []
      const uploadedMaterialType = (result as { materialType?: MaterialType })
        .materialType
      setLastUpload({
        lessonIds: uploadedLessonIds,
        materialType: uploadedMaterialType,
        listeningSectionNumber: (
          result as { listeningSectionNumber?: number | null }
        ).listeningSectionNumber,
      })
      setPickedAssFiles([])
      setSelectedFileNames([])
      if (fileInputRef.current) fileInputRef.current.value = ''

      setAudioUploadFileNames([])
      setAssAudioOverrides({})

      if (mode === 'new') {
        setPaperName('')
      }

      if (
        uploadedMaterialType !== 'LISTENING' ||
        uploadedLessonIds.length !== 1
      ) {
        router.refresh()
      }
    } else {
      setLastUpload(null)
    }
  }

  const handleCopyPastedSubtitleText = async () => {
    if (!pastedSubtitleText) return

    try {
      await navigator.clipboard.writeText(pastedSubtitleText)
      setSubtitleCopyState('copied')
      window.setTimeout(() => setSubtitleCopyState('idle'), 1800)
    } catch {
      setSubtitleCopyState('error')
      window.setTimeout(() => setSubtitleCopyState('idle'), 2200)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const allFiles = Array.from(files)
      const droppedFiles = allFiles.filter(file =>
        file.name.toLowerCase().endsWith('.ass'),
      )
      const droppedAudioFiles = usesCombinedListeningUpload
        ? allFiles.filter(isSupportedAudioFile)
        : []

      if (droppedFiles.length === 0) {
        void dialog.alert(
          usesCombinedListeningUpload
            ? '请至少选择一个 ASS 字幕文件，可同时选择同名 MP3。'
            : '只能上传 .ass 格式的字幕文件。',
        )
        return
      }

      setSelectedFileNames(droppedFiles.map(file => file.name))
      if (usesCombinedListeningUpload) {
        setAudioUploadFileNames(droppedAudioFiles.map(file => file.name))
      }
      setPickedAssFiles(
        droppedFiles.map(file => ({ name: file.name, size: file.size })),
      )
      syncFilesToInput(
        fileInputRef.current,
        usesCombinedListeningUpload
          ? [...droppedFiles, ...droppedAudioFiles]
          : droppedFiles,
      )
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    const subtitleFiles = files.filter(file =>
      file.name.toLowerCase().endsWith('.ass'),
    )
    const audioFiles = usesCombinedListeningUpload
      ? files.filter(isSupportedAudioFile)
      : []
    setSelectedFileNames(subtitleFiles.map(file => file.name))
    setPickedAssFiles(
      subtitleFiles.map(file => ({ name: file.name, size: file.size })),
    )
    if (usesCombinedListeningUpload) {
      setAudioUploadFileNames(audioFiles.map(file => file.name))
    }
  }

  const handleZoneClick = () => fileInputRef.current?.click()
  const handleAudioPick = () => audioInputRef.current?.click()

  const isSupportedAudioFile = (file: File) =>
    file.name.toLowerCase().endsWith('.mp3')

  const handleAudioDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAudioDragging(true)
  }

  const handleAudioDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAudioDragging(false)
  }

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAudioDragging(false)

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    const droppedList = Array.from(files).filter(isSupportedAudioFile)
    if (droppedList.length === 0) {
      void dialog.alert('听力录音仅支持 MP3 文件。')
      return
    }

    setAudioUploadFileNames(droppedList.map(file => file.name))
    syncFilesToInput(audioInputRef.current, droppedList)
  }

  const paperOptions: CollectionBrowserOption[] = useMemo(
    () =>
      toCollectionBrowserOptions(
        papers.filter(paper =>
          isCollectionTypeAllowedForMaterial(
            materialType,
            String(paper.collectionType || 'PAPER'),
          ),
        ),
      ),
    [materialType, papers],
  )

  const levelOptions: DropdownOption[] = levels
    .filter(level => isCollectionTypeAllowedForMaterial(materialType, level.id))
    .map(level => ({
      value: level.id,
      label: level.title,
    }))

  const selectedPaperLabel =
    mode === 'existing'
      ? paperOptions.find(item => item.value === selectedPaperId)?.searchText ||
        paperOptions.find(item => item.value === selectedPaperId)?.label ||
        `未选择${destinationName}`
      : paperName || `新建${destinationName}`

  const addSelectedPaper = (paperId: string) => {
    if (!paperId) return
    setSelectedPaperIds(current =>
      current.includes(paperId) ? current : [...current, paperId],
    )
    if (!selectedPaperId) setSelectedPaperId(paperId)
  }

  const removeSelectedPaper = (paperId: string) => {
    const next = selectedPaperIds.filter(id => id !== paperId)
    setSelectedPaperIds(next)
    if (selectedPaperId === paperId) setSelectedPaperId(next[0] || '')
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className={`animate-in fade-in mx-auto flex w-full max-w-5xl flex-col ${
          usesPracticeMaterialLayout
            ? ''
            : 'border-y border-slate-200 bg-white px-4 md:px-7'
        }`}>
        <input
          type='hidden'
          name='uploadMode'
          value={isMediaSubtitleVariant ? 'media' : mode}
        />
        <input type='hidden' name='audioSourceType' value={audioSourceType} />
        <input
          type='hidden'
          name='addQuestions'
          value={
            materialType === 'LISTENING' ? 'yes' : addQuestions ? 'yes' : 'no'
          }
        />
        <input
          type='hidden'
          name='materialType'
          value={isMediaSubtitleVariant ? 'MEDIA_SUBTITLE' : materialType}
        />
        <input type='hidden' name='collectionLanguage' value={defaultLanguage} />
        <input
          type='hidden'
          name='subtitleNoAudio'
          value={isMediaSubtitleVariant ? 'yes' : 'no'}
        />
        <input
          type='hidden'
          name='subtitleSourceType'
          value={subtitleSourceType}
        />
        <input
          type='hidden'
          name='subtitleWorkTitle'
          value={subtitleWorkTitle}
        />
        <input type='hidden' name='subtitleSeason' value={subtitleSeason} />
        <input type='hidden' name='subtitleEpisode' value={subtitleEpisode} />
        <input
          type='hidden'
          name='assAudioOverrides'
          value={JSON.stringify(assAudioOverrides)}
        />

        {!isMediaSubtitleVariant && (
          <fieldset className='relative overflow-visible rounded-none border-b border-slate-200 py-6 md:py-8'>
            <legend className='text-sm font-bold text-slate-900'>
              {usesPaperDestination ? '所属试卷' : '保存位置'}
            </legend>

            <div
              className={
                usesPracticeMaterialLayout
                  ? 'mb-4 mt-3 flex border-b border-slate-200'
                  : 'mb-4 mt-3 grid grid-cols-2 gap-1 bg-slate-100 p-1'
              }>
              <label
                className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  usesPracticeMaterialLayout ? '!rounded-none border-b-2' : ''
                }
              ${
                mode === 'existing'
                  ? usesPracticeMaterialLayout
                    ? 'border-slate-950 text-slate-950'
                    : 'bg-white text-slate-900'
                  : usesPracticeMaterialLayout
                    ? 'border-transparent text-slate-400 hover:text-slate-700'
                    : 'text-gray-500 hover:bg-gray-100'
              }
              ${papers.length === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                <input
                  type='radio'
                  className='hidden'
                  checked={mode === 'existing'}
                  onChange={() => setMode('existing')}
                  disabled={papers.length === 0}
                />
                {usesPaperDestination ? '选择已有试卷' : '选择已有内容'}
              </label>

              <label
                className={`flex cursor-pointer items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  usesPracticeMaterialLayout ? '!rounded-none border-b-2' : ''
                }
              ${
                mode === 'new'
                  ? usesPracticeMaterialLayout
                    ? 'border-slate-950 text-slate-950'
                    : 'bg-white text-slate-900'
                  : usesPracticeMaterialLayout
                    ? 'border-transparent text-slate-400 hover:text-slate-700'
                    : 'text-gray-500 hover:bg-gray-100'
              }`}>
                <input
                  type='radio'
                  className='hidden'
                  checked={mode === 'new'}
                  onChange={() => setMode('new')}
                />
                {usesPaperDestination ? '新建试卷' : '新建学习内容'}
              </label>
            </div>

            {mode === 'existing' ? (
              <div className='space-y-3'>
                <input type='hidden' name='paperId' value={selectedPaperId} />
                {selectedPaperIds.map(paperId => (
                  <input
                    key={paperId}
                    type='hidden'
                    name='collectionIds'
                    value={paperId}
                  />
                ))}
                <CollectionBrowserSelect
                  options={paperOptions.filter(
                    option => !selectedPaperIds.includes(option.value),
                  )}
                  value=''
                  onChange={addSelectedPaper}
                  placeholder={
                    selectedPaperIds.length > 0
                      ? `继续添加其他${destinationName}`
                      : `请选择${destinationName}`
                  }
                  recentKey='manage.upload.paper.recent'
                />
                {selectedPaperIds.length > 0 && (
                  <div>
                    <div className='flex flex-wrap gap-2'>
                      {selectedPaperIds.map((paperId, index) => {
                        const option = paperOptions.find(
                          item => item.value === paperId,
                        )
                        return (
                          <span
                            key={paperId}
                            className='inline-flex items-center gap-2 border-b border-slate-200 px-1 py-2 text-xs font-semibold text-slate-700'>
                            {index === 0 ? '主要 · ' : ''}
                            {option?.searchText || option?.label || `未知${destinationName}`}
                            <button
                              type='button'
                              onClick={() => removeSelectedPaper(paperId)}
                              aria-label={`移除 ${option?.label || destinationName}`}
                              className='text-blue-500 transition hover:text-red-600'>
                              ×
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className='flex flex-col gap-4 md:gap-5'>
                <div className='z-20 flex flex-col gap-4 md:flex-row md:gap-5'>
                  <input
                    required
                    name='collectionName'
                    value={paperName}
                    onChange={e => setPaperName(e.target.value)}
                    placeholder={
                      usesPaperDestination
                        ? defaultLanguage === 'en'
                          ? '试卷名称，例如：TOEIC 模拟题 01'
                          : '试卷名称，例如：2025-07 N1 真题'
                        : materialType === 'SPEAKING'
                          ? '教材或单元名称'
                          : '学习内容名称'
                    }
                    className='flex-[2] border border-gray-200 bg-gray-50 p-4 text-sm font-bold outline-none transition-colors focus:ring-2 focus:ring-blue-400'
                  />

                  <div className={usesPaperDestination ? 'hidden' : 'flex-[1]'}>
                    <input
                      type='hidden'
                      name='collectionType'
                      value={selectedLevelId}
                    />
                    <SearchableDropdown
                      options={levelOptions}
                      value={selectedLevelId}
                      onChange={setSelectedLevelId}
                      placeholder='选择内容类型'
                    />
                  </div>
                </div>
              </div>
            )}
          </fieldset>
        )}

        <fieldset className='relative overflow-visible rounded-none border-b border-slate-200 py-6 md:py-8'>
          <div
            className={`flex flex-col gap-2 md:flex-row md:items-center md:justify-between ${usesPracticeMaterialLayout ? 'mb-3' : 'mb-4'}`}>
            <legend
              className={
                usesPracticeMaterialLayout
                  ? 'sr-only'
                  : 'text-base font-bold text-slate-900 md:text-lg'
              }>
              {usesPracticeMaterialLayout ? (
                '材料信息'
              ) : (
                isMediaSubtitleVariant ? '字幕归属' : '材料信息'
              )}
            </legend>
            {!usesPracticeMaterialLayout && mode === 'existing' && selectedPaperId && (
              <span className='text-xs font-semibold text-slate-400'>
                已沿用上一条记录
              </span>
            )}
          </div>

          {usesAutomaticListeningTitle ? (
            <div className='mb-4 border-y border-slate-200 py-3'>
              <p className='text-sm font-bold text-slate-800'>标题自动生成</p>
              <p className='mt-1 text-xs leading-5 text-slate-500'>
                无需填写标题。系统会优先识别文件名中的問題编号；无法识别时使用字幕文件名。
              </p>
            </div>
          ) : (
            <div className='mb-4'>
              <label
                className={
                  usesPracticeMaterialLayout
                    ? 'sr-only'
                    : 'mb-1.5 block text-sm font-semibold text-slate-700'
                }>
                {isBatchAss
                  ? '标题前缀（可选）'
                  : isMediaSubtitleVariant
                    ? '字幕标题（可选）'
                    : '标题'}
              </label>
              <input
                name='title'
                value={title}
                onChange={e => {
                  autoSuggestedTitleRef.current = null
                  setTitle(e.target.value)
                }}
                placeholder={
                  isBatchAss
                    ? '例：N1 听力（留空则直接用字幕文件名）'
                    : isMediaSubtitleVariant
                      ? '留空则使用字幕文件名'
                      : materialType === 'SPEAKING'
                        ? '例：会話 01（可留空，不填则用字幕文件名）'
                        : '例：问题 1-01（可留空，不填则用字幕文件名）'
                }
                className={
                  usesPracticeMaterialLayout
                    ? 'w-full border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200'
                    : 'w-full border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
                }
              />
              {isBatchAss && !title.trim() && (
                <p className='mt-1 text-xs font-semibold text-amber-600'>
                  未填写标题前缀：将直接使用每个字幕文件名作为标题。
                </p>
              )}
            </div>
          )}

          <div>
            {isMediaSubtitleVariant && (
              <div className='mb-4 border border-slate-200 bg-slate-50 p-3 md:p-4'>
                <p className='mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500'>
                  字幕归属
                </p>
                <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                  <CustomSelect
                    value={subtitleSourceType}
                    onChange={e =>
                      setSubtitleSourceType(
                        e.currentTarget.value as 'MOVIE' | 'TV',
                      )
                    }
                    className='w-full border border-gray-200 bg-white p-3 text-sm font-bold text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'>
                    <option value='MOVIE'>电影</option>
                    <option value='TV'>电视剧</option>
                  </CustomSelect>
                  <input
                    value={subtitleWorkTitle}
                    onChange={e => setSubtitleWorkTitle(e.target.value)}
                    placeholder='作品名（电影名 / 剧名）'
                    className='w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
                  />
                  {subtitleSourceType === 'TV' && (
                    <>
                      <input
                        value={subtitleSeason}
                        onChange={e => setSubtitleSeason(e.target.value)}
                        placeholder='季（例：1）'
                        className='w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
                      />
                      <input
                        value={subtitleEpisode}
                        onChange={e => setSubtitleEpisode(e.target.value)}
                        placeholder='集（例：3）'
                        className='w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {isMediaSubtitleVariant && (
              <details className='group mb-4 rounded-lg border border-slate-200 bg-white'>
                <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-700 marker:content-none'>
                  从 ASS 文本提取台词
                  <span className='text-xs font-normal text-slate-400 group-open:hidden'>
                    辅助工具
                  </span>
                  <span className='hidden text-xs font-normal text-slate-400 group-open:inline'>
                    收起
                  </span>
                </summary>
                <div className='border-t border-slate-200 p-3 md:p-4'>
                  <div className='mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
                    <div>
                      <p className='text-[11px] font-bold uppercase tracking-wider text-emerald-700'>
                        粘贴字幕提取文本
                      </p>
                      <p className='mt-1 text-xs font-semibold text-slate-500'>
                        可粘贴 ASS 的 Dialogue 行，自动提取可复制的纯文本。
                      </p>
                    </div>
                    <button
                      type='button'
                      onClick={handleCopyPastedSubtitleText}
                      disabled={!pastedSubtitleText}
                      className={`border px-3 py-2 text-xs font-bold transition ${
                        pastedSubtitleText
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                      }`}>
                      {subtitleCopyState === 'copied'
                        ? '已复制'
                        : subtitleCopyState === 'error'
                          ? '复制失败'
                          : '复制文本'}
                    </button>
                  </div>

                  <textarea
                    value={pastedAssSubtitle}
                    onChange={e => setPastedAssSubtitle(e.target.value)}
                    placeholder={
                      'Dialogue: 0,0:01:52.66,0:01:55.24,Default,,0,0,0,,(鹿谷門実) コナンくん 紅茶でいいかい？\nDialogue: 0,0:01:55.32,0:01:58.33,Default,,0,0,0,,(江南孝明) あっ すいません ありがとうございます'
                    }
                    className='custom-scrollbar min-h-[120px] w-full resize-y border border-gray-200 bg-slate-50 p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-300'
                  />

                  <div className='mt-3 border border-slate-200 bg-slate-50 p-3'>
                    <div className='mb-2 flex items-center justify-between gap-2'>
                      <p className='text-xs font-bold text-slate-700'>
                        提取结果
                      </p>
                      <span className='text-xs font-bold text-slate-500'>
                        {pastedSubtitleLineCount} 行
                      </span>
                    </div>
                    <pre className='custom-scrollbar min-h-[84px] max-h-56 w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words border border-slate-200 bg-white p-3 text-sm leading-7 text-slate-800 [overflow-wrap:anywhere]'>
                      {pastedSubtitleText ||
                        '粘贴字幕后，这里会显示可复制的文本内容。'}
                    </pre>
                  </div>
                </div>
              </details>
            )}

            {!isMediaSubtitleVariant && (
              <>
                <label
                  className={
                    usesPracticeMaterialLayout
                      ? 'sr-only'
                      : 'mb-1.5 block text-sm font-semibold text-slate-700'
                  }>
                  音频来源
                </label>

                <div
                  className={
                    usesPracticeMaterialLayout
                      ? 'mb-3 flex overflow-x-auto border-b border-slate-200'
                      : 'mb-3 grid grid-cols-1 divide-y divide-slate-200 border-y border-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0'
                  }>
                  <button
                    type='button'
                    onClick={() => setAudioSourceType('manual')}
                    disabled={subtitleNoAudio}
                    className={`shrink-0 rounded-none px-3 py-2.5 text-sm font-bold transition ${usesPracticeMaterialLayout ? 'border-b-2' : ''} ${
                      audioSourceType === 'manual'
                        ? usesPracticeMaterialLayout
                          ? 'border-slate-950 text-slate-950'
                          : 'bg-slate-900 text-white'
                        : usesPracticeMaterialLayout
                          ? 'border-transparent text-slate-400 hover:text-slate-700'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                    } ${subtitleNoAudio ? 'cursor-not-allowed opacity-50' : ''}`}>
                    {usesPracticeMaterialLayout ? '填写路径' : '手动填写路径'}
                  </button>

                  <button
                    type='button'
                    onClick={() => setAudioSourceType('existing')}
                    disabled={subtitleNoAudio}
                    className={`shrink-0 rounded-none px-3 py-2.5 text-sm font-bold transition ${usesPracticeMaterialLayout ? 'border-b-2' : ''} ${
                      audioSourceType === 'existing'
                        ? usesPracticeMaterialLayout
                          ? 'border-slate-950 text-slate-950'
                          : 'bg-slate-900 text-white'
                        : usesPracticeMaterialLayout
                          ? 'border-transparent text-slate-400 hover:text-slate-700'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                    } ${subtitleNoAudio ? 'cursor-not-allowed opacity-50' : ''}`}>
                    {usesPracticeMaterialLayout ? '站内录音' : '浏览站内录音'}
                  </button>

                  <button
                    type='button'
                    onClick={() => setAudioSourceType('upload')}
                    disabled={subtitleNoAudio}
                    className={`shrink-0 rounded-none px-3 py-2.5 text-sm font-bold transition ${usesPracticeMaterialLayout ? 'border-b-2' : ''} ${
                      audioSourceType === 'upload'
                        ? usesPracticeMaterialLayout
                          ? 'border-slate-950 text-slate-950'
                          : 'bg-slate-900 text-white'
                        : usesPracticeMaterialLayout
                          ? 'border-transparent text-slate-400 hover:text-slate-700'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                    } ${subtitleNoAudio ? 'cursor-not-allowed opacity-50' : ''}`}>
                    {usesPracticeMaterialLayout ? '上传录音' : '上传并保存录音'}
                  </button>
                </div>
              </>
            )}

            {!isMediaSubtitleVariant && subtitleNoAudio && (
              <p className='mb-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700'>
                已启用无音频模式：本次将仅导入 ASS 字幕，音频字段留空。
              </p>
            )}

            {!isMediaSubtitleVariant &&
              !subtitleNoAudio &&
              (audioSourceType === 'manual' ||
                audioSourceType === 'existing') && (
                <>
                  {audioSourceType === 'manual' ? (
                    <input
                      name='audioFile'
                      value={audioFile}
                      onChange={e => setAudioFile(e.target.value)}
                      placeholder='例：/audios/Shadowing/N2-01.mp3'
                      className='w-full border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
                    />
                  ) : (
                    <div className='space-y-2'>
                      <input
                        type='hidden'
                        name='audioMatchFolder'
                        value={selectedAudioFolder}
                      />

                      <div className='grid grid-cols-1 gap-2 md:grid-cols-5'>
                        <div className='md:col-span-2'>
                          <SearchableDropdown
                            value={selectedAudioFolder}
                            onChange={setSelectedAudioFolder}
                            options={audioFolders.map(folder => ({
                              value: folder,
                              label:
                                folder === '(根目录)'
                                  ? `根目录 (${audioFolderMap.get(folder)?.length || 0})`
                                  : `${folder} (${audioFolderMap.get(folder)?.length || 0})`,
                            }))}
                            placeholder={
                              audioListLoading
                                ? '加载文件夹中...'
                                : '选择文件夹'
                            }
                          />
                        </div>

                        {isBatchAss ? (
                          <div className='md:col-span-3 border border-blue-100 bg-blue-50/60 p-3 text-xs font-medium text-blue-700'>
                            将按字幕文件名优先在当前文件夹匹配同名音频，匹配不到时自动回退到全站同名音频。
                            <input
                              type='hidden'
                              name='audioFile'
                              value={
                                selectedAudioFolder === '(根目录)'
                                  ? '/audios/'
                                  : `/audios/${selectedAudioFolder}/`
                              }
                            />
                          </div>
                        ) : (
                          <div className='md:col-span-3'>
                            <SearchableDropdown
                              value={audioFile}
                              onChange={setAudioFile}
                              options={filesInSelectedFolder.map(item => ({
                                value: item,
                                label: item.split('/').pop() || item,
                              }))}
                              placeholder={
                                audioListLoading
                                  ? '读取录音中...'
                                  : '选择录音文件'
                              }
                            />
                            <input
                              type='hidden'
                              name='audioFile'
                              value={audioFile}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

            {!isMediaSubtitleVariant &&
              !subtitleNoAudio &&
              audioSourceType === 'upload' &&
              !usesCombinedListeningUpload && (
                <div
                  onDragOver={handleAudioDragOver}
                  onDragLeave={handleAudioDragLeave}
                  onDrop={handleAudioDrop}
                  className={`border p-3 transition ${
                    isAudioDragging
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}>
                  <input
                    ref={audioInputRef}
                    type='file'
                    name='audioUploadFiles'
                    accept='.mp3,audio/mpeg'
                    multiple={isBatchAss}
                    onChange={e => {
                      const list = e.target.files
                        ? Array.from(e.target.files)
                        : []
                      if (list.length === 0) {
                        setAudioUploadFileNames([])
                        return
                      }

                      if (!list.every(isSupportedAudioFile)) {
                        void dialog.alert('听力录音仅支持 MP3 文件。')
                        e.currentTarget.value = ''
                        setAudioUploadFileNames([])
                        return
                      }

                      setAudioUploadFileNames(list.map(file => file.name))
                    }}
                    className='hidden'
                  />

                  <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
                    <button
                      type='button'
                      onClick={handleAudioPick}
                      className='border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50'>
                      选择录音文件
                    </button>

                    <span className='text-xs font-medium text-gray-500'>
                      {audioUploadFileNames.length > 0
                        ? `已选择 ${audioUploadFileNames.length} 个录音文件`
                        : isAudioDragging
                          ? '松开即可上传录音'
                          : isBatchAss
                            ? '点击选择或拖拽多个 MP3（将按同名优先配对）'
                            : '点击选择或拖拽 MP3 录音文件'}
                    </span>
                  </div>

                  {audioUploadFileNames.length > 1 && (
                    <div className='mt-2 max-h-24 overflow-y-auto border border-blue-100 bg-white/70 p-2 text-xs text-blue-700'>
                      {audioUploadFileNames.slice(0, 10).map((name, index) => (
                        <div key={`${name}-${index}`} className='truncate'>
                          {name}
                        </div>
                      ))}
                      {audioUploadFileNames.length > 10 && (
                        <div className='mt-1 text-[11px] text-blue-600'>
                          还有 {audioUploadFileNames.length - 10} 个文件...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
          </div>

          {isMediaSubtitleVariant ? (
            <label className='mt-4 block text-sm font-semibold text-slate-700'>
              字幕语言
              <input
                name='materialLanguage'
                value={materialLanguage}
                onChange={e => setMaterialLanguage(e.target.value)}
                placeholder='例如：ja / en / zh'
                className='mt-2 w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-300'
              />
            </label>
          ) : materialType === 'SPEAKING' ? (
            <label className='mt-4 block'>
              <span className='sr-only'>章节名称</span>
              <input
                name='materialChapterName'
                value={materialChapterName}
                onChange={e => setMaterialChapterName(e.target.value)}
                placeholder='例如：Section 01 / 会話 1'
                className='w-full border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 outline-none transition-colors focus:border-slate-500 focus:ring-2 focus:ring-slate-200'
              />
            </label>
          ) : null}
        </fieldset>

        <section className='border-b border-slate-200 py-6 md:py-8'>
          <h3
            className={
              usesPracticeMaterialLayout
                ? 'text-sm font-bold text-slate-900'
                : 'text-base font-bold text-slate-900 md:text-lg'
            }>
            {usesCombinedListeningUpload ? '录音与字幕' : '字幕文件'}
          </h3>
          <div
            role='button'
            tabIndex={0}
            aria-label={
              usesCombinedListeningUpload
                ? '选择 MP3 录音和 ASS 字幕文件'
                : '选择 ASS 字幕文件'
            }
            onClick={handleZoneClick}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleZoneClick()
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative mt-4 flex cursor-pointer flex-col items-center justify-center overflow-hidden border border-dashed px-5 py-7 outline-none transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2
          ${
            isDragging
              ? 'border-slate-500 bg-slate-50'
              : selectedFileNames.length > 0
                ? 'border-slate-400 bg-slate-50'
                : 'border-slate-300 bg-white hover:border-slate-500 hover:bg-slate-50'
          }`}>
            <input
              required
              type='file'
              name={usesCombinedListeningUpload ? 'mediaFiles' : 'assFiles'}
              accept={
                usesCombinedListeningUpload ? '.mp3,audio/mpeg,.ass' : '.ass'
              }
              multiple
              ref={fileInputRef}
              onChange={handleFileChange}
              className='hidden'
            />

            {selectedFileNames.length > 0 ? (
              <div className='animate-in zoom-in-95 text-center duration-300'>
                <div className='mb-1.5 text-base font-bold text-slate-900'>
                  {usesCombinedListeningUpload
                    ? `已选择 ${selectedFileNames.length} 个字幕、${audioUploadFileNames.length} 个录音`
                    : `字幕文件已就绪（${selectedFileNames.length}）`}
                </div>
                <div className='mb-3 max-h-28 overflow-y-auto text-left text-xs font-semibold text-slate-600 md:text-sm'>
                  {selectedFileNames.slice(0, 8).map((name, index) => (
                    <div key={`${name}-${index}`} className='truncate'>
                      字幕 · {name}
                    </div>
                  ))}
                  {usesCombinedListeningUpload &&
                    audioUploadFileNames.slice(0, 8).map((name, index) => (
                      <div key={`audio-${name}-${index}`} className='truncate'>
                        录音 · {name}
                      </div>
                    ))}
                  {selectedFileNames.length > 8 && (
                    <div className='mt-1 text-[11px] text-blue-600/70'>
                      还有 {selectedFileNames.length - 8} 个文件...
                    </div>
                  )}
                </div>
                <div className='text-xs font-medium text-slate-400'>
                  点击或拖拽可重新选择（支持批量）
                </div>
              </div>
            ) : (
              <div className='text-center'>
                <div
                  className={`mb-1 text-base font-bold transition-colors ${
                    isDragging ? 'text-slate-950' : 'text-slate-800'
                  }`}>
                  {isDragging
                    ? '松开即可加入文件'
                    : usesCombinedListeningUpload
                      ? '一次选择 MP3 和 ASS，系统按同名自动配对'
                      : '点击选择，或拖拽一个或多个 .ass 文件到这里'}
                </div>
                {usesCombinedListeningUpload ? (
                  <div className='text-xs font-bold text-gray-400 md:text-sm'>
                    支持同时选择多组文件并批量上传
                  </div>
                ) : !usesPracticeMaterialLayout ? (
                  <div className='text-xs font-bold text-gray-400 md:text-sm'>
                    支持批量导入 Aegisub 标准 .ass 字幕
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {isBatchAss && (
            <details className='mt-3 text-xs text-slate-500'>
              <summary className='cursor-pointer font-semibold text-slate-600'>
                查看批量匹配规则
              </summary>
              <p className='mt-2 leading-5'>
                {isMediaSubtitleVariant
                  ? '系统会按文件逐个创建字幕材料，只保存字幕文本。'
                  : '系统会按字幕文件名匹配同名录音，并自动续接排序。'}
              </p>
            </details>
          )}
        </section>

        {!isMediaSubtitleVariant &&
          !subtitleNoAudio &&
          !isBatchAss &&
          previewRows.length > 0 && (
            <AudioMatchPreview
              rows={previewRows}
              isBatch={isBatchAss}
              collectionLabel={selectedPaperLabel}
              destinationLabel={destinationName}
              overrides={assAudioOverrides}
              onOverride={(rowKey, value) =>
                setAssAudioOverrides(previous => ({
                  ...previous,
                  [rowKey]: value,
                }))
              }
            />
          )}

        {materialType === 'LISTENING' && selectedFileNames.length > 0 ? (
          <LessonQuestionsPanel
            key={selectedFileNames.join('|')}
            lessonId=''
            initialQuestions={[]}
            defaultListeningSectionNumber={defaultListeningSectionNumber || ''}
            appearance='import'
            draftMode
            language={defaultLanguage}
            defaultQuestionType={defaultQuestionType}
            defaultQuestionsPerMaterial={defaultQuestionsPerMaterial}
            toeicPartLabel={toeicPartLabel}
            listeningSectionLabel={listeningSectionLabel}
            batchFileNames={selectedFileNames}
          />
        ) : null}

        <button
          type='submit'
          disabled={status.type === 'loading'}
          className={`my-6 flex min-h-11 w-full items-center justify-center gap-3 px-5 py-2.5 text-sm font-bold transition-[background-color,color,opacity] md:ml-auto md:w-auto md:min-w-44
          ${
            status.type === 'loading'
              ? 'bg-gray-200 text-gray-500'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}>
          {status.type === 'loading'
            ? '正在导入...'
            : selectedFileNames.length > 1
              ? `导入 ${selectedFileNames.length} 条材料`
              : '确认导入'}
        </button>

        {status.message && (
          <div
            className={`border px-4 py-3 text-sm font-semibold ${
              uploadedListeningLessonId
                ? 'flex items-center justify-between gap-3'
                : ''
            }
            ${
              status.type === 'success'
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : status.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
            }`}>
            <span>{status.message}</span>
            {uploadedListeningLessonId ? (
              <a
                href={`/manage/listening/${uploadedListeningLessonId}`}
                className='shrink-0 text-xs font-bold text-blue-700 hover:text-blue-950'>
                材料详情 →
              </a>
            ) : (
              status.type === 'success' &&
              lastUpload &&
              lastUpload.lessonIds.length > 0 &&
              (isMediaSubtitleVariant ||
                !lastUpload.materialType ||
                lastUpload.materialType === 'LISTENING' ||
                lastUpload.materialType === 'SPEAKING') && (
                <div className='mt-2 flex flex-wrap gap-2'>
                  {lastUpload.lessonIds.map((id, i) => (
                    <a
                      key={id}
                      href={
                        isMediaSubtitleVariant
                          ? `/subtitles/${id}`
                          : lastUpload.materialType === 'SPEAKING'
                            ? `/manage/shadowing/${id}`
                            : `/manage/listening/${id}#questions`
                      }
                      className='inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors'>
                      {isMediaSubtitleVariant
                        ? lastUpload.lessonIds.length > 1
                          ? `查看字幕 ${i + 1}`
                          : '查看字幕详情'
                        : lastUpload.materialType === 'SPEAKING'
                          ? lastUpload.lessonIds.length > 1
                            ? `编辑跟读 ${i + 1}`
                            : '编辑跟读材料'
                          : lastUpload.lessonIds.length > 1
                            ? `编辑题目 ${i + 1}`
                            : '前往添加题目'}
                      <svg
                        className='w-3.5 h-3.5'
                        fill='none'
                        stroke='currentColor'
                        viewBox='0 0 24 24'>
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          strokeWidth={2.5}
                          d='M13 7l5 5m0 0l-5 5m5-5H6'
                        />
                      </svg>
                    </a>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </form>
    </>
  )
}
