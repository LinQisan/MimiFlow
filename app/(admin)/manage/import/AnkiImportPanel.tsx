'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  previewAnkiImport,
  runAnkiImport,
  syncWordbookSources,
} from '@/features/import/anki-actions'
import {
  listSelectableWordbooks,
  listSelectableWordbookSeries,
} from '@/modules/knowledge/wordbooks/actions'
import { useDialog } from '@/context/DialogContext'
import CustomSelect from '@/components/ui/CustomSelect'
import { JLPT_LEVELS } from '@/modules/knowledge/vocabulary/domain/jlpt'
import { buildVocabularyAudioFolder } from '@/utils/vocabulary/audioFolder'
import AnkiFileDropZone from './AnkiFileDropZone'

type PreviewPayload = {
  fileKind: 'apkg' | 'tsv'
  deckNames: string[]
  embeddedAudioFiles: number
  totalRows: number
  validRows: number
  skippedRows: number
  createWords: number
  updateWords: number
  rowsWithAudioRef: number
  rowsWithWordAudioRef: number
  matchedAudioRows: number
  matchedWordAudioRows: number
  uploadedAudioFiles: number
  notebookName?: string
  wordbookId?: string
  wordbookTitle?: string
  sourceName?: string
  globalTags?: string
  rowsJson: string
  sampleRows: {
    etymologies?: string[]
    rowNo: number
    word: string
    wordAudioName: string
    sentence: string
    sentenceTranslation: string
    sentenceAudioName: string
    tags?: string[]
    status: 'valid' | 'skipped'
    reason?: string
  }[]
}

type WordbookOption = {
  id: string
  title: string
  seriesId: string
  seriesTitle: string
}

type WordbookSeriesOption = {
  id: string
  title: string
}

export default function AnkiImportPanel() {
  const dialog = useDialog()
  const audioRef = useRef<HTMLInputElement | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isAudioDragging, setIsAudioDragging] = useState(false)
  const [pickedAudioNames, setPickedAudioNames] = useState<string[]>([])
  const [globalTags, setGlobalTags] = useState('')
  const [jlpt, setJlpt] = useState('')
  const [partsOfSpeech, setPartsOfSpeech] = useState('')
  const [targetMode, setTargetMode] = useState<'new' | 'existing'>('new')
  const [wordbookId, setWordbookId] = useState('')
  const [seriesId, setSeriesId] = useState('')
  const [newSeriesTitle, setNewSeriesTitle] = useState('')
  const [newWordbookTitle, setNewWordbookTitle] = useState('')
  const [seriesOptions, setSeriesOptions] = useState<WordbookSeriesOption[]>([])
  const [wordbookOptions, setWordbookOptions] = useState<
    Array<WordbookOption & { pathLabel: string }>
  >([])
  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [summary, setSummary] = useState<{
    totalRows: number
    created: number
    updated: number
    linkedSentences: number
    reusedAudios?: number
    addedReadingAudios?: number
    uploadedAudios: number
    sourceName?: string
    notebookName?: string
    globalTags?: string
  } | null>(null)
  const [isPreviewPending, startPreviewTransition] = useTransition()
  const [isImportPending, startImportTransition] = useTransition()
  const [isSyncPending, startSyncTransition] = useTransition()

  const invalidatePreview = () => {
    setPreview(null)
    setSummary(null)
  }

  const refreshTargets = useCallback(async () => {
    try {
      const [rows, series] = await Promise.all([
        listSelectableWordbooks() as Promise<WordbookOption[]>,
        listSelectableWordbookSeries() as Promise<WordbookSeriesOption[]>,
      ])
      setWordbookOptions(rows.map(item => ({ ...item, pathLabel: `${item.seriesTitle} / ${item.title}` })))
      setSeriesOptions(series)
      setWordbookId(current => rows.some(item => item.id === current) ? current : '')
      setSeriesId(current => series.some(item => item.id === current) ? current : '')
    } catch {
      setWordbookOptions([])
      setSeriesOptions([])
      setPreview(null)
      dialog.toast('词表列表加载失败，请重新打开导入页面。', { tone: 'error' })
    }
  }, [dialog])

  useEffect(() => {
    void refreshTargets()
    const refresh = () => { setPreview(null); void refreshTargets() }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [refreshTargets])

  const selectedWordbookPathLabel = useMemo(
    () => wordbookOptions.find(item => item.id === wordbookId)?.pathLabel || '',
    [wordbookId, wordbookOptions],
  )

  const selectedWordbookTitle = useMemo(
    () => wordbookOptions.find(item => item.id === wordbookId)?.title || '',
    [wordbookId, wordbookOptions],
  )

  const selectedWordbookSeriesTitle = useMemo(
    () =>
      wordbookOptions.find(item => item.id === wordbookId)?.seriesTitle || '',
    [wordbookId, wordbookOptions],
  )

  const selectedSeriesTitle = useMemo(
    () => seriesOptions.find(item => item.id === seriesId)?.title || '',
    [seriesId, seriesOptions],
  )

  const notebookName = useMemo(() => {
    if (targetMode === 'existing') return ''
    const seriesTitle = selectedSeriesTitle || newSeriesTitle.trim()
    const wordbookTitle = newWordbookTitle.trim()
    return seriesTitle && wordbookTitle ? `${seriesTitle}/${wordbookTitle}` : ''
  }, [newSeriesTitle, newWordbookTitle, selectedSeriesTitle, targetMode])

  const audioFolder = useMemo(() => {
    const seriesTitle =
      targetMode === 'existing'
        ? selectedWordbookSeriesTitle
        : selectedSeriesTitle || newSeriesTitle.trim()
    const wordbookTitle =
      targetMode === 'existing'
        ? selectedWordbookTitle
        : newWordbookTitle.trim()
    return buildVocabularyAudioFolder(seriesTitle, wordbookTitle)
  }, [
    newSeriesTitle,
    newWordbookTitle,
    selectedSeriesTitle,
    selectedWordbookSeriesTitle,
    selectedWordbookTitle,
    targetMode,
  ])

  const wordbooksBySeries = useMemo(() => {
    const groups = new Map<string, { title: string; options: typeof wordbookOptions }>()
    wordbookOptions.forEach(option => {
      const group = groups.get(option.seriesId) || {
        title: option.seriesTitle,
        options: [],
      }
      group.options.push(option)
      groups.set(option.seriesId, group)
    })
    return [...groups.values()]
  }, [wordbookOptions])

  const buildFormDataForPreview = () => {
    if (!importFile) return null
    const formData = new FormData()
    formData.set('ankiFile', importFile)
    formData.set('globalTags', globalTags.trim())
    formData.set('jlpt', jlpt)
    formData.set('partsOfSpeech', partsOfSpeech.trim())
    formData.set('notebookName', notebookName.trim())
    formData.set('wordbookId', targetMode === 'existing' ? wordbookId : '')
    formData.set('seriesId', targetMode === 'new' ? seriesId : '')
    formData.set('seriesTitle', targetMode === 'new' ? newSeriesTitle.trim() : '')
    formData.set(
      'wordbookTitle',
      targetMode === 'existing' ? selectedWordbookTitle : newWordbookTitle.trim(),
    )
    const audioFiles = audioRef.current?.files || []
    Array.from(audioFiles).forEach(item => formData.append('audioFiles', item))
    return formData
  }

  const handlePreview = () => {
    startPreviewTransition(async () => {
      if (targetMode === 'existing' && !wordbookId) {
        dialog.toast('请选择要导入到的词表。', { tone: 'error' })
        return
      }
      const formData = buildFormDataForPreview()
      if (!formData) {
        dialog.toast('请先选择 Anki APKG、TXT 或 TSV 文件。', {
          tone: 'error',
        })
        return
      }
      const result = await previewAnkiImport(formData)
      if (!result.success) {
        dialog.toast(result.message || '预览失败', { tone: 'error' })
        setPreview(null)
        return
      }
      if (!result.preview) {
        dialog.toast('预览结果为空', { tone: 'error' })
        setPreview(null)
        return
      }
      if (targetMode === 'new' && result.preview.notebookName) {
        const [suggestedSeriesTitle, suggestedWordbookTitle] = result.preview.notebookName
          .split(/[\\/]/)
          .map(item => item.trim())
          .filter(Boolean)
        if (suggestedSeriesTitle && suggestedWordbookTitle) {
          if (!seriesId && !newSeriesTitle.trim()) {
            const existingSeries = seriesOptions.find(
              item => item.title === suggestedSeriesTitle,
            )
            setSeriesId(existingSeries?.id || '')
            setNewSeriesTitle(existingSeries ? '' : suggestedSeriesTitle)
          }
          if (!newWordbookTitle.trim()) setNewWordbookTitle(suggestedWordbookTitle)
        }
      }
      setPreview(result.preview)
      setSummary(null)
      dialog.toast('预览已生成，请确认后再导入。', { tone: 'success' })
    })
  }

  const handleImport = () => {
    startImportTransition(async () => {
      if (!preview) {
        dialog.toast('请先执行预览。', { tone: 'error' })
        return
      }
      const formData = new FormData()
      formData.set('rowsJson', preview.rowsJson)
      formData.set('globalTags', globalTags.trim())
      formData.set('jlpt', jlpt)
      formData.set('partsOfSpeech', partsOfSpeech.trim())
      formData.set('notebookName', notebookName.trim())
      formData.set('wordbookId', targetMode === 'existing' ? wordbookId : '')
      formData.set('seriesId', targetMode === 'new' ? seriesId : '')
      formData.set('seriesTitle', targetMode === 'new' ? newSeriesTitle.trim() : '')
      formData.set('wordbookTitle', targetMode === 'new' ? newWordbookTitle.trim() : '')
      if (importFile) formData.set('ankiFile', importFile)
      const audioFiles = audioRef.current?.files || []
      Array.from(audioFiles).forEach(item => formData.append('audioFiles', item))

      let result
      try {
        result = await runAnkiImport(formData)
      } catch {
        dialog.toast('导入请求失败，请重新预览后重试。', { tone: 'error' })
        await refreshTargets()
        return
      }
      if (!result.success) {
        dialog.toast(result.message || '导入失败', { tone: 'error' })
        return
      }
      if (!result.summary) {
        dialog.toast('导入完成，但未返回统计信息。', { tone: 'info' })
        return
      }
      await refreshTargets()
      setPreview(null)
      setSummary(result.summary)
      dialog.toast('Anki 数据导入成功。', { tone: 'success' })
    })
  }

  const handleSyncSources = () => {
    startSyncTransition(async () => {
      const result = await syncWordbookSources()
      if (!result.success) {
        dialog.toast('同步来源失败', { tone: 'error' })
        return
      }
      dialog.toast(`已同步 ${result.updatedCount} 条来源`, { tone: 'success' })
    })
  }

  const isSupportedAudioFile = (file: File) =>
    /(\.mp3|\.m4a|\.wav|\.ogg|\.aac|\.flac|\.webm)$/i.test(file.name) ||
    file.type.startsWith('audio/')

  const handleAudioPick = () => audioRef.current?.click()

  const handleAudioDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAudioDragging(true)
  }

  const handleAudioDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAudioDragging(false)
  }

  const handleAudioDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAudioDragging(false)
    const list = Array.from(e.dataTransfer.files || []).filter(isSupportedAudioFile)
    if (list.length === 0) {
      dialog.toast('仅支持音频文件（mp3/m4a/wav/ogg/aac/flac/webm）。', { tone: 'error' })
      return
    }
    const dt = new DataTransfer()
    list.forEach(file => dt.items.add(file))
    if (audioRef.current) audioRef.current.files = dt.files
    setPickedAudioNames(list.map(file => file.name))
    invalidatePreview()
  }

  return (
    <section className='w-full' aria-label='Anki 导入设置'>
      <div className='mx-auto max-w-6xl'>
        <section className='border-b border-slate-200 pb-8' aria-labelledby='anki-files-heading'>
          <h2 id='anki-files-heading' className='text-lg font-semibold text-slate-950'>文件</h2>
          <div className='mt-4'>
            <AnkiFileDropZone
              file={importFile}
              onChange={file => {
                setImportFile(file)
                invalidatePreview()
              }}
            />
          </div>

          <div className='mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 md:flex-row md:items-center md:justify-between'>
            <div>
              <p className='text-sm font-semibold text-slate-700'>附加音频</p>
              <p className='mt-0.5 text-xs text-slate-500'>TXT / TSV 可选</p>
            </div>
              <input
                ref={audioRef}
                type='file'
                multiple
                accept='audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm'
                onChange={event => {
                  const list = Array.from(event.currentTarget.files || [])
                  setPickedAudioNames(list.map(file => file.name))
                  invalidatePreview()
                }}
                className='hidden'
              />
              <div
                onDragOver={handleAudioDragOver}
                onDragLeave={handleAudioDragLeave}
                onDrop={handleAudioDrop}
                className={`flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 border px-3 py-2 transition-colors md:max-w-2xl ${
                  isAudioDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-white'
                }`}>
                <span className='min-w-0 truncate text-xs text-slate-500'>
                  {pickedAudioNames.length > 0
                    ? `${pickedAudioNames.length} 个音频文件`
                    : isAudioDragging
                      ? '松开即可添加'
                      : '拖入或选择音频'}
                </span>
                <button type='button' onClick={handleAudioPick} className='ui-btn ui-btn-sm shrink-0'>选择</button>
              </div>
          </div>
        </section>

        <section className='mt-8 border-b border-slate-200 pb-8' aria-labelledby='anki-target-heading'>
          <h2 id='anki-target-heading' className='text-lg font-semibold text-slate-950'>保存到</h2>
          <div className='mt-4 grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2'>
            <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
              保存方式
              <CustomSelect
                value={targetMode}
                onChange={event => {
                  setTargetMode(event.currentTarget.value as 'new' | 'existing')
                  invalidatePreview()
                }}
                className='ui-input !h-10 text-left text-sm'>
                <option value='new'>新建词表</option>
                <option value='existing'>导入到已有词表</option>
              </CustomSelect>
            </label>

            {targetMode === 'existing' ? (
              <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
                已有词表
                <CustomSelect
                  value={wordbookId}
                  onChange={event => {
                    setWordbookId(event.currentTarget.value)
                    invalidatePreview()
                  }}
                  className='ui-input !h-10 text-left text-sm'>
                  <option value=''>请选择词表</option>
                  {wordbooksBySeries.map(group => (
                    <optgroup key={group.title} label={group.title}>
                      {group.options.map(option => (
                        <option key={`anki-wordbook-${option.id}`} value={option.id}>
                          {option.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </CustomSelect>
              </label>
            ) : (
              <>
                <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
                  所在分组
                  <CustomSelect
                    value={seriesId}
                    onChange={event => {
                      setSeriesId(event.currentTarget.value)
                      invalidatePreview()
                    }}
                    className='ui-input !h-10 text-left text-sm'>
                    <option value=''>新建分组</option>
                    {seriesOptions.map(series => (
                      <option key={`anki-series-${series.id}`} value={series.id}>
                        {series.title}
                      </option>
                    ))}
                  </CustomSelect>
                </label>
                {!seriesId && (
                  <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
                    分组名称
                    <input
                      value={newSeriesTitle}
                      onChange={event => {
                        setNewSeriesTitle(event.currentTarget.value)
                        invalidatePreview()
                      }}
                      className='ui-input !h-10 text-sm'
                      placeholder='N2語彙トレーニング'
                    />
                  </label>
                )}
                <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
                  词表名称
                  <input
                    value={newWordbookTitle}
                    onChange={event => {
                      setNewWordbookTitle(event.currentTarget.value)
                      invalidatePreview()
                    }}
                    className='ui-input !h-10 text-sm'
                    placeholder='Unit02 动词A'
                  />
                </label>
              </>
            )}

            <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
              统一词性（可选）
              <input
                value={partsOfSpeech}
                onChange={event => {
                  setPartsOfSpeech(event.currentTarget.value)
                  invalidatePreview()
                }}
                className='ui-input !h-10 text-sm'
                placeholder='動詞'
              />
            </label>
            <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
              JLPT（当前词表）
              <CustomSelect
                value={jlpt}
                onChange={event => {
                  setJlpt(event.currentTarget.value)
                  invalidatePreview()
                }}
                className='ui-input !h-10 text-left text-sm'>
                <option value=''>未设置（可按词书名称推断）</option>
                {JLPT_LEVELS.map(level => (
                  <option key={`anki-jlpt-${level}`} value={level}>{level}</option>
                ))}
              </CustomSelect>
            </label>
            <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
              标签
              <input
                value={globalTags}
                onChange={event => {
                  setGlobalTags(event.currentTarget.value)
                  invalidatePreview()
                }}
                className='ui-input !h-10 text-sm'
                placeholder='重点, 易混'
              />
            </label>
            <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
              音频目录（按词表自动管理）
              <input
                value={audioFolder}
                readOnly
                className='ui-input !h-10 bg-slate-50 text-sm text-slate-500'
                placeholder='选择词书分组和词表后自动生成'
              />
            </label>
          </div>
        </section>

        <section className='mt-8 border-b border-slate-200 pb-8' aria-labelledby='anki-confirm-heading'>
          <h2 id='anki-confirm-heading' className='text-lg font-semibold text-slate-950'>确认</h2>
          <div className='mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center'>
            <button
              type='button'
              onClick={handlePreview}
              disabled={isPreviewPending || isImportPending}
              className={`ui-btn w-full disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto ${preview ? '' : 'ui-btn-primary'}`}>
              {isPreviewPending ? '识别中…' : preview ? '重新预览' : '生成预览'}
            </button>
            <button
              type='button'
              onClick={handleImport}
              disabled={!preview || isImportPending || isPreviewPending}
              className='ui-btn ui-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto'>
              {isImportPending ? '导入中…' : '导入'}
            </button>
            <button
              type='button'
              onClick={handleSyncSources}
              disabled={isSyncPending || isImportPending || isPreviewPending}
              className='ui-btn ui-btn-sm w-full disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto sm:w-auto'>
              {isSyncPending ? '同步中…' : '同步已有来源'}
            </button>
          </div>
        </section>

        {preview && (
          <section className='mt-8 border-y border-slate-200 bg-white px-4 py-6 md:px-5' aria-labelledby='anki-preview-heading'>
            <div className='flex flex-wrap items-baseline justify-between gap-2'>
              <h2 id='anki-preview-heading' className='text-xl font-semibold text-slate-950'>导入预览</h2>
              <span className='text-xs font-medium text-slate-500'>
                {preview.fileKind.toUpperCase()}
                {preview.embeddedAudioFiles > 0 ? ` · ${preview.embeddedAudioFiles} 个内置音频` : ''}
              </span>
            </div>
            <div className='mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-slate-600 md:grid-cols-5'>
              <Info label='可导入' value={String(preview.validRows)} />
              <Info label='新建' value={String(preview.createWords)} />
              <Info label='更新' value={String(preview.updateWords)} />
              <Info label='跳过' value={String(preview.skippedRows)} />
              <Info
                label='音频匹配'
                value={`${preview.matchedWordAudioRows + preview.matchedAudioRows} / ${preview.rowsWithWordAudioRef + preview.rowsWithAudioRef}`}
              />
            </div>
            <div className='mt-5 grid gap-2 border-t border-slate-200 pt-4 text-xs text-slate-600 md:grid-cols-3'>
              <p className='min-w-0 truncate'>
                <span className='text-slate-400'>目标</span>{' '}
                <span className='font-medium text-slate-800'>
                  {targetMode === 'existing'
                    ? selectedWordbookPathLabel || preview.wordbookTitle || '未设置'
                    : notebookName || preview.notebookName || '未设置'}
                </span>
              </p>
              <p className='min-w-0 truncate'>
                <span className='text-slate-400'>词性</span>{' '}
                <span className='font-medium text-slate-800'>{partsOfSpeech || '—'}</span>
              </p>
              <p className='min-w-0 truncate'>
                <span className='text-slate-400'>JLPT</span>{' '}
                <span className='font-medium text-slate-800'>{jlpt || '按词书推断'}</span>
              </p>
              <p className='min-w-0 truncate md:text-right'>
                <span className='text-slate-400'>牌组</span>{' '}
                <span className='font-medium text-slate-800'>
                  {preview.deckNames.length > 0 ? preview.deckNames.join(' / ') : '—'}
                </span>
              </p>
            </div>

            <div className='mt-5 overflow-x-auto border-t border-slate-200'>
              <table className='min-w-full text-left text-sm'>
                <thead className='bg-slate-50 text-xs text-slate-500'>
                  <tr>
                    <th className='px-2 py-2'>行</th>
                    <th className='px-2 py-2'>单词</th>
                    <th className='px-2 py-2'>单词发音</th>
                    <th className='px-2 py-2'>例句</th>
                    <th className='px-2 py-2'>翻译</th>
                    <th className='px-2 py-2'>句子音频</th>
                    <th className='px-2 py-2'>标签</th>
                    <th className='px-2 py-2'>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((row, index) => (
                    <tr key={`anki-preview-${row.rowNo}-${row.word}-${index}`} className='border-t border-slate-100 align-top'>
                      <td className='px-2 py-2 text-xs text-gray-500'>{row.rowNo}</td>
                      <td className='px-2 py-2 font-semibold text-gray-900'>{row.word || '-'}{row.etymologies?.length ? <p className='mt-1 text-xs font-normal text-slate-500'>词源：{row.etymologies.join(' · ')}</p> : null}</td>
                      <td className='px-2 py-2 text-gray-600'>{row.wordAudioName || '-'}</td>
                      <td className='px-2 py-2 text-gray-700'>{row.sentence || '-'}</td>
                      <td className='px-2 py-2 text-gray-600'>{row.sentenceTranslation || '-'}</td>
                      <td className='px-2 py-2 text-gray-600'>{row.sentenceAudioName || '-'}</td>
                      <td className='px-2 py-2 text-gray-600'>
                        {row.tags && row.tags.length > 0 ? row.tags.join(' / ') : '-'}
                      </td>
                      <td className='px-2 py-2 text-xs'>
                        {row.status === 'valid' ? (
                          <span className='ui-tag ui-tag-success'>可导入</span>
                        ) : (
                          <span className='ui-tag ui-tag-warn'>{row.reason || '跳过'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {summary && (
          <section className='mt-8 border-y border-emerald-200 bg-emerald-50 px-4 py-5' aria-live='polite'>
            <h2 className='text-lg font-semibold text-emerald-800'>导入完成</h2>
            <div className='mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-emerald-700 md:grid-cols-5'>
              <Info label='导入行数' value={String(summary.totalRows)} />
              <Info label='新建词' value={String(summary.created)} />
              <Info label='更新词' value={String(summary.updated)} />
              <Info label='关联例句' value={String(summary.linkedSentences)} />
              <Info label='新增音频文件' value={String(summary.uploadedAudios)} />
              <Info label='复用音频文件' value={String(summary.reusedAudios || 0)} />
              <Info label='新增读音音频' value={String(summary.addedReadingAudios || 0)} />
            </div>
            <p className='mt-4 text-xs font-medium text-emerald-700'>
              {targetMode === 'existing'
                ? selectedWordbookPathLabel || summary.notebookName || '未设置'
                : notebookName || summary.notebookName || '未设置'}
            </p>
          </section>
        )}
      </div>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0 border-b border-slate-200 pb-2'>
      <p className='text-[11px] text-slate-500'>{label}</p>
      <p className='mt-1 break-words font-semibold text-slate-900'>{value}</p>
    </div>
  )
}
