'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  batchUpdateVocabularyMetaAdmin,
  deleteVocabularyAdmin,
  getVocabulariesPagedAdmin,
  getVocabularyMergePreviewAdmin,
  mergeAllVocabularyDuplicatesAdmin,
  mergeVocabularyDuplicateGroupAdmin,
  updateVocabularyMetaAdmin,
  updateVocabularyTagsAdmin,
} from '../searchActions'
import { useDialog } from '@/context/DialogContext'
import InlineConfirmAction from '@/components/InlineConfirmAction'
import WordPronunciation from '@/components/WordPronunciation'

type VocabularyRecord = {
  id: string
  word: string
  sourceType: 'AUDIO_DIALOGUE' | 'ARTICLE_TEXT' | 'QUIZ_QUESTION'
  sentences: SentenceRecord[]
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  tags: string[]
}

type SentenceRecord = {
  text: string
  source: string
  sourceUrl: string
  meaningIndex?: number | null
  posTags?: string[]
}

type MergePreviewItem = {
  id: string
  word: string
  sentenceCount: number
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
}

type MergePreviewGroup = {
  groupKey: string
  keepId: string
  keepWord: string
  mergeIds: string[]
  items: MergePreviewItem[]
}

const splitUserInput = (raw: string) =>
  Array.from(
    new Set(
      raw
        .split(/[\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const SourceBadge = ({ type }: { type: VocabularyRecord['sourceType'] }) => {
  if (type === 'AUDIO_DIALOGUE') {
    return (
      <span className='inline-flex items-center rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700'>
        听力
      </span>
    )
  }
  if (type === 'ARTICLE_TEXT') {
    return (
      <span className='inline-flex items-center rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700'>
        阅读
      </span>
    )
  }
  return (
    <span className='inline-flex items-center rounded-md border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700'>
      题目
    </span>
  )
}

const deleteButtonClassName =
  'bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100'

export default function VocabularyManagePage() {
  const PAGE_SIZE = 30
  const dialog = useDialog()
  const [vocabList, setVocabList] = useState<VocabularyRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pronunciationsInput, setPronunciationsInput] = useState('')
  const [partsOfSpeechInput, setPartsOfSpeechInput] = useState('')
  const [meaningInput, setMeaningInput] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [mergePreview, setMergePreview] = useState<{
    groups: MergePreviewGroup[]
    totalGroups: number
    duplicateCount: number
  }>({
    groups: [],
    totalGroups: 0,
    duplicateCount: 0,
  })
  const [isLoadingMergePreview, setIsLoadingMergePreview] = useState(false)
  const [mergingGroupKey, setMergingGroupKey] = useState<string | null>(null)
  const [isMergingAll, setIsMergingAll] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkPronunciationsInput, setBulkPronunciationsInput] = useState('')
  const [bulkPartsOfSpeechInput, setBulkPartsOfSpeechInput] = useState('')
  const [bulkMode, setBulkMode] = useState<'append' | 'replace'>('append')
  const [isBulkSaving, setIsBulkSaving] = useState(false)
  const pronunciationsPreview = splitUserInput(pronunciationsInput)
  const partsOfSpeechPreview = splitUserInput(partsOfSpeechInput)
  const meaningPreview = splitUserInput(meaningInput)
  const tagsPreview = splitUserInput(tagsInput)
  const bulkPronunciationsPreview = splitUserInput(bulkPronunciationsInput)
  const bulkPartsOfSpeechPreview = splitUserInput(bulkPartsOfSpeechInput)

  const fetchVocabs = async (page = currentPage, keyword = searchKeyword) => {
    setLoading(true)
    const data = await getVocabulariesPagedAdmin(keyword, page, PAGE_SIZE)
    const nextList = data.items as VocabularyRecord[]
    setVocabList(nextList)
    setTotalCount(data.total || 0)
    setCurrentPage(data.page || 1)
    const validIdSet = new Set(nextList.map(item => item.id))
    setSelectedIds(prev => prev.filter(id => validIdSet.has(id)))
    setLoading(false)
  }

  const fetchMergePreview = async () => {
    setIsLoadingMergePreview(true)
    const data = await getVocabularyMergePreviewAdmin()
    setMergePreview(data as typeof mergePreview)
    setIsLoadingMergePreview(false)
  }

  useEffect(() => {
    fetchMergePreview()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchVocabs(currentPage, searchKeyword)
    }, 260)
    return () => window.clearTimeout(timer)
  }, [currentPage, searchKeyword])

  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      setViewMode('card')
    }
  }, [])

  const totalMeanings = useMemo(
    () => vocabList.reduce((acc, item) => acc + item.meanings.length, 0),
    [vocabList],
  )
  const filteredList = vocabList
  const filteredIdSet = useMemo(
    () => new Set(filteredList.map(item => item.id)),
    [filteredList],
  )
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const selectedInViewCount = useMemo(
    () => selectedIds.filter(id => filteredIdSet.has(id)).length,
    [filteredIdSet, selectedIds],
  )
  const allInViewSelected =
    filteredList.length > 0 && selectedInViewCount === filteredList.length

  const toggleSelectId = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      if (checked) {
        if (prev.includes(id)) return prev
        return [...prev, id]
      }
      return prev.filter(item => item !== id)
    })
  }

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds(prev => {
      if (!checked) return prev.filter(id => !filteredIdSet.has(id))
      const next = new Set(prev)
      filteredList.forEach(item => next.add(item.id))
      return [...next]
    })
  }

  const openEditor = (item: VocabularyRecord) => {
    setEditingId(item.id)
    setPronunciationsInput(item.pronunciations.join('\n'))
    setPartsOfSpeechInput(item.partsOfSpeech.join('\n'))
    setMeaningInput(item.meanings.join('\n'))
    setTagsInput(item.tags.join('\n'))
  }

  const handleDeleteVocab = async (id: string, word: string) => {
    const res = await deleteVocabularyAdmin(id)
    if (!res.success) {
      dialog.toast(res.message || `删除 "${word}" 失败`, { tone: 'error' })
      return
    }
    await fetchVocabs(currentPage, searchKeyword)
    dialog.toast('已删除', { tone: 'success' })
  }

  const handleBatchUpdate = async () => {
    if (selectedIds.length === 0) {
      dialog.toast('请先选择词条', { tone: 'error' })
      return
    }
    const pronunciations = splitUserInput(bulkPronunciationsInput)
    const partsOfSpeech = splitUserInput(bulkPartsOfSpeechInput)
    if (pronunciations.length === 0 && partsOfSpeech.length === 0) {
      dialog.toast('请至少填写注音或词性', { tone: 'error' })
      return
    }

    setIsBulkSaving(true)
    const result = await batchUpdateVocabularyMetaAdmin(
      selectedIds,
      { pronunciations, partsOfSpeech },
      bulkMode,
    )
    setIsBulkSaving(false)
    if (!result.success) {
      dialog.toast(result.message || '批量更新失败', { tone: 'error' })
      return
    }

    setVocabList(prev =>
      prev.map(item => {
        if (!selectedIds.includes(item.id)) return item
        const nextPronunciations =
          pronunciations.length === 0
            ? item.pronunciations
            : bulkMode === 'replace'
              ? pronunciations
              : Array.from(new Set([...item.pronunciations, ...pronunciations]))
        const nextPartsOfSpeech =
          partsOfSpeech.length === 0
            ? item.partsOfSpeech
            : bulkMode === 'replace'
              ? partsOfSpeech
              : Array.from(new Set([...item.partsOfSpeech, ...partsOfSpeech]))
        return {
          ...item,
          pronunciations: nextPronunciations,
          partsOfSpeech: nextPartsOfSpeech,
        }
      }),
    )

    dialog.toast(`已批量更新 ${result.updatedCount || selectedIds.length} 条`, {
      tone: 'success',
    })
  }

  const handleSave = async (item: VocabularyRecord) => {
    const pronunciations = splitUserInput(pronunciationsInput)
    const partsOfSpeech = splitUserInput(partsOfSpeechInput)
    const meanings = splitUserInput(meaningInput)
    const tags = splitUserInput(tagsInput)
    setSavingId(item.id)
    const res = await updateVocabularyMetaAdmin(item.id, {
      pronunciations,
      partsOfSpeech,
      meanings,
    })
    setSavingId(null)

    if (!res.success) {
      await dialog.alert(res.message || '保存失败')
      return
    }

    // 上传标签（如果有变化）
    if (tags.length > 0 || item.tags.length > 0) {
      setSavingId(item.id)
      const tagRes = await updateVocabularyTagsAdmin(item.id, tags)
      setSavingId(null)
      if (!tagRes.success) {
        await dialog.alert(tagRes.message || '保存标签失败')
        return
      }
    }

    setVocabList(prev =>
      prev.map(current =>
        current.id === item.id
          ? {
              ...current,
              pronunciations,
              partsOfSpeech,
              meanings,
              tags,
            }
          : current,
      ),
    )
    setEditingId(null)
    dialog.toast('保存成功', { tone: 'success' })
  }

  const handleMergeSingleGroup = async (group: MergePreviewGroup) => {
    setMergingGroupKey(group.groupKey)
    const result = await mergeVocabularyDuplicateGroupAdmin(
      group.keepId,
      group.mergeIds,
    )
    setMergingGroupKey(null)
    if (!result.success) {
      dialog.toast(result.message || '归并失败', { tone: 'error' })
      return
    }
    dialog.toast(`已归并 ${result.mergedCount || 0} 条重复词`, {
      tone: 'success',
    })
    await fetchVocabs(currentPage, searchKeyword)
    await fetchMergePreview()
  }

  const handleMergeAllGroups = async () => {
    setIsMergingAll(true)
    const result = await mergeAllVocabularyDuplicatesAdmin()
    setIsMergingAll(false)
    if (!result.success) {
      dialog.toast(result.message || '一键归并失败', { tone: 'error' })
      return
    }
    dialog.toast(`已归并 ${result.mergedCount || 0} 条重复词`, {
      tone: 'success',
    })
    await fetchVocabs(currentPage, searchKeyword)
    await fetchMergePreview()
  }

  return (
    <div className='mx-auto max-w-6xl p-4 pb-24 md:p-8'>
      <div className='mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between'>
        <div>
          <Link
            href='/manage'
            className='mb-1 inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-700 md:text-sm'>
            返回管理中心
          </Link>
          <h1 className='text-2xl font-black text-gray-900'>词库管理</h1>
          <p className='mt-1 text-sm text-gray-500'>
            维护单词注音和释义，可多值保存。
          </p>
        </div>
        <div className='flex flex-col gap-2'>
          <div className='grid grid-cols-2 gap-2 text-sm'>
            <div className='border border-gray-200 bg-white px-3 py-2'>
              <p className='text-xs text-gray-500'>词条</p>
              <p className='text-lg font-bold text-gray-900'>{totalCount}</p>
            </div>
            <div className='border border-gray-200 bg-white px-3 py-2'>
              <p className='text-xs text-gray-500'>释义总数</p>
              <p className='text-lg font-bold text-gray-900'>{totalMeanings}</p>
            </div>
          </div>
          <div className='inline-flex w-full border border-gray-200 bg-white p-1 md:w-auto'>
            <button
              type='button'
              onClick={() => setViewMode('card')}
              className={`flex-1 px-3 py-1.5 text-xs font-bold transition ${
                viewMode === 'card'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}>
              卡片
            </button>
            <button
              type='button'
              onClick={() => setViewMode('table')}
              className={`flex-1 px-3 py-1.5 text-xs font-bold transition ${
                viewMode === 'table'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}>
              表格
            </button>
          </div>
        </div>
      </div>

      <div className='mb-4 border border-gray-200 bg-white p-3 md:p-4'>
        <label className='mb-1 block text-xs font-bold text-gray-500'>
          搜索词条
        </label>
        <input
          type='text'
          value={searchKeyword}
          onChange={e => {
            setSearchKeyword(e.currentTarget.value)
            setCurrentPage(1)
          }}
          placeholder='支持搜索单词、注音、词性、释义、例句来源'
          className='w-full border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
        />
        <p className='mt-1 text-xs text-gray-400'>
          共 {totalCount} 条，当前页 {filteredList.length} 条
        </p>
      </div>

      <section className='mb-4 border border-gray-200 bg-white p-3 md:p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3'>
          <div>
            <h2 className='text-sm font-black text-gray-900'>
              词性/注音批量编辑
            </h2>
            <p className='mt-1 text-xs text-gray-500'>
              适合日语外来语、多音词、多词性词条的集中治理。
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2 text-xs'>
            <span className='ui-tag ui-tag-info'>
              已选 {selectedIds.length}
            </span>
            <button
              type='button'
              onClick={() => toggleSelectAllVisible(true)}
              disabled={filteredList.length === 0 || allInViewSelected}
              className='ui-btn ui-btn-sm disabled:opacity-50'>
              全选当前筛选
            </button>
            <button
              type='button'
              onClick={() => setSelectedIds([])}
              disabled={selectedIds.length === 0}
              className='ui-btn ui-btn-sm disabled:opacity-50'>
              清空选择
            </button>
          </div>
        </div>

        <div className='mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3'>
          <label className='text-xs font-semibold text-gray-600'>
            更新方式
            <select
              value={bulkMode}
              onChange={event =>
                setBulkMode(event.currentTarget.value as 'append' | 'replace')
              }
              className='mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'>
              <option value='append'>追加（保留原值）</option>
              <option value='replace'>覆盖（替换原值）</option>
            </select>
          </label>
          <label className='text-xs font-semibold text-gray-600'>
            批量注音
            <textarea
              value={bulkPronunciationsInput}
              onChange={event =>
                setBulkPronunciationsInput(event.currentTarget.value)
              }
              rows={3}
              placeholder='每行一个，可用逗号分隔；日语支持 言:い い 訳:わけ，也兼容空格或 | 拆分'
              className='mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
            />
          </label>
          <label className='text-xs font-semibold text-gray-600'>
            批量词性
            <textarea
              value={bulkPartsOfSpeechInput}
              onChange={event =>
                setBulkPartsOfSpeechInput(event.currentTarget.value)
              }
              rows={3}
              placeholder='每行一个词性'
              className='mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100'
            />
          </label>
        </div>

        <div className='mt-3 flex flex-wrap items-center gap-2'>
          {bulkPronunciationsPreview.slice(0, 6).map(item => (
            <span key={`bulk-pron-${item}`} className='ui-tag ui-tag-info'>
              注音: {item}
            </span>
          ))}
          {bulkPartsOfSpeechPreview.slice(0, 6).map(item => (
            <span key={`bulk-pos-${item}`} className='ui-tag ui-tag-warn'>
              词性: {item}
            </span>
          ))}
          {(bulkPronunciationsPreview.length > 6 ||
            bulkPartsOfSpeechPreview.length > 6) && (
            <span className='text-xs text-gray-400'>仅展示前 6 个预览项</span>
          )}
        </div>

        <div className='mt-3 flex flex-wrap items-center gap-2'>
          <button
            type='button'
            onClick={handleBatchUpdate}
            disabled={isBulkSaving || selectedIds.length === 0}
            className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
            {isBulkSaving ? '批量保存中...' : '应用到已选词条'}
          </button>
          <button
            type='button'
            onClick={() => toggleSelectAllVisible(!allInViewSelected)}
            disabled={filteredList.length === 0}
            className='ui-btn ui-btn-sm disabled:opacity-50'>
            {allInViewSelected ? '取消当前页全选' : '勾选当前页'}
          </button>
        </div>
      </section>

      <section className='mb-4 flex items-center justify-between border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600'>
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
            onClick={() =>
              setCurrentPage(prev => Math.min(totalPages, prev + 1))
            }
            className='ui-btn ui-btn-sm disabled:opacity-50'>
            下一页
          </button>
        </div>
      </section>

      <section className='mb-4 border border-gray-200 bg-white p-3 md:p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3'>
          <div>
            <h2 className='text-sm font-black text-gray-900'>词形归并治理台</h2>
            <p className='mt-1 text-xs text-gray-500'>
              预览历史重复词条，支持单组归并和一键归并。
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={fetchMergePreview}
              disabled={isLoadingMergePreview}
              className='ui-btn ui-btn-sm'>
              {isLoadingMergePreview ? '扫描中...' : '重新扫描'}
            </button>
            <button
              type='button'
              onClick={handleMergeAllGroups}
              disabled={isMergingAll || mergePreview.duplicateCount === 0}
              className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
              {isMergingAll ? '归并中...' : '一键归并全部'}
            </button>
          </div>
        </div>
        <div className='mt-3 flex flex-wrap items-center gap-2 text-xs'>
          <span className='ui-tag ui-tag-muted'>
            重复组 {mergePreview.totalGroups}
          </span>
          <span className='ui-tag ui-tag-warn'>
            待归并词条 {mergePreview.duplicateCount}
          </span>
        </div>
        <div className='mt-3 space-y-2'>
          {mergePreview.groups.slice(0, 12).map(group => (
            <div
              key={`merge-group-${group.groupKey}`}
              className='border border-gray-200 bg-gray-50/60 p-2.5'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex flex-wrap items-center gap-2 text-xs'>
                  <span className='ui-tag ui-tag-info'>
                    词根: {group.groupKey}
                  </span>
                  <span className='ui-tag ui-tag-success'>
                    保留: {group.keepWord}
                  </span>
                  <span className='ui-tag ui-tag-muted'>
                    合并 {group.mergeIds.length} 条
                  </span>
                </div>
                <button
                  type='button'
                  onClick={() => handleMergeSingleGroup(group)}
                  disabled={mergingGroupKey === group.groupKey}
                  className='ui-btn ui-btn-sm'>
                  {mergingGroupKey === group.groupKey
                    ? '处理中...'
                    : '合并此组'}
                </button>
              </div>
              <div className='mt-2 flex flex-wrap gap-1.5 text-[11px] text-gray-600'>
                {group.items.map(item => (
                  <span
                    key={`merge-item-${group.groupKey}-${item.id}`}
                    className={`rounded-md border px-2 py-0.5 ${
                      item.id === group.keepId
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-gray-200 bg-white'
                    }`}>
                    {item.word} · 例句{item.sentenceCount}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {mergePreview.groups.length > 12 && (
            <p className='text-xs text-gray-400'>
              仅展示前 12 组，点击「一键归并全部」可处理全部重复。
            </p>
          )}
          {mergePreview.totalGroups === 0 && (
            <p className='text-xs text-gray-400'>
              当前未发现可归并的历史重复词。
            </p>
          )}
        </div>
      </section>

      <div className='min-h-[62vh] border border-gray-200 bg-white '>
        {loading ? (
          viewMode === 'card' ? (
            <div className='space-y-3 p-3 md:p-4'>
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={`manage-vocab-card-skeleton-${idx}`}
                  className='border border-gray-200 bg-gray-50/60 p-3 md:p-4'>
                  <div className='h-6 w-32 animate-pulse bg-gray-100' />
                  <div className='mt-3 h-4 w-5/6 animate-pulse bg-gray-100' />
                  <div className='mt-2 h-4 w-2/3 animate-pulse bg-gray-100' />
                  <div className='mt-4 h-20 animate-pulse bg-gray-100' />
                </div>
              ))}
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[920px] text-left text-sm text-gray-700'>
                <thead className='sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500'>
                  <tr>
                    <th className='border-b border-gray-200 px-3 py-3.5 font-bold'>
                      选择
                    </th>
                    <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                      单词
                    </th>
                    <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                      注音
                    </th>
                    <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                      词性
                    </th>
                    <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                      释义
                    </th>
                    <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                      来源
                    </th>
                    <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <tr
                      key={`manage-vocab-row-skeleton-${idx}`}
                      className='border-b border-gray-100'>
                      <td className='px-3 py-3.5'>
                        <div className='h-4 w-4 animate-pulse bg-gray-100' />
                      </td>
                      <td className='px-4 py-3.5'>
                        <div className='h-5 w-32 animate-pulse bg-gray-100' />
                        <div className='mt-2 h-14 w-full max-w-md animate-pulse bg-gray-100' />
                      </td>
                      <td className='px-4 py-3.5'>
                        <div className='h-5 w-24 animate-pulse bg-gray-100' />
                      </td>
                      <td className='px-4 py-3.5'>
                        <div className='h-5 w-20 animate-pulse bg-gray-100' />
                      </td>
                      <td className='px-4 py-3.5'>
                        <div className='h-5 w-32 animate-pulse bg-gray-100' />
                      </td>
                      <td className='px-4 py-3.5'>
                        <div className='h-5 w-14 animate-pulse bg-gray-100' />
                      </td>
                      <td className='px-4 py-3.5'>
                        <div className='h-8 w-24 animate-pulse bg-gray-100' />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : viewMode === 'card' ? (
          <div className='space-y-3 p-3 md:p-4'>
            {filteredList.map(item => {
              const displayPronunciations = item.pronunciations
              const displayPartsOfSpeech = item.partsOfSpeech
              const displayMeanings = item.meanings
              const isEditing = editingId === item.id
              const isSaving = savingId === item.id
              const sentenceList = item.sentences || []

              return (
                <article
                  key={item.id}
                  className='border border-gray-200 bg-gray-50/60 p-3 md:p-4'>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='flex items-start gap-2'>
                      <input
                        type='checkbox'
                        checked={selectedIds.includes(item.id)}
                        onChange={event =>
                          toggleSelectId(item.id, event.currentTarget.checked)
                        }
                        className='mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400'
                        aria-label={`选择词条 ${item.word}`}
                      />
                      <div>
                        <WordPronunciation
                          word={item.word}
                          pronunciation={displayPronunciations[0] || ''}
                          pronunciations={displayPronunciations}
                          showPronunciation={true}
                          wordClassName='text-xl font-black text-gray-900'
                          hintClassName='text-[11px] font-bold text-gray-500'
                        />
                        <div className='mt-1'>
                          <SourceBadge type={item.sourceType} />
                        </div>
                      </div>
                    </div>
                    <div className='inline-flex items-center gap-2'>
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSave(item)}
                            disabled={isSaving}
                            className='bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60'>
                            {isSaving ? '保存中...' : '保存'}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className='border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600'>
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => openEditor(item)}
                            className='border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700'>
                            编辑
                          </button>
                          <InlineConfirmAction
                            message={`删除 "${item.word}" 后不可恢复，确认删除吗？`}
                            onConfirm={() =>
                              handleDeleteVocab(item.id, item.word)
                            }
                            triggerLabel='删除'
                            confirmLabel='确认删除'
                            pendingLabel='删除中...'
                            triggerClassName={deleteButtonClassName}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  <div className='mt-3 space-y-2'>
                    <section className='border border-indigo-100 bg-indigo-50/40 p-2.5'>
                      <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-500'>
                        注音 / 音标
                      </p>
                      {isEditing ? (
                        <>
                          <textarea
                            value={pronunciationsInput}
                            onChange={e =>
                              setPronunciationsInput(e.currentTarget.value)
                            }
                            rows={3}
                            placeholder='每行一个，或使用逗号分隔；日语支持 言:い い 訳:わけ，也兼容空格或 | 拆分'
                            className='w-full border border-indigo-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-indigo-400'
                          />
                          <p className='mt-1 text-[10px] text-indigo-400'>
                            示例：言い訳 可填 言:い い 訳:わけ；也可填 にん げん
                            / にん|げん；外来语一般整词填写
                          </p>
                          <div className='mt-2 flex flex-wrap gap-1.5'>
                            {pronunciationsPreview.length > 0 ? (
                              pronunciationsPreview.map(pron => (
                                <span
                                  key={`${item.id}-pron-preview-card-${pron}`}
                                  className='rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700'>
                                  {pron}
                                </span>
                              ))
                            ) : (
                              <span className='text-[10px] text-indigo-300'>
                                尚未识别到注音项
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className='flex flex-wrap gap-1.5'>
                          {displayPronunciations.length ? (
                            displayPronunciations.map(pron => (
                              <span
                                key={`${item.id}-pron-card-${pron}`}
                                className='rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700'>
                                {pron}
                              </span>
                            ))
                          ) : (
                            <span className='text-xs text-gray-400'>
                              未设置
                            </span>
                          )}
                        </div>
                      )}
                    </section>

                    <section className='border border-amber-100 bg-amber-50/40 p-2.5'>
                      <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700'>
                        词性
                      </p>
                      {isEditing ? (
                        <>
                          <textarea
                            value={partsOfSpeechInput}
                            onChange={e =>
                              setPartsOfSpeechInput(e.currentTarget.value)
                            }
                            rows={3}
                            placeholder='例如: n. / vt.'
                            className='w-full border border-amber-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-amber-400'
                          />
                          <div className='mt-2 flex flex-wrap gap-1.5'>
                            {partsOfSpeechPreview.length > 0 ? (
                              partsOfSpeechPreview.map(pos => (
                                <span
                                  key={`${item.id}-pos-preview-card-${pos}`}
                                  className='rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700'>
                                  {pos}
                                </span>
                              ))
                            ) : (
                              <span className='text-[10px] text-amber-300'>
                                尚未识别到词性项
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className='flex flex-wrap gap-1.5'>
                          {displayPartsOfSpeech.length ? (
                            displayPartsOfSpeech.map(pos => (
                              <span
                                key={`${item.id}-pos-card-${pos}`}
                                className='rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700'>
                                {pos}
                              </span>
                            ))
                          ) : (
                            <span className='text-xs text-gray-400'>
                              未设置
                            </span>
                          )}
                        </div>
                      )}
                    </section>

                    <section className='border border-emerald-100 bg-emerald-50/40 p-2.5'>
                      <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600'>
                        释义
                      </p>
                      {isEditing ? (
                        <>
                          <textarea
                            value={meaningInput}
                            onChange={e =>
                              setMeaningInput(e.currentTarget.value)
                            }
                            rows={3}
                            placeholder='每行一个释义'
                            className='w-full border border-emerald-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-emerald-400'
                          />
                          <div className='mt-2 flex flex-wrap gap-1.5'>
                            {meaningPreview.length > 0 ? (
                              meaningPreview.map(meaning => (
                                <span
                                  key={`${item.id}-meaning-preview-card-${meaning}`}
                                  className='rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'>
                                  {meaning}
                                </span>
                              ))
                            ) : (
                              <span className='text-[10px] text-emerald-300'>
                                尚未识别到释义项
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className='flex flex-wrap gap-1.5'>
                          {displayMeanings.length ? (
                            displayMeanings.map(meaning => (
                              <span
                                key={`${item.id}-meaning-card-${meaning}`}
                                className='rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700'>
                                {meaning}
                              </span>
                            ))
                          ) : (
                            <span className='text-xs text-gray-400'>
                              未设置
                            </span>
                          )}
                        </div>
                      )}
                    </section>

                    <section className='border border-indigo-100 bg-indigo-50/40 p-2.5'>
                      <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600'>
                        标签
                      </p>
                      {isEditing ? (
                        <>
                          <textarea
                            value={tagsInput}
                            onChange={e => setTagsInput(e.currentTarget.value)}
                            rows={2}
                            placeholder='每行一个标签'
                            className='w-full border border-indigo-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-indigo-400'
                          />
                          <div className='mt-2 flex flex-wrap gap-1.5'>
                            {tagsPreview.length > 0 ? (
                              tagsPreview.map(tag => (
                                <span
                                  key={`${item.id}-tag-preview-card-${tag}`}
                                  className='rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700'>
                                  #{tag}
                                </span>
                              ))
                            ) : (
                              <span className='text-[10px] text-indigo-300'>
                                未添加标签
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className='flex flex-wrap gap-1.5'>
                          {item.tags && item.tags.length > 0 ? (
                            item.tags.map(tag => (
                              <span
                                key={`${item.id}-tag-card-${tag}`}
                                className='rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700'>
                                #{tag}
                              </span>
                            ))
                          ) : (
                            <span className='text-xs text-gray-400'>
                              未设置
                            </span>
                          )}
                        </div>
                      )}
                    </section>
                  </div>

                  <div className='mt-3'>
                    {sentenceList.length === 0 ? (
                      <p className='text-xs text-gray-400'>暂无例句</p>
                    ) : (
                      <div className='space-y-1.5'>
                        {sentenceList.slice(0, 2).map((sentence, idx) => (
                          <div
                            key={`${item.id}-sentence-card-${idx}`}
                            className='border border-gray-200 bg-white px-2.5 py-2'>
                            <p className='text-xs leading-relaxed text-gray-700 line-clamp-2'>
                              {sentence.text}
                            </p>
                            <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
                              <span className='rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500'>
                                {sentence.source}
                              </span>
                              {typeof sentence.meaningIndex === 'number' && (
                                <span className='rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700'>
                                  释义 {sentence.meaningIndex + 1}
                                </span>
                              )}
                              {(sentence.posTags || []).slice(0, 1).map(tag => (
                                <span
                                  key={`${item.id}-sentence-card-tag-${idx}-${tag}`}
                                  className='rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700'>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {sentenceList.length > 2 && (
                          <p className='px-1 text-[10px] font-medium text-gray-400'>
                            还有 {sentenceList.length - 2} 条例句
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
            {filteredList.length === 0 && (
              <div className='py-16 text-center text-gray-400'>
                {searchKeyword.trim() ? '没有匹配的词条' : '暂无词条'}
              </div>
            )}
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[920px] text-left text-sm text-gray-700'>
              <colgroup>
                <col className='w-[4%]' />
                <col className='w-[30%]' />
                <col className='w-[16%]' />
                <col className='w-[14%]' />
                <col className='w-[20%]' />
                <col className='w-[8%]' />
                <col className='w-[12%]' />
              </colgroup>
              <thead className='sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500'>
                <tr>
                  <th className='border-b border-gray-200 px-3 py-3.5 font-bold'>
                    <input
                      type='checkbox'
                      checked={allInViewSelected}
                      onChange={event =>
                        toggleSelectAllVisible(event.currentTarget.checked)
                      }
                      className='h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400'
                      aria-label='全选当前筛选词条'
                    />
                  </th>
                  <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                    单词
                  </th>
                  <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                    注音
                  </th>
                  <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                    词性
                  </th>
                  <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                    释义
                  </th>
                  <th className='border-b border-gray-200 px-4 py-3.5 font-bold'>
                    来源
                  </th>
                  <th className='border-b border-gray-200 px-4 py-3.5 text-right font-bold'>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map(item => {
                  const displayPronunciations = item.pronunciations
                  const displayPartsOfSpeech = item.partsOfSpeech
                  const displayMeanings = item.meanings
                  const isEditing = editingId === item.id
                  const isSaving = savingId === item.id

                  return (
                    <tr
                      key={item.id}
                      className='border-b border-gray-100 align-top odd:bg-white even:bg-gray-50/45 hover:bg-indigo-50/30'>
                      <td className='px-3 py-3.5'>
                        <input
                          type='checkbox'
                          checked={selectedIds.includes(item.id)}
                          onChange={event =>
                            toggleSelectId(item.id, event.currentTarget.checked)
                          }
                          className='h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400'
                          aria-label={`选择词条 ${item.word}`}
                        />
                      </td>
                      <td className='px-4 py-3.5'>
                        <WordPronunciation
                          word={item.word}
                          pronunciation={displayPronunciations[0] || ''}
                          pronunciations={displayPronunciations}
                          showPronunciation={true}
                          wordClassName='font-bold text-gray-900'
                          hintClassName='text-[11px] font-bold text-gray-500'
                        />
                        {(() => {
                          const sentenceList = item.sentences || []
                          if (sentenceList.length === 0) {
                            return (
                              <p className='mt-1 text-xs text-gray-400'>
                                暂无例句
                              </p>
                            )
                          }
                          return (
                            <div className='mt-2 space-y-1.5 max-w-md'>
                              {sentenceList.slice(0, 2).map((sentence, idx) => (
                                <div
                                  key={`${item.id}-sentence-${idx}`}
                                  className='border border-gray-200 bg-gray-50 px-2.5 py-2'>
                                  <p className='text-xs text-gray-700 leading-relaxed line-clamp-2'>
                                    {sentence.text}
                                  </p>
                                  <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
                                    <span className='rounded-md bg-white border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500'>
                                      {sentence.source}
                                    </span>
                                    {typeof sentence.meaningIndex ===
                                      'number' && (
                                      <span className='rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700'>
                                        释义 {sentence.meaningIndex + 1}
                                      </span>
                                    )}
                                    {(sentence.posTags || [])
                                      .slice(0, 1)
                                      .map(tag => (
                                        <span
                                          key={`${item.id}-sentence-${idx}-tag-${tag}`}
                                          className='rounded-md bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700'>
                                          {tag}
                                        </span>
                                      ))}
                                  </div>
                                </div>
                              ))}
                              {sentenceList.length > 2 && (
                                <p className='text-[10px] font-medium text-gray-400 px-1'>
                                  还有 {sentenceList.length - 2} 条例句
                                </p>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className='px-4 py-3.5'>
                        {isEditing ? (
                          <div className='w-64 border border-indigo-100 bg-indigo-50/40 p-2.5'>
                            <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-500'>
                              注音 / 音标
                            </p>
                            <textarea
                              value={pronunciationsInput}
                              onChange={e =>
                                setPronunciationsInput(e.currentTarget.value)
                              }
                              rows={3}
                              placeholder='每行一个，或使用逗号分隔；日语支持 言:い い 訳:わけ，也兼容空格或 | 拆分'
                              className='w-full border border-indigo-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-indigo-400'
                            />
                            <p className='mt-1 text-[10px] text-indigo-400'>
                              示例：言い訳 可填 言:い い 訳:わけ；也可填 にん
                              げん / にん|げん；外来语一般整词填写
                            </p>
                            <div className='mt-2 flex flex-wrap gap-1.5'>
                              {pronunciationsPreview.length > 0 ? (
                                pronunciationsPreview.map(pron => (
                                  <span
                                    key={`${item.id}-pron-preview-${pron}`}
                                    className='rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700'>
                                    {pron}
                                  </span>
                                ))
                              ) : (
                                <span className='text-[10px] text-indigo-300'>
                                  尚未识别到注音项
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className='flex max-w-56 flex-wrap gap-1.5'>
                            {displayPronunciations.length ? (
                              displayPronunciations.map(pron => (
                                <span
                                  key={`${item.id}-pron-${pron}`}
                                  className='rounded-md bg-indigo-50 px-2 py-1 text-xs font-bold text-indigo-700'>
                                  {pron}
                                </span>
                              ))
                            ) : (
                              <span className='text-xs text-gray-400'>
                                未设置
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className='px-4 py-3.5'>
                        {isEditing ? (
                          <div className='w-48 border border-amber-100 bg-amber-50/40 p-2.5'>
                            <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700'>
                              词性
                            </p>
                            <textarea
                              value={partsOfSpeechInput}
                              onChange={e =>
                                setPartsOfSpeechInput(e.currentTarget.value)
                              }
                              rows={3}
                              placeholder='例如: n.\nvt.'
                              className='w-full border border-amber-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-amber-400'
                            />
                            <div className='mt-2 flex max-w-44 flex-wrap gap-1.5'>
                              {partsOfSpeechPreview.length > 0 ? (
                                partsOfSpeechPreview.map(pos => (
                                  <span
                                    key={`${item.id}-pos-preview-${pos}`}
                                    className='rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700'>
                                    {pos}
                                  </span>
                                ))
                              ) : (
                                <span className='text-[10px] text-amber-300'>
                                  尚未识别到词性项
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className='flex max-w-44 flex-wrap gap-1.5'>
                            {displayPartsOfSpeech.length ? (
                              displayPartsOfSpeech.map(pos => (
                                <span
                                  key={`${item.id}-pos-${pos}`}
                                  className='rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700'>
                                  {pos}
                                </span>
                              ))
                            ) : (
                              <span className='text-xs text-gray-400'>
                                未设置
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className='px-4 py-3.5'>
                        {isEditing ? (
                          <div className='w-72 border border-emerald-100 bg-emerald-50/40 p-2.5'>
                            <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600'>
                              释义
                            </p>
                            <textarea
                              value={meaningInput}
                              onChange={e =>
                                setMeaningInput(e.currentTarget.value)
                              }
                              rows={3}
                              placeholder='每行一个释义，支持多个词义'
                              className='w-full border border-emerald-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-emerald-400'
                            />
                            <div className='mt-2 flex max-w-64 flex-wrap gap-1.5'>
                              {meaningPreview.length > 0 ? (
                                meaningPreview.map(meaning => (
                                  <span
                                    key={`${item.id}-meaning-preview-${meaning}`}
                                    className='rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'>
                                    {meaning}
                                  </span>
                                ))
                              ) : (
                                <span className='text-[10px] text-emerald-300'>
                                  尚未识别到释义项
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className='flex max-w-64 flex-wrap gap-1.5'>
                            {displayMeanings.length ? (
                              displayMeanings.map(meaning => (
                                <span
                                  key={`${item.id}-meaning-${meaning}`}
                                  className='rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700'>
                                  {meaning}
                                </span>
                              ))
                            ) : (
                              <span className='text-xs text-gray-400'>
                                未设置
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className='px-4 py-3.5'>
                        {isEditing ? (
                          <div className='w-40 border border-indigo-100 bg-indigo-50/40 p-2.5'>
                            <p className='mb-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600'>
                              标签
                            </p>
                            <textarea
                              value={tagsInput}
                              onChange={e =>
                                setTagsInput(e.currentTarget.value)
                              }
                              rows={2}
                              placeholder='每行一个标签'
                              className='w-full border border-indigo-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none focus:border-indigo-400'
                            />
                            <div className='mt-2 flex max-w-40 flex-wrap gap-1.5'>
                              {tagsPreview.length > 0 ? (
                                tagsPreview.map(tag => (
                                  <span
                                    key={`${item.id}-tag-preview-${tag}`}
                                    className='rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700'>
                                    #{tag}
                                  </span>
                                ))
                              ) : (
                                <span className='text-[10px] text-indigo-300'>
                                  未添加标签
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className='flex max-w-40 flex-wrap gap-1.5'>
                            {item.tags && item.tags.length > 0 ? (
                              item.tags.map(tag => (
                                <span
                                  key={`${item.id}-tag-${tag}`}
                                  className='rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700'>
                                  #{tag}
                                </span>
                              ))
                            ) : (
                              <span className='text-xs text-gray-400'>
                                未设置
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className='px-4 py-3.5'>
                        <SourceBadge type={item.sourceType} />
                      </td>
                      <td className='px-4 py-3.5 text-right'>
                        <div className='inline-flex min-w-[132px] items-center justify-end gap-2 whitespace-nowrap'>
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSave(item)}
                                disabled={isSaving}
                                className='bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60'>
                                {isSaving ? '保存中...' : '保存'}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className='border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-600'>
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => openEditor(item)}
                                className='border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700'>
                                编辑
                              </button>
                              <InlineConfirmAction
                                message={`删除 "${item.word}" 后不可恢复，确认删除吗？`}
                                onConfirm={() =>
                                  handleDeleteVocab(item.id, item.word)
                                }
                                triggerLabel='删除'
                                confirmLabel='确认删除'
                                pendingLabel='删除中...'
                                triggerClassName={deleteButtonClassName}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filteredList.length === 0 && (
                  <tr>
                    <td colSpan={7} className='py-16 text-center text-gray-400'>
                      {searchKeyword.trim() ? '没有匹配的词条' : '暂无词条'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
