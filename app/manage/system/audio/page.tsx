'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import InlineConfirmAction from '@/components/InlineConfirmAction'
import {
  bulkDeleteAudioFilesAdmin,
  bulkMoveAudioFilesAdmin,
  createAudioFolderAdmin,
  deleteAudioFileAdmin,
  listAudioFilesAdmin,
  moveAudioFileAdmin,
  renameAudioFileAdmin,
  uploadAudioFileAdmin,
} from '@/modules/media/audio/manage-actions'
import { useDialog } from '@/context/DialogContext'
import { formatBytes, formatTokyoDateTime } from '@/utils/time/format'

type AudioItem = {
  path: string
  folder: string
  name: string
  size: number
  updatedAt: string
  linkedLessons: number
  linkedListeningMaterials: number
  linkedReadingMaterials: number
  linkedSpeakingMaterials: number
  linkedSubtitleMaterials: number
  linkedVocabularyAudio: number
}

type AudioFolderSummary = {
  path: string
  name: string
  depth: number
  directCount: number
  descendantCount: number
  size: number
}

type AudioSummary = {
  totalFiles: number
  totalSize: number
  linkedFiles: number
  unlinkedFiles: number
  folderCount: number
}

type SelectOption = {
  value: string
  label: string
}

function CompactDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (next: string) => void
  options: SelectOption[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onOutside = (event: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(event.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  const selected = options.find(item => item.value === value)?.label || value || placeholder

  return (
    <div ref={wrapRef} className='relative w-full'>
      <button
        type='button'
        onClick={() => setOpen(prev => !prev)}
        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition ${
          open
            ? 'border-indigo-300 bg-white text-gray-800 ring-2 ring-indigo-100'
            : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-white'
        }`}>
        <span className='truncate pr-2'>{selected}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180 text-indigo-500' : ''}`}
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
      </button>
      {open && (
        <div className='absolute z-[80] mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white py-1.5 shadow-xl'>
          {options.length === 0 ? (
            <div className='px-3 py-2 text-sm text-gray-400'>暂无选项</div>
          ) : (
            options.map((item, index) => (
              <button
                key={`${item.value || '__empty'}-${index}`}
                type='button'
                onClick={() => {
                  onChange(item.value)
                  setOpen(false)
                }}
                className={`block w-full truncate px-3 py-2 text-left text-sm font-semibold transition ${
                  item.value === value
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}>
                {item.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function ManageAudioPage() {
  const PAGE_SIZE = 30
  const dialog = useDialog()
  const [items, setItems] = useState<AudioItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState('')
  const [usage, setUsage] = useState<
    'all' | 'listening' | 'reading' | 'speaking' | 'vocabulary' | 'unlinked'
  >('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [folderOptions, setFolderOptions] = useState<string[]>([])
  const [folderSummaries, setFolderSummaries] = useState<AudioFolderSummary[]>([])
  const [summary, setSummary] = useState<AudioSummary>({
    totalFiles: 0,
    totalSize: 0,
    linkedFiles: 0,
    unlinkedFiles: 0,
    folderCount: 0,
  })
  const [movingPath, setMovingPath] = useState<string | null>(null)
  const [activeMovePath, setActiveMovePath] = useState<string | null>(null)
  const [moveFolder, setMoveFolder] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [activeRenamePath, setActiveRenamePath] = useState<string | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [bulkFolder, setBulkFolder] = useState('')
  const [bulkNewFolder, setBulkNewFolder] = useState('')
  const [bulkMoving, setBulkMoving] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderDraft, setFolderDraft] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [uploadFolder, setUploadFolder] = useState(() => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date())
    const year = parts.find(part => part.type === 'year')?.value || 'unknown'
    const month = parts.find(part => part.type === 'month')?.value || '00'
    return `staging/${year}-${month}`
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})

  const fetchItems = useCallback(
    async (
      page = currentPage,
      keyword = search,
      currentFolder = folder,
      currentUsage = usage,
    ) => {
      setLoading(true)
      const res = await listAudioFilesAdmin({
        page,
        pageSize: PAGE_SIZE,
        keyword,
        folder: currentFolder,
        usage: currentUsage,
      })
      if (res.success) {
        setItems(res.items)
        setFolderOptions(res.folders || [])
        setFolderSummaries(res.folderSummaries || [])
        setSummary(res.summary)
        setTotalCount(res.total || 0)
        setTotalPages(res.totalPages || 1)
        setCurrentPage(res.page || 1)
      }
      setLoading(false)
    },
    [PAGE_SIZE, currentPage, search, folder, usage],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchItems(currentPage, search, folder, usage)
    }, 240)
    return () => window.clearTimeout(timer)
  }, [currentPage, fetchItems, search, folder, usage])

  useEffect(() => {
    setSelectedPaths(prev => prev.filter(path => items.some(item => item.path === path)))
  }, [items])

  const filtered = items

  const moveFolderOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: '根目录' },
      ...folderOptions.map(item => ({ value: item, label: item })),
    ],
    [folderOptions],
  )
  const uploadFolderOptions = useMemo<SelectOption[]>(
    () => [
      { value: uploadFolder, label: uploadFolder },
      { value: 'listening', label: 'listening · 听力材料' },
      { value: 'shadowing', label: 'shadowing · 跟读材料' },
      { value: 'vocabulary', label: 'vocabulary · 词汇音频' },
      { value: 'staging', label: 'staging · 待归类' },
      ...folderOptions
        .filter(item => item !== uploadFolder)
        .map(item => ({ value: item, label: item })),
    ],
    [folderOptions, uploadFolder],
  )
  const usageOptions: SelectOption[] = [
    { value: 'all', label: '全部用途' },
    { value: 'listening', label: '听力材料使用中' },
    { value: 'reading', label: '阅读材料使用中' },
    { value: 'speaking', label: '跟读材料使用中' },
    { value: 'vocabulary', label: '词汇使用中' },
    { value: 'unlinked', label: '未关联材料' },
  ]
  const allVisibleSelected =
    filtered.length > 0 && filtered.every(item => selectedPaths.includes(item.path))

  const handleUpload = async () => {
    if (!fileRef.current?.files?.[0]) {
      await dialog.alert('请先选择录音文件。')
      return
    }
    setUploading(true)
    const formData = new FormData()
    formData.set('audioFile', fileRef.current.files[0])
    formData.set('folder', uploadFolder)
    const res = await uploadAudioFileAdmin(formData)
    setUploading(false)
    if (!res.success) {
      await dialog.alert(res.message)
      return
    }
    dialog.toast(res.message, { tone: 'success' })
    if (fileRef.current) fileRef.current.value = ''
    setSelectedFileName('')
    await fetchItems()
  }

  const handleDelete = async (item: AudioItem) => {
    const res = await deleteAudioFileAdmin(item.path)
    if (!res.success) {
      dialog.toast(res.message, { tone: 'error' })
      return
    }
    dialog.toast(res.message, { tone: 'success' })
    await fetchItems()
  }

  const handleAudioPlay = (path: string) => {
    Object.entries(audioRefs.current).forEach(([key, audio]) => {
      if (!audio || key === path) return
      if (!audio.paused) audio.pause()
    })
  }

  const startMove = (item: AudioItem) => {
    setActiveMovePath(item.path)
    setMoveFolder(item.folder === '(根目录)' ? '' : item.folder)
    setNewFolder('')
  }

  const cancelMove = () => {
    setActiveMovePath(null)
    setMoveFolder('')
    setNewFolder('')
  }

  const toggleSelect = (path: string) => {
    setSelectedPaths(prev =>
      prev.includes(path) ? prev.filter(item => item !== path) : [...prev, path],
    )
  }

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedPaths(prev => prev.filter(path => !filtered.some(item => item.path === path)))
      return
    }
    const merged = new Set(selectedPaths)
    filtered.forEach(item => merged.add(item.path))
    setSelectedPaths(Array.from(merged))
  }

  const handleMove = async (item: AudioItem) => {
    const targetFolder = newFolder.trim() || moveFolder
    setMovingPath(item.path)
    const res = await moveAudioFileAdmin(item.path, targetFolder)
    setMovingPath(null)
    if (!res.success) {
      dialog.toast(res.message, { tone: 'error' })
      return
    }
    const details: string[] = []
    if (typeof res.listeningRefUpdated === 'number' && res.listeningRefUpdated > 0)
      details.push(`听力引用更新 ${res.listeningRefUpdated} 条`)
    if (typeof res.readingRefUpdated === 'number' && res.readingRefUpdated > 0)
      details.push(`阅读引用更新 ${res.readingRefUpdated} 条`)
    if (typeof res.speakingRefUpdated === 'number' && res.speakingRefUpdated > 0)
      details.push(`跟读引用更新 ${res.speakingRefUpdated} 条`)
    if (typeof res.subtitleRefUpdated === 'number' && res.subtitleRefUpdated > 0) {
      details.push(`影视字幕引用更新 ${res.subtitleRefUpdated} 条`)
    }
    if (typeof res.vocabularyRefUpdated === 'number' && res.vocabularyRefUpdated > 0)
      details.push(`词汇引用更新 ${res.vocabularyRefUpdated} 条`)
    if (res.sourceRemoved === false) details.push('旧文件需稍后清理')
    dialog.toast(
      details.length > 0 ? `${res.message}（${details.join('，')}）` : res.message,
      { tone: 'success' },
    )
    cancelMove()
    await fetchItems()
  }

  const startRename = (item: AudioItem) => {
    setActiveRenamePath(item.path)
    setRenameValue(item.name.replace(/\.[^.]+$/, ''))
  }

  const cancelRename = () => {
    setActiveRenamePath(null)
    setRenameValue('')
  }

  const handleRename = async (item: AudioItem) => {
    if (!renameValue.trim()) {
      dialog.toast('请输入新的文件名。', { tone: 'error' })
      return
    }
    setRenamingPath(item.path)
    const res = await renameAudioFileAdmin(item.path, renameValue)
    setRenamingPath(null)
    if (!res.success) {
      dialog.toast(res.message, { tone: 'error' })
      return
    }
    dialog.toast(res.message, { tone: 'success' })
    cancelRename()
    await fetchItems()
  }

  const handleCreateFolder = async () => {
    if (!folderDraft.trim()) {
      dialog.toast('请输入文件夹名。', { tone: 'error' })
      return
    }
    setCreatingFolder(true)
    const res = await createAudioFolderAdmin(folderDraft)
    setCreatingFolder(false)
    if (!res.success) {
      dialog.toast(res.message, { tone: 'error' })
      return
    }
    dialog.toast(res.message, { tone: 'success' })
    setFolderDraft('')
    await fetchItems()
  }

  const handleBulkMove = async () => {
    if (selectedPaths.length === 0) {
      dialog.toast('请先选择录音。', { tone: 'error' })
      return
    }
    const targetFolder = bulkNewFolder.trim() || bulkFolder
    setBulkMoving(true)
    const res = await bulkMoveAudioFilesAdmin(selectedPaths, targetFolder)
    setBulkMoving(false)
    if (!res.success) {
      dialog.toast(res.message, { tone: 'error' })
      return
    }
    const extra = []
    if (typeof res.listeningRefUpdated === 'number' && res.listeningRefUpdated > 0)
      extra.push(`听力引用 ${res.listeningRefUpdated}`)
    if (typeof res.readingRefUpdated === 'number' && res.readingRefUpdated > 0)
      extra.push(`阅读引用 ${res.readingRefUpdated}`)
    if (typeof res.speakingRefUpdated === 'number' && res.speakingRefUpdated > 0)
      extra.push(`跟读引用 ${res.speakingRefUpdated}`)
    if (typeof res.subtitleRefUpdated === 'number') extra.push(`字幕引用 ${res.subtitleRefUpdated}`)
    if (typeof res.vocabularyRefUpdated === 'number' && res.vocabularyRefUpdated > 0)
      extra.push(`词汇引用 ${res.vocabularyRefUpdated}`)
    dialog.toast(`${res.message}${extra.length > 0 ? `（${extra.join('，')}）` : ''}`, {
      tone: 'success',
    })
    setSelectedPaths([])
    setBulkNewFolder('')
    await fetchItems()
  }

  const handleBulkDelete = async () => {
    if (selectedPaths.length === 0) {
      dialog.toast('请先选择录音。', { tone: 'error' })
      return
    }
    const confirmed = await dialog.confirm(
      `确认删除已选 ${selectedPaths.length} 条录音吗？`,
      { title: '批量删除', confirmText: '删除', danger: true },
    )
    if (!confirmed) return
    setBulkDeleting(true)
    const res = await bulkDeleteAudioFilesAdmin(selectedPaths)
    setBulkDeleting(false)
    if (!res.success) {
      dialog.toast(res.message, { tone: 'error' })
      return
    }
    dialog.toast(res.message, { tone: 'success' })
    setSelectedPaths([])
    await fetchItems()
  }

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-8'>
      <div className='mx-auto max-w-7xl space-y-5'>
        <section className='py-5'>
          <div className='flex flex-wrap items-end justify-between gap-4'>
            <h1 className='text-xl font-bold text-slate-950'>录音文件</h1>
            <p className='ui-meta'>存储位置：public/audios</p>
          </div>
          <div className='mt-6 grid grid-cols-2 gap-y-4 py-4 md:grid-cols-5'>
            {[
              ['文件', summary.totalFiles],
              ['目录', summary.folderCount],
              ['已关联', summary.linkedFiles],
              ['待整理', summary.unlinkedFiles],
              ['占用空间', formatBytes(summary.totalSize)],
            ].map(([label, value]) => (
              <div key={label} className='px-3 first:pl-0 md:px-5'>
                <p className='text-[11px] font-medium text-slate-400'>{label}</p>
                <p className='mt-1 text-xl font-semibold tabular-nums text-slate-900'>{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className='py-4'>
          <div className='grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto]'>
            <input
              type='search'
              value={search}
              onChange={event => {
                setSearch(event.currentTarget.value)
                setCurrentPage(1)
              }}
              placeholder='搜索文件名或完整路径'
              className='h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100'
            />
            <CompactDropdown
              value={usage}
              onChange={value => {
                setUsage(value as typeof usage)
                setCurrentPage(1)
              }}
              options={usageOptions}
              placeholder='选择用途'
            />
            <button
              type='button'
              onClick={() => {
                setSearch('')
                setFolder('')
                setUsage('all')
                setCurrentPage(1)
              }}
              className='ui-btn h-10 px-4 text-sm'>
              清除筛选
            </button>
          </div>

          <div className='mt-4 grid gap-3 pt-4 lg:grid-cols-[minmax(220px,1fr)_minmax(240px,1fr)_auto] lg:items-end'>
            <div>
              <p className='mb-2 text-xs font-semibold text-slate-600'>上传文件</p>
              <input
                ref={fileRef}
                type='file'
                accept='audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm'
                className='hidden'
                id='manage-audio-upload'
                onChange={event =>
                  setSelectedFileName(event.currentTarget.files?.[0]?.name || '')
                }
              />
              <label
                htmlFor='manage-audio-upload'
                className='flex h-10 cursor-pointer items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-sm text-slate-600 hover:border-slate-400 hover:bg-white'>
                <span className='truncate'>{selectedFileName || '选择 MP3 或其他音频文件'}</span>
              </label>
            </div>
            <div>
              <p className='mb-2 text-xs font-semibold text-slate-600'>保存目录</p>
              <CompactDropdown
                value={uploadFolder}
                onChange={setUploadFolder}
                options={uploadFolderOptions}
                placeholder='选择保存目录'
              />
            </div>
            <button
              type='button'
              onClick={() => void handleUpload()}
              disabled={uploading}
              className='ui-btn ui-btn-primary h-10 px-5 text-sm disabled:opacity-60'>
              {uploading ? '上传中…' : '上传到目录'}
            </button>
          </div>

          {selectedPaths.length > 0 ? (
            <div className='mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3'>
              <div className='mb-2 flex items-center justify-between gap-3'>
                <p className='text-xs font-semibold text-indigo-800'>已选 {selectedPaths.length} 条录音</p>
                <button type='button' onClick={() => setSelectedPaths([])} className='text-xs text-indigo-700'>取消选择</button>
              </div>
              <div className='grid gap-2 md:grid-cols-[220px_minmax(180px,1fr)_auto_auto]'>
                <CompactDropdown value={bulkFolder} onChange={setBulkFolder} options={moveFolderOptions} placeholder='移动到已有目录' />
                <input
                  type='text'
                  value={bulkNewFolder}
                  onChange={event => setBulkNewFolder(event.currentTarget.value)}
                  placeholder='或输入新目录路径'
                  className='h-10 rounded-xl border border-indigo-200 bg-white px-3 text-sm outline-none focus:border-indigo-400'
                />
                <button type='button' onClick={() => void handleBulkMove()} disabled={bulkMoving} className='ui-btn ui-btn-primary h-10 px-4 text-sm disabled:opacity-60'>
                  {bulkMoving ? '移动中…' : '批量移动'}
                </button>
                <button type='button' onClick={() => void handleBulkDelete()} disabled={bulkDeleting} className='ui-btn h-10 border-red-200 px-4 text-sm text-red-600 disabled:opacity-60'>
                  {bulkDeleting ? '删除中…' : '批量删除'}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <div className='grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]'>
          <aside className='py-4 lg:sticky lg:top-20'>
            <div className='flex items-center justify-between px-2 py-2'>
              <h2 className='text-sm font-semibold text-slate-900'>目录</h2>
              <span className='text-[11px] text-slate-400'>{summary.folderCount}</span>
            </div>
            <div className='max-h-[52vh] space-y-0.5 overflow-y-auto py-2'>
              <button
                type='button'
                onClick={() => {
                  setFolder('')
                  setCurrentPage(1)
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs ${folder === '' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                <span>全部录音</span>
                <span className='tabular-nums opacity-70'>{summary.totalFiles}</span>
              </button>
              {folderSummaries.map(item => (
                <button
                  key={item.path}
                  type='button'
                  title={`${item.path} · ${formatBytes(item.size)}`}
                  onClick={() => {
                    setFolder(item.path)
                    setCurrentPage(1)
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg py-2 pr-2 text-left text-xs ${folder === item.path ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  style={{ paddingLeft: `${0.5 + Math.min(item.depth, 4) * 0.75}rem` }}>
                  <span className='truncate'>{item.name}</span>
                  <span className='shrink-0 tabular-nums opacity-60'>{item.descendantCount}</span>
                </button>
              ))}
            </div>
            <div className='mt-3 space-y-2'>
              <input
                type='text'
                value={folderDraft}
                onChange={event => setFolderDraft(event.currentTarget.value)}
                placeholder='新目录，如 listening/N1'
                className='h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-slate-400'
              />
              <button type='button' onClick={() => void handleCreateFolder()} disabled={creatingFolder} className='ui-btn ui-btn-sm w-full disabled:opacity-60'>
                {creatingFolder ? '创建中…' : '新建目录'}
              </button>
            </div>
          </aside>

          <section className='overflow-hidden bg-transparent'>
            <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'>
              <div className='min-w-0'>
                <p className='truncate text-sm font-semibold text-slate-900'>{folder || '全部录音'}</p>
                <p className='mt-0.5 text-xs text-slate-400'>共 {totalCount} 条 · 当前显示 {filtered.length} 条</p>
              </div>
              <div className='flex items-center gap-2 text-xs text-slate-500'>
                <button type='button' onClick={toggleSelectAllVisible} className='ui-btn ui-btn-sm'>{allVisibleSelected ? '取消当前页' : '选择当前页'}</button>
                <span className='tabular-nums'>{currentPage} / {totalPages}</span>
                <button type='button' disabled={currentPage <= 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))} className='ui-btn ui-btn-sm disabled:opacity-40'>上一页</button>
                <button type='button' disabled={currentPage >= totalPages} onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} className='ui-btn ui-btn-sm disabled:opacity-40'>下一页</button>
              </div>
            </div>

            <div className='min-h-[58vh]'>
              {loading ? (
                <div className='space-y-4'>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className='grid gap-3 px-4 py-5 md:grid-cols-[minmax(0,1fr)_220px]'>
                      <div className='h-12 animate-pulse rounded-lg bg-slate-100' />
                      <div className='h-10 animate-pulse rounded-full bg-slate-100' />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className='px-6 py-20 text-center'>
                  <p className='text-sm font-semibold text-slate-700'>这个目录里暂时没有录音</p>
                  <p className='mt-2 text-xs text-slate-400'>可以上传文件，或清除搜索与用途筛选。</p>
                </div>
              ) : (
                <div className='space-y-4'>
                  {filtered.map(item => (
                    <article key={item.path} className='grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_230px_auto] xl:items-center'>
                      <div className='min-w-0'>
                        <div className='flex items-start gap-3'>
                          <input
                            type='checkbox'
                            aria-label={`选择 ${item.name}`}
                            checked={selectedPaths.includes(item.path)}
                            onChange={() => toggleSelect(item.path)}
                            className='mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400'
                          />
                          <div className='min-w-0'>
                            <p className='truncate text-sm font-semibold text-slate-900'>{item.name}</p>
                            <p className='mt-1 truncate text-xs text-slate-500' title={item.path}>{item.path}</p>
                            <div className='mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400'>
                              <span>{formatBytes(item.size)}</span>
                              <span>{formatTokyoDateTime(item.updatedAt)}</span>
                              <span className={item.linkedLessons > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                                {item.linkedLessons > 0 ? `已关联 ${item.linkedLessons}` : '未关联'}
                              </span>
                              {item.linkedLessons > 0 ? (
                                <span>
                                  听力 {item.linkedListeningMaterials} · 阅读 {item.linkedReadingMaterials} · 跟读 {item.linkedSpeakingMaterials}
                                  {item.linkedVocabularyAudio > 0
                                    ? ` · 词汇 ${item.linkedVocabularyAudio}`
                                    : ''}
                                  {item.linkedSubtitleMaterials > 0
                                    ? ` · 字幕 ${item.linkedSubtitleMaterials}`
                                    : ''}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                      <audio
                        controls
                        preload='metadata'
                        src={item.path}
                        ref={node => { audioRefs.current[item.path] = node }}
                        onPlay={() => handleAudioPlay(item.path)}
                        className='h-9 w-full'
                      />
                      <div className='flex flex-wrap gap-2 xl:justify-end'>
                        <button type='button' onClick={() => startRename(item)} className='ui-btn ui-btn-sm'>重命名</button>
                        <button type='button' onClick={() => startMove(item)} className='ui-btn ui-btn-sm'>移动</button>
                        <InlineConfirmAction
                          message='确认删除该录音文件吗？'
                          onConfirm={() => handleDelete(item)}
                          triggerLabel='删除'
                          confirmLabel='确认删除'
                          pendingLabel='删除中…'
                          triggerClassName='ui-btn ui-btn-sm text-red-600'
                        />
                      </div>

                      {activeRenamePath === item.path ? (
                        <div className='rounded-xl border border-slate-200 bg-slate-50 p-3 xl:col-span-3'>
                          <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]'>
                            <input type='text' value={renameValue} onChange={event => setRenameValue(event.currentTarget.value)} placeholder='新文件名（不含扩展名）' className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400' />
                            <div className='flex gap-2'>
                              <button type='button' onClick={cancelRename} className='ui-btn ui-btn-sm'>取消</button>
                              <button type='button' disabled={renamingPath === item.path} onClick={() => void handleRename(item)} className='ui-btn ui-btn-primary ui-btn-sm disabled:opacity-60'>{renamingPath === item.path ? '保存中…' : '保存'}</button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {activeMovePath === item.path ? (
                        <div className='rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 xl:col-span-3'>
                          <div className='grid gap-2 md:grid-cols-[240px_minmax(0,1fr)_auto]'>
                            <CompactDropdown value={moveFolder} onChange={setMoveFolder} options={moveFolderOptions} placeholder='选择已有目录' />
                            <input type='text' value={newFolder} onChange={event => setNewFolder(event.currentTarget.value)} placeholder='或输入新目录，如 listening/N1/2026-07' className='h-10 rounded-xl border border-indigo-200 bg-white px-3 text-sm outline-none focus:border-indigo-400' />
                            <div className='flex gap-2'>
                              <button type='button' onClick={cancelMove} className='ui-btn ui-btn-sm'>取消</button>
                              <button type='button' disabled={movingPath === item.path} onClick={() => void handleMove(item)} className='ui-btn ui-btn-primary ui-btn-sm disabled:opacity-60'>{movingPath === item.path ? '移动中…' : '确认移动'}</button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className='flex items-center justify-between px-4 py-3 text-xs text-slate-500'>
              <span className='ui-meta tabular-nums'>第 {currentPage} / {totalPages} 页</span>
              <div className='flex items-center gap-0.5'>
                <button type='button' aria-label='上一页' disabled={currentPage <= 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))} className='inline-flex size-7 items-center justify-center rounded-md text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40'>‹</button>
                <button type='button' aria-label='下一页' disabled={currentPage >= totalPages} onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} className='inline-flex size-7 items-center justify-center rounded-md text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40'>›</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
