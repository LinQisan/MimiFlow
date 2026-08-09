'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CollectionType, MaterialType } from '@prisma/client'
import { listPublicAudioFiles, uploadAssAndSaveData } from './action'
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
}




export default function UploadForm({
  levels,
  papers,
  variant = 'default',
}: Props) {
  const dialog = useDialog()
  const router = useRouter()

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
  } = useAudioUploadState(papers.length > 0)
  const isMediaSubtitleVariant = variant === 'media-subtitle'
  const [pastedAssSubtitle, setPastedAssSubtitle] = useState('')
  const [subtitleCopyState, setSubtitleCopyState] = useState<
    'idle' | 'copied' | 'error'
  >('idle')
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([])

  const isBatchAss = selectedFileNames.length > 1
  const pastedSubtitleText = useMemo(
    () => extractAssDialoguePlainText(pastedAssSubtitle),
    [pastedAssSubtitle],
  )
  const pastedSubtitleLineCount = pastedSubtitleText
    ? pastedSubtitleText.split('\n').filter(Boolean).length
    : 0

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
    if (isCollectionTypeAllowedForMaterial(materialType, selectedLevelId)) return
    const fallbackType = getDefaultCollectionTypeForMaterial(materialType)
    const fallback = levels.find(level => level.id === fallbackType) || levels[0]
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
      const resolvedType: MaterialType = 'LISTENING'
      const latest = findLatestLessonByMaterialType(targetPaper, resolvedType)
      if (targetPaper && targetPaper.lessons.length > 0) {
        setTitle(autoIncrementString(latest?.title || ''))
        setAudioFile(
          normalizeListeningAudioPath(
            autoIncrementString(latest?.audioFile || ''),
          ),
        )
      } else {
        setTitle('')
        setAudioFile('/audios/')
      }
      setMaterialType(resolvedType)
      setMaterialChapterName('')
    }
  }, [
    materialType,
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
    if (mode !== 'existing' || !selectedPaperId || materialType !== 'SPEAKING') return
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
      setMaterialType('LISTENING')
      setMaterialChapterName('')
    }
  }, [mode, setMaterialType, setMaterialChapterName])

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

  const {
    audioFolderMap,
    audioFolders,
    filesInSelectedFolder,
    siteAudioByStem,
    scopedAudioByStem,
  } = useAudioFileCatalog({
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
      setStatus({ type: 'error', message: '请选择要添加内容的集合。' })
      return
    }

    if (!isMediaSubtitleVariant && mode === 'new' && !selectedLevelId) {
      setStatus({ type: 'error', message: '请选择集合类型。' })
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
      (!audioInputRef.current?.files ||
        audioInputRef.current.files.length === 0)
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
      })
      setPickedAssFiles([])
      setSelectedFileNames([])
      if (fileInputRef.current) fileInputRef.current.value = ''

      setAudioUploadFileNames([])
      setAssAudioOverrides({})

      if (mode === 'new') {
        setPaperName('')
      }

      if (uploadedMaterialType === 'LISTENING' && uploadedLessonIds.length === 1) {
        router.push(`/manage/listening/${uploadedLessonIds[0]}#questions`)
      } else {
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
      const droppedFiles = Array.from(files).filter(file =>
        file.name.toLowerCase().endsWith('.ass'),
      )

      if (droppedFiles.length === 0) {
        void dialog.alert('只能上传 .ass 格式的字幕文件。')
        return
      }

      setSelectedFileNames(droppedFiles.map(file => file.name))
      setPickedAssFiles(
        droppedFiles.map(file => ({ name: file.name, size: file.size })),
      )
      syncFilesToInput(fileInputRef.current, droppedFiles)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    setSelectedFileNames(files.map(file => file.name))
    setPickedAssFiles(files.map(file => ({ name: file.name, size: file.size })))
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
        '未选择集合'
      : paperName || '新建集合'

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
    <form
      onSubmit={handleSubmit}
      className='animate-in fade-in mx-auto flex w-full max-w-4xl flex-col gap-4'>
      <input
        type='hidden'
        name='uploadMode'
        value={isMediaSubtitleVariant ? 'media' : mode}
      />
      <input type='hidden' name='audioSourceType' value={audioSourceType} />
      <input
        type='hidden'
        name='addQuestions'
        value={materialType === 'LISTENING' ? 'yes' : addQuestions ? 'yes' : 'no'}
      />
      <input
        type='hidden'
        name='materialType'
        value={isMediaSubtitleVariant ? 'MEDIA_SUBTITLE' : materialType}
      />
      <input
        type='hidden'
        name='subtitleNoAudio'
        value={isMediaSubtitleVariant ? 'yes' : 'no'}
      />
      <input type='hidden' name='subtitleSourceType' value={subtitleSourceType} />
      <input type='hidden' name='subtitleWorkTitle' value={subtitleWorkTitle} />
      <input type='hidden' name='subtitleSeason' value={subtitleSeason} />
      <input type='hidden' name='subtitleEpisode' value={subtitleEpisode} />
      {isMediaSubtitleVariant && (
        <input type='hidden' name='materialSource' value={subtitleWorkTitle} />
      )}
      <input
        type='hidden'
        name='assAudioOverrides'
        value={JSON.stringify(assAudioOverrides)}
      />

      {!isMediaSubtitleVariant && (
        <fieldset className='relative overflow-visible rounded-xl border border-slate-200 bg-white p-4 md:p-6'>
        <legend className='px-1 text-base font-bold text-slate-900 md:text-lg'>
          <span className='mr-2 text-blue-600'>1</span>
          选择归属
        </legend>

        <div className='mb-4 mt-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1'>
          <label
            className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors
              ${
                mode === 'existing'
                  ? 'bg-white text-slate-900 shadow-sm'
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
            添加到已有集合
          </label>

          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors
              ${
                mode === 'new'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}>
            <input
              type='radio'
              className='hidden'
              checked={mode === 'new'}
              onChange={() => setMode('new')}
            />
            新建集合并录入
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
                  ? '继续添加其他集合'
                  : '请选择要追加内容的集合'
              }
              recentKey='manage.upload.paper.recent'
            />
            <p className='text-xs font-medium text-slate-500'>
              当前仅显示正式试卷。普通集合和收藏夹不用于承载听力源材料。
            </p>
            {selectedPaperIds.length > 0 && (
              <div>
                <p className='mb-2 text-xs font-semibold text-slate-500'>
                  已选择 {selectedPaperIds.length} 个集合；第一个作为主要归属。
                </p>
                <div className='flex flex-wrap gap-2'>
                  {selectedPaperIds.map((paperId, index) => {
                    const option = paperOptions.find(
                      item => item.value === paperId,
                    )
                    return (
                      <span
                        key={paperId}
                        className='inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800'>
                        {index === 0 ? '主要 · ' : ''}
                        {option?.searchText || option?.label || '未知集合'}
                        <button
                          type='button'
                          onClick={() => removeSelectedPaper(paperId)}
                          aria-label={`移除 ${option?.label || '集合'}`}
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
                placeholder='集合名称（例：2025-07 N1 真题）'
                className='flex-[2] border border-gray-200 bg-gray-50 p-4 text-sm font-bold outline-none transition-colors focus:ring-2 focus:ring-blue-400'
              />

              <div className='flex-[1]'>
                <input type='hidden' name='collectionType' value={selectedLevelId} />
                <SearchableDropdown
                  options={levelOptions}
                  value={selectedLevelId}
                  onChange={setSelectedLevelId}
                  placeholder='选择集合用途'
                />
                <p className='mt-2 text-xs text-gray-500'>
                  用途决定内容在练习页或资料库中的位置。
                </p>
              </div>
            </div>
          </div>
        )}
        </fieldset>
      )}

      <fieldset className='relative overflow-visible rounded-xl border border-slate-200 bg-white p-4 md:p-6'>

        <div className='mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
          <legend className='text-base font-bold text-slate-900 md:text-lg'>
            <span className='mr-2 text-blue-600'>
              {isMediaSubtitleVariant ? '1' : '2'}
            </span>
            {isMediaSubtitleVariant ? '设置字幕归属' : '准备材料'}
          </legend>
          {mode === 'existing' && selectedPaperId && (
            <span className='rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700'>
              已沿用集合上一条记录
            </span>
          )}
        </div>

        <div className='mb-4'>
          <label className='mb-1.5 block text-sm font-semibold text-slate-700'>
            {isBatchAss
              ? '标题前缀（可选）'
              : isMediaSubtitleVariant
                ? '字幕标题（可选）'
                : '标题'}
          </label>
          <input
            name='title'
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={
              isBatchAss
                ? '例：N1 听力（留空则直接用字幕文件名）'
                : isMediaSubtitleVariant
                  ? '留空则使用字幕文件名'
                : '例：问题 1-01（可留空，不填则用字幕文件名）'
            }
            className='w-full border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
          />
          {isBatchAss && !title.trim() && (
            <p className='mt-1 text-xs font-semibold text-amber-600'>
              未填写标题前缀：将直接使用每个字幕文件名作为标题。
            </p>
          )}
        </div>

        {isBatchAss && (
          <div className='mb-4 border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-800 md:mb-5'>
            <p className='font-black'>批量录入说明</p>
            <p className='mt-1'>
              已进入批量模式。只需选择目标集合并上传多个字幕，系统会自动按顺序创建多条语料并分配排序。
            </p>
          </div>
        )}

        <div>
          {isMediaSubtitleVariant && (
            <div className='mb-4 border border-slate-200 bg-slate-50 p-3 md:p-4'>
              <p className='mb-2 text-[11px] font-black uppercase tracking-wider text-slate-500'>
                字幕归属
              </p>
              <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                <CustomSelect
                  value={subtitleSourceType}
                  onChange={e =>
                    setSubtitleSourceType(e.currentTarget.value as 'MOVIE' | 'TV')
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
                  <p className='text-[11px] font-black uppercase tracking-wider text-emerald-700'>
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
                  className={`border px-3 py-2 text-xs font-black transition ${
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
                placeholder={'Dialogue: 0,0:01:52.66,0:01:55.24,Default,,0,0,0,,(鹿谷門実) コナンくん 紅茶でいいかい？\nDialogue: 0,0:01:55.32,0:01:58.33,Default,,0,0,0,,(江南孝明) あっ すいません ありがとうございます'}
                className='custom-scrollbar min-h-[120px] w-full resize-y border border-gray-200 bg-slate-50 p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-300'
              />

              <div className='mt-3 border border-slate-200 bg-slate-50 p-3'>
                <div className='mb-2 flex items-center justify-between gap-2'>
                  <p className='text-xs font-black text-slate-700'>提取结果</p>
                  <span className='text-xs font-bold text-slate-500'>
                    {pastedSubtitleLineCount} 行
                  </span>
                </div>
                <pre className='custom-scrollbar min-h-[84px] max-h-56 w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words border border-slate-200 bg-white p-3 text-sm leading-7 text-slate-800 [overflow-wrap:anywhere]'>
                  {pastedSubtitleText || '粘贴字幕后，这里会显示可复制的文本内容。'}
                </pre>
              </div>
              </div>
            </details>
          )}

          {!isMediaSubtitleVariant && (
            <>
              <label className='mb-1.5 block text-sm font-semibold text-slate-700'>
                音频来源
              </label>

              <div className='mb-3 grid grid-cols-1 gap-2 md:grid-cols-3'>
            <button
              type='button'
              onClick={() => setAudioSourceType('manual')}
              disabled={subtitleNoAudio}
              className={`border px-3 py-2.5 text-sm font-bold transition ${
                audioSourceType === 'manual'
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              } ${subtitleNoAudio ? 'cursor-not-allowed opacity-50' : ''}`}>
              手动填写路径
            </button>

            <button
              type='button'
              onClick={() => setAudioSourceType('existing')}
              disabled={subtitleNoAudio}
              className={`border px-3 py-2.5 text-sm font-bold transition ${
                audioSourceType === 'existing'
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              } ${subtitleNoAudio ? 'cursor-not-allowed opacity-50' : ''}`}>
              浏览站内录音
            </button>

            <button
              type='button'
              onClick={() => setAudioSourceType('upload')}
              disabled={subtitleNoAudio}
              className={`border px-3 py-2.5 text-sm font-bold transition ${
                audioSourceType === 'upload'
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              } ${subtitleNoAudio ? 'cursor-not-allowed opacity-50' : ''}`}>
              上传并保存录音
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
            (audioSourceType === 'manual' || audioSourceType === 'existing') && (
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
                          audioListLoading ? '加载文件夹中...' : '选择文件夹'
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
                            audioListLoading ? '读取录音中...' : '选择录音文件'
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

                  <p className='text-xs font-medium text-gray-500'>
                    共 {audioFolders.length} 个文件夹，当前文件夹{' '}
                    {filesInSelectedFolder.length} 个录音
                  </p>
                </div>
              )}

              <p className='mt-1 text-xs font-medium text-gray-500'>
                当前路径：{audioFile || '未设置'}
              </p>
            </>
            )}

          {!isMediaSubtitleVariant &&
            !subtitleNoAudio &&
            audioSourceType === 'upload' && (
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
                  const list = e.target.files ? Array.from(e.target.files) : []
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

              <p className='mt-2 text-xs font-medium text-gray-500'>
                提交后会自动保存到
                `/public/audios/集合名`。批量模式会按同名优先配对，未命中时尝试站内同名音频，并自动分配语料顺序。
              </p>
            </div>
          )}
        </div>

        {isMediaSubtitleVariant ? (
          <details className='group mt-4 rounded-lg border border-slate-200 bg-slate-50'>
            <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-700 marker:content-none'>
              补充检索信息
              <span className='text-xs font-normal text-slate-400 group-open:hidden'>
                可选
              </span>
              <span className='hidden text-xs font-normal text-slate-400 group-open:inline'>
                收起
              </span>
            </summary>
            <div className='border-t border-slate-200 p-3 md:p-4'>
            <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
              <input
                name='materialLanguage'
                value={materialLanguage}
                onChange={e => setMaterialLanguage(e.target.value)}
                placeholder='字幕语言（例：ja / en / zh）'
                className='w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-300'
              />
              <input
                name='materialTags'
                value={materialTags}
                onChange={e => setMaterialTags(e.target.value)}
                placeholder='题材标签（逗号分隔，如：悬疑, 校园, 爱情）'
                className='w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-300'
              />
              <input
                name='materialDifficulty'
                value={materialDifficulty}
                onChange={e => setMaterialDifficulty(e.target.value)}
                placeholder='台词难度（例：中级 / 高级）'
                className='w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-300'
              />
            </div>

            <textarea
              name='materialDescription'
              value={materialDescription}
              onChange={e => setMaterialDescription(e.target.value)}
              placeholder='场景说明（可选，例如：机场安检、商务会议）'
              className='custom-scrollbar mt-2 min-h-[80px] w-full resize-y border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-300'
            />
            <textarea
              name='materialTranscript'
              value={materialTranscript}
              onChange={e => setMaterialTranscript(e.target.value)}
              placeholder='全文文本（可选，便于检索）'
              className='custom-scrollbar mt-2 min-h-[100px] w-full resize-y border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-emerald-300'
            />
            </div>
          </details>
        ) : (
          <details className='group mt-4 rounded-lg border border-slate-200 bg-slate-50'>
            <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-700 marker:content-none'>
              补充来源、难度与检索信息
              <span className='text-xs font-normal text-slate-400 group-open:hidden'>
                可选
              </span>
              <span className='hidden text-xs font-normal text-slate-400 group-open:inline'>
                收起
              </span>
            </summary>
            <div className='border-t border-slate-200 p-3 md:p-4'>
            {materialType === 'SPEAKING' && (
              <input
                name='materialChapterName'
                value={materialChapterName}
                onChange={e => setMaterialChapterName(e.target.value)}
                placeholder='跟读章节名（例：Section 01 / 会話 1）'
                className='mb-2 w-full border border-indigo-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-indigo-400'
              />
            )}
            <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
              <input
                name='materialSource'
                value={materialSource}
                onChange={e => setMaterialSource(e.target.value)}
                placeholder='来源（例：JLPT N1 2026-07）'
                className='w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
              />
              <input
                name='materialLanguage'
                value={materialLanguage}
                onChange={e => setMaterialLanguage(e.target.value)}
                placeholder='语言（例：ja-JP / en-US）'
                className='w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
              />
              <input
                name='materialDifficulty'
                value={materialDifficulty}
                onChange={e => setMaterialDifficulty(e.target.value)}
                placeholder='难度（例：N1 / Advanced）'
                className='w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
              />
              <input
                name='materialTags'
                value={materialTags}
                onChange={e => setMaterialTags(e.target.value)}
                placeholder='标签（逗号分隔，如：交通, 机场, 会话）'
                className='w-full border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
              />
            </div>

            <textarea
              name='materialDescription'
              value={materialDescription}
              onChange={e => setMaterialDescription(e.target.value)}
              placeholder='材料描述（可选）'
              className='custom-scrollbar mt-2 min-h-[80px] w-full resize-y border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
            />
            <textarea
              name='materialTranscript'
              value={materialTranscript}
              onChange={e => setMaterialTranscript(e.target.value)}
              placeholder='全文文本（可选，便于检索与后续处理）'
              className='custom-scrollbar mt-2 min-h-[100px] w-full resize-y border border-gray-200 bg-white p-3 text-sm font-medium text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-blue-400'
            />
            </div>
          </details>
        )}
      </fieldset>

      <section className='rounded-xl border border-slate-200 bg-white p-4 md:p-6'>
        <h3 className='text-base font-bold text-slate-900 md:text-lg'>
          <span className='mr-2 text-blue-600'>
            {isMediaSubtitleVariant ? '2' : '3'}
          </span>
          上传字幕并确认
        </h3>
        <p className='mb-4 mt-1 text-sm text-slate-500'>
          一个字幕创建一条材料；选择多个文件会自动进入批量模式。
        </p>
        <div
          role='button'
          tabIndex={0}
          aria-label='选择 ASS 字幕文件'
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
          className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 p-7 outline-none transition-[background-color,border-color,color,transform] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:p-10
          ${
            isDragging
              ? 'scale-[1.02] border-blue-400 bg-blue-50/80'
              : selectedFileNames.length > 0
                ? 'border-blue-400 bg-blue-50/80'
                : 'border-dashed border-gray-300 bg-white hover:border-blue-300 hover:bg-gray-50'
          }`}>
        <input
          required
          type='file'
          name='assFiles'
          accept='.ass'
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
          className='hidden'
        />

        {selectedFileNames.length > 0 ? (
          <div className='animate-in zoom-in-95 text-center duration-300'>
            <div className='mb-1.5 text-lg font-black text-blue-700 md:text-xl'>
              字幕文件已就绪（{selectedFileNames.length}）
            </div>
            <div className='mb-4 max-h-28 overflow-y-auto border border-blue-200 bg-white/70 p-2 text-left text-xs font-bold text-blue-700/80 md:text-sm'>
              {selectedFileNames.slice(0, 8).map((name, index) => (
                <div key={`${name}-${index}`} className='truncate'>
                  {name}
                </div>
              ))}
              {selectedFileNames.length > 8 && (
                <div className='mt-1 text-[11px] text-blue-600/70'>
                  还有 {selectedFileNames.length - 8} 个文件...
                </div>
              )}
            </div>
            <div className='inline-block rounded-full bg-blue-100/50 px-3 py-1 text-xs font-bold text-blue-500/60'>
              点击或拖拽可重新选择（支持批量）
            </div>
          </div>
        ) : (
          <div className='text-center'>
            <div
              className={`mb-2 text-base font-black transition-colors md:text-xl ${
                isDragging ? 'text-blue-600' : 'text-gray-800'
              }`}>
              {isDragging
                ? '松开即可放入字幕文件'
                : '点击选择，或拖拽一个或多个 .ass 文件到这里'}
            </div>
            <div className='text-xs font-bold text-gray-400 md:text-sm'>
              支持批量导入 Aegisub 标准 .ass 字幕
            </div>
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
                : '系统会按字幕文件名匹配同名录音，并自动续接排序；找不到匹配时可在下方预览中手动调整。'}
            </p>
          </details>
        )}
      </section>

      {!isMediaSubtitleVariant && !subtitleNoAudio && previewRows.length > 0 && (
        <AudioMatchPreview
          rows={previewRows}
          isBatch={isBatchAss}
          collectionLabel={selectedPaperLabel}
          overrides={assAudioOverrides}
          onOverride={(rowKey, value) =>
            setAssAudioOverrides(previous => ({
              ...previous,
              [rowKey]: value,
            }))
          }
        />
      )}

      {!isMediaSubtitleVariant && (
        <div className='rounded-xl border border-blue-200 bg-blue-50 px-4 py-3.5 md:px-5'>
          <p className='text-sm font-bold text-blue-900'>
            听力材料必须配套题目
          </p>
          <p className='mt-1 text-xs font-semibold text-blue-700'>
            单条导入后会直接进入题目编辑；批量导入后需逐条完成题目。
          </p>
        </div>
      )}

      <button
        type='submit'
        disabled={status.type === 'loading'}
        className={`flex min-h-12 w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-base font-bold transition-[background-color,border-color,color,transform,opacity] active:scale-[0.99]
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
          className={`border px-4 py-3 text-sm font-semibold
            ${
              status.type === 'success'
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : status.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
            }`}>
          {status.message}
          {status.type === 'success' &&
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
                  <svg className='w-3.5 h-3.5' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2.5} d='M13 7l5 5m0 0l-5 5m5-5H6' />
                  </svg>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </form>
  )
}
