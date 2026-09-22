'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import InlineConfirmAction from '@/components/InlineConfirmAction'
import CustomSelect from '@/components/ui/CustomSelect'
import WordPronunciation from '@/modules/knowledge/vocabulary/components/WordPronunciation'
import VocabularyCsvDropZone from '@/modules/knowledge/vocabulary/components/VocabularyCsvDropZone'
import { useDialog } from '@/context/DialogContext'
import { splitLineStringList } from '@/utils/text/jsonList'
import ControlDropdown from '@/modules/knowledge/vocabulary/components/ControlDropdown'
import { listWordbookFilterOptions } from '@/modules/knowledge/vocabulary/domain/wordbook-list'
import { listSelectableWordbooks } from '@/modules/knowledge/wordbooks/actions'
import {
  batchUpdateVocabularyMetaAdmin,
  createVocabularyPartOfSpeechAdmin,
  deleteVocabularyAdmin,
  deleteVocabularyPartOfSpeechAdmin,
  getVocabulariesPagedAdmin,
  getVocabularySentencesAdmin,
  getVocabularyMergePreviewAdmin,
  listVocabularyPartOfSpeechHierarchyAdmin,
  mergeAllVocabularyDuplicatesAdmin,
  mergeVocabularyDuplicateGroupAdmin,
  updateVocabularyAdmin,
} from '@/modules/knowledge/vocabulary/admin-actions'

type VocabularyRecord = {
  id: string
  word: string
  languageCode: string
  sourceType:
    | 'AUDIO_DIALOGUE'
    | 'MEDIA_SUBTITLE_LINE'
    | 'ARTICLE_TEXT'
    | 'QUIZ_QUESTION'
  sentences: SentenceRecord[]
  etymologies?: string[]
  pronunciations: string[]
  partsOfSpeech: string[]
  meanings: string[]
  tags: string[]
  wordbookPaths: string[]
}

type SentenceRecord = {
  linkId: string
  text: string
  source: string
  sourceUrl: string
  senseId: string
  posTags?: string[]
}

type EditableSentenceRecord = {
  linkId: string
  text: string
  posTagsInput: string
  source: string
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

type PartOfSpeechHierarchyItem = {
  id: string
  name: string
  languageCode: string
  parentId: string | null
  parent: { name: string } | null
  managed: boolean
  _count: { children: number }
}

type WordbookOption = Awaited<ReturnType<typeof listSelectableWordbooks>>[number]

const PAGE_SIZE = 30

const languageLabels: Record<string, string> = {
  ja: '日语',
  en: '英语',
  zh: '中文',
  ko: '韩语',
  other: '其他',
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

const sameStringList = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index])

const sourceLabel: Record<VocabularyRecord['sourceType'], string> = {
  AUDIO_DIALOGUE: '听力',
  MEDIA_SUBTITLE_LINE: '影视',
  ARTICLE_TEXT: '文章',
  QUIZ_QUESTION: '题目',
}

const fieldClassName =
  'ui-input min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none'

export type VocabularyManageRecord = VocabularyRecord
export type VocabularyManageWordbookOption = WordbookOption

export default function VocabularyManageClient({
  initialVocabList,
  initialTotalCount,
  initialWordbooks,
}: {
  initialVocabList: VocabularyRecord[]
  initialTotalCount: number
  initialWordbooks: WordbookOption[]
}) {
  const dialog = useDialog()
  const [vocabList, setVocabList] = useState<VocabularyRecord[]>(initialVocabList)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [isSearchComposing, setIsSearchComposing] = useState(false)
  const [wordbookFilter, setWordbookFilter] = useState('all')
  const [wordbooks, setWordbooks] = useState<WordbookOption[]>(initialWordbooks)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [wordInput, setWordInput] = useState('')
  const [pronunciationsInput, setPronunciationsInput] = useState('')
  const [partsOfSpeechInput, setPartsOfSpeechInput] = useState('')
  const [meaningInput, setMeaningInput] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [sentenceInputs, setSentenceInputs] = useState<EditableSentenceRecord[]>([])
  const [initialSentenceInputs, setInitialSentenceInputs] = useState<EditableSentenceRecord[]>([])
  const [isLoadingSentenceInputs, setIsLoadingSentenceInputs] = useState(false)
  const [activeTool, setActiveTool] = useState<'csv' | 'batch' | 'parts-of-speech' | 'duplicates' | null>(null)
  const [csvWordbookId, setCsvWordbookId] = useState(initialWordbooks[0]?.id || '')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isCsvUploading, setIsCsvUploading] = useState(false)
  const [bulkPronunciationsInput, setBulkPronunciationsInput] = useState('')
  const [bulkPartsOfSpeechInput, setBulkPartsOfSpeechInput] = useState('')
  const [bulkSelectedPartsOfSpeech, setBulkSelectedPartsOfSpeech] = useState<string[]>([])
  const [bulkLanguageCode, setBulkLanguageCode] = useState('ja')
  const [bulkMode, setBulkMode] = useState<'append' | 'replace'>('append')
  const [isBulkSaving, setIsBulkSaving] = useState(false)
  const [partOfSpeechHierarchy, setPartOfSpeechHierarchy] = useState<PartOfSpeechHierarchyItem[]>([])
  const [partOfSpeechName, setPartOfSpeechName] = useState('')
  const [partOfSpeechLanguageCode, setPartOfSpeechLanguageCode] = useState('ja')
  const [partOfSpeechParentName, setPartOfSpeechParentName] = useState('')
  const [isSavingPartOfSpeech, setIsSavingPartOfSpeech] = useState(false)
  const [mergePreview, setMergePreview] = useState<{
    groups: MergePreviewGroup[]
    totalGroups: number
    duplicateCount: number
  }>({ groups: [], totalGroups: 0, duplicateCount: 0 })
  const [isLoadingMergePreview, setIsLoadingMergePreview] = useState(false)
  const [hasLoadedMergePreview, setHasLoadedMergePreview] = useState(false)
  const [mergingGroupKey, setMergingGroupKey] = useState<string | null>(null)
  const [isMergingAll, setIsMergingAll] = useState(false)
  const requestIdRef = useRef(0)
  const sentenceRequestIdRef = useRef(0)
  const lastListRequestKeyRef = useRef(JSON.stringify([1, '', 'all']))
  const hasRequestedWordbooksRef = useRef(true)

  const fetchVocabs = useCallback(async (
    page: number,
    keyword: string,
    selectedWordbook: string,
  ) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoading(true)
    try {
      const data = await getVocabulariesPagedAdmin(
        keyword,
        page,
        PAGE_SIZE,
        selectedWordbook,
      )
      if (requestId !== requestIdRef.current) return
      const nextList = data.items as VocabularyRecord[]
      setVocabList(nextList)
      setTotalCount(data.total || 0)
      setCurrentPage(data.page || 1)
      const validIds = new Set(nextList.map(item => item.id))
      setSelectedIds(previous => previous.filter(id => validIds.has(id)))
    } catch {
      if (requestId === requestIdRef.current) {
        dialog.toast('词条加载失败，请稍后重试', { tone: 'error' })
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [dialog])

  useEffect(() => {
    if (hasRequestedWordbooksRef.current) return
    hasRequestedWordbooksRef.current = true
    void listSelectableWordbooks()
      .then(rows => {
        setWordbooks(rows)
        setCsvWordbookId(previous => previous || rows[0]?.id || '')
      })
      .catch(() => dialog.toast('单词书加载失败，请稍后重试', { tone: 'error' }))
  }, [dialog])

  const fetchMergePreview = useCallback(async () => {
    setIsLoadingMergePreview(true)
    try {
      const data = await getVocabularyMergePreviewAdmin()
      setMergePreview(data as typeof mergePreview)
      setHasLoadedMergePreview(true)
    } catch {
      dialog.toast('重复项扫描失败，请稍后重试', { tone: 'error' })
    } finally {
      setIsLoadingMergePreview(false)
    }
  }, [dialog])

  const fetchPartOfSpeechHierarchy = useCallback(async () => {
    const rows = await listVocabularyPartOfSpeechHierarchyAdmin()
    setPartOfSpeechHierarchy(rows)
  }, [])

  useEffect(() => {
    const requestKey = JSON.stringify([
      currentPage,
      searchKeyword,
      wordbookFilter,
    ])
    if (lastListRequestKeyRef.current === requestKey) return
    lastListRequestKeyRef.current = requestKey
    void fetchVocabs(currentPage, searchKeyword, wordbookFilter)
  }, [currentPage, fetchVocabs, searchKeyword, wordbookFilter])

  useEffect(() => {
    if (isSearchComposing) return
    const keyword = searchInput.trim()
    if (keyword === searchKeyword) return
    const timer = window.setTimeout(() => {
      setCurrentPage(1)
      setSearchKeyword(keyword)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [isSearchComposing, searchInput, searchKeyword])

  const wordbookFilterOptions = useMemo(
    () => listWordbookFilterOptions(
      wordbooks.map(wordbook => ({
        id: wordbook.id,
        name: wordbook.title,
        seriesId: wordbook.seriesId,
        seriesName: wordbook.seriesTitle,
        count: wordbook.vocabularyCount,
      })),
    ),
    [wordbooks],
  )

  const currentIds = useMemo(() => vocabList.map(item => item.id), [vocabList])
  const selectedVocabularies = useMemo(
    () => vocabList.filter(item => selectedIds.includes(item.id)),
    [selectedIds, vocabList],
  )
  const selectedLanguageCodes = useMemo(
    () => Array.from(new Set(selectedVocabularies.map(item => item.languageCode))),
    [selectedVocabularies],
  )
  const bulkTargetIds = useMemo(
    () =>
      selectedVocabularies
        .filter(item => item.languageCode === bulkLanguageCode)
        .map(item => item.id),
    [bulkLanguageCode, selectedVocabularies],
  )
  const bulkPartOfSpeechOptions = useMemo(
    () =>
      partOfSpeechHierarchy.filter(
        item => item.languageCode === bulkLanguageCode,
      ),
    [bulkLanguageCode, partOfSpeechHierarchy],
  )
  const selectedInView = selectedIds.filter(id => currentIds.includes(id)).length
  const allInViewSelected = vocabList.length > 0 && selectedInView === vocabList.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, totalCount)
  const isSearchPending = searchInput.trim() !== searchKeyword

  const commitSearch = () => {
    setCurrentPage(1)
    setSearchKeyword(searchInput.trim())
  }

  useEffect(() => {
    if (selectedLanguageCodes.length === 1) {
      setBulkLanguageCode(selectedLanguageCodes[0])
    }
  }, [selectedLanguageCodes])

  const toggleSelectAll = () => {
    setSelectedIds(previous => {
      if (allInViewSelected) {
        return previous.filter(id => !currentIds.includes(id))
      }
      return Array.from(new Set([...previous, ...currentIds]))
    })
  }

  const openEditor = (item: VocabularyRecord) => {
    const sentenceRequestId = sentenceRequestIdRef.current + 1
    sentenceRequestIdRef.current = sentenceRequestId
    setEditingId(item.id)
    setWordInput(item.word)
    setPronunciationsInput(item.pronunciations.join('\n'))
    setPartsOfSpeechInput(item.partsOfSpeech.join('\n'))
    setMeaningInput(item.meanings.join('\n'))
    setTagsInput(item.tags.join('\n'))
    setSentenceInputs([])
    setInitialSentenceInputs([])
    setIsLoadingSentenceInputs(true)
    void getVocabularySentencesAdmin(item.id)
      .then(result => {
        if (sentenceRequestIdRef.current !== sentenceRequestId) return
        if (!result.success) {
          dialog.toast(result.message || '例句加载失败', { tone: 'error' })
          return
        }
        const inputs = result.sentences.map(sentence => ({
          linkId: sentence.linkId,
          text: sentence.text,
          posTagsInput: (sentence.posTags || []).join(', '),
          source: sentence.source,
        }))
        setSentenceInputs(inputs)
        setInitialSentenceInputs(inputs)
      })
      .catch(() => {
        if (sentenceRequestIdRef.current === sentenceRequestId) {
          dialog.toast('例句加载失败，请稍后重试', { tone: 'error' })
        }
      })
      .finally(() => {
        if (sentenceRequestIdRef.current === sentenceRequestId) {
          setIsLoadingSentenceInputs(false)
        }
      })
  }

  const handleSave = async (item: VocabularyRecord) => {
    const word = wordInput.trim()
    if (!word) {
      dialog.toast('词条不能为空', { tone: 'error' })
      return
    }
    const pronunciations = splitUserInput(pronunciationsInput)
    const partsOfSpeech = splitUserInput(partsOfSpeechInput)
    const meanings = splitLineStringList(meaningInput)
    const tags = splitUserInput(tagsInput)
    const updateMeta =
      word !== item.word ||
      !sameStringList(pronunciations, item.pronunciations) ||
      !sameStringList(partsOfSpeech, item.partsOfSpeech) ||
      !sameStringList(meanings, item.meanings)
    const updateTags = !sameStringList(tags, item.tags)
    const sentences = sentenceInputs
      .filter(sentence => {
        const initial = initialSentenceInputs.find(
          candidate => candidate.linkId === sentence.linkId,
        )
        return (
          !initial ||
          initial.text.trim() !== sentence.text.trim() ||
          !sameStringList(
            splitUserInput(initial.posTagsInput),
            splitUserInput(sentence.posTagsInput),
          )
        )
      })
      .map(sentence => ({
        linkId: sentence.linkId,
        text: sentence.text.trim(),
        posTags: splitUserInput(sentence.posTagsInput),
      }))
    if (sentences.some(sentence => !sentence.text)) {
      dialog.toast('例句不能为空', { tone: 'error' })
      return
    }
    if (!updateMeta && !updateTags && sentences.length === 0) {
      setEditingId(null)
      dialog.toast('没有需要保存的修改')
      return
    }
    setSavingId(item.id)
    const result = await updateVocabularyAdmin(item.id, {
      word,
      pronunciations,
      partsOfSpeech,
      meanings,
      tags,
      sentences,
      updateMeta,
      updateTags,
    })
    if (!result.success) {
      setSavingId(null)
      dialog.toast(result.message || '保存失败', { tone: 'error' })
      return
    }
    setSavingId(null)
    setVocabList(previous =>
      previous.map(current =>
        current.id === item.id
          ? {
              ...current,
              word,
              pronunciations,
              partsOfSpeech,
              meanings,
              tags,
              sentences: current.sentences.map(sentence => {
                const edited = sentences.find(
                  candidate => candidate.linkId === sentence.linkId,
                )
                return edited
                  ? { ...sentence, text: edited.text, posTags: edited.posTags }
                  : sentence
              }),
            }
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
    setVocabList(previous => previous.filter(item => item.id !== id))
    setSelectedIds(previous => previous.filter(itemId => itemId !== id))
    setTotalCount(previous => Math.max(0, previous - 1))
    dialog.toast('已删除', { tone: 'success' })
  }

  const handleBatchUpdate = async () => {
    const pronunciations = splitUserInput(bulkPronunciationsInput)
    const partsOfSpeech = Array.from(
      new Set([
        ...bulkSelectedPartsOfSpeech,
        ...splitUserInput(bulkPartsOfSpeechInput),
      ]),
    )
    if (bulkTargetIds.length === 0 || (pronunciations.length === 0 && partsOfSpeech.length === 0)) {
      dialog.toast('请选择词条并填写更新内容', { tone: 'error' })
      return
    }
    setIsBulkSaving(true)
    const result = await batchUpdateVocabularyMetaAdmin(
      bulkTargetIds,
      { pronunciations, partsOfSpeech },
      bulkMode,
    )
    setIsBulkSaving(false)
    if (!result.success) {
      dialog.toast(result.message || '批量更新失败', { tone: 'error' })
      return
    }
    await fetchVocabs(currentPage, searchKeyword, wordbookFilter)
    dialog.toast(`已更新 ${result.updatedCount || bulkTargetIds.length} 条`, {
      tone: 'success',
    })
  }

  const toggleBulkPartOfSpeech = (name: string) => {
    setBulkSelectedPartsOfSpeech(previous =>
      previous.includes(name)
        ? previous.filter(item => item !== name)
        : [...previous, name],
    )
  }

  const handleCreateBulkPartOfSpeech = async () => {
    const name = bulkPartsOfSpeechInput.trim()
    if (!name) return
    setIsSavingPartOfSpeech(true)
    const result = await createVocabularyPartOfSpeechAdmin(
      name,
      bulkLanguageCode,
    )
    setIsSavingPartOfSpeech(false)
    if (!result.success) {
      dialog.toast(result.message || '添加失败', { tone: 'error' })
      return
    }
    setBulkPartsOfSpeechInput('')
    setBulkSelectedPartsOfSpeech(previous =>
      previous.includes(name) ? previous : [...previous, name],
    )
    await fetchPartOfSpeechHierarchy()
    dialog.toast('词性已创建并选中', { tone: 'success' })
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
    await fetchVocabs(currentPage, searchKeyword, wordbookFilter)
    setMergePreview(previous => ({
      groups: previous.groups.filter(item => item.groupKey !== group.groupKey),
      totalGroups: Math.max(0, previous.totalGroups - 1),
      duplicateCount: Math.max(0, previous.duplicateCount - group.mergeIds.length),
    }))
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
    await fetchVocabs(currentPage, searchKeyword, wordbookFilter)
    setMergePreview({ groups: [], totalGroups: 0, duplicateCount: 0 })
    dialog.toast(`已合并 ${result.mergedCount || 0} 条`, { tone: 'success' })
  }

  const handleCreatePartOfSpeech = async () => {
    setIsSavingPartOfSpeech(true)
    const result = await createVocabularyPartOfSpeechAdmin(
      partOfSpeechName,
      partOfSpeechLanguageCode,
      partOfSpeechParentName,
    )
    setIsSavingPartOfSpeech(false)
    if (!result.success) {
      dialog.toast(result.message || '添加失败', { tone: 'error' })
      return
    }
    setPartOfSpeechName('')
    await fetchPartOfSpeechHierarchy()
    dialog.toast('词性已添加', { tone: 'success' })
  }

  const handleDeletePartOfSpeech = async (id: string) => {
    const result = await deleteVocabularyPartOfSpeechAdmin(id)
    if (!result.success) {
      dialog.toast(result.message || '删除失败', { tone: 'error' })
      return
    }
    await fetchPartOfSpeechHierarchy()
    dialog.toast('词性目录已删除，词条中的已有词性不受影响', { tone: 'success' })
  }

  const handleCsvUpload = async () => {
    if (!csvWordbookId || !csvFile) return
    setIsCsvUploading(true)
    const formData = new FormData()
    formData.set('wordbookId', csvWordbookId)
    formData.set('file', csvFile)
    try {
      const response = await fetch('/api/manage/vocabulary/csv', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json() as {
        success: boolean
        message?: string
        updatedCount?: number
      }
      if (!result.success) {
        dialog.toast(result.message || '上传更新失败', { tone: 'error' })
        return
      }
      setCsvFile(null)
      await fetchVocabs(currentPage, searchKeyword, wordbookFilter)
      dialog.toast(`已更新 ${result.updatedCount || 0} 条词汇`, { tone: 'success' })
    } catch {
      dialog.toast('上传更新失败，请稍后重试', { tone: 'error' })
    } finally {
      setIsCsvUploading(false)
    }
  }

  const toggleTool = (tool: 'csv' | 'batch' | 'parts-of-speech' | 'duplicates') => {
    setActiveTool(previous => (previous === tool ? null : tool))
    if (tool === 'csv' && !['all', 'none'].includes(wordbookFilter) && !wordbookFilter.startsWith('series:')) {
      setCsvWordbookId(wordbookFilter)
    }
    if (tool === 'parts-of-speech' || tool === 'batch') {
      void fetchPartOfSpeechHierarchy()
    }
    if (tool === 'duplicates' && !hasLoadedMergePreview) {
      void fetchMergePreview()
    }
  }

  return (
    <main className='min-h-full bg-[#f6f5f1] px-3 py-4 md:px-6'>
      <div className='mx-auto max-w-7xl space-y-3'>
        <section className='bg-transparent'>
          <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'>
            <div className='flex items-center gap-2 text-sm tabular-nums text-slate-500'>
              <strong className='font-bold text-slate-900'>{totalCount.toLocaleString()}</strong>
              <span>条词汇</span>
              {selectedIds.length > 0 ? (
                <span className='ui-tag ui-tag-info'>已选 {selectedIds.length}</span>
              ) : null}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Link href='/vocabulary' className='ui-btn ui-btn-sm'>查看词库</Link>
              <button
                type='button'
                aria-pressed={activeTool === 'csv'}
                onClick={() => toggleTool('csv')}
                className={`ui-btn ui-btn-sm ${activeTool === 'csv' ? 'ui-btn-primary' : ''}`}>
                CSV
              </button>
              <button
                type='button'
                aria-pressed={activeTool === 'batch'}
                onClick={() => toggleTool('batch')}
                className={`ui-btn ui-btn-sm ${activeTool === 'batch' ? 'ui-btn-primary' : ''}`}>
                批量编辑
              </button>
              <button
                type='button'
                aria-pressed={activeTool === 'parts-of-speech'}
                onClick={() => toggleTool('parts-of-speech')}
                className={`ui-btn ui-btn-sm ${activeTool === 'parts-of-speech' ? 'ui-btn-primary' : ''}`}>
                词性
              </button>
              <button
                type='button'
                aria-pressed={activeTool === 'duplicates'}
                onClick={() => toggleTool('duplicates')}
                className={`ui-btn ui-btn-sm ${activeTool === 'duplicates' ? 'ui-btn-primary' : ''}`}>
                {isLoadingMergePreview
                  ? '扫描中…'
                  : mergePreview.duplicateCount > 0
                    ? `重复 ${mergePreview.duplicateCount}`
                    : hasLoadedMergePreview
                      ? '无重复'
                      : '检查重复'}
              </button>
            </div>
          </div>
          <div className='grid gap-3 px-4 py-3 sm:grid-cols-[minmax(15rem,1fr)_minmax(13rem,20rem)_auto] sm:items-end'>
            <label className='text-xs font-semibold text-slate-500'>
              搜索
              <input
                type='search'
                value={searchInput}
                onChange={event => {
                  const value = event.currentTarget.value
                  setSearchInput(value)
                  if (!value) {
                    setCurrentPage(1)
                    setSearchKeyword('')
                  }
                }}
                onCompositionStart={() => setIsSearchComposing(true)}
                onCompositionEnd={() => setIsSearchComposing(false)}
                onKeyDown={event => {
                  if (event.key !== 'Enter' || isSearchComposing) return
                  event.preventDefault()
                  commitSearch()
                }}
                placeholder='词条、注音或释义'
                aria-label='搜索词库'
                className='ui-input mt-1 h-10 w-full bg-white px-3 text-sm outline-none'
              />
            </label>
            <label className='text-xs font-semibold text-slate-500'>
              单词书
              <ControlDropdown
                ariaLabel='单词书筛选'
                value={wordbookFilter}
                onChange={value => {
                  setWordbookFilter(value)
                  setCurrentPage(1)
                  setSearchKeyword(searchInput.trim())
                }}
                className='mt-1 w-full'
                options={[
                  { value: 'all', label: '全部单词书' },
                  { value: 'none', label: '未加入单词书' },
                  ...wordbookFilterOptions,
                ]}
              />
            </label>
            <div className='flex gap-2'>
              {isSearchPending && searchInput.trim() ? (
                <button
                  type='button'
                  onClick={commitSearch}
                  className='ui-btn ui-btn-sm ui-btn-primary'>
                  搜索
                </button>
              ) : null}
              {searchInput ? (
                <button
                  type='button'
                  onClick={() => {
                    setSearchInput('')
                    setSearchKeyword('')
                    setCurrentPage(1)
                  }}
                  className='ui-btn ui-btn-sm'>
                  清除
                </button>
              ) : null}
              <button
                type='button'
                onClick={toggleSelectAll}
                disabled={vocabList.length === 0}
                className='ui-btn ui-btn-sm whitespace-nowrap disabled:opacity-50'>
                {allInViewSelected ? '取消本页' : '全选本页'}
              </button>
            </div>
          </div>
        </section>

        {activeTool === 'csv' ? (
          <section className='bg-transparent px-4 py-5'>
            <div className='grid gap-5 lg:grid-cols-2'>
              <div>
                <h2 className='text-sm font-bold text-slate-900'>按词表导出</h2>
                <p className='mt-1 text-xs leading-5 text-slate-500'>包含单词、语言、注音、词性、标签、释义、例句与例句词性，不包含音频。</p>
                <label className='mt-3 block text-xs font-semibold text-slate-600'>
                  词表
                  <CustomSelect
                    value={csvWordbookId}
                    onChange={event => setCsvWordbookId(event.currentTarget.value)}
                    className={`${fieldClassName} mt-1`}>
                    {wordbooks.map(wordbook => (
                      <option key={wordbook.id} value={wordbook.id}>
                        {wordbook.seriesTitle} / {wordbook.title}（{wordbook.vocabularyCount}）
                      </option>
                    ))}
                  </CustomSelect>
                </label>
                {csvWordbookId ? (
                  <a
                    href={`/api/manage/vocabulary/csv?wordbook=${encodeURIComponent(csvWordbookId)}`}
                    className='ui-btn ui-btn-primary mt-3 inline-flex'>
                    导出 CSV
                  </a>
                ) : null}
              </div>
              <div>
                <h2 className='text-sm font-bold text-slate-900'>上传更新</h2>
                <p className='mt-1 text-xs leading-5 text-slate-500'>请上传由此处导出的 CSV。多个例句按换行对应，单条例句的多个词性可用逗号分隔。上传不会新增或删除单词、例句。</p>
                <VocabularyCsvDropZone
                  file={csvFile}
                  onChange={setCsvFile}
                  onError={message => dialog.toast(message, { tone: 'error' })}
                />
                <button
                  type='button'
                  disabled={!csvWordbookId || !csvFile || isCsvUploading}
                  onClick={() => void handleCsvUpload()}
                  className='ui-btn ui-btn-primary mt-3 disabled:opacity-50'>
                  {isCsvUploading ? '更新中…' : '上传并更新'}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeTool === 'batch' ? (
          <section className='bg-transparent px-4 py-5'>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <h2 className='text-sm font-bold text-slate-900'>批量编辑</h2>
              <button
                type='button'
                onClick={() => setSelectedIds([])}
                className='text-xs font-semibold text-slate-400 hover:text-slate-700'>
                清空选择
              </button>
            </div>
            <div className='grid gap-3 md:grid-cols-[160px_1fr]'>
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
            </div>
            <div className='mt-4 pt-4'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                  <h3 className='text-sm font-semibold text-slate-900'>词性</h3>
                  <p className='mt-0.5 text-xs text-slate-500'>仅更新所选语言的词条。</p>
                </div>
                <div className='flex flex-wrap gap-1' aria-label='词性语言'>
                  {Array.from(
                    new Set([
                      bulkLanguageCode,
                      ...selectedLanguageCodes,
                      ...partOfSpeechHierarchy.map(item => item.languageCode),
                    ]),
                  ).map(languageCode => (
                    <button
                      key={`bulk-pos-language-${languageCode}`}
                      type='button'
                      onClick={() => {
                        setBulkLanguageCode(languageCode)
                        setBulkSelectedPartsOfSpeech([])
                        setBulkPartsOfSpeechInput('')
                      }}
                      className={`ui-btn ui-btn-sm ${
                        bulkLanguageCode === languageCode ? 'ui-btn-primary' : ''
                      }`}>
                      {languageLabels[languageCode] || languageCode}
                    </button>
                  ))}
                </div>
              </div>
              <div className='mt-3 flex flex-wrap gap-2'>
                {bulkPartOfSpeechOptions.map(item => {
                  const selected = bulkSelectedPartsOfSpeech.includes(item.name)
                  return (
                    <button
                      key={`bulk-pos-${item.languageCode}-${item.name}`}
                      type='button'
                      aria-pressed={selected}
                      onClick={() => toggleBulkPartOfSpeech(item.name)}
                      className={`ui-btn ui-btn-sm ${selected ? 'ui-btn-primary' : ''}`}>
                      {item.parent ? `${item.parent.name} / ` : ''}{item.name}
                    </button>
                  )
                })}
                {bulkPartOfSpeechOptions.length === 0 ? (
                  <span className='py-2 text-xs text-slate-400'>该语言还没有词性</span>
                ) : null}
              </div>
              <div className='mt-3 flex flex-col gap-2 sm:flex-row'>
                <input
                  value={bulkPartsOfSpeechInput}
                  onChange={event => setBulkPartsOfSpeechInput(event.currentTarget.value)}
                  placeholder={`创建${languageLabels[bulkLanguageCode] || bulkLanguageCode}词性`}
                  aria-label='新词性名称'
                  className={`${fieldClassName} flex-1`}
                />
                <button
                  type='button'
                  disabled={isSavingPartOfSpeech || !bulkPartsOfSpeechInput.trim()}
                  onClick={() => void handleCreateBulkPartOfSpeech()}
                  className='ui-btn ui-btn-sm disabled:opacity-50'>
                  {isSavingPartOfSpeech ? '创建中…' : '创建并选择'}
                </button>
              </div>
              {selectedLanguageCodes.length > 1 ? (
                <p className='mt-2 text-xs text-amber-700'>当前选择包含多种语言，本次只应用到{languageLabels[bulkLanguageCode] || bulkLanguageCode}词条。</p>
              ) : null}
            </div>
            <button
              type='button'
              onClick={handleBatchUpdate}
              disabled={isBulkSaving || bulkTargetIds.length === 0}
              className='ui-btn ui-btn-sm ui-btn-primary mt-3 disabled:opacity-50'>
              {isBulkSaving ? '保存中…' : `应用到 ${bulkTargetIds.length} 条`}
            </button>
          </section>
        ) : null}

        {activeTool === 'parts-of-speech' ? (
          <section className='bg-transparent px-4 py-5'>
            <div className='grid gap-5 lg:grid-cols-[minmax(260px,0.7fr)_1.3fr]'>
              <div>
                <h2 className='text-sm font-bold text-slate-900'>添加词性层级</h2>
                <p className='mt-1 text-xs leading-5 text-slate-500'>根词性不选上级；子词性选择一个上级。这里的目录会出现在词书批量词性选项中。</p>
                <label className='mt-3 block text-xs font-semibold text-slate-600'>
                  语言
                  <CustomSelect
                    value={partOfSpeechLanguageCode}
                    onChange={event => {
                      setPartOfSpeechLanguageCode(event.currentTarget.value)
                      setPartOfSpeechParentName('')
                    }}
                    className={`${fieldClassName} mt-1`}>
                    {Object.entries(languageLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </CustomSelect>
                </label>
                <label className='mt-3 block text-xs font-semibold text-slate-600'>
                  词性名称
                  <input
                    value={partOfSpeechName}
                    onChange={event => setPartOfSpeechName(event.currentTarget.value)}
                    placeholder='例如：固有名詞'
                    className={`${fieldClassName} mt-1`}
                  />
                </label>
                <label className='mt-3 block text-xs font-semibold text-slate-600'>
                  上级词性
                  <CustomSelect
                    value={partOfSpeechParentName}
                    onChange={event => setPartOfSpeechParentName(event.currentTarget.value)}
                    className={`${fieldClassName} mt-1`}>
                    <option value=''>无（根词性）</option>
                    {partOfSpeechHierarchy
                      .filter(item => item.languageCode === partOfSpeechLanguageCode)
                      .map(item => (
                      <option key={item.id} value={item.name}>{item.parent ? `${item.parent.name} / ` : ''}{item.name}</option>
                    ))}
                  </CustomSelect>
                </label>
                <button
                  type='button'
                  disabled={isSavingPartOfSpeech || !partOfSpeechName.trim()}
                  onClick={() => void handleCreatePartOfSpeech()}
                  className='ui-btn ui-btn-primary mt-3 disabled:opacity-50'>
                  {isSavingPartOfSpeech ? '添加中…' : '添加词性'}
                </button>
              </div>
              <div>
                <h2 className='text-sm font-bold text-slate-900'>当前层级 · {languageLabels[partOfSpeechLanguageCode] || partOfSpeechLanguageCode}</h2>
                <div className='mt-3 space-y-4'>
                  {partOfSpeechHierarchy
                    .filter(item => item.languageCode === partOfSpeechLanguageCode)
                    .map(item => (
                    <div key={item.id} className='flex min-h-12 items-center gap-3 px-2 py-2'>
                      <span className='min-w-0 flex-1 text-sm font-semibold text-slate-800'>
                        {item.parent ? <span className='font-normal text-slate-400'>{item.parent.name} / </span> : null}
                        {item.name}
                      </span>
                      {item._count.children > 0 ? <span className='text-xs text-slate-400'>{item._count.children} 个子级</span> : null}
                      {item.managed ? (
                        <InlineConfirmAction
                          message={`删除「${item.name}」的自定义层级吗？词条中的已有词性不会删除。`}
                          onConfirm={() => handleDeletePartOfSpeech(item.id)}
                          triggerLabel='删除层级'
                          confirmLabel='确认删除'
                          pendingLabel='删除中…'
                          triggerClassName='ui-btn ui-btn-sm text-rose-700'
                        />
                      ) : (
                        <span className='text-[11px] text-slate-400'>现有词性</span>
                      )}
                    </div>
                  ))}
                  {partOfSpeechHierarchy.filter(
                    item => item.languageCode === partOfSpeechLanguageCode,
                  ).length === 0 ? (
                    <p className='py-8 text-center text-sm text-slate-400'>尚未建立自定义词性层级</p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeTool === 'duplicates' ? (
          <section className='bg-transparent px-4 py-5'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h2 className='text-base font-bold text-slate-900'>重复项整理</h2>
                <p className='mt-1 text-xs text-slate-500'>
                  按词形、注音和内容质量选择保留项；合并会保留例句与词书归属。
                </p>
              </div>
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
            <div className='mt-3 space-y-4'>
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
              {isLoadingMergePreview ? (
                <div className='space-y-2 py-4' aria-label='正在扫描重复项'>
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className='h-10 animate-pulse bg-stone-100' />
                  ))}
                </div>
              ) : mergePreview.totalGroups === 0 ? (
                <p className='py-8 text-center text-sm text-slate-400'>没有发现重复项</p>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className='overflow-hidden bg-transparent'>
          <div className='flex flex-wrap items-center justify-between gap-3 bg-stone-50/60 px-4 py-3'>
            <p className='text-xs tabular-nums text-slate-500'>
              {rangeStart}–{rangeEnd} / {totalCount.toLocaleString()}
            </p>
            {loading ? (
              <span className='text-xs font-semibold text-slate-400'>正在更新结果…</span>
            ) : null}
          </div>
          {loading ? (
            <div className='space-y-1 p-2'>
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className='h-20 animate-pulse rounded-lg bg-slate-50' />
              ))}
            </div>
          ) : (
            <div className='space-y-4'>
              {vocabList.map(item => {
                const isEditing = editingId === item.id
                const isSaving = savingId === item.id
                const previewSentence = item.sentences[0]
                const originLabels = item.wordbookPaths.length > 0
                  ? item.wordbookPaths
                  : [sourceLabel[item.sourceType]]
                return (
                  <article
                    key={item.id}
                    data-editing={isEditing || undefined}
                    className={`px-3 py-3 transition-colors md:px-4 ${
                      isEditing ? 'bg-slate-500/[0.025]' : 'hover:bg-stone-50/70'
                    }`}>
                    <div className='grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 md:grid-cols-[1rem_minmax(10rem,0.75fr)_minmax(14rem,1.25fr)_minmax(11rem,0.9fr)_auto] md:items-center'>
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
                        className='mt-1 h-4 w-4 rounded border-slate-300 accent-slate-900 md:mt-0'
                      />
                      <div className='min-w-0'>
                        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1'>
                          <WordPronunciation
                            word={item.word}
                            pronunciation={item.pronunciations[0] || ''}
                            pronunciations={item.pronunciations}
                            etymologies={item.etymologies}
                            showPronunciation={true}
                            wordClassName='text-base font-bold text-slate-950'
                            hintClassName='text-xs font-medium text-slate-400'
                          />
                          {item.partsOfSpeech.slice(0, 2).map(value => (
                            <span key={value} className='ui-tag ui-tag-muted text-[10px]'>{value}</span>
                          ))}
                        </div>
                      </div>
                      <div className='col-start-2 min-w-0 md:col-start-auto'>
                        <div className='flex flex-wrap gap-x-2 gap-y-1 text-sm leading-5 text-slate-600'>
                          {item.meanings.slice(0, 3).map(value => (
                            <span key={value}>{value}</span>
                          ))}
                          {item.meanings.length === 0 ? (
                            <span className='text-slate-300'>无释义</span>
                          ) : null}
                        </div>
                        {previewSentence ? (
                          <p className='mt-1 truncate text-xs leading-5 text-slate-400'>
                            {previewSentence.text}
                          </p>
                        ) : null}
                      </div>
                      <div className='col-start-2 flex min-w-0 flex-wrap gap-1 md:col-start-auto'>
                        {originLabels.slice(0, 2).map(value => (
                          <span key={value} title={value} className='ui-tag ui-tag-muted max-w-full truncate text-[10px]'>
                            {value}
                          </span>
                        ))}
                        {originLabels.length > 2 ? (
                          <span className='text-[10px] text-slate-400'>+{originLabels.length - 2}</span>
                        ) : null}
                      </div>
                      <div className='col-start-3 row-start-1 flex shrink-0 justify-end md:col-start-auto md:row-start-auto'>
                        {isEditing ? (
                          <span className='ui-tag ui-tag-info'>正在编辑</span>
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
                      <div className='ml-7 mt-4 border-t border-indigo-100 pt-4'>
                        <div className='mb-4'>
                          <h3 className='text-sm font-bold text-slate-900'>编辑词条</h3>
                          <p className='mt-0.5 text-xs leading-5 text-slate-500'>
                            修改词条名称后，词书、例句和学习记录仍会保留在当前词条下。
                          </p>
                        </div>

                        <label className='block text-xs font-semibold text-slate-600'>
                          词条名称
                          <input
                            value={wordInput}
                            onChange={event => setWordInput(event.currentTarget.value)}
                            autoFocus
                            placeholder='输入单词或词组'
                            className={`${fieldClassName} mt-1 text-base font-bold`}
                          />
                        </label>

                        <div className='mt-3 grid gap-3 md:grid-cols-2'>
                          {[
                            ['注音', pronunciationsInput, setPronunciationsInput],
                            ['词性', partsOfSpeechInput, setPartsOfSpeechInput],
                            ['释义', meaningInput, setMeaningInput],
                            ['标签', tagsInput, setTagsInput],
                          ].map(([label, value, setter]) => (
                            <label key={label as string} className='text-xs font-semibold text-slate-600'>
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

                        <section className='mt-4 border-t border-indigo-100 pt-4'>
                          <div className='mb-3'>
                            <h4 className='text-xs font-bold text-slate-700'>
                              单词书例句
                            </h4>
                            <p className='mt-0.5 text-xs leading-5 text-slate-500'>
                              可修改例句原文及其在当前词条下的词性；多个词性使用逗号分隔。
                            </p>
                          </div>
                          {isLoadingSentenceInputs ? (
                            <p className='rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400'>
                              正在加载例句…
                            </p>
                          ) : sentenceInputs.length > 0 ? (
                            <div className='space-y-3'>
                              {sentenceInputs.map((sentence, sentenceIndex) => {
                                return (
                                  <div
                                    key={sentence.linkId}
                                    className='rounded-lg border border-slate-200 bg-white p-3'>
                                    <div className='mb-2 flex items-center justify-between gap-3'>
                                      <span className='text-[11px] font-bold text-slate-500'>
                                        例句 {sentenceIndex + 1}
                                      </span>
                                      {sentence.source ? (
                                        <span className='truncate text-[10px] text-slate-400' title={sentence.source}>
                                          {sentence.source}
                                        </span>
                                      ) : null}
                                    </div>
                                    <label className='block text-xs font-semibold text-slate-600'>
                                      例句原文
                                      <textarea
                                        value={sentence.text}
                                        onChange={event => {
                                          const text = event.currentTarget.value
                                          setSentenceInputs(previous =>
                                            previous.map(current =>
                                              current.linkId === sentence.linkId
                                                ? { ...current, text }
                                                : current,
                                            ),
                                          )
                                        }}
                                        rows={3}
                                        className={`${fieldClassName} mt-1 resize-y`}
                                      />
                                    </label>
                                    <label className='mt-2 block text-xs font-semibold text-slate-600'>
                                      例句词性
                                      <input
                                        value={sentence.posTagsInput}
                                        onChange={event => {
                                          const posTagsInput = event.currentTarget.value
                                          setSentenceInputs(previous =>
                                            previous.map(current =>
                                              current.linkId === sentence.linkId
                                                ? {
                                                    ...current,
                                                    posTagsInput,
                                                  }
                                                : current,
                                            ),
                                          )
                                        }}
                                        placeholder='例如：副詞, 接続詞'
                                        className={`${fieldClassName} mt-1`}
                                      />
                                    </label>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <p className='rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400'>
                              当前词条没有关联例句
                            </p>
                          )}
                        </section>

                        <div className='mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-indigo-100 pt-4'>
                          <InlineConfirmAction
                            message={`删除「${item.word}」后不可恢复。`}
                            onConfirm={() => handleDelete(item.id)}
                            triggerLabel='删除词条'
                            confirmLabel='确认删除'
                            pendingLabel='删除中…'
                            triggerClassName='ui-btn ui-btn-sm ui-btn-danger'
                          />
                          <div className='flex gap-2'>
                            <button
                              type='button'
                              onClick={() => {
                                sentenceRequestIdRef.current += 1
                                setEditingId(null)
                              }}
                              disabled={isSaving}
                              className='ui-btn ui-btn-sm disabled:opacity-50'>
                              取消
                            </button>
                            <button
                              type='button'
                              onClick={() => handleSave(item)}
                              disabled={
                                isSaving ||
                                isLoadingSentenceInputs ||
                                !wordInput.trim()
                              }
                              className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
                              {isSaving ? '保存中…' : '保存修改'}
                            </button>
                          </div>
                        </div>
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

        <nav className='flex items-center justify-between border-t border-slate-300 pt-4 text-xs text-slate-500' aria-label='词库分页'>
          <span className='ui-meta tabular-nums'>第 {currentPage} / {totalPages} 页 · 每页 {PAGE_SIZE} 条</span>
          <div className='flex items-center gap-0.5'>
            <button
              type='button'
              aria-label='上一页'
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(previous => Math.max(1, previous - 1))}
              className='inline-flex size-7 items-center justify-center rounded-md text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40'>
              ‹
            </button>
            <button
              type='button'
              aria-label='下一页'
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(previous => Math.min(totalPages, previous + 1))}
              className='inline-flex size-7 items-center justify-center rounded-md text-base leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40'>
              ›
            </button>
          </div>
        </nav>
      </div>
    </main>
  )
}
