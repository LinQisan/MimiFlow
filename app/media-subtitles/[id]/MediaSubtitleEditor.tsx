'use client'

import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'

import ToggleSwitch from '@/components/ToggleSwitch'
import WordTooltip from '@/components/exam/WordTooltip'
import { useTextSelection } from '@/hooks/useTextSelection'
import {
  useShowMeaning,
  useShowPronunciation,
} from '@/hooks/usePronunciationPrefs'
import { annotateJapaneseText } from '@/utils/language/japaneseRuby'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import {
  buildPronunciationMapForText,
  buildSurfaceAliasMapForText,
} from '@/utils/vocabulary/japaneseInflection'
import { buildAudioDialogueSourceId } from '@/utils/audioDialogue/sourceId'
import {
  deleteMediaSubtitleLine,
  updateMediaSubtitleLineMeta,
} from '../actions'

type DialogueRow = {
  id: number
  stableId: string
  start: number
  end: number
  text: string
  note: string
  favorite: boolean
}

type Props = {
  legacyId: string
  materialId: string
  initialTitle: string
  initialDialogues: DialogueRow[]
  initialPronunciationMap: Record<string, string>
  initialVocabularyMetaMap: Record<string, VocabularyMeta>
  initialSearchKeyword?: string
  initialFocusedStableId?: string
}

const PAGE_SIZE_OPTIONS = [20, 40, 80]

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function highlightKeyword(text: string, keyword: string) {
  const normalizedKeyword = keyword.trim()
  if (!normalizedKeyword || !text) return text

  const parts = text.split(new RegExp(`(${escapeRegExp(normalizedKeyword)})`, 'gi'))
  return parts.map((part, index) =>
    part.toLowerCase() === normalizedKeyword.toLowerCase() ? (
      <mark
        key={`${part}-${index}`}
        className='rounded-sm bg-yellow-200/90 px-0.5 font-bold text-slate-900'>
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

function sentenceMeaningNotes(
  sentence: string,
  vocabularyMetaMap: Record<string, VocabularyMeta>,
) {
  const words = Object.keys(vocabularyMetaMap)
  const aliasMap = buildSurfaceAliasMapForText(sentence, words)
  const bestByBase = new Map<string, { word: string; meaning: string }>()
  Object.entries(aliasMap).forEach(([surface, base]) => {
    const meaning = vocabularyMetaMap[base]?.meanings?.[0] || ''
    if (!meaning.trim()) return
    const existing = bestByBase.get(base)
    if (!existing || surface.length > existing.word.length) {
      bestByBase.set(base, { word: surface, meaning })
    }
  })
  return Array.from(bestByBase.values())
    .sort((a, b) => b.word.length - a.word.length)
    .slice(0, 6)
}

function resequenceRows(rows: DialogueRow[]) {
  const idMap = new Map<number, number>()
  const nextRows = rows.map((row, index) => {
    const nextId = index + 1
    idMap.set(row.id, nextId)
    return {
      ...row,
      id: nextId,
    }
  })
  return { rows: nextRows, idMap }
}

function remapKeyedState<T>(
  source: Record<number, T>,
  idMap: Map<number, number>,
) {
  return Object.entries(source).reduce<Record<number, T>>((acc, [key, value]) => {
    const oldId = Number(key)
    const nextId = idMap.get(oldId)
    if (nextId != null) acc[nextId] = value
    return acc
  }, {})
}

export default function MediaSubtitleEditor({
  legacyId,
  materialId,
  initialTitle,
  initialDialogues,
  initialPronunciationMap,
  initialVocabularyMetaMap,
  initialSearchKeyword = '',
  initialFocusedStableId = '',
}: Props) {
  const [rows, setRows] = useState<DialogueRow[]>(
    initialDialogues.length > 0
      ? initialDialogues
      : [
          {
            id: 1,
            stableId: 'draft-1',
            start: 0,
            end: 1,
            text: '',
            note: '',
            favorite: false,
          },
        ],
  )
  const [showTimeline, setShowTimeline] = useState(false)
  const [showFavoriteOnly, setShowFavoriteOnly] = useState(false)
  const [pageSize, setPageSize] = useState(40)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchKeyword, setSearchKeyword] = useState(initialSearchKeyword)
  const deferredSearchKeyword = useDeferredValue(searchKeyword)
  const normalizedSearchKeyword = deferredSearchKeyword.trim().toLowerCase()
  const [currentSearchHitIndex, setCurrentSearchHitIndex] = useState(0)
  const [expandedNoteRowId, setExpandedNoteRowId] = useState<number | null>(
    null,
  )
  const [editingRowId, setEditingRowId] = useState<number | null>(null)
  const [copyFromId, setCopyFromId] = useState(initialDialogues[0]?.id || 1)
  const [copyToId, setCopyToId] = useState(
    initialDialogues[initialDialogues.length - 1]?.id || 1,
  )
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  )
  const [noteDraftById, setNoteDraftById] = useState<Record<number, string>>(
    () =>
      initialDialogues.reduce<Record<number, string>>((acc, row) => {
        acc[row.id] = row.note || ''
        return acc
      }, {}),
  )
  const [editDraftById, setEditDraftById] = useState<
    Record<number, { start: string; end: string; text: string }>
  >({})
  const [lineMetaMessage, setLineMetaMessage] = useState('')
  const [lineMetaPending, startLineMetaTransition] = useTransition()
  const [localPronunciationMap, setLocalPronunciationMap] = useState(
    initialPronunciationMap,
  )
  const [localVocabularyMetaMap, setLocalVocabularyMetaMap] = useState(
    initialVocabularyMetaMap,
  )

  const { showPronunciation, setShowPronunciation } = useShowPronunciation()
  const { showMeaning, setShowMeaning } = useShowMeaning()
  const { selection, closeSelection } = useTextSelection()
  const rowRefs = useRef<Record<number, HTMLElement | null>>({})
  const hasAppliedInitialFocusRef = useRef(false)

  const filteredRows = useMemo(
    () =>
      rows.filter(row => {
        if (showFavoriteOnly && !row.favorite) return false
        if (!normalizedSearchKeyword) return true
        const haystacks = [row.text, row.note, String(row.id)]
        return haystacks.some(item =>
          item.toLowerCase().includes(normalizedSearchKeyword),
        )
      }),
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
  const currentSearchHitId = searchHitIds[currentSearchHitIndex] || null

  useEffect(() => {
    setCurrentPage(1)
  }, [showFavoriteOnly, normalizedSearchKeyword, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (searchHitIds.length === 0) {
      setCurrentSearchHitIndex(0)
      return
    }
    setCurrentSearchHitIndex(prev => Math.min(prev, searchHitIds.length - 1))
  }, [searchHitIds])

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
  }, [currentSearchHitId, filteredRows, normalizedPage, pageSize])

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
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  }

  const renderSentence = (row: DialogueRow): ReactNode => {
    if (!showPronunciation) {
      return highlightKeyword(row.text, deferredSearchKeyword)
    }
    return annotateSentence(row.text)
  }

  const runLineUpdate = (
    lineId: number,
    patch: Parameters<typeof updateMediaSubtitleLineMeta>[2],
  ) => {
    startLineMetaTransition(async () => {
      const result = await updateMediaSubtitleLineMeta(legacyId, lineId, patch)
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

  const handleDeleteRow = (row: DialogueRow) => {
    if (rows.length <= 1) {
      setLineMetaMessage('至少保留一行字幕。')
      return
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`确认删除第 ${row.id} 行字幕吗？后续编号会自动顺延。`)
    ) {
      return
    }

    startLineMetaTransition(async () => {
      const result = await deleteMediaSubtitleLine(legacyId, row.id)
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

  const clampSentenceId = (value: number) => {
    if (!Number.isFinite(value)) return minRowId
    return Math.min(maxRowId, Math.max(minRowId, Math.floor(value)))
  }

  const writeClipboard = async (text: string) => {
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

  return (
    <section className='rounded-3xl border border-slate-200 bg-white p-3 md:p-5'>
      <div className='mb-3 border-b border-slate-100 pb-3'>
        <h2 className='text-base font-black text-slate-900'>字幕阅读</h2>
        <p className='text-xs text-slate-500'>
          {initialTitle}。句子旁可直接收藏、写笔记、编辑句子。
        </p>
      </div>

      <div className='space-y-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <ToggleSwitch
            checked={showPronunciation}
            onChange={setShowPronunciation}
            label='注音'
          />
          <ToggleSwitch
            checked={showMeaning}
            onChange={setShowMeaning}
            label='注释'
          />
          <ToggleSwitch
            checked={showTimeline}
            onChange={setShowTimeline}
            label='时间轴'
          />
          <ToggleSwitch
            checked={showFavoriteOnly}
            onChange={setShowFavoriteOnly}
            label='仅看收藏'
          />
        </div>

        <div className='rounded-xl border border-slate-200 bg-slate-50 p-3'>
          <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
            <div className='flex flex-1 flex-col gap-2 sm:flex-row'>
              <input
                type='text'
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.currentTarget.value)}
                placeholder='页内搜索句子、句号或笔记'
                className='h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
              />
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={() => moveSearchHit(-1)}
                  disabled={searchHitIds.length === 0}
                  className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'>
                  上一条
                </button>
                <button
                  type='button'
                  onClick={() => moveSearchHit(1)}
                  disabled={searchHitIds.length === 0}
                  className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'>
                  下一条
                </button>
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <label className='text-[11px] font-semibold text-slate-500'>
                每页
              </label>
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.currentTarget.value))}
                className='h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'>
                {PAGE_SIZE_OPTIONS.map(option => (
                  <option key={`page-size-${option}`} value={option}>
                    {option} 句
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className='mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-500'>
            <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1'>
              共 {filteredRows.length} 句
            </span>
            <span className='rounded-full border border-slate-200 bg-white px-2.5 py-1'>
              第 {normalizedPage}/{totalPages} 页
            </span>
            {deferredSearchKeyword.trim() && (
              <span className='rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700'>
                句子命中 {searchHitIds.length} 条
                {searchHitIds.length > 0
                  ? ` · 当前 ${currentSearchHitIndex + 1}/${searchHitIds.length}`
                  : ''}
              </span>
            )}
          </div>
        </div>

        {lineMetaMessage && (
          <p className='text-xs font-semibold text-slate-600'>
            {lineMetaMessage}
          </p>
        )}

        <div className='rounded-xl border border-slate-200 bg-slate-50 p-2.5'>
          <p className='mb-2 text-[11px] font-bold tracking-wide text-slate-500'>
            区间复制字幕文本（仅文本）
          </p>
          <div className='grid grid-cols-1 gap-2 md:grid-cols-[8rem_8rem_auto]'>
            <input
              type='number'
              min={Number.isFinite(minRowId) ? minRowId : 1}
              max={Number.isFinite(maxRowId) ? maxRowId : 1}
              value={copyFromId}
              onChange={e => setCopyFromId(Number(e.target.value))}
              className='h-9 border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
              placeholder='起始句号'
            />
            <input
              type='number'
              min={Number.isFinite(minRowId) ? minRowId : 1}
              max={Number.isFinite(maxRowId) ? maxRowId : 1}
              value={copyToId}
              onChange={e => setCopyToId(Number(e.target.value))}
              className='h-9 border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100'
              placeholder='结束句号'
            />
            <button
              type='button'
              onClick={() => void handleCopyRange()}
              className={`h-9 rounded-md border px-3 text-xs font-semibold transition ${
                copyState === 'copied'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : copyState === 'error'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}>
              {copyState === 'copied'
                ? '已复制'
                : copyState === 'error'
                  ? '复制失败'
                  : '复制区间文本'}
            </button>
          </div>
          <p className='mt-1 text-[11px] text-slate-500'>
            自动按句号范围复制，且只包含句子文本，不包含时间轴。
          </p>
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
            return (
              <article
                key={`read-${row.id}-${row.start}-${row.end}`}
                ref={node => {
                  rowRefs.current[row.id] = node
                }}
                className={`border bg-white px-3 py-3 transition hover:bg-slate-50/70 md:px-4 ${
                  isCurrentSearchHit
                    ? 'border-blue-300 ring-2 ring-blue-100'
                    : isSearchMatch
                      ? 'border-yellow-200 bg-yellow-50/40'
                      : 'border-slate-200'
                }`}>
                <div className='flex items-start gap-3'>
                  <div
                    data-context-ignore
                    className='mt-0.5 shrink-0 text-[11px] font-bold text-slate-400'>
                    #{row.id}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div
                      data-context-ignore
                      className='mb-1 flex items-center justify-between gap-2'>
                      <div className='flex items-center gap-1.5'>
                        <button
                          type='button'
                          onClick={() => handleToggleFavorite(row)}
                          disabled={lineMetaPending}
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition ${
                            row.favorite
                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                          } ${lineMetaPending ? 'opacity-60' : ''}`}>
                          {row.favorite ? '已收藏' : '收藏'}
                        </button>
                        <button
                          type='button'
                          onClick={() =>
                            setExpandedNoteRowId(prev =>
                              prev === row.id ? null : row.id,
                            )
                          }
                          className='rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50'>
                          {row.note ? '笔记*' : '笔记'}
                        </button>
                        <button
                          type='button'
                          onClick={() =>
                            isEditing
                              ? setEditingRowId(null)
                              : handleStartEditRow(row)
                          }
                          className='rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-50'>
                          {isEditing ? '收起编辑' : '编辑'}
                        </button>
                        <button
                          type='button'
                          onClick={() => handleDeleteRow(row)}
                          disabled={lineMetaPending || rows.length <= 1}
                          className='rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40'>
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
                      className='media-subtitle-text text-[16px] leading-8 text-slate-800 md:text-[18px]'>
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
          <div className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5'>
            <p className='text-xs text-slate-500'>
              当前显示第 {(normalizedPage - 1) * pageSize + 1}-
              {Math.min(normalizedPage * pageSize, filteredRows.length)} 句
            </p>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={normalizedPage <= 1}
                className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'>
                上一页
              </button>
              <span className='rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600'>
                {normalizedPage} / {totalPages}
              </span>
              <button
                type='button'
                onClick={() =>
                  setCurrentPage(prev => Math.min(totalPages, prev + 1))
                }
                disabled={normalizedPage >= totalPages}
                className='h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'>
                下一页
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
          initialMeta={localVocabularyMetaMap[selection.text]}
          onSaved={({ word, meta }) => {
            setLocalVocabularyMetaMap(prev => {
              const next = { ...prev, [word]: meta }
              if (selection.text && selection.text !== word) {
                next[selection.text] = meta
              }
              return next
            })
            if (meta.pronunciations[0]) {
              setLocalPronunciationMap(prev => {
                const next = { ...prev, [word]: meta.pronunciations[0] }
                if (selection.text && selection.text !== word) {
                  next[selection.text] = meta.pronunciations[0]
                }
                return next
              })
            }
          }}
          onClose={closeSelection}
        />
      )}
    </section>
  )
}
