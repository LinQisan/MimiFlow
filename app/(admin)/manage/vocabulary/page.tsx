'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import InlineConfirmAction from '@/components/InlineConfirmAction'
import CustomSelect from '@/components/ui/CustomSelect'
import WordPronunciation from '@/components/vocabulary/WordPronunciation'
import { useDialog } from '@/context/DialogContext'
import {
  batchUpdateVocabularyMetaAdmin,
  deleteVocabularyAdmin,
  getVocabulariesPagedAdmin,
  getVocabularyMergePreviewAdmin,
  mergeAllVocabularyDuplicatesAdmin,
  mergeVocabularyDuplicateGroupAdmin,
  updateVocabularyMetaAdmin,
  updateVocabularyTagsAdmin,
} from '@/features/vocabulary/admin-actions'

type VocabularyRecord = {
  id: string
  word: string
  sourceType:
    | 'AUDIO_DIALOGUE'
    | 'MEDIA_SUBTITLE_LINE'
    | 'ARTICLE_TEXT'
    | 'QUIZ_QUESTION'
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
}

type MergePreviewGroup = {
  groupKey: string
  keepId: string
  keepWord: string
  mergeIds: string[]
  items: MergePreviewItem[]
}

const PAGE_SIZE = 30

const splitUserInput = (raw: string) =>
  Array.from(
    new Set(
      raw
        .split(/[\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const sourceLabel: Record<VocabularyRecord['sourceType'], string> = {
  AUDIO_DIALOGUE: '听力',
  MEDIA_SUBTITLE_LINE: '影视',
  ARTICLE_TEXT: '阅读',
  QUIZ_QUESTION: '题目',
}

const fieldClassName =
  'ui-input min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none'

export default function VocabularyManagePage() {
  const dialog = useDialog()
  const [vocabList, setVocabList] = useState<VocabularyRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [pronunciationsInput, setPronunciationsInput] = useState('')
  const [partsOfSpeechInput, setPartsOfSpeechInput] = useState('')
  const [meaningInput, setMeaningInput] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [showBatchTools, setShowBatchTools] = useState(false)
  const [bulkPronunciationsInput, setBulkPronunciationsInput] = useState('')
  const [bulkPartsOfSpeechInput, setBulkPartsOfSpeechInput] = useState('')
  const [bulkMode, setBulkMode] = useState<'append' | 'replace'>('append')
  const [isBulkSaving, setIsBulkSaving] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [mergePreview, setMergePreview] = useState<{
    groups: MergePreviewGroup[]
    totalGroups: number
    duplicateCount: number
  }>({ groups: [], totalGroups: 0, duplicateCount: 0 })
  const [isLoadingMergePreview, setIsLoadingMergePreview] = useState(false)
  const [mergingGroupKey, setMergingGroupKey] = useState<string | null>(null)
  const [isMergingAll, setIsMergingAll] = useState(false)

  const fetchVocabs = useCallback(async (page: number, keyword: string) => {
    setLoading(true)
    const data = await getVocabulariesPagedAdmin(keyword, page, PAGE_SIZE)
    const nextList = data.items as VocabularyRecord[]
    setVocabList(nextList)
    setTotalCount(data.total || 0)
    setCurrentPage(data.page || 1)
    const validIds = new Set(nextList.map(item => item.id))
    setSelectedIds(previous => previous.filter(id => validIds.has(id)))
    setLoading(false)
  }, [])

  const fetchMergePreview = useCallback(async () => {
    setIsLoadingMergePreview(true)
    const data = await getVocabularyMergePreviewAdmin()
    setMergePreview(data as typeof mergePreview)
    setIsLoadingMergePreview(false)
  }, [])

  useEffect(() => {
    void fetchMergePreview()
  }, [fetchMergePreview])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchVocabs(currentPage, searchKeyword)
    }, 240)
    return () => window.clearTimeout(timer)
  }, [currentPage, fetchVocabs, searchKeyword])

  const currentIds = useMemo(() => vocabList.map(item => item.id), [vocabList])
  const selectedInView = selectedIds.filter(id => currentIds.includes(id)).length
  const allInViewSelected = vocabList.length > 0 && selectedInView === vocabList.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const toggleSelectAll = () => {
    setSelectedIds(previous => {
      if (allInViewSelected) {
        return previous.filter(id => !currentIds.includes(id))
      }
      return Array.from(new Set([...previous, ...currentIds]))
    })
  }

  const openEditor = (item: VocabularyRecord) => {
    setEditingId(item.id)
    setPronunciationsInput(item.pronunciations.join('\n'))
    setPartsOfSpeechInput(item.partsOfSpeech.join('\n'))
    setMeaningInput(item.meanings.join('\n'))
    setTagsInput(item.tags.join('\n'))
  }

  const handleSave = async (item: VocabularyRecord) => {
    const pronunciations = splitUserInput(pronunciationsInput)
    const partsOfSpeech = splitUserInput(partsOfSpeechInput)
    const meanings = splitUserInput(meaningInput)
    const tags = splitUserInput(tagsInput)
    setSavingId(item.id)
    const result = await updateVocabularyMetaAdmin(item.id, {
      pronunciations,
      partsOfSpeech,
      meanings,
    })
    if (!result.success) {
      setSavingId(null)
      dialog.toast(result.message || '保存失败', { tone: 'error' })
      return
    }
    const tagResult = await updateVocabularyTagsAdmin(item.id, tags)
    setSavingId(null)
    if (!tagResult.success) {
      dialog.toast(tagResult.message || '标签保存失败', { tone: 'error' })
      return
    }
    setVocabList(previous =>
      previous.map(current =>
        current.id === item.id
          ? { ...current, pronunciations, partsOfSpeech, meanings, tags }
          : current,
      ),
    )
    setEditingId(null)
    dialog.toast('已保存', { tone: 'success' })
  }

  const handleDelete = async (id: string) => {
    const result = await deleteVocabularyAdmin(id)
    if (!result.success) {
      dialog.toast(result.message || '删除失败', { tone: 'error' })
      return
    }
    await fetchVocabs(currentPage, searchKeyword)
    dialog.toast('已删除', { tone: 'success' })
  }

  const handleBatchUpdate = async () => {
    const pronunciations = splitUserInput(bulkPronunciationsInput)
    const partsOfSpeech = splitUserInput(bulkPartsOfSpeechInput)
    if (selectedIds.length === 0 || (pronunciations.length === 0 && partsOfSpeech.length === 0)) {
      dialog.toast('请选择词条并填写更新内容', { tone: 'error' })
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
    await fetchVocabs(currentPage, searchKeyword)
    dialog.toast(`已更新 ${result.updatedCount || selectedIds.length} 条`, {
      tone: 'success',
    })
  }

  const handleMergeGroup = async (group: MergePreviewGroup) => {
    setMergingGroupKey(group.groupKey)
    const result = await mergeVocabularyDuplicateGroupAdmin(
      group.keepId,
      group.mergeIds,
    )
    setMergingGroupKey(null)
    if (!result.success) {
      dialog.toast(result.message || '合并失败', { tone: 'error' })
      return
    }
    await Promise.all([
      fetchVocabs(currentPage, searchKeyword),
      fetchMergePreview(),
    ])
    dialog.toast('已合并', { tone: 'success' })
  }

  const handleMergeAll = async () => {
    setIsMergingAll(true)
    const result = await mergeAllVocabularyDuplicatesAdmin()
    setIsMergingAll(false)
    if (!result.success) {
      dialog.toast(result.message || '合并失败', { tone: 'error' })
      return
    }
    await Promise.all([
      fetchVocabs(currentPage, searchKeyword),
      fetchMergePreview(),
    ])
    dialog.toast(`已合并 ${result.mergedCount || 0} 条`, { tone: 'success' })
  }

  return (
    <main className='min-h-full px-3 py-4 md:px-6 md:py-6'>
      <div className='mx-auto max-w-6xl space-y-4'>
        <header className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-baseline gap-3'>
            <h1 className='text-xl font-black text-slate-950 md:text-2xl'>词库</h1>
            <span className='text-sm text-slate-400'>{totalCount} 条</span>
          </div>
          <div className='flex items-center gap-2'>
            {selectedIds.length > 0 ? (
              <span className='rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600'>
                已选 {selectedIds.length}
              </span>
            ) : null}
            <button
              type='button'
              onClick={() => setShowBatchTools(previous => !previous)}
              className='ui-btn ui-btn-sm'>
              批量编辑
            </button>
            <button
              type='button'
              onClick={() => setShowDuplicates(previous => !previous)}
              className='ui-btn ui-btn-sm'>
              重复项{mergePreview.duplicateCount > 0 ? ` ${mergePreview.duplicateCount}` : ''}
            </button>
          </div>
        </header>

        <section className='rounded-xl border border-slate-200 bg-white p-2 shadow-sm'>
          <div className='flex items-center gap-2'>
            <input
              type='search'
              value={searchKeyword}
              onChange={event => {
                setSearchKeyword(event.currentTarget.value)
                setCurrentPage(1)
              }}
              placeholder='搜索词条、释义或来源'
              aria-label='搜索词库'
              className='ui-input h-10 min-w-0 flex-1 rounded-lg border-0 bg-slate-50 px-3 text-sm outline-none'
            />
            <button
              type='button'
              onClick={toggleSelectAll}
              disabled={vocabList.length === 0}
              className='ui-btn ui-btn-sm shrink-0 disabled:opacity-50'>
              {allInViewSelected ? '取消全选' : '全选本页'}
            </button>
          </div>
        </section>

        {showBatchTools ? (
          <section className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <h2 className='text-sm font-bold text-slate-900'>批量编辑</h2>
              <button
                type='button'
                onClick={() => setSelectedIds([])}
                className='text-xs font-semibold text-slate-400 hover:text-slate-700'>
                清空选择
              </button>
            </div>
            <div className='grid gap-3 md:grid-cols-[160px_1fr_1fr]'>
              <label className='text-xs font-semibold text-slate-500'>
                方式
                <CustomSelect
                  value={bulkMode}
                  onChange={event =>
                    setBulkMode(event.currentTarget.value as 'append' | 'replace')
                  }
                  className={`${fieldClassName} mt-1`}>
                  <option value='append'>追加</option>
                  <option value='replace'>覆盖</option>
                </CustomSelect>
              </label>
              <label className='text-xs font-semibold text-slate-500'>
                注音
                <textarea
                  value={bulkPronunciationsInput}
                  onChange={event => setBulkPronunciationsInput(event.currentTarget.value)}
                  rows={2}
                  placeholder='每行一个'
                  className={`${fieldClassName} mt-1 resize-y`}
                />
              </label>
              <label className='text-xs font-semibold text-slate-500'>
                词性
                <textarea
                  value={bulkPartsOfSpeechInput}
                  onChange={event => setBulkPartsOfSpeechInput(event.currentTarget.value)}
                  rows={2}
                  placeholder='每行一个'
                  className={`${fieldClassName} mt-1 resize-y`}
                />
              </label>
            </div>
            <button
              type='button'
              onClick={handleBatchUpdate}
              disabled={isBulkSaving || selectedIds.length === 0}
              className='ui-btn ui-btn-sm ui-btn-primary mt-3 disabled:opacity-50'>
              {isBulkSaving ? '保存中…' : `应用到 ${selectedIds.length} 条`}
            </button>
          </section>
        ) : null}

        {showDuplicates ? (
          <section className='rounded-xl border border-slate-200 bg-white p-4 shadow-sm'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <h2 className='text-sm font-bold text-slate-900'>重复项</h2>
              <div className='flex gap-2'>
                <button
                  type='button'
                  onClick={fetchMergePreview}
                  disabled={isLoadingMergePreview}
                  className='ui-btn ui-btn-sm'>
                  {isLoadingMergePreview ? '扫描中…' : '重新扫描'}
                </button>
                <button
                  type='button'
                  onClick={handleMergeAll}
                  disabled={isMergingAll || mergePreview.duplicateCount === 0}
                  className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
                  {isMergingAll ? '合并中…' : '全部合并'}
                </button>
              </div>
            </div>
            <div className='mt-3 divide-y divide-slate-100'>
              {mergePreview.groups.slice(0, 12).map(group => (
                <div
                  key={group.groupKey}
                  className='flex flex-wrap items-center gap-2 py-2.5 text-sm'>
                  <span className='font-bold text-slate-900'>{group.keepWord}</span>
                  <span className='min-w-0 flex-1 truncate text-xs text-slate-400'>
                    {group.items.map(item => item.word).join(' · ')}
                  </span>
                  <button
                    type='button'
                    onClick={() => handleMergeGroup(group)}
                    disabled={mergingGroupKey === group.groupKey}
                    className='ui-btn ui-btn-sm'>
                    {mergingGroupKey === group.groupKey ? '处理中…' : `合并 ${group.mergeIds.length} 条`}
                  </button>
                </div>
              ))}
              {mergePreview.totalGroups === 0 ? (
                <p className='py-6 text-center text-sm text-slate-400'>没有重复项</p>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className='overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm'>
          {loading ? (
            <div className='space-y-1 p-2'>
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className='h-20 animate-pulse rounded-lg bg-slate-50' />
              ))}
            </div>
          ) : (
            <div className='divide-y divide-slate-100'>
              {vocabList.map(item => {
                const isEditing = editingId === item.id
                const isSaving = savingId === item.id
                const previewSentence = item.sentences[0]
                return (
                  <article key={item.id} className='px-3 py-3 md:px-4'>
                    <div className='flex items-start gap-3'>
                      <input
                        type='checkbox'
                        checked={selectedIds.includes(item.id)}
                        onChange={event =>
                          setSelectedIds(previous =>
                            event.currentTarget.checked
                              ? Array.from(new Set([...previous, item.id]))
                              : previous.filter(id => id !== item.id),
                          )
                        }
                        aria-label={`选择 ${item.word}`}
                        className='mt-2 h-4 w-4 rounded border-slate-300 accent-slate-900'
                      />
                      <div className='min-w-0 flex-1'>
                        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
                          <WordPronunciation
                            word={item.word}
                            pronunciation={item.pronunciations[0] || ''}
                            pronunciations={item.pronunciations}
                            showPronunciation={true}
                            wordClassName='text-lg font-black text-slate-950'
                            hintClassName='text-xs font-medium text-slate-400'
                          />
                          <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500'>
                            {sourceLabel[item.sourceType]}
                          </span>
                          {item.partsOfSpeech.slice(0, 2).map(value => (
                            <span key={value} className='text-xs text-slate-400'>{value}</span>
                          ))}
                        </div>
                        <div className='mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-slate-600'>
                          {item.meanings.slice(0, 3).map(value => (
                            <span key={value}>{value}</span>
                          ))}
                          {item.meanings.length === 0 ? (
                            <span className='text-slate-300'>无释义</span>
                          ) : null}
                        </div>
                        {previewSentence ? (
                          <p className='mt-1 truncate text-xs text-slate-400'>
                            {previewSentence.text}
                          </p>
                        ) : null}
                      </div>
                      <div className='flex shrink-0 gap-1.5'>
                        {isEditing ? (
                          <>
                            <InlineConfirmAction
                              message={`删除「${item.word}」后不可恢复。`}
                              onConfirm={() => handleDelete(item.id)}
                              triggerLabel='删除'
                              confirmLabel='确认'
                              pendingLabel='删除中…'
                              triggerClassName='ui-btn ui-btn-sm ui-btn-danger'
                            />
                            <button
                              type='button'
                              onClick={() => handleSave(item)}
                              disabled={isSaving}
                              className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
                              {isSaving ? '保存中…' : '保存'}
                            </button>
                            <button
                              type='button'
                              onClick={() => setEditingId(null)}
                              className='ui-btn ui-btn-sm'>
                              取消
                            </button>
                          </>
                        ) : (
                          <button
                            type='button'
                            onClick={() => openEditor(item)}
                            className='ui-btn ui-btn-sm'>
                            编辑
                          </button>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className='ml-7 mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 md:grid-cols-2'>
                        {[
                          ['注音', pronunciationsInput, setPronunciationsInput],
                          ['词性', partsOfSpeechInput, setPartsOfSpeechInput],
                          ['释义', meaningInput, setMeaningInput],
                          ['标签', tagsInput, setTagsInput],
                        ].map(([label, value, setter]) => (
                          <label key={label as string} className='text-xs font-semibold text-slate-500'>
                            {label as string}
                            <textarea
                              value={value as string}
                              onChange={event =>
                                (setter as (next: string) => void)(event.currentTarget.value)
                              }
                              rows={2}
                              placeholder='每行一个'
                              className={`${fieldClassName} mt-1 resize-y`}
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </article>
                )
              })}
              {vocabList.length === 0 ? (
                <p className='py-16 text-center text-sm text-slate-400'>
                  {searchKeyword.trim() ? '没有匹配结果' : '暂无词条'}
                </p>
              ) : null}
            </div>
          )}
        </section>

        <nav className='flex items-center justify-between text-xs text-slate-400' aria-label='词库分页'>
          <span>{currentPage} / {totalPages}</span>
          <div className='flex gap-2'>
            <button
              type='button'
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(previous => Math.max(1, previous - 1))}
              className='ui-btn ui-btn-sm disabled:opacity-40'>
              上一页
            </button>
            <button
              type='button'
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(previous => Math.min(totalPages, previous + 1))}
              className='ui-btn ui-btn-sm disabled:opacity-40'>
              下一页
            </button>
          </div>
        </nav>
      </div>
    </main>
  )
}
