'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { listPublicAudioFiles, uploadAssAndSaveData } from './action'
import { useDialog } from '@/context/DialogContext'

// ==========================================
// 🌟 核心：手写的高级自定义下拉菜单组件
// ==========================================
function CustomDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  placeholder: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 点击外部自动关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedLabel =
    options.find(o => o.value === value)?.label || placeholder

  return (
    <div className='relative w-full' ref={ref}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full p-4 bg-gray-50 border rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-400 outline-none transition-all cursor-pointer flex justify-between items-center
          ${isOpen ? 'border-indigo-400 ring-2 ring-indigo-400/20 bg-white' : 'border-gray-200 hover:bg-white'}
        `}>
        <span className={value ? 'text-gray-800 truncate pr-4' : 'text-gray-400'}>
          {selectedLabel}
        </span>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`}
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'>
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2.5}
            d='M19 9l-7 7-7-7'
          />
        </svg>
      </div>

      {isOpen && (
        <div className='absolute z-[80] mt-2 w-full max-h-[26rem] overflow-y-auto rounded-2xl border border-gray-100 bg-white py-2 shadow-xl custom-scrollbar animate-in fade-in slide-in-from-top-2'>
          {options.length === 0 ? (
            <div className='px-4 py-3 text-sm text-gray-400 text-center'>
              暂无选项
            </div>
          ) : (
            options.map(opt => (
              <div
                key={opt.value}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`px-4 py-3 text-sm font-bold cursor-pointer transition-colors truncate
                  ${value === opt.value ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50 hover:text-indigo-600'}
                `}>
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

type Props = {
  levels: { id: string; title: string }[]
  categories: {
    id: string
    name: string
    level: { title: string }
    lessons: {
      title: string
      audioFile: string
    }[]
  }[]
}

const autoIncrementString = (str: string) => {
  if (!str) return ''
  return str.replace(/(\d+)(?!.*\d)/, match => {
    const num = parseInt(match, 10) + 1
    return num.toString().padStart(match.length, '0')
  })
}

type PickedFileMeta = {
  name: string
  size: number
}

const getStem = (name: string) =>
  name
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '')

const buildPickedKey = (file: PickedFileMeta) => `${file.name}::${file.size}`

const deriveAudioPathFromDir = (audioPath: string, assName: string) => {
  const trimmed = audioPath.trim()
  if (!trimmed.endsWith('/')) return trimmed
  const baseName = assName.replace(/\.[^.]+$/, '')
  return `${trimmed}${baseName}.mp3`
}

export default function UploadForm({ levels, categories }: Props) {
  const dialog = useDialog()
  const router = useRouter()

  const [mode, setMode] = useState<'existing' | 'new'>(
    categories.length > 0 ? 'existing' : 'new',
  )
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedLevelId, setSelectedLevelId] = useState('') // 🌟 新增：记录大专区的选择

  const [status, setStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error'
    message: string
  }>({ type: 'idle', message: '' })

  const [title, setTitle] = useState('')
  const [audioFile, setAudioFile] = useState('')
  const [audioSourceType, setAudioSourceType] = useState<
    'manual' | 'existing' | 'upload'
  >('manual')
  const [existingAudioFiles, setExistingAudioFiles] = useState<string[]>([])
  const [selectedAudioFolder, setSelectedAudioFolder] = useState('')
  const [audioListLoading, setAudioListLoading] = useState(false)
  const [audioUploadFileNames, setAudioUploadFileNames] = useState<string[]>([])
  const [categoryName, setCategoryName] = useState('')
  const [description, setDescription] = useState('')

  const [isDragging, setIsDragging] = useState(false)
  const [isAudioDragging, setIsAudioDragging] = useState(false)
  const [pickedAssFiles, setPickedAssFiles] = useState<PickedFileMeta[]>([])
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([])
  const [assAudioOverrides, setAssAudioOverrides] = useState<
    Record<string, string>
  >({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const isBatchAss = selectedFileNames.length > 1

  useEffect(() => {
    if (mode === 'existing' && selectedCategoryId) {
      const targetCategory = categories.find(c => c.id === selectedCategoryId)
      if (targetCategory && targetCategory.lessons.length > 0) {
        const latest = targetCategory.lessons[0]
        setTitle(autoIncrementString(latest.title))
        setAudioFile(autoIncrementString(latest.audioFile))
      } else {
        setTitle('')
        setAudioFile('/audios/')
      }
    }
  }, [mode, selectedCategoryId, categories])

  useEffect(() => {
    const loadAudioFiles = async () => {
      setAudioListLoading(true)
      const res = await listPublicAudioFiles()
      if (res.success) setExistingAudioFiles(res.files)
      setAudioListLoading(false)
    }
    void loadAudioFiles()
  }, [])

  const audioFolderMap = useMemo(() => {
    const folderMap = new Map<string, string[]>()
    for (const filePath of existingAudioFiles) {
      const normalized = filePath.startsWith('/audios/')
        ? filePath.slice('/audios/'.length)
        : filePath.replace(/^\/+/, '')
      const segments = normalized.split('/').filter(Boolean)
      const folder =
        segments.length > 1 ? segments.slice(0, -1).join('/') : '(根目录)'
      if (!folderMap.has(folder)) folderMap.set(folder, [])
      folderMap.get(folder)?.push(filePath)
    }
    const sortedEntries = [...folderMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([folder, files]) => [folder, files.sort((a, b) => a.localeCompare(b))] as const)
    return new Map(sortedEntries)
  }, [existingAudioFiles])

  const audioFolders = useMemo(
    () => [...audioFolderMap.keys()],
    [audioFolderMap],
  )
  const filesInSelectedFolder = useMemo(
    () => audioFolderMap.get(selectedAudioFolder) || [],
    [audioFolderMap, selectedAudioFolder],
  )
  const siteAudioByStem = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const audioPath of existingAudioFiles) {
      const stem = getStem(audioPath.split('/').pop() || audioPath)
      const bucket = map.get(stem) || []
      bucket.push(audioPath)
      map.set(stem, bucket)
    }
    return map
  }, [existingAudioFiles])
  const scopedAudioByStem = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const audioPath of filesInSelectedFolder) {
      const stem = getStem(audioPath.split('/').pop() || audioPath)
      const bucket = map.get(stem) || []
      bucket.push(audioPath)
      map.set(stem, bucket)
    }
    return map
  }, [filesInSelectedFolder])
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

  const previewRows = useMemo(() => {
    return pickedAssFiles.map(file => {
      const key = buildPickedKey(file)
      const stem = getStem(file.name)
      const uploadCandidates = uploadedAudioByStem.get(stem) || []
      const scopedCandidates = scopedAudioByStem.get(stem) || []
      const siteCandidates = siteAudioByStem.get(stem) || []
      const fallbackPath = deriveAudioPathFromDir(audioFile, file.name)

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
  }, [previewRows])

  useEffect(() => {
    if (audioSourceType !== 'existing') return
    if (audioFolders.length === 0) {
      setSelectedAudioFolder('')
      return
    }
    if (!selectedAudioFolder || !audioFolderMap.has(selectedAudioFolder)) {
      setSelectedAudioFolder(audioFolders[0])
    }
  }, [audioFolderMap, audioFolders, audioSourceType, selectedAudioFolder])

  useEffect(() => {
    if (audioSourceType !== 'existing') return
    if (filesInSelectedFolder.length === 0) {
      setAudioFile('')
      return
    }
    if (!filesInSelectedFolder.includes(audioFile)) {
      setAudioFile(filesInSelectedFolder[0])
    }
  }, [audioFile, audioSourceType, filesInSelectedFolder])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // 🌟 手动拦截：因为我们把原生的 select 换成了自定义组件（隐藏的 input 不会自动触发浏览器的必填提示）
    if (mode === 'existing' && !selectedCategoryId) {
      setStatus({ type: 'error', message: '请选择要添加内容的分类。' })
      return
    }
    if (mode === 'new' && !selectedLevelId) {
      setStatus({ type: 'error', message: '请选择所属等级。' })
      return
    }
    if (!fileInputRef.current?.files?.length) {
      setStatus({ type: 'error', message: '请先选择或拖拽上传至少一个 .ass 文件。' })
      return
    }
    if (
      (audioSourceType === 'manual' || audioSourceType === 'existing') &&
      !audioFile.trim()
    ) {
      setStatus({ type: 'error', message: '请先设置音频路径。' })
      return
    }
    if (
      audioSourceType === 'upload' &&
      (!audioInputRef.current?.files || audioInputRef.current.files.length === 0)
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
      setPickedAssFiles([])
      setSelectedFileNames([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      setAudioUploadFileNames([])
      setAssAudioOverrides({})
      if (mode === 'new') {
        setCategoryName('')
        setDescription('')
      }
      router.refresh()
    }
  }

  // ================= 拖拽逻辑 =================
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
      if (fileInputRef.current) {
        const dataTransfer = new DataTransfer()
        droppedFiles.forEach(file => dataTransfer.items.add(file))
        fileInputRef.current.files = dataTransfer.files
      }
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
    /(\.mp3|\.m4a|\.wav|\.ogg|\.aac|\.flac|\.webm)$/i.test(file.name) ||
    file.type.startsWith('audio/')

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
      void dialog.alert('仅支持音频文件（mp3/m4a/wav/ogg/aac/flac/webm）。')
      return
    }
    setAudioUploadFileNames(droppedList.map(file => file.name))
    if (audioInputRef.current) {
      const dataTransfer = new DataTransfer()
      droppedList.forEach(file => dataTransfer.items.add(file))
      audioInputRef.current.files = dataTransfer.files
    }
  }

  // 构建下拉菜单的数据选项
  const categoryOptions = categories.map(c => ({
    value: c.id,
    label: `[${c.level.title}] ${c.name}`,
  }))
  const levelOptions = levels.map(l => ({ value: l.id, label: l.title }))
  const selectedCategoryLabel =
    mode === 'existing'
      ? categoryOptions.find(item => item.value === selectedCategoryId)?.label || '未选择分类'
      : categoryName || '新建分类'

  return (
    <form
      onSubmit={handleSubmit}
      className='mx-auto flex w-full max-w-5xl flex-col gap-4 pb-16 md:gap-6 md:pb-20 animate-in fade-in'>
      <input type='hidden' name='uploadMode' value={mode} />
      <input type='hidden' name='audioSourceType' value={audioSourceType} />
      <input
        type='hidden'
        name='assAudioOverrides'
        value={JSON.stringify(assAudioOverrides)}
      />

      {/* ================= 1. 分类归属 ================= */}
      <fieldset className='relative overflow-visible rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-8'>
        <div className='absolute top-0 left-0 w-2 h-full bg-indigo-500 rounded-l-3xl'></div>
        <legend className='mb-4 flex items-center gap-2 px-2 text-lg font-black tracking-wide text-gray-800 md:mb-6 md:px-4 md:text-xl'>
          分类归属
        </legend>

        <div className='mb-5 grid grid-cols-1 gap-2 rounded-2xl border border-gray-100/50 bg-gray-50/80 p-2 sm:grid-cols-2 md:mb-6 md:gap-4 md:p-2.5'>
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all md:py-3 ${mode === 'existing' ? 'border border-gray-200/50 bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-gray-100'} ${categories.length === 0 ? 'cursor-not-allowed opacity-50' : ''}`}>
            <input
              type='radio'
              className='hidden'
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
              disabled={categories.length === 0}
            />
            添加到已有分类
          </label>
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all md:py-3 ${mode === 'new' ? 'border border-gray-200/50 bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
            <input
              type='radio'
              className='hidden'
              checked={mode === 'new'}
              onChange={() => setMode('new')}
            />
            新建分类并录入
          </label>
        </div>

        {mode === 'existing' ? (
          <div>
            {/* 🌟 使用自定义下拉菜单 */}
            <input type='hidden' name='categoryId' value={selectedCategoryId} />
            <CustomDropdown
              options={categoryOptions}
              value={selectedCategoryId}
              onChange={setSelectedCategoryId}
              placeholder='请选择要追加内容的分类'
            />
          </div>
        ) : (
          <div className='flex flex-col gap-4 md:gap-5'>
            <div className='z-20 flex flex-col gap-4 md:flex-row md:gap-5'>
              <input
                required
                name='categoryName'
                value={categoryName}
                onChange={e => setCategoryName(e.target.value)}
                placeholder='分类名称（例：N1 听力 2023-07）'
                className='flex-[2] p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-400 outline-none transition-all'
              />

              {/* 🌟 使用自定义下拉菜单 */}
              <div className='flex-[1]'>
                <input type='hidden' name='level' value={selectedLevelId} />
                <CustomDropdown
                  options={levelOptions}
                  value={selectedLevelId}
                  onChange={setSelectedLevelId}
                  placeholder='选择所属等级'
                />
              </div>
            </div>
            <textarea
              name='description'
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder='分类说明（可选）'
              className='w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-400 outline-none transition-all min-h-[100px] resize-y custom-scrollbar'
            />
          </div>
        )}
      </fieldset>

      {/* ================= 2. 题目信息 (带智能预填) ================= */}
      <fieldset className='relative overflow-visible rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-8'>
        <div className='absolute top-0 left-0 w-2 h-full bg-emerald-400 rounded-l-3xl'></div>
        <div className='mb-4 flex flex-col gap-2 px-2 md:mb-6 md:flex-row md:items-center md:justify-between md:px-4'>
          <legend className='flex items-center gap-2 text-lg font-black tracking-wide text-gray-800 md:text-xl'>
            语料基本信息
          </legend>
          {mode === 'existing' && selectedCategoryId && (
            <span className='text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-1.5'>
              <span className='animate-pulse'>✨</span> 已根据上条记录自动填充
            </span>
          )}
        </div>

        <div className='mb-4 pl-1 md:mb-5 md:pl-2'>
          <div className='w-full'>
            <label className='text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5 block'>
              {isBatchAss ? '标题前缀（可选）' : '标题'}
            </label>
            <input
              name='title'
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={
                isBatchAss
                  ? '例：N1 听力（留空则直接用字幕文件名）'
                : '例：问题 1-01（可留空，不填则用字幕文件名）'
              }
              className='w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-emerald-400 outline-none transition-all'
            />
            {isBatchAss && !title.trim() && (
              <p className='mt-1 text-xs font-semibold text-amber-600'>
                未填写标题前缀：将直接使用每个字幕文件名作为标题。
              </p>
            )}
          </div>
        </div>

        {isBatchAss && (
          <div className='mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-800 md:mb-5'>
            <p className='font-black'>批量录入说明</p>
            <p className='mt-1'>
              已进入批量模式。只需选择目标分类并上传多个字幕，系统会自动按顺序创建多条听力语料并分配排序。
            </p>
          </div>
        )}

        <div className='pl-1 md:pl-2'>
          <label className='mb-1.5 block text-[10px] font-black uppercase tracking-wider text-gray-400'>
            音频来源
          </label>
          <div className='mb-3 grid grid-cols-1 gap-2 md:grid-cols-3'>
            <button
              type='button'
              onClick={() => setAudioSourceType('manual')}
              className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                audioSourceType === 'manual'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              手动填写路径
            </button>
            <button
              type='button'
              onClick={() => setAudioSourceType('existing')}
              className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                audioSourceType === 'existing'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              浏览站内录音
            </button>
            <button
              type='button'
              onClick={() => setAudioSourceType('upload')}
              className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                audioSourceType === 'upload'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              上传并保存录音
            </button>
          </div>

          {(audioSourceType === 'manual' || audioSourceType === 'existing') && (
            <>
              {audioSourceType === 'manual' ? (
                <input
                  name='audioFile'
                  value={audioFile}
                  onChange={e => setAudioFile(e.target.value)}
                  placeholder='例：/audios/Shadowing/N2-01.mp3'
                  className='w-full rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm font-bold text-gray-800 outline-none transition-all focus:ring-2 focus:ring-emerald-400'
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
                      <CustomDropdown
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
                      <div className='md:col-span-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs font-medium text-emerald-700'>
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
                        <CustomDropdown
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
                        <input type='hidden' name='audioFile' value={audioFile} />
                      </div>
                    )}
                  </div>
                  <p className='text-xs font-medium text-gray-500'>
                    共 {audioFolders.length} 个文件夹，
                    当前文件夹 {filesInSelectedFolder.length} 个录音
                  </p>
                </div>
              )}
              <p className='mt-1 text-xs font-medium text-gray-500'>
                当前路径：{audioFile || '未设置'}
              </p>
            </>
          )}

          {audioSourceType === 'upload' && (
            <div
              onDragOver={handleAudioDragOver}
              onDragLeave={handleAudioDragLeave}
              onDrop={handleAudioDrop}
              className={`rounded-2xl border p-3 transition ${
                isAudioDragging
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-gray-200 bg-gray-50'
              }`}>
              <input
                ref={audioInputRef}
                type='file'
                name='audioUploadFiles'
                accept='audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm'
                multiple={isBatchAss}
                onChange={e => {
                  const list = e.target.files ? Array.from(e.target.files) : []
                  if (list.length === 0) {
                    setAudioUploadFileNames([])
                    return
                  }
                  if (!list.every(isSupportedAudioFile)) {
                    void dialog.alert('仅支持音频文件（mp3/m4a/wav/ogg/aac/flac/webm）。')
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
                  className='rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50'>
                  选择录音文件
                </button>
                <span className='text-xs font-medium text-gray-500'>
                  {audioUploadFileNames.length > 0
                    ? `已选择 ${audioUploadFileNames.length} 个录音文件`
                    : isAudioDragging
                      ? '松开即可上传录音'
                      : isBatchAss
                        ? '点击选择或拖拽多个录音文件（将按同名优先配对）'
                        : '点击选择或拖拽录音文件（mp3/m4a/wav/ogg/aac/flac/webm）'}
                </span>
              </div>
              {audioUploadFileNames.length > 1 && (
                <div className='mt-2 max-h-24 overflow-y-auto rounded-xl border border-emerald-100 bg-white/70 p-2 text-xs text-emerald-700'>
                  {audioUploadFileNames.slice(0, 10).map((name, index) => (
                    <div key={`${name}-${index}`} className='truncate'>
                      {name}
                    </div>
                  ))}
                  {audioUploadFileNames.length > 10 && (
                    <div className='mt-1 text-[11px] text-emerald-600'>
                      还有 {audioUploadFileNames.length - 10} 个文件...
                    </div>
                  )}
                </div>
              )}
              <p className='mt-2 text-xs font-medium text-gray-500'>
                提交后会自动保存到 `/public/audios/uploads`。批量模式会按同名优先配对，未命中时尝试站内同名音频，并自动分配语料顺序。
              </p>
            </div>
          )}
        </div>
      </fieldset>

      {/* ================= 3. 拖拽上传区 ================= */}
      <div
        onClick={handleZoneClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border-2 p-8 transition-all md:p-14
          ${isDragging ? 'border-indigo-400 bg-indigo-50/80 scale-[1.02]' : selectedFileNames.length > 0 ? 'border-emerald-400 bg-emerald-50/80' : 'border-dashed border-gray-300 bg-white hover:bg-gray-50 hover:border-indigo-300'}`}>
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
          <div className='text-center animate-in zoom-in-95 duration-300'>
            <div className='mb-1.5 text-lg font-black text-emerald-700 md:text-xl'>
              字幕文件已就绪（{selectedFileNames.length}）
            </div>
            <div className='mb-4 max-h-28 overflow-y-auto rounded-xl border border-emerald-200 bg-white/70 p-2 text-left text-xs font-bold text-emerald-700/80 md:text-sm'>
              {selectedFileNames.slice(0, 8).map((name, index) => (
                <div key={`${name}-${index}`} className='truncate'>
                  {name}
                </div>
              ))}
              {selectedFileNames.length > 8 && (
                <div className='mt-1 text-[11px] text-emerald-600/70'>
                  还有 {selectedFileNames.length - 8} 个文件...
                </div>
              )}
            </div>
            <div className='text-xs text-emerald-500/60 font-bold bg-emerald-100/50 px-3 py-1 rounded-full inline-block'>
              点击或拖拽可重新选择（支持批量）
            </div>
          </div>
        ) : (
          <div className='text-center'>
            <div
              className={`mb-2 text-base font-black transition-colors md:text-xl ${isDragging ? 'text-indigo-600' : 'text-gray-800'}`}>
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
      <p className='text-xs text-gray-500'>
        批量导入规则：会按文件逐个创建语料。若音频路径以 `/` 结尾（如
        `/audios/n1/2026-07/`），系统将按字幕文件名自动映射为同名 `.mp3`；排序会自动续接。
      </p>

      {previewRows.length > 0 && (
        <section className='rounded-3xl border border-indigo-100 bg-indigo-50/30 p-4 md:p-6'>
          <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
            <h3 className='text-sm font-black text-indigo-900 md:text-base'>
              {isBatchAss ? '多音频题目录入预览' : '音频配对预览'}
            </h3>
            <span className='rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-bold text-indigo-700'>
              {previewRows.length} 条
            </span>
          </div>
          <p className='mb-3 text-xs font-semibold text-indigo-700'>
            当前分类：{selectedCategoryLabel}
          </p>
          <div className='space-y-2'>
            {previewRows.map(row => {
              const overrideValue = assAudioOverrides[row.key] ?? row.autoValue
              const uniqueCandidates = Array.from(
                new Set([
                  ...row.scopedCandidates,
                  ...row.siteCandidates,
                  ...row.uploadCandidates.map(name => `upload://${row.stem}`),
                ]),
              )
              return (
                <div
                  key={row.key}
                  className='rounded-2xl border border-indigo-100 bg-white p-3'>
                  <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                    <p className='truncate text-xs font-bold text-gray-700 md:text-sm'>
                      {row.name}
                    </p>
                    <button
                      type='button'
                      onClick={() =>
                        setAssAudioOverrides(prev => ({
                          ...prev,
                          [row.key]: row.autoValue,
                        }))
                      }
                      className='rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100'>
                      恢复自动
                    </button>
                  </div>
                  <p className='mb-2 text-[11px] font-medium text-indigo-700'>
                    自动结果：{row.autoLabel}
                  </p>
                  {uniqueCandidates.length > 0 && (
                    <div className='mb-2 flex flex-wrap gap-1.5'>
                      {uniqueCandidates.slice(0, 6).map(candidate => (
                        <button
                          key={`${row.key}-${candidate}`}
                          type='button'
                          onClick={() =>
                            setAssAudioOverrides(prev => ({
                              ...prev,
                              [row.key]: candidate,
                            }))
                          }
                          className='rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100'>
                          {candidate.startsWith('upload://')
                            ? `上传同名（${row.uploadCandidates[0] || row.stem}）`
                            : candidate}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    type='text'
                    value={overrideValue}
                    onChange={e =>
                      setAssAudioOverrides(prev => ({
                        ...prev,
                        [row.key]: e.currentTarget.value,
                      }))
                    }
                    placeholder='可手动填写 /audios/xxx.mp3 或 upload://词干'
                    className='w-full rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 py-2 text-xs text-gray-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
                  />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ================= 4. 提交按钮与状态 ================= */}
      <button
        type='submit'
        disabled={status.type === 'loading'}
        className={`mt-2 flex w-full items-center justify-center gap-3 rounded-2xl py-4 text-base font-black transition-all shadow-lg active:scale-95 md:mt-4 md:py-5 md:text-xl
          ${status.type === 'loading' ? 'bg-gray-200 text-gray-500 cursor-not-allowed shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 hover:shadow-xl'}
        `}>
        {status.type === 'loading' ? (
          <>
            <svg
              className='animate-spin h-6 w-6 text-gray-500'
              viewBox='0 0 24 24'>
              <circle
                className='opacity-25'
                cx='12'
                cy='12'
                r='10'
                stroke='currentColor'
                strokeWidth='4'
                fill='none'></circle>
              <path
                className='opacity-75'
                fill='currentColor'
                d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
            </svg>{' '}
            正在解析字幕并保存...
          </>
        ) : (
          '提交并保存'
        )}
      </button>

      {status.message && (
        <div
          className={`p-5 rounded-2xl font-bold text-sm animate-in slide-in-from-bottom-4 flex items-center gap-3
          ${status.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}
        `}>
          {status.message}
        </div>
      )}
    </form>
  )
}
