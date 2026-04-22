'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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
} from './action'
import { useDialog } from '@/context/DialogContext'

type AudioItem = {
  path: string
  folder: string
  name: string
  size: number
  updatedAt: string
  linkedLessons: number
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

  const selected =
    options.find(item => item.value === value)?.label || placeholder

  return (
    <div ref={wrapRef} className='relative w-full'>
      <button
        type='button'
        onClick={() => setOpen(prev => !prev)}
        className={`flex w-full items-center justify-between border px-3 py-2 text-sm font-semibold transition ${
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
        <div className='absolute z-[80] mt-2 max-h-80 w-full overflow-y-auto border border-gray-100 bg-white py-1.5 '>
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

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDateTimeStable = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
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
  const [currentPage, setCurrentPage] = useState(1)
  const [folderOptions, setFolderOptions] = useState<string[]>([])
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
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})

  const fetchItems = async (page = currentPage, keyword = search, currentFolder = folder) => {
    setLoading(true)
    const res = await listAudioFilesAdmin({
      page,
      pageSize: PAGE_SIZE,
      keyword,
      folder: currentFolder,
    })
    if (res.success) {
      setItems(res.items)
      setFolderOptions(res.folders || [])
      setTotalCount(res.total || 0)
      setTotalPages(res.totalPages || 1)
      setCurrentPage(res.page || 1)
    }
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchItems(currentPage, search, folder)
    }, 240)
    return () => window.clearTimeout(timer)
  }, [currentPage, search, folder])

  useEffect(() => {
    setSelectedPaths(prev => prev.filter(path => items.some(item => item.path === path)))
  }, [items])

  const filtered = items

  const filterFolderOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: '全部文件夹' },
      ...folderOptions.map(item => ({ value: item, label: item })),
    ],
    [folderOptions],
  )
  const moveFolderOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: '根目录' },
      ...folderOptions
        .filter(item => item !== '(根目录)')
        .map(item => ({ value: item, label: item })),
    ],
    [folderOptions],
  )
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
    const res = await uploadAudioFileAdmin(formData)
    setUploading(false)
    if (!res.success) {
      await dialog.alert(res.message)
      return
    }
    dialog.toast(res.message, { tone: 'success' })
    if (fileRef.current) fileRef.current.value = ''
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
    if (typeof res.lessonRefUpdated === 'number') {
      details.push(`课程音频引用更新 ${res.lessonRefUpdated} 条`)
    }
    if (typeof res.subtitleRefUpdated === 'number' && res.subtitleRefUpdated > 0) {
      details.push(`字幕文本引用更新 ${res.subtitleRefUpdated} 条`)
    }
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
    if (typeof res.lessonRefUpdated === 'number') extra.push(`课程引用 ${res.lessonRefUpdated}`)
    if (typeof res.subtitleRefUpdated === 'number') extra.push(`字幕引用 ${res.subtitleRefUpdated}`)
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
      <div className='mx-auto max-w-6xl space-y-4 md:space-y-6'>
        <section className='border border-gray-200 bg-white p-4 md:p-8'>
          <Link
            href='/'
            className='mb-2 inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.24em] text-slate-500 uppercase transition hover:text-slate-900 md:text-sm'
            aria-label='返回首页'
            title='返回首页'>
            <span>MimiFlow</span>
            <svg className='h-4 w-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 19l-7-7 7-7'
              />
            </svg>
          </Link>
          <h1 className='text-xl font-black text-gray-900 md:text-3xl'>录音管理</h1>
          <p className='mt-2 text-xs text-gray-500 md:text-sm'>
            管理站内录音文件，支持筛选、试听、上传和删除。
          </p>
        </section>

        <section className='border border-gray-200 bg-white p-4 md:p-6'>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto]'>
            <input
              type='text'
              value={search}
              onChange={e => {
                setSearch(e.currentTarget.value)
                setCurrentPage(1)
              }}
              placeholder='搜索文件名或路径'
              className='w-full border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
            />
            <CompactDropdown
              value={folder}
              onChange={value => {
                setFolder(value)
                setCurrentPage(1)
              }}
              options={filterFolderOptions}
              placeholder='选择文件夹'
            />
            <div className='flex gap-2'>
              <input
                ref={fileRef}
                type='file'
                accept='audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm'
                className='hidden'
                id='manage-audio-upload'
              />
              <label
                htmlFor='manage-audio-upload'
                className='inline-flex cursor-pointer items-center border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50'>
                选择录音
              </label>
              <button
                type='button'
                onClick={() => void handleUpload()}
                disabled={uploading}
                className='bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60'>
                {uploading ? '上传中...' : '上传'}
              </button>
            </div>
          </div>
          <div className='mt-3 grid grid-cols-1 gap-2 border border-gray-100 bg-gray-50/70 p-3 md:grid-cols-[1fr_auto]'>
            <div className='grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr]'>
              <CompactDropdown
                value=''
                onChange={value => setFolderDraft(value)}
                options={moveFolderOptions}
                placeholder='选择已有文件夹（可选）'
              />
              <input
                type='text'
                value={folderDraft}
                onChange={e => setFolderDraft(e.currentTarget.value)}
                placeholder='新建文件夹，例如：archive/2026-04'
                className='w-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
              />
            </div>
            <button
              type='button'
              onClick={() => void handleCreateFolder()}
              disabled={creatingFolder}
              className='border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60'>
              {creatingFolder ? '创建中...' : '新建文件夹'}
            </button>
          </div>
          <div className='mt-3 border border-indigo-100 bg-indigo-50/50 p-3'>
            <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
              <p className='text-xs font-bold text-indigo-800'>
                批量操作：已选 {selectedPaths.length} / 当前 {filtered.length}
              </p>
              <button
                type='button'
                onClick={toggleSelectAllVisible}
                className='border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50'>
                {allVisibleSelected ? '取消全选当前列表' : '全选当前列表'}
              </button>
            </div>
            <div className='grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr_auto_auto]'>
              <CompactDropdown
                value={bulkFolder}
                onChange={setBulkFolder}
                options={moveFolderOptions}
                placeholder='移动到已有文件夹'
              />
              <input
                type='text'
                value={bulkNewFolder}
                onChange={e => setBulkNewFolder(e.currentTarget.value)}
                placeholder='或输入新文件夹路径'
                className='w-full border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
              />
              <button
                type='button'
                onClick={() => void handleBulkMove()}
                disabled={bulkMoving || selectedPaths.length === 0}
                className='bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60'>
                {bulkMoving ? '移动中...' : '批量移动'}
              </button>
              <button
                type='button'
                onClick={() => void handleBulkDelete()}
                disabled={bulkDeleting || selectedPaths.length === 0}
                className='border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-60'>
                {bulkDeleting ? '删除中...' : '批量删除'}
              </button>
            </div>
          </div>
          <p className='mt-2 text-xs text-gray-400'>
            共 {totalCount} 条录音，当前页显示 {filtered.length} 条
          </p>
        </section>

        <section className='flex items-center justify-between border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600'>
          <span>
            第 {currentPage} / {totalPages} 页
          </span>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className='ui-btn ui-btn-sm disabled:opacity-50'>
              上一页
            </button>
            <button
              type='button'
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className='ui-btn ui-btn-sm disabled:opacity-50'>
              下一页
            </button>
          </div>
        </section>

        <section className='border border-gray-200 bg-white '>
          <div className='min-h-[62vh]'>
            {loading ? (
              <div className='divide-y divide-gray-100'>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`audio-skeleton-${idx}`}
                    className='grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1fr_240px_130px_auto] md:items-start'>
                    <div className='space-y-2'>
                      <div className='h-4 w-48 animate-pulse bg-gray-100' />
                      <div className='h-3 w-72 max-w-full animate-pulse bg-gray-100' />
                      <div className='h-3 w-40 animate-pulse bg-gray-100' />
                    </div>
                    <div className='h-10 animate-pulse bg-gray-100' />
                    <div className='space-y-2'>
                      <div className='h-6 w-20 animate-pulse bg-gray-100' />
                      <div className='h-6 w-20 animate-pulse bg-gray-100' />
                    </div>
                    <div className='space-y-2'>
                      <div className='h-8 w-20 animate-pulse bg-gray-100' />
                      <div className='h-8 w-20 animate-pulse bg-gray-100' />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className='py-14 text-center text-sm text-gray-400'>暂无录音文件</div>
            ) : (
              <div className='divide-y divide-gray-100'>
              {filtered.map(item => (
                <article
                  key={item.path}
                  className='grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1fr_240px_130px_auto] md:items-start'>
                  <div className='min-w-0'>
                    <label className='mb-1 inline-flex items-center gap-2 text-xs font-semibold text-gray-500'>
                      <input
                        type='checkbox'
                        checked={selectedPaths.includes(item.path)}
                        onChange={() => toggleSelect(item.path)}
                        className='h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500'
                      />
                      选择
                    </label>
                    <p className='truncate text-sm font-bold text-gray-800'>{item.name}</p>
                    <p className='mt-1 truncate text-xs text-gray-500'>{item.path}</p>
                    <p className='mt-1 text-[11px] text-gray-400'>
                      文件夹：{item.folder} · 更新：
                      {formatDateTimeStable(item.updatedAt)}
                    </p>
                  </div>
                  <audio
                    controls
                    preload='metadata'
                    src={item.path}
                    ref={node => {
                      audioRefs.current[item.path] = node
                    }}
                    onPlay={() => handleAudioPlay(item.path)}
                    className='w-full '
                  />
                  <div className='space-y-1 text-xs'>
                    <p className='rounded-md bg-gray-100 px-2 py-1 font-semibold text-gray-600'>
                      {formatBytes(item.size)}
                    </p>
                    <p
                      className={`rounded-md px-2 py-1 font-semibold ${
                        item.linkedLessons > 0
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}>
                      引用：{item.linkedLessons}
                    </p>
                  </div>
                  <div className='flex flex-col items-stretch gap-2 md:items-end'>
                    <button
                      type='button'
                      onClick={() => startRename(item)}
                      className='border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50'>
                      重命名
                    </button>
                    <button
                      type='button'
                      onClick={() => startMove(item)}
                      className='border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100'>
                      移动文件
                    </button>
                    <InlineConfirmAction
                      message='确认删除该录音文件吗？'
                      onConfirm={() => handleDelete(item)}
                      triggerLabel='删除'
                      confirmLabel='确认删除'
                      pendingLabel='删除中...'
                      triggerClassName='bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100'
                    />
                  </div>
                  {activeRenamePath === item.path && (
                    <div className='md:col-span-4 border border-gray-200 bg-gray-50/80 p-3'>
                      <p className='mb-2 text-xs font-bold text-gray-700'>新文件名（不含扩展名）</p>
                      <div className='grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]'>
                        <input
                          type='text'
                          value={renameValue}
                          onChange={e => setRenameValue(e.currentTarget.value)}
                          placeholder='输入新的文件名'
                          className='w-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
                        />
                        <div className='flex gap-2'>
                          <button
                            type='button'
                            onClick={cancelRename}
                            className='border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50'>
                            取消
                          </button>
                          <button
                            type='button'
                            disabled={renamingPath === item.path}
                            onClick={() => void handleRename(item)}
                            className='bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60'>
                            {renamingPath === item.path ? '保存中...' : '保存'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {activeMovePath === item.path && (
                    <div className='md:col-span-4 border border-indigo-100 bg-indigo-50/50 p-3'>
                      <p className='mb-2 text-xs font-bold text-indigo-800'>
                        目标文件夹
                      </p>
                      <div className='grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr_auto]'>
                        <CompactDropdown
                          value={moveFolder}
                          onChange={setMoveFolder}
                          options={moveFolderOptions}
                          placeholder='选择已有文件夹'
                        />
                        <input
                          type='text'
                          value={newFolder}
                          onChange={e => setNewFolder(e.currentTarget.value)}
                          placeholder='或输入新文件夹，例如：jlpt/n1/2026-07'
                          className='w-full border border-indigo-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
                        />
                        <div className='flex gap-2'>
                          <button
                            type='button'
                            onClick={cancelMove}
                            className='border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50'>
                            取消
                          </button>
                          <button
                            type='button'
                            disabled={movingPath === item.path}
                            onClick={() => void handleMove(item)}
                            className='bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60'>
                            {movingPath === item.path ? '移动中...' : '确认移动'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
