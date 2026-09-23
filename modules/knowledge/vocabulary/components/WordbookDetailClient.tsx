'use client'

// Vocabulary wordbook detail client.

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import WordPronunciation from '@/modules/knowledge/vocabulary/components/WordPronunciation'
import CustomSelect from '@/components/ui/CustomSelect'
import {
  addPartsOfSpeechToWordbookVocabularies,
  addTagsToWordbookVocabularies,
  createWordbook,
  createWordbookSeries,
  deleteWordbook,
  moveWordbook,
  moveVocabularyWithinWordbook,
  removeVocabularyFromWordbook,
  renameWordbook,
  renameWordbookSeries,
  setJlptForWordbookVocabularies,
} from '@/modules/knowledge/wordbooks/actions'
import { JLPT_LEVELS } from '@/modules/knowledge/vocabulary/domain/jlpt'
import { useDialog } from '@/context/DialogContext'
import { getPosOptions } from '@/utils/language/posTagger'
import { buildWordbookEntryHref } from '@/modules/knowledge/vocabulary/domain/navigation'
import { normalizeWordbookQuery } from '@/modules/knowledge/wordbooks/entry-query'
import WordbookEntryRow from '@/modules/knowledge/wordbooks/components/WordbookEntryRow'
import type { WordbookVocabularyItem } from '@/modules/knowledge/wordbooks/types'

type WordbookSeriesMeta = {
  id: string
  title: string
}


type Props = {
  canManage: boolean
  wordbookId: string
  wordbookTitle: string
  series: WordbookSeriesMeta
  seriesOptions: WordbookSeriesMeta[]
  partOfSpeechHierarchy: Array<{
    id: string
    name: string
    parentName: string | null
  }>
  items: WordbookVocabularyItem[]
  currentPage: number
  totalPages: number
  totalCount: number
  filteredCount: number
  initialQuery: string
  initialViewMode: 'list' | 'flashcard'
  pageSize: number
}

export default function WordbookDetailClient({
  canManage,
  wordbookId,
  wordbookTitle,
  series,
  seriesOptions,
  partOfSpeechHierarchy,
  items,
  currentPage,
  totalPages,
  totalCount,
  filteredCount,
  initialQuery,
  initialViewMode,
  pageSize,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const dialog = useDialog()
  const searchParams = useSearchParams()
  const [isNavigating, startNavigation] = useTransition()
  const [keyword, setKeyword] = useState(initialQuery)
  const [viewMode, setViewMode] = useState<'list' | 'flashcard'>(initialViewMode)
  const [flashIndex, setFlashIndex] = useState(0)
  const [showManagement, setShowManagement] = useState(false)
  const [targetSeriesId, setTargetSeriesId] = useState('')
  const [selectedVocabularyIds, setSelectedVocabularyIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectedPartsOfSpeech, setSelectedPartsOfSpeech] = useState<Set<string>>(
    () => new Set(),
  )
  const [customPartOfSpeech, setCustomPartOfSpeech] = useState('')
  const [isBulkSaving, setIsBulkSaving] = useState(false)
  const [bulkTagsInput, setBulkTagsInput] = useState('')
  const [isBulkTagSaving, setIsBulkTagSaving] = useState(false)
  const [bulkJlpt, setBulkJlpt] = useState('')
  const [isBulkJlptSaving, setIsBulkJlptSaving] = useState(false)
  const [pendingVocabularyIds, setPendingVocabularyIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [isReordering, setIsReordering] = useState(false)

  const moveOptions = useMemo(
    () => seriesOptions.filter(item => item.id !== series.id),
    [series.id, seriesOptions],
  )

  useEffect(() => {
    setTargetSeriesId(current =>
      moveOptions.some(item => item.id === current) ? current : moveOptions[0]?.id || '',
    )
  }, [moveOptions])

  const navigate = (page: number, query = initialQuery, nextView = viewMode) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    if (query) params.set('q', normalizeWordbookQuery(query))
    else params.delete('q')
    if (nextView === 'flashcard') params.set('view', 'card')
    else params.delete('view')
    startNavigation(() => router.push(`${pathname}?${params}`))
  }
  const toPage = (page: number) => navigate(page)
  const filteredItems = items
  const visibleIds = filteredItems.map(item => item.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every(id => selectedVocabularyIds.has(id))
  const partOfSpeechOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...partOfSpeechHierarchy.map(item => item.name),
          ...items.flatMap(item => item.partsOfSpeech),
          ...items.flatMap(item => getPosOptions(item.word, '')),
        ]),
      ),
    [items, partOfSpeechHierarchy],
  )

  const currentFlash = filteredItems[flashIndex] || null
  const flashSentences = Array.isArray(currentFlash?.sentences)
    ? currentFlash.sentences.slice(0, 2)
    : []

  const playAudioFile = (audioFile?: string | null) => {
    if (!audioFile) return
    const audio = new Audio(audioFile)
    void audio.play().catch(() => {})
  }

  useEffect(() => {
    if (viewMode !== 'flashcard' || filteredItems.length === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof Element && event.target.closest('button, a, [role="listbox"], [role="dialog"], [contenteditable="true"]'))
      ) {
        return
      }

      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setFlashIndex(prev => Math.max(0, prev - 1))
      }
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        event.preventDefault()
        setFlashIndex(prev => Math.min(filteredItems.length - 1, prev + 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [viewMode, filteredItems.length])

  useEffect(() => {
    setFlashIndex(0)
  }, [initialQuery, viewMode, currentPage])

  useEffect(() => {
    const itemIds = new Set(items.map(item => item.id))
    setSelectedVocabularyIds(current => {
      const next = new Set([...current].filter(id => itemIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [items])

  const handleRename = async () => {
    const name = await dialog.prompt('输入新名称', {
      title: '重命名单词书',
      defaultValue: wordbookTitle,
      confirmText: '保存',
    })
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) {
      dialog.toast('名称不能为空', { tone: 'error' })
      return
    }
    const res = await renameWordbook(wordbookId, trimmed)
    if (!res.success) {
      dialog.toast(res.message || '保存失败', { tone: 'error' })
      return
    }
    router.refresh()
    dialog.toast('已更新', { tone: 'success' })
  }

  const handleMove = async () => {
    if (moveOptions.length === 0) {
      dialog.toast('没有其他可用的词书系列', { tone: 'info' })
      return
    }
    if (!targetSeriesId) {
      dialog.toast('请选择目标系列', { tone: 'error' })
      return
    }
    const res = await moveWordbook(wordbookId, targetSeriesId)
    if (!res.success) {
      dialog.toast(res.message || '移动失败', { tone: 'error' })
      return
    }
    router.refresh()
    dialog.toast('已移动', { tone: 'success' })
  }

  const handleCreateSibling = async () => {
    const name = await dialog.prompt(`在「${series.title}」中新建词书`, {
      title: '新建同系列词书',
      confirmText: '创建',
    })
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) {
      dialog.toast('名称不能为空', { tone: 'error' })
      return
    }
    const res = await createWordbook(trimmed, series.id)
    if (!res.success || !res.wordbook) {
      dialog.toast(res.message || '创建失败', { tone: 'error' })
      return
    }
    dialog.toast('词书已创建', { tone: 'success' })
    router.push(`/vocabulary/wordbooks/${res.wordbook.id}`)
  }

  const handleRenameSeries = async () => {
    const name = await dialog.prompt('输入新的词书系列名称', {
      title: '重命名词书系列',
      defaultValue: series.title,
      confirmText: '保存',
    })
    if (name == null) return
    const res = await renameWordbookSeries(series.id, name)
    if (!res.success) {
      dialog.toast(res.message || '保存失败', { tone: 'error' })
      return
    }
    router.refresh()
    dialog.toast('词书系列已更新', { tone: 'success' })
  }

  const handleCreateSeriesAndMove = async () => {
    const name = await dialog.prompt('输入新词书系列名称', {
      title: '新建系列并移动当前词书',
      confirmText: '创建并移动',
    })
    if (name == null) return
    const created = await createWordbookSeries(name)
    if (!created.success || !created.series) {
      dialog.toast(created.message || '创建失败', { tone: 'error' })
      return
    }
    const moved = await moveWordbook(wordbookId, created.series.id)
    if (!moved.success) {
      dialog.toast(moved.message || '移动失败', { tone: 'error' })
      return
    }
    router.refresh()
    dialog.toast('已创建系列并移动当前词书', { tone: 'success' })
  }

  const handleDeleteWordbook = async () => {
    const confirmed = await dialog.confirm(
      `确认删除「${wordbookTitle}」吗？将删除这个词表、收录关系及其独占音频；词汇库中的单词和其他词表仍会保留，共享音频不会删除。`,
      {
        title: '删除单词书',
        confirmText: '删除',
        danger: true,
      },
    )
    if (!confirmed) return
    const res = await deleteWordbook(wordbookId)
    if (!res.success) {
      dialog.toast(res.message || '删除失败', { tone: 'error' })
      return
    }
    const deletedAudioFiles = 'deletedAudioFiles' in res ? (res.deletedAudioFiles ?? 0) : 0
    dialog.toast(
      deletedAudioFiles > 0
        ? `单词书已删除，并清理 ${deletedAudioFiles} 个音频文件`
        : '单词书已删除',
      { tone: 'success' },
    )
    router.push('/vocabulary')
    router.refresh()
  }

  const handleRemoveVocabulary = async (item: WordbookVocabularyItem) => {
    const confirmed = await dialog.confirm(
      `确认将「${item.word}」移出「${wordbookTitle}」吗？单词本身及其在其他词表中的内容都会保留。`,
      {
        title: '移出当前词表',
        confirmText: '确认移出',
        danger: true,
      },
    )
    if (!confirmed) return
    setPendingVocabularyIds(current => new Set(current).add(item.id))
    const res = await removeVocabularyFromWordbook(item.id, wordbookId)
    if (!res.success) {
      setPendingVocabularyIds(current => {
        const next = new Set(current)
        next.delete(item.id)
        return next
      })
      dialog.toast(res.message || '移出失败', { tone: 'error' })
      return
    }
    dialog.toast('已从当前词表移出，单词本身已保留', { tone: 'success' })
    router.refresh()
  }

  const handleMoveVocabulary = async (
    item: WordbookVocabularyItem,
    direction: 'up' | 'down',
  ) => {
    if (isReordering) return
    setIsReordering(true)
    try {
      const result = await moveVocabularyWithinWordbook(
        item.id,
        wordbookId,
        direction,
      )
      if (!result.success) {
        dialog.toast(result.message || '调整排序失败', { tone: 'error' })
        return
      }
      dialog.toast(
        direction === 'up' ? `已上移「${item.word}」` : `已下移「${item.word}」`,
        { tone: 'success' },
      )
      router.refresh()
    } finally {
      setIsReordering(false)
    }
  }

  const toggleVocabulary = (id: string) => {
    setSelectedVocabularyIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleVisibleVocabularies = () => {
    setSelectedVocabularyIds(current => {
      const next = new Set(current)
      visibleIds.forEach(id => {
        if (allVisibleSelected) next.delete(id)
        else next.add(id)
      })
      return next
    })
  }

  const togglePartOfSpeech = (value: string) => {
    setSelectedPartsOfSpeech(current => {
      const next = new Set(current)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const handleAddPartsOfSpeech = async () => {
    const customValues = customPartOfSpeech
      .split(/[\n,，、]+/)
      .map(value => value.trim())
      .filter(Boolean)
    const values = [...selectedPartsOfSpeech, ...customValues]
    if (values.length === 0) {
      dialog.toast('请先选择或填写词性', { tone: 'error' })
      return
    }
    setIsBulkSaving(true)
    const result = await addPartsOfSpeechToWordbookVocabularies(
      [...selectedVocabularyIds],
      wordbookId,
      values,
    )
    setIsBulkSaving(false)
    if (!result.success) {
      dialog.toast(result.message || '批量添加失败', { tone: 'error' })
      return
    }
    setSelectedVocabularyIds(new Set())
    setSelectedPartsOfSpeech(new Set())
    setCustomPartOfSpeech('')
    dialog.toast(`已为 ${result.updatedCount} 个单词添加词性`, {
      tone: 'success',
    })
    router.refresh()
  }

  const handleAddTags = async () => {
    const tags = bulkTagsInput
      .split(/[\n,，、]+/)
      .map(value => value.trim())
      .filter(Boolean)
    if (tags.length === 0) {
      dialog.toast('请先填写标签', { tone: 'error' })
      return
    }
    setIsBulkTagSaving(true)
    const result = await addTagsToWordbookVocabularies(
      [...selectedVocabularyIds],
      wordbookId,
      tags,
    )
    setIsBulkTagSaving(false)
    if (!result.success) {
      dialog.toast(result.message || '批量添加标签失败', { tone: 'error' })
      return
    }
    setSelectedVocabularyIds(new Set())
    setBulkTagsInput('')
    dialog.toast(`已为 ${result.updatedCount} 个单词添加标签`, { tone: 'success' })
    router.refresh()
  }

  const handleSetJlpt = async () => {
    setIsBulkJlptSaving(true)
    const result = await setJlptForWordbookVocabularies(
      [...selectedVocabularyIds],
      wordbookId,
      bulkJlpt,
    )
    setIsBulkJlptSaving(false)
    if (!result.success) {
      dialog.toast(result.message || '批量更新 JLPT 失败', { tone: 'error' })
      return
    }
    setSelectedVocabularyIds(new Set())
    dialog.toast(
      bulkJlpt
        ? `已将 ${result.updatedCount} 个词条设为 ${bulkJlpt}`
        : `已清除 ${result.updatedCount} 个词条的 JLPT`,
      { tone: 'success' },
    )
    router.refresh()
  }

  return (
    <section aria-busy={isNavigating}>
      <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>{initialQuery ? `找到 ${filteredCount} / ${totalCount} 个词` : `共 ${totalCount} 个词`} · 本页 {filteredItems.length} 个词</span>
          <span>
            第 {currentPage}/{totalPages} 页
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              onClick={() => { setViewMode('list'); navigate(currentPage, initialQuery, 'list') }}
              className={`min-h-10 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                viewMode === 'list'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}>
              列表
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'flashcard'}
              onClick={() => {
                setViewMode('flashcard')
                setFlashIndex(0)
                navigate(currentPage, initialQuery, 'flashcard')
              }}
              className={`min-h-10 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                viewMode === 'flashcard'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}>
              单词卡
            </button>
          </div>
          {canManage && <button
            type="button"
            aria-expanded={showManagement}
            aria-controls="wordbook-management-panel"
            onClick={() => {
              setShowManagement(value => !value)
              setSelectedVocabularyIds(new Set())
            }}
            className={`ui-btn ${showManagement ? 'ui-btn-primary' : ''}`}>
            {showManagement ? '收起管理' : '管理词表'}
          </button>}
        </div>
      </div>

      {showManagement ? (
        <section id="wordbook-management-panel" className="border-b border-slate-200 dark:border-slate-800 py-5">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">词表管理</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              删除操作不会删除词汇库中的单词。清除搜索后，可使用每个词条右侧的上、下箭头调整顺序。
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr_1fr]">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                名称
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleRename()}
                  className="ui-btn ui-btn-sm">
                  重命名词表
                </button>
                <button
                  type="button"
                  onClick={() => void handleRenameSeries()}
                  className="ui-btn ui-btn-sm">
                  重命名系列
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                归属系列
              </p>
              <div className="flex gap-2">
                <CustomSelect
                  aria-label="目标词书系列"
                  value={targetSeriesId}
                  disabled={moveOptions.length === 0}
                  onChange={event => setTargetSeriesId(event.currentTarget.value)}
                  className="min-w-0 flex-1">
                  {moveOptions.length === 0 ? <option value="">没有其他系列</option> : null}
                  {moveOptions.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </CustomSelect>
                <button
                  type="button"
                  disabled={!targetSeriesId}
                  onClick={() => void handleMove()}
                  className="ui-btn ui-btn-sm disabled:opacity-40">
                  移动
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleCreateSeriesAndMove()}
                className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400 underline-offset-4 hover:text-slate-900 hover:underline">
                新建系列并移动当前词表
              </button>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                新增与删除
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateSibling()}
                  className="ui-btn ui-btn-sm">
                  新建同系列词表
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteWordbook()}
                  className="ui-btn ui-btn-sm ui-btn-danger">
                  删除当前词表
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <form
        role='search'
        aria-label='搜索整本单词书'
        className='ui-toolbar border-b border-slate-200 dark:border-slate-800 py-3'
        onSubmit={event => { event.preventDefault(); navigate(1, keyword) }}>
        <label className='min-w-0 flex-1 text-xs font-medium text-slate-500 dark:text-slate-400'>
          搜索整本单词书
          <input
            type='search'
            value={keyword}
            onChange={event => setKeyword(event.currentTarget.value)}
            placeholder='单词、读音、释义或词性'
            className='mt-1 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-base text-slate-800 dark:text-slate-200 outline-none focus:border-slate-500 md:text-sm'
          />
        </label>
        <button type='submit' disabled={isNavigating} className='ui-btn self-end disabled:opacity-50'>{isNavigating ? '搜索中…' : '搜索'}</button>
        {initialQuery ? <button type='button' className='ui-btn self-end' onClick={() => { setKeyword(''); navigate(1, '') }}>清除</button> : null}
        {showManagement && viewMode === 'list' ? (
          <button type='button' onClick={toggleVisibleVocabularies} disabled={!visibleIds.length || isNavigating} className='ui-btn self-end disabled:opacity-40'>
            {allVisibleSelected ? '取消全选' : `全选本页（${visibleIds.length}）`}
          </button>
        ) : null}
      </form>

      {viewMode === 'list' ? (
        <>
          {showManagement && selectedVocabularyIds.size > 0 ? (
            <section
              className="mb-4 border-y border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4"
              aria-label="批量编辑单词">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    已选择 {selectedVocabularyIds.size} 个单词
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">词性和标签会追加；JLPT 只更新当前词表中的收录记录。</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedVocabularyIds(new Set())}
                  className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900">
                  清空选择
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2" aria-label="常用词性">
                {partOfSpeechOptions.map(option => {
                  const selected = selectedPartsOfSpeech.has(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => togglePartOfSpeech(option)}
                      className={`min-h-10 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                        selected
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-500'
                      }`}>
                      {selected ? '✓ ' : ''}
                      {option}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  其他词性（可选）
                  <input
                    type="text"
                    value={customPartOfSpeech}
                    onChange={event => setCustomPartOfSpeech(event.currentTarget.value)}
                    placeholder="多个词性用逗号分隔"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <button
                  type="button"
                  disabled={isBulkSaving}
                  onClick={() => void handleAddPartsOfSpeech()}
                  className="ui-btn ui-btn-primary self-end disabled:opacity-50">
                  {isBulkSaving ? '添加中…' : `添加到 ${selectedVocabularyIds.size} 个单词`}
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 dark:border-slate-800 pt-4 sm:flex-row">
                <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  JLPT
                  <CustomSelect
                    value={bulkJlpt}
                    onChange={event => setBulkJlpt(event.currentTarget.value)}
                    className="mt-1 h-10 w-full text-left text-sm">
                    <option value="">未设置（清除）</option>
                    {JLPT_LEVELS.map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </CustomSelect>
                </label>
                <button
                  type="button"
                  disabled={isBulkJlptSaving}
                  onClick={() => void handleSetJlpt()}
                  className="ui-btn ui-btn-primary self-end disabled:opacity-50">
                  {isBulkJlptSaving ? '保存中…' : `设置 JLPT 到 ${selectedVocabularyIds.size} 个词条`}
                </button>
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 dark:border-slate-800 pt-4 sm:flex-row">
                <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  批量添加标签
                  <input
                    type="text"
                    value={bulkTagsInput}
                    onChange={event => setBulkTagsInput(event.currentTarget.value)}
                    placeholder="多个标签用逗号分隔"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  />
                </label>
                <button
                  type="button"
                  disabled={isBulkTagSaving}
                  onClick={() => void handleAddTags()}
                  className="ui-btn ui-btn-primary self-end disabled:opacity-50">
                  {isBulkTagSaving ? '添加中…' : `添加标签到 ${selectedVocabularyIds.size} 个单词`}
                </button>
              </div>
            </section>
          ) : null}
          <div className="divide-y divide-slate-200 border-y border-slate-200 dark:border-slate-800">
            {filteredItems.map((item, index) => (
              <WordbookEntryRow
                key={item.id}
                item={item}
                wordbookId={wordbookId}
                position={(currentPage - 1) * pageSize + index + 1}
                managing={showManagement}
                selected={selectedVocabularyIds.has(item.id)}
                removing={pendingVocabularyIds.has(item.id)}
                reordering={isReordering}
                canMoveUp={!initialQuery && (index > 0 || currentPage > 1)}
                canMoveDown={!initialQuery && (currentPage - 1) * pageSize + index + 1 < totalCount}
                onToggle={() => toggleVocabulary(item.id)}
                onMoveUp={showManagement && !initialQuery ? () => void handleMoveVocabulary(item, 'up') : undefined}
                onMoveDown={showManagement && !initialQuery ? () => void handleMoveVocabulary(item, 'down') : undefined}
                onRemove={() => void handleRemoveVocabulary(item)}
              />
            ))}
            {filteredItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">当前范围内没有词条</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-3xl">
          <div className="relative flex min-h-[520px] w-full flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-7">
            {currentFlash ? (
              <>
                <div className="mb-3 border-b border-slate-100 pb-4 text-center">
                  <WordPronunciation
                    word={currentFlash.word}
                    pronunciation={currentFlash.pronunciations[0] || ''}
                    pronunciations={currentFlash.pronunciations}
                    etymologies={currentFlash.etymologies}
                    showPronunciation
                    wordClassName="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 md:text-5xl"
                    hintClassName="text-xs font-semibold text-slate-500 dark:text-slate-400 md:text-sm"
                  />
                  {(currentFlash.partsOfSpeech[0] || '').trim() ? (
                    <div className="mt-3">
                      <span className="ui-tag ui-tag-muted h-6 px-2.5 text-[11px]">
                        {(currentFlash.partsOfSpeech[0] || '').trim()}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="mb-5 flex items-center justify-center gap-2">
                  {currentFlash.wordAudio ? (
                    <button
                      type="button"
                      onClick={() => playAudioFile(currentFlash.wordAudio)}
                      className="ui-btn ui-btn-sm h-8 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      发音
                    </button>
                  ) : null}
                  {canManage && <Link href={buildWordbookEntryHref(wordbookId, currentFlash.id, true)} prefetch={false} className="ui-btn">
                    编辑
                  </Link>}
                </div>

                <p className='mb-5 whitespace-pre-wrap text-center text-base leading-7 text-slate-700 dark:text-slate-300'>{currentFlash.meanings.join('；') || '暂无释义'}</p>
                {flashSentences.length > 0 ? (
                  <div className="space-y-2">
                    {flashSentences.map((sentence, idx) => (
                      <div
                        key={`${currentFlash.id}-sent-${idx}`}
                        className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 px-4 py-3">
                        <p lang="ja" className="font-reading-ja text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
                          {sentence.text}
                        </p>
                        {sentence.translation ? <p className='mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400'>{sentence.translation}</p> : null}
                        <div className="mt-2 flex items-center gap-2 text-[12px] text-slate-400">
                          {sentence.sourceUrl ? (
                            <Link
                              href={sentence.sourceUrl}
                              className="underline-offset-2 hover:text-slate-600 hover:underline">
                              {sentence.source || '来源'}
                            </Link>
                          ) : sentence.source ? (
                            <span>{sentence.source}</span>
                          ) : null}
                          {sentence.audioFile ? (
                            <>
                              <span>｜</span>
                              <button
                                type="button"
                                onClick={() => playAudioFile(sentence.audioFile)}
                                className="font-medium text-slate-500 dark:text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline">
                                播放
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-auto pt-5">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFlashIndex(prev => Math.max(0, prev - 1))}
                      disabled={flashIndex <= 0}
                      className="ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50">
                      上一张
                    </button>
                    <span className="ui-tag ui-tag-muted h-6 px-2 text-[11px] font-semibold">
                      {flashIndex + 1}/{filteredItems.length}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFlashIndex(prev => Math.min(filteredItems.length - 1, prev + 1))
                      }
                      disabled={flashIndex >= filteredItems.length - 1}
                      className="ui-btn ui-btn-sm disabled:pointer-events-none disabled:opacity-50">
                      下一张
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">当前单词书暂无词条</p>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-0.5">
        <button
          type="button"
          aria-label="上一页"
          onClick={() => toPage(currentPage - 1)}
          disabled={currentPage <= 1 || isNavigating}
          className="ui-btn disabled:pointer-events-none disabled:opacity-50">
          ‹
        </button>
        <button
          type="button"
          aria-label="下一页"
          onClick={() => toPage(currentPage + 1)}
          disabled={currentPage >= totalPages || isNavigating}
          className="ui-btn disabled:pointer-events-none disabled:opacity-50">
          ›
        </button>
      </div>
    </section>
  )
}
