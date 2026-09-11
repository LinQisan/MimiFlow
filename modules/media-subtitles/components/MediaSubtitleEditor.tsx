'use client'

// Subtitle editor and learning surface.

import {
  type ClipboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'

import WordTooltip from '@/modules/knowledge/vocabulary/components/WordTooltip'
import { useStudyTextHighlights } from '@/modules/knowledge/learning-records/useStudyTextHighlights'
import LearningPointHighlightPanel from '@/modules/knowledge/learning-records/components/LearningPointHighlightPanel'
import TrustedHtml from '@/components/ui/TrustedHtml'
import { useDialog } from '@/context/DialogContext'
import { useTextSelection } from '@/hooks/useTextSelection'
import {
  useShowMeaning,
  useShowPronunciation,
} from '@/modules/language/hooks/usePronunciationPrefs'
import { annotateJapaneseText } from '@/utils/language/japaneseRuby'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import { buildPronunciationMapForText } from '@/utils/vocabulary/japaneseInflection'
import { buildAudioDialogueSourceId } from '@/utils/audioDialogue/sourceId'
import SubtitleReaderControls from '@/modules/media-subtitles/components/SubtitleReaderControls'
import {
  remapKeyedState,
  resequenceRows,
  sentenceMeaningNotes,
  filterSubtitleRows,
  type DialogueRow,
} from '@/modules/media-subtitles/domain/editor'
import { highlightSubtitleKeyword } from '@/modules/media-subtitles/components/HighlightedSubtitleText'
import { useMediaSubtitleEditorState } from '@/modules/media-subtitles/hooks/useMediaSubtitleEditorState'
import {
  deleteMediaSubtitleLine,
  updateMediaSubtitleLineMeta,
} from '@/modules/media-subtitles/actions'

type Props = {
  materialId: string
  initialTitle: string
  initialDialogues: DialogueRow[]
  initialPronunciationMap: Record<string, string>
  initialVocabularyMetaMap: Record<string, VocabularyMeta>
  initialSearchKeyword?: string
  initialFocusedStableId?: string
}

export default function MediaSubtitleEditor({
  materialId,
  initialDialogues,
  initialPronunciationMap,
  initialVocabularyMetaMap,
  initialSearchKeyword = '',
  initialFocusedStableId = '',
}: Props) {
  const dialog = useDialog()
  const editorState = useMediaSubtitleEditorState({
    initialDialogues,
    initialSearchKeyword,
    initialPronunciationMap,
    initialVocabularyMetaMap,
  })
  const {
    rows, setRows, showTimeline, setShowTimeline, showFavoriteOnly,
    setShowFavoriteOnly, pageSize, setPageSize, currentPage, setCurrentPage,
    searchKeyword, setSearchKeyword, currentSearchHitIndex,
    setCurrentSearchHitIndex, expandedNoteRowId, setExpandedNoteRowId,
    editingRowId, setEditingRowId, copyFromId, setCopyFromId, copyToId,
    setCopyToId, copyState, setCopyState, selectedRowIds, setSelectedRowIds,
    lastSelectedRowId, setLastSelectedRowId, selectedCopyState,
    setSelectedCopyState, noteDraftById, setNoteDraftById, editDraftById,
    setEditDraftById, lineMetaMessage, setLineMetaMessage,
    localPronunciationMap, setLocalPronunciationMap, localVocabularyMetaMap,
    setLocalVocabularyMetaMap,
  } = editorState
  const deferredSearchKeyword = useDeferredValue(searchKeyword)
  const normalizedSearchKeyword = deferredSearchKeyword.trim().toLowerCase()
  const [lineMetaPending, startLineMetaTransition] = useTransition()

  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()
  const [showLearningPoints, setShowLearningPoints] = useState(false)
  const { selection, closeSelection } = useTextSelection()
  const subtitleRootRef = useRef<HTMLElement>(null)
  const rowRefs = useRef<Record<number, HTMLElement | null>>({})
  const hasAppliedInitialFocusRef = useRef(false)

  const filteredRows = useMemo(
    () => filterSubtitleRows({ rows, favoriteOnly: showFavoriteOnly, keyword: normalizedSearchKeyword }),
    [rows, showFavoriteOnly, normalizedSearchKeyword],
  )
  const searchHitIds = useMemo(
    () =>
      normalizedSearchKeyword
        ? filteredRows
            .filter(row => row.text.toLowerCase().includes(normalizedSearchKeyword))
            .map(row => row.id)
        : [],
    [filteredRows, normalizedSearchKeyword],
  )
  const minRowId = useMemo(
    () =>
      rows.reduce(
        (min, row) => Math.min(min, row.id),
        Number.POSITIVE_INFINITY,
      ),
    [rows],
  )
  const maxRowId = useMemo(
    () =>
      rows.reduce(
        (max, row) => Math.max(max, row.id),
        Number.NEGATIVE_INFINITY,
      ),
    [rows],
  )
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const normalizedPage = Math.min(currentPage, totalPages)
  const paginatedRows = useMemo(
    () =>
      filteredRows.slice(
        (normalizedPage - 1) * pageSize,
        normalizedPage * pageSize,
      ),
    [filteredRows, normalizedPage, pageSize],
  )
  const {
    learningPoints,
    isLoadingLearningPoints,
    learningPointSelection,
    closeLearningPoint,
    inspectLearningPoint,
    inspectLearningPointWord,
  } = useStudyTextHighlights({
    rootRef: subtitleRootRef,
    contentKey: `${normalizedPage}:${paginatedRows
      .map(row => `${row.stableId}:${row.text}`)
      .join('\u0000')}`,
    showLearningPoints,
  })
  const currentSearchHitId = searchHitIds[currentSearchHitIndex] || null
  const favoriteCount = useMemo(
    () => rows.filter(row => row.favorite).length,
    [rows],
  )
  const selectedRows = useMemo(
    () => rows.filter(row => selectedRowIds.has(row.id)),
    [rows, selectedRowIds],
  )
  const selectedText = useMemo(
    () =>
      selectedRows
        .map(row => row.text.trim())
        .filter(Boolean)
        .join('\n'),
    [selectedRows],
  )
  const visibleStart =
    filteredRows.length > 0 ? (normalizedPage - 1) * pageSize + 1 : 0
  const visibleEnd = Math.min(normalizedPage * pageSize, filteredRows.length)
  const normalizedCopyFrom =
    Number.isFinite(minRowId) && Number.isFinite(maxRowId)
      ? Math.min(maxRowId, Math.max(minRowId, Math.floor(copyFromId)))
      : 0
  const normalizedCopyTo =
    Number.isFinite(minRowId) && Number.isFinite(maxRowId)
      ? Math.min(maxRowId, Math.max(minRowId, Math.floor(copyToId)))
      : 0
  const copyRangeCount =
    Number.isFinite(minRowId) && Number.isFinite(maxRowId)
      ? Math.abs(normalizedCopyTo - normalizedCopyFrom) + 1
      : 0

  useEffect(() => {
    setCurrentPage(1)
  }, [showFavoriteOnly, normalizedSearchKeyword, pageSize, setCurrentPage])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages, setCurrentPage])

  useEffect(() => {
    if (searchHitIds.length === 0) {
      setCurrentSearchHitIndex(0)
      return
    }
    setCurrentSearchHitIndex(prev => Math.min(prev, searchHitIds.length - 1))
  }, [searchHitIds, setCurrentSearchHitIndex])

  useEffect(() => {
    if (hasAppliedInitialFocusRef.current) return
    if (!initialFocusedStableId.trim()) {
      hasAppliedInitialFocusRef.current = true
      return
    }

    const targetRow = rows.find(row => row.stableId === initialFocusedStableId.trim())
    if (!targetRow) {
      hasAppliedInitialFocusRef.current = true
      return
    }

    const visibleRows = filteredRows.some(row => row.id === targetRow.id)
      ? filteredRows
      : rows
    const rowIndex = visibleRows.findIndex(row => row.id === targetRow.id)
    if (rowIndex < 0) {
      hasAppliedInitialFocusRef.current = true
      return
    }

    const targetPage = Math.floor(rowIndex / pageSize) + 1
    if (targetPage !== normalizedPage) {
      setCurrentPage(targetPage)
      return
    }

    const searchHitIndex = searchHitIds.findIndex(rowId => rowId === targetRow.id)
    if (searchHitIndex >= 0) {
      setCurrentSearchHitIndex(searchHitIndex)
    }

    rowRefs.current[targetRow.id]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
    hasAppliedInitialFocusRef.current = true
  }, [
    filteredRows,
    initialFocusedStableId,
    normalizedPage,
    pageSize,
    rows,
    searchHitIds,
    setCurrentPage,
    setCurrentSearchHitIndex,
  ])

  useEffect(() => {
    if (!currentSearchHitId) return
    const hitPosition = filteredRows.findIndex(row => row.id === currentSearchHitId)
    if (hitPosition < 0) return
    const targetPage = Math.floor(hitPosition / pageSize) + 1
    if (targetPage !== normalizedPage) {
      setCurrentPage(targetPage)
      return
    }
    const target = rowRefs.current[currentSearchHitId]
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [
    currentSearchHitId,
    filteredRows,
    normalizedPage,
    pageSize,
    setCurrentPage,
  ])

  const moveSearchHit = (direction: 1 | -1) => {
    if (searchHitIds.length === 0) return
    setCurrentSearchHitIndex(prev => {
      const next = prev + direction
      if (next < 0) return searchHitIds.length - 1
      if (next >= searchHitIds.length) return 0
      return next
    })
  }

  const annotateSentence = (text: string) => {
    if (!showPronunciation) return text
    const pronMap = buildPronunciationMapForText(
      text,
      Object.entries(localPronunciationMap).reduce<Record<string, string>>(
        (acc, [word, pronunciation]) => {
          if (pronunciation.trim()) acc[word] = pronunciation
          return acc
        },
        {},
      ),
    )
    if (Object.keys(pronMap).length === 0) return text

    const html = annotateJapaneseText(text, pronMap, {
      rubyClassName: 'jp-ruby',
      rtClassName: 'jp-ruby-rt text-[10px] font-bold text-slate-500',
    })
    return <TrustedHtml html={html} />
  }

  const renderSentence = (row: DialogueRow): ReactNode => {
    if (!showPronunciation) {
      return highlightSubtitleKeyword(row.text, deferredSearchKeyword)
    }
    return annotateSentence(row.text)
  }

  const runLineUpdate = (
    lineId: number,
    patch: Parameters<typeof updateMediaSubtitleLineMeta>[2],
  ) => {
    startLineMetaTransition(async () => {
      const result = await updateMediaSubtitleLineMeta(materialId, lineId, patch)
      if (!result.success) {
        setLineMetaMessage(result.message || '保存失败。')
        return
      }

      setRows(prev =>
        prev.map(item => {
          if (item.id !== lineId) return item
          return {
            ...item,
            favorite:
              typeof patch.favorite === 'boolean'
                ? patch.favorite
                : item.favorite,
            note:
              typeof patch.note === 'string' ? patch.note.trim() : item.note,
            text:
              typeof patch.text === 'string' && patch.text.trim()
                ? patch.text.trim()
                : item.text,
            start:
              Number.isFinite(patch.start as number) && patch.start != null
                ? Number(patch.start)
                : item.start,
            end:
              Number.isFinite(patch.end as number) && patch.end != null
                ? Number(patch.end)
                : item.end,
          }
        }),
      )
      setLineMetaMessage(result.message || '已保存。')
    })
  }

  const handleToggleFavorite = (row: DialogueRow) => {
    runLineUpdate(row.id, { favorite: !row.favorite })
  }

  const handleSaveNote = (row: DialogueRow) => {
    const note = (noteDraftById[row.id] || '').trim()
    runLineUpdate(row.id, { note })
    setExpandedNoteRowId(null)
  }

  const handleStartEditRow = (row: DialogueRow) => {
    setEditingRowId(row.id)
    setEditDraftById(prev => ({
      ...prev,
      [row.id]: {
        start: String(row.start),
        end: String(row.end),
        text: row.text,
      },
    }))
  }

  const handleSaveEditRow = (rowId: number) => {
    const draft = editDraftById[rowId]
    if (!draft) return
    runLineUpdate(rowId, {
      start: Number(draft.start),
      end: Number(draft.end),
      text: draft.text,
    })
    setEditingRowId(null)
  }

  const handleDeleteRow = async (row: DialogueRow) => {
    if (rows.length <= 1) {
      setLineMetaMessage('至少保留一行字幕。')
      return
    }
    const confirmed = await dialog.confirm(
      `确认删除第 ${row.id} 行字幕吗？后续编号会自动顺延。`,
      {
        title: '删除字幕行',
        confirmText: '删除',
        danger: true,
      },
    )
    if (!confirmed) {
      return
    }

    startLineMetaTransition(async () => {
      const result = await deleteMediaSubtitleLine(materialId, row.id)
      if (!result.success) {
        setLineMetaMessage(result.message || '删除失败。')
        return
      }

      const filtered = rows.filter(item => item.id !== row.id)
      const resequenced = resequenceRows(filtered)
      setRows(resequenced.rows)
      setNoteDraftById(prev => remapKeyedState(prev, resequenced.idMap))
      setEditDraftById(prev => remapKeyedState(prev, resequenced.idMap))
      setExpandedNoteRowId(prev =>
        prev == null ? null : resequenced.idMap.get(prev) ?? null,
      )
      setEditingRowId(prev =>
        prev == null ? null : resequenced.idMap.get(prev) ?? null,
      )
      setSelectedRowIds(prev => {
        const next = new Set<number>()
        prev.forEach(rowId => {
          const mapped = resequenced.idMap.get(rowId)
          if (mapped != null) next.add(mapped)
        })
        return next
      })
      setLastSelectedRowId(prev =>
        prev == null ? null : resequenced.idMap.get(prev) ?? null,
      )
      setCopyFromId(prev => {
        const mapped = resequenced.idMap.get(prev)
        if (mapped != null) return mapped
        return Math.min(prev, resequenced.rows.length || 1)
      })
      setCopyToId(prev => {
        const mapped = resequenced.idMap.get(prev)
        if (mapped != null) return mapped
        return Math.min(prev, resequenced.rows.length || 1)
      })
      setLineMetaMessage(result.message || '已删除。')
    })
  }

  const selectRow = (rowId: number, extendRange: boolean) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev)
      if (extendRange && lastSelectedRowId != null) {
        const [start, end] =
          lastSelectedRowId <= rowId
            ? [lastSelectedRowId, rowId]
            : [rowId, lastSelectedRowId]
        rows.forEach(row => {
          if (row.id >= start && row.id <= end) next.add(row.id)
        })
      } else if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
    setLastSelectedRowId(rowId)
  }

  const clampSentenceId = (value: number) => {
    if (!Number.isFinite(value)) return minRowId
    return Math.min(maxRowId, Math.max(minRowId, Math.floor(value)))
  }

  const writeClipboard = useCallback(async (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }

    if (typeof document === 'undefined') {
      throw new Error('clipboard api unavailable')
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (!copied) throw new Error('copy fallback failed')
  }, [])

  const handleCopySelectedRows = useCallback(async () => {
    if (!selectedText) {
      setSelectedCopyState('error')
      window.setTimeout(() => setSelectedCopyState('idle'), 1500)
      return
    }

    try {
      await writeClipboard(selectedText)
      setSelectedCopyState('copied')
      window.setTimeout(() => setSelectedCopyState('idle'), 1800)
    } catch {
      setSelectedCopyState('error')
      window.setTimeout(() => setSelectedCopyState('idle'), 1800)
    }
  }, [selectedText, setSelectedCopyState, writeClipboard])

  const handleCopySelectedRowsFromClipboardEvent = (
    event: ClipboardEvent<HTMLElement>,
  ) => {
    if (!selectedText) return
    const browserSelection =
      typeof window !== 'undefined' ? window.getSelection()?.toString() : ''
    if (browserSelection?.trim()) return

    event.preventDefault()
    event.clipboardData.setData('text/plain', selectedText)
    setSelectedCopyState('copied')
    window.setTimeout(() => setSelectedCopyState('idle'), 1800)
  }

  const handleCopyRange = async () => {
    if (!Number.isFinite(minRowId) || !Number.isFinite(maxRowId)) return
    const from = clampSentenceId(copyFromId)
    const to = clampSentenceId(copyToId)
    const [start, end] = from <= to ? [from, to] : [to, from]

    const text = rows
      .filter(row => row.id >= start && row.id <= end)
      .map(row => row.text.trim())
      .filter(Boolean)
      .join('\n')

    if (!text) {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1500)
      return
    }

    try {
      await writeClipboard(text)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedText) return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'c') {
        return
      }

      const target = event.target as HTMLElement | null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [data-context-ignore]',
        )
      ) {
        return
      }

      event.preventDefault()
      void handleCopySelectedRows()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleCopySelectedRows, selectedText])

  const handleRowMouseDown = (
    event: MouseEvent<HTMLElement>,
    rowId: number,
  ) => {
    if (!event.shiftKey) return
    const target = event.target as HTMLElement
    if (target.closest('[data-row-action]')) return

    event.preventDefault()
    selectRow(rowId, true)
  }

  const handleRowClick = (event: MouseEvent<HTMLElement>, rowId: number) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-row-action]')) return
    if (event.shiftKey) return

    const browserSelection =
      typeof window !== 'undefined' ? window.getSelection()?.toString() : ''
    if (browserSelection?.trim()) return

    event.preventDefault()
    selectRow(rowId, false)
  }

  const handleEditorBackgroundClick = (event: MouseEvent<HTMLElement>) => {
    if (selectedRowIds.size === 0) return
    const target = event.target as HTMLElement
    if (
      target.closest(
        '[data-subtitle-row], button, input, textarea, select, a, [data-context-ignore]',
      )
    ) {
      return
    }

    setSelectedRowIds(new Set())
    setLastSelectedRowId(null)
  }

  return (
    <section
      ref={subtitleRootRef}
      className='border border-slate-200 bg-white'
      onCopy={handleCopySelectedRowsFromClipboardEvent}
      onClick={handleEditorBackgroundClick}>
      <div className='border-b border-slate-200 px-4 py-4 md:px-5'>
        <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
          <h2 className='ui-section-head'>字幕阅读</h2>
          <div className='flex flex-wrap gap-2 text-xs font-bold text-slate-600'>
            <span className='rounded border border-slate-200 bg-slate-50 px-2.5 py-1'>
              {rows.length} 句
            </span>
            <span className='rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700'>
              {favoriteCount} 收藏
            </span>
            {selectedRowIds.size > 0 && (
              <span className='rounded border border-teal-200 bg-teal-50 px-2.5 py-1 text-teal-700'>
                已选 {selectedRowIds.size} 句
              </span>
            )}
            <span className='rounded border border-slate-200 bg-slate-50 px-2.5 py-1'>
              第 {normalizedPage}/{totalPages} 页
            </span>
          </div>
        </div>
      </div>

      <div className='space-y-4 p-4 md:p-5'>
        <SubtitleReaderControls
          searchKeyword={searchKeyword}
          setSearchKeyword={setSearchKeyword}
          searchHitCount={searchHitIds.length}
          currentSearchHitIndex={currentSearchHitIndex}
          moveSearchHit={moveSearchHit}
          visibleStart={visibleStart}
          visibleEnd={visibleEnd}
          filteredCount={filteredRows.length}
          showPronunciation={showPronunciation}
          setShowPronunciation={setShowPronunciation}
          showMeaning={showMeaning}
          setShowMeaning={setShowMeaning}
          showLearningPoints={showLearningPoints}
          setShowLearningPoints={setShowLearningPoints}
          showTimeline={showTimeline}
          setShowTimeline={setShowTimeline}
          showFavoriteOnly={showFavoriteOnly}
          setShowFavoriteOnly={setShowFavoriteOnly}
          pageSize={pageSize}
          setPageSize={setPageSize}
        />

        {showLearningPoints ? (
          <LearningPointHighlightPanel
            points={learningPoints}
            isLoading={isLoadingLearningPoints}
            selection={learningPointSelection}
            onClose={closeLearningPoint}
            onInspect={inspectLearningPoint}
            onInspectWord={inspectLearningPointWord}
          />
        ) : null}

        <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center'>
          <div className='rounded-lg border border-slate-200 bg-slate-50 p-3'>
            <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
              <div>
                <p className='text-xs font-bold text-slate-700'>复制字幕文本</p>
                <p className='mt-1 text-xs text-slate-500'>
                  可按句号范围复制，也可点击字幕框选择，Shift 点击另一框批量选择。
                </p>
              </div>
              <div className='space-y-2'>
                <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[7.5rem_7.5rem_auto]'>
                  <input
                    type='number'
                    min={Number.isFinite(minRowId) ? minRowId : 1}
                    max={Number.isFinite(maxRowId) ? maxRowId : 1}
                    value={copyFromId}
                    onChange={e => setCopyFromId(Number(e.target.value))}
                    className='h-10 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100'
                    placeholder='起始句号'
                  />
                  <input
                    type='number'
                    min={Number.isFinite(minRowId) ? minRowId : 1}
                    max={Number.isFinite(maxRowId) ? maxRowId : 1}
                    value={copyToId}
                    onChange={e => setCopyToId(Number(e.target.value))}
                    className='h-10 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100'
                    placeholder='结束句号'
                  />
                  <button
                    type='button'
                    onClick={() => void handleCopyRange()}
                    className={`col-span-2 h-10 rounded-md border px-3 text-xs font-bold transition sm:col-span-1 ${
                      copyState === 'copied'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : copyState === 'error'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100'
                    }`}>
                    {copyState === 'copied'
                      ? '已复制'
                      : copyState === 'error'
                        ? '复制失败'
                        : `复制 ${copyRangeCount} 句`}
                  </button>
                </div>
                <div className='grid gap-2 sm:grid-cols-[auto_auto] sm:justify-end'>
                  <button
                    type='button'
                    onClick={() => void handleCopySelectedRows()}
                    disabled={selectedRowIds.size === 0}
                    className={`h-10 rounded-md border px-3 text-xs font-bold transition ${
                      selectedCopyState === 'copied'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : selectedCopyState === 'error'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : selectedRowIds.size > 0
                            ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                            : 'cursor-not-allowed border-slate-200 bg-white text-slate-400'
                    }`}>
                    {selectedCopyState === 'copied'
                      ? '已复制选中'
                      : selectedCopyState === 'error'
                        ? '没有可复制文本'
                        : `复制选中 ${selectedRowIds.size} 句`}
                  </button>
                  <button
                    type='button'
                    onClick={() => {
                      setSelectedRowIds(new Set())
                      setLastSelectedRowId(null)
                    }}
                    disabled={selectedRowIds.size === 0}
                    className='h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'>
                    清空选择
                  </button>
                </div>
              </div>
            </div>
          </div>

          {lineMetaMessage && (
            <p className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600'>
              {lineMetaMessage}
            </p>
          )}
        </div>

        <div className='space-y-2'>
          {paginatedRows.map(row => {
            const notes = showMeaning
              ? sentenceMeaningNotes(row.text, localVocabularyMetaMap)
              : []
            const isEditing = editingRowId === row.id
            const editDraft = editDraftById[row.id]
            const isCurrentSearchHit = row.id === currentSearchHitId
            const isSearchMatch =
              normalizedSearchKeyword &&
              row.text.toLowerCase().includes(normalizedSearchKeyword)
            const isSelected = selectedRowIds.has(row.id)
            return (
              <article
                data-subtitle-row
                key={`read-${row.id}-${row.start}-${row.end}`}
                ref={node => {
                  rowRefs.current[row.id] = node
                }}
                onMouseDown={event => handleRowMouseDown(event, row.id)}
                onClick={event => handleRowClick(event, row.id)}
                className={`rounded-lg border bg-white px-3 py-3 transition hover:border-teal-200 hover:bg-teal-50/30 md:px-4 ${
                  isSelected
                    ? 'border-teal-400 bg-teal-50 ring-2 ring-teal-100'
                    : isCurrentSearchHit
                    ? 'border-teal-300 ring-2 ring-teal-100'
                    : isSearchMatch
                      ? 'border-yellow-200 bg-yellow-50/40'
                      : 'border-slate-200'
                }`}>
                <div className='flex items-start gap-3'>
                  <div
                    data-context-ignore
                    className='mt-1 flex h-7 min-w-9 shrink-0 items-center justify-center rounded bg-slate-100 px-2 text-[11px] font-bold text-slate-500'>
                    #{row.id}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div
                      data-context-ignore
                      className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                      <div className='flex flex-wrap items-center gap-1.5'>
                        <button
                          data-row-action
                          type='button'
                          onClick={() => handleToggleFavorite(row)}
                          disabled={lineMetaPending}
                          className={`rounded-md border px-2 py-1 text-[11px] font-bold transition ${
                            row.favorite
                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          } ${lineMetaPending ? 'opacity-60' : ''}`}>
                          {row.favorite ? '已收藏' : '收藏'}
                        </button>
                        <button
                          data-row-action
                          type='button'
                          onClick={() =>
                            setExpandedNoteRowId(prev =>
                              prev === row.id ? null : row.id,
                            )
                          }
                          className='rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50'>
                          {row.note ? '笔记*' : '笔记'}
                        </button>
                        <button
                          data-row-action
                          type='button'
                          onClick={() =>
                            isEditing
                              ? setEditingRowId(null)
                              : handleStartEditRow(row)
                          }
                          className='rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50'>
                          {isEditing ? '收起编辑' : '编辑'}
                        </button>
                        <button
                          data-row-action
                          type='button'
                          onClick={() => void handleDeleteRow(row)}
                          disabled={lineMetaPending || rows.length <= 1}
                          className='rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40'>
                          删除
                        </button>
                      </div>
                    </div>

                    {showTimeline && (
                      <p
                        data-context-ignore
                        className='mb-1 font-mono text-[11px] font-semibold text-blue-700'>
                        {row.start.toFixed(2)} → {row.end.toFixed(2)}
                      </p>
                    )}
                    <p
                      data-context-block
                      data-context-sentence
                      data-source-type='MEDIA_SUBTITLE_LINE'
                      data-source-id={buildAudioDialogueSourceId(
                        materialId,
                        row.stableId,
                      )}
                      className='media-subtitle-text break-words text-[16px] leading-8 text-slate-800 [overflow-wrap:anywhere] md:text-[18px]'>
                      {renderSentence(row)}
                    </p>

                    {notes.length > 0 && (
                      <div className='mt-2 flex flex-wrap gap-1.5'>
                        {notes.map(item => (
                          <span
                            key={`${row.id}-${item.word}`}
                            className='rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600'>
                            {item.word}：{item.meaning}
                          </span>
                        ))}
                      </div>
                    )}

                    {row.note && expandedNoteRowId !== row.id && (
                      <p
                        data-context-ignore
                        className='mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600'>
                        笔记：{row.note}
                      </p>
                    )}

                    {expandedNoteRowId === row.id && (
                      <div
                        data-context-ignore
                        className='mt-2 rounded-md border border-slate-200 bg-slate-50 p-2'>
                        <textarea
                          value={noteDraftById[row.id] ?? row.note ?? ''}
                          onChange={e =>
                            setNoteDraftById(prev => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                          rows={3}
                          placeholder='写点笔记，比如语法点、语气、语境。'
                          className='w-full resize-y border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
                        />
                        <div className='mt-2 flex justify-end gap-2'>
                          <button
                            type='button'
                            onClick={() => setExpandedNoteRowId(null)}
                            className='rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50'>
                            取消
                          </button>
                          <button
                            type='button'
                            onClick={() => handleSaveNote(row)}
                            disabled={lineMetaPending}
                            className='rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60'>
                            保存笔记
                          </button>
                        </div>
                      </div>
                    )}

                    {isEditing && (
                      <div className='mt-2 rounded-md border border-slate-200 bg-slate-50 p-2'>
                        <div className='grid grid-cols-1 gap-2 md:grid-cols-[7rem_7rem]'>
                          <input
                            type='number'
                            step='0.01'
                            value={editDraft?.start || String(row.start)}
                            onChange={e =>
                              setEditDraftById(prev => ({
                                ...prev,
                                [row.id]: {
                                  start: e.target.value,
                                  end: prev[row.id]?.end || String(row.end),
                                  text: prev[row.id]?.text || row.text,
                                },
                              }))
                            }
                            className='h-9 border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
                          />
                          <input
                            type='number'
                            step='0.01'
                            value={editDraft?.end || String(row.end)}
                            onChange={e =>
                              setEditDraftById(prev => ({
                                ...prev,
                                [row.id]: {
                                  start:
                                    prev[row.id]?.start || String(row.start),
                                  end: e.target.value,
                                  text: prev[row.id]?.text || row.text,
                                },
                              }))
                            }
                            className='h-9 border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
                          />
                        </div>
                        <textarea
                          value={editDraft?.text || row.text}
                          onChange={e =>
                            setEditDraftById(prev => ({
                              ...prev,
                              [row.id]: {
                                start: prev[row.id]?.start || String(row.start),
                                end: prev[row.id]?.end || String(row.end),
                                text: e.target.value,
                              },
                            }))
                          }
                          rows={2}
                          className='mt-2 w-full resize-y border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
                        />
                        <div className='mt-2 flex justify-end gap-2'>
                          <button
                            type='button'
                            onClick={() => setEditingRowId(null)}
                            className='rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50'>
                            取消
                          </button>
                          <button
                            type='button'
                            onClick={() => handleSaveEditRow(row.id)}
                            disabled={lineMetaPending}
                            className='rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60'>
                            保存编辑
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}

          {paginatedRows.length === 0 && (
            <div className='border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500'>
              暂无符合条件的句子。
            </div>
          )}
        </div>

        {filteredRows.length > 0 && (
          <div className='flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-3'>
            <p className='ui-meta tabular-nums'>
              第 {visibleStart}-{visibleEnd} 句 · {normalizedPage} / {totalPages} 页
            </p>
            <div className='flex items-center gap-0.5'>
              <button
                type='button'
                aria-label='上一页'
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={normalizedPage <= 1}
                className='inline-flex size-7 items-center justify-center rounded-md text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40'>
                ‹
              </button>
              <button
                type='button'
                aria-label='下一页'
                onClick={() =>
                  setCurrentPage(prev => Math.min(totalPages, prev + 1))
                }
                disabled={normalizedPage >= totalPages}
                className='inline-flex size-7 items-center justify-center rounded-md text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40'>
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {selection.isVisible && selection.sourceType !== '' && (
        <WordTooltip
          word={selection.text}
          x={selection.x}
          y={selection.y}
          isTop={selection.isTop}
          contextSentence={selection.contextSentence}
          sourceType={selection.sourceType}
          sourceId={selection.sourceId}
          detectedWord={selection.detectedWord}
          initialMeta={localVocabularyMetaMap[selection.text]}
          onSaved={({ word, meta }) => {
            setLocalVocabularyMetaMap(prev => ({ ...prev, [word]: meta }))
            if (meta.pronunciations[0]) {
              setLocalPronunciationMap(prev => ({
                ...prev,
                [word]: meta.pronunciations[0],
              }))
            }
          }}
          onClose={closeSelection}
        />
      )}
    </section>
  )
}
