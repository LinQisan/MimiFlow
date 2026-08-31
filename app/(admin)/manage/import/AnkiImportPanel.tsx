'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  previewAnkiImport,
  runAnkiImport,
  syncWordbookSources,
} from '@/features/import/anki-actions'
import { listSelectableWordbooks } from '@/modules/knowledge/wordbooks/actions'
import { useDialog } from '@/context/DialogContext'
import CustomSelect from '@/components/ui/CustomSelect'

type PreviewPayload = {
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

export default function AnkiImportPanel() {
  const dialog = useDialog()
  const tsvRef = useRef<HTMLInputElement | null>(null)
  const audioRef = useRef<HTMLInputElement | null>(null)
  const [pickedTsvName, setPickedTsvName] = useState('')
  const [isAudioDragging, setIsAudioDragging] = useState(false)
  const [pickedAudioNames, setPickedAudioNames] = useState<string[]>([])
  const [audioFolder, setAudioFolder] = useState('vocabulary/anki')
  const [globalTags, setGlobalTags] = useState('')
  const [notebookName, setNotebookName] = useState('')
  const [wordbookId, setWordbookId] = useState('')
  const [wordbookOptions, setWordbookOptions] = useState<
    Array<WordbookOption & { pathLabel: string }>
  >([])
  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [summary, setSummary] = useState<{
    totalRows: number
    created: number
    updated: number
    linkedSentences: number
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

  useEffect(() => {
    void (async () => {
      const rows = (await listSelectableWordbooks()) as WordbookOption[]
      setWordbookOptions(
        rows.map(item => ({
          ...item,
          pathLabel: `${item.seriesTitle} / ${item.title}`,
        })),
      )
    })()
  }, [])

  const selectedWordbookPathLabel = useMemo(
    () => wordbookOptions.find(item => item.id === wordbookId)?.pathLabel || '',
    [wordbookId, wordbookOptions],
  )

  const selectedWordbookTitle = useMemo(
    () => wordbookOptions.find(item => item.id === wordbookId)?.title || '',
    [wordbookId, wordbookOptions],
  )

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
    const file = tsvRef.current?.files?.[0]
    if (!file) return null
    const formData = new FormData()
    formData.set('tsvFile', file)
    formData.set('audioFolder', audioFolder)
    formData.set('globalTags', globalTags.trim())
    formData.set('notebookName', notebookName.trim())
    formData.set('wordbookId', wordbookId)
    formData.set('wordbookTitle', selectedWordbookTitle)
    const audioFiles = audioRef.current?.files || []
    Array.from(audioFiles).forEach(item => formData.append('audioFiles', item))
    return formData
  }

  const handlePreview = () => {
    startPreviewTransition(async () => {
      const formData = buildFormDataForPreview()
      if (!formData) {
        dialog.toast('请先选择 Anki TSV 文件。', { tone: 'error' })
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
      formData.set('audioFolder', audioFolder)
      formData.set('globalTags', globalTags.trim())
      formData.set('notebookName', notebookName.trim())
      formData.set('wordbookId', wordbookId)
      const audioFiles = audioRef.current?.files || []
      Array.from(audioFiles).forEach(item => formData.append('audioFiles', item))

      const result = await runAnkiImport(formData)
      if (!result.success) {
        dialog.toast(result.message || '导入失败', { tone: 'error' })
        return
      }
      if (!result.summary) {
        dialog.toast('导入完成，但未返回统计信息。', { tone: 'info' })
        return
      }
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
        <p className='max-w-3xl text-sm leading-6 text-slate-500'>
          支持单词、注音、释义、例句、例句翻译、用法、单词发音和句子发音。音频文件可选；文件名会与 TSV 中的音频引用自动匹配。
        </p>

        <section className='mt-8 border-b border-slate-200 pb-8' aria-labelledby='anki-files-heading'>
          <div className='mb-5 flex items-baseline gap-3'>
            <span className='text-xs font-bold tracking-[0.16em] text-slate-400'>01</span>
            <h2 id='anki-files-heading' className='text-xl font-semibold text-slate-950'>选择文件</h2>
          </div>
          <div className='grid grid-cols-1 gap-5 md:grid-cols-2'>
            <div>
              <span className='block text-sm font-semibold text-slate-700'>Anki TXT / TSV</span>
              <input
                ref={tsvRef}
                type='file'
                accept='.txt,.tsv,text/plain,text/tab-separated-values'
                aria-label='选择 Anki TXT 或 TSV 文件'
                onChange={event => {
                  setPickedTsvName(event.currentTarget.files?.[0]?.name || '')
                  invalidatePreview()
                }}
                className='hidden'
              />
              <div className='mt-2 flex min-h-20 items-center justify-between gap-3 border border-slate-300 bg-white px-4 py-3'>
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium text-slate-800'>{pickedTsvName || '尚未选择文件'}</p>
                  <p className='mt-1 text-xs text-slate-500'>支持 .txt 和 .tsv</p>
                </div>
                <button type='button' onClick={() => tsvRef.current?.click()} className='ui-btn ui-btn-sm shrink-0'>
                  {pickedTsvName ? '重新选择' : '选择文件'}
                </button>
              </div>
            </div>
            <div>
              <span className='block text-sm font-semibold text-slate-700'>批量音频（可选）</span>
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
                className={`mt-2 min-h-20 border px-4 py-3 transition-colors ${
                  isAudioDragging ? 'border-indigo-300 bg-indigo-50' : 'border-slate-300 bg-white'
                }`}>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <button type='button' onClick={handleAudioPick} className='ui-btn ui-btn-sm'>
                    选择音频文件
                  </button>
                  <span className='text-xs text-slate-500'>
                    {pickedAudioNames.length > 0
                      ? `已选择 ${pickedAudioNames.length} 个音频`
                      : isAudioDragging
                        ? '松开即可批量上传音频'
                        : '可直接把多个音频拖进此区域'}
                  </span>
                </div>
                {pickedAudioNames.length > 0 && (
                  <div className='mt-3 max-h-24 overflow-y-auto border-t border-slate-200 pt-2 text-xs text-slate-600'>
                    {pickedAudioNames.slice(0, 10).map((name, index) => (
                      <div key={`anki-audio-picked-${name}-${index}`} className='truncate'>
                        {name}
                      </div>
                    ))}
                    {pickedAudioNames.length > 10 && (
                      <div className='mt-1 text-[11px] text-slate-400'>还有 {pickedAudioNames.length - 10} 个文件…</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className='mt-8 border-b border-slate-200 pb-8' aria-labelledby='anki-target-heading'>
          <div className='mb-5 flex items-baseline gap-3'>
            <span className='text-xs font-bold tracking-[0.16em] text-slate-400'>02</span>
            <h2 id='anki-target-heading' className='text-xl font-semibold text-slate-950'>设置目标</h2>
          </div>
          <div className='grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2'>
            <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
              音频保存目录
              <input
                value={audioFolder}
                onChange={event => {
                  setAudioFolder(event.currentTarget.value)
                  invalidatePreview()
                }}
                className='ui-input !h-10 text-sm'
                placeholder='vocabulary/anki'
              />
              <span className='text-xs font-normal text-slate-500'>相对于 /public/audios</span>
            </label>
            <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
              全局标签（逗号/分号分隔）
              <input
                value={globalTags}
                onChange={event => {
                  setGlobalTags(event.currentTarget.value)
                  invalidatePreview()
                }}
                className='ui-input !h-10 text-sm'
                placeholder='例如：书籍:N2核心, 单元:Unit01, 主题:词汇'
              />
            </label>
            <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
              现有目标单词书（推荐）
              <CustomSelect
                value={wordbookId}
                onChange={event => {
                  const value = event.currentTarget.value
                  setWordbookId(value)
                  if (value) setNotebookName('')
                  invalidatePreview()
                }}
                className='ui-input !h-10 text-left text-sm'>
                <option value=''>不选择，按路径新建</option>
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
            <label className='flex flex-col gap-2 text-sm font-semibold text-slate-700'>
              新建词书路径（系列 / 词书）
              <input
                value={notebookName}
                onChange={event => {
                  setNotebookName(event.currentTarget.value)
                  invalidatePreview()
                }}
                disabled={!!wordbookId}
                className='ui-input !h-10 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'
                placeholder='例如：红宝书/N1'
              />
            </label>
          </div>
          <p className='mt-4 text-xs leading-5 text-slate-500'>
            选择现有词书后不会创建新路径；新建时固定使用“系列 / 词书”两级结构。
          </p>
        </section>

        <section className='mt-8 border-b border-slate-200 pb-8' aria-labelledby='anki-confirm-heading'>
          <div className='mb-5 flex items-baseline gap-3'>
            <span className='text-xs font-bold tracking-[0.16em] text-slate-400'>03</span>
            <h2 id='anki-confirm-heading' className='text-xl font-semibold text-slate-950'>预览并导入</h2>
          </div>
          <p className='mb-4 text-sm leading-6 text-slate-500'>先生成预览。修改任一文件或设置后，需要重新预览才能导入。</p>
          <div className='flex flex-wrap items-center gap-2'>
            <button
              type='button'
              onClick={handlePreview}
              disabled={isPreviewPending || isImportPending}
              className={`ui-btn disabled:cursor-not-allowed disabled:opacity-40 ${preview ? '' : 'ui-btn-primary'}`}>
              {isPreviewPending ? '识别中…' : preview ? '重新生成预览' : '生成导入预览'}
            </button>
            <button
              type='button'
              onClick={handleImport}
              disabled={!preview || isImportPending || isPreviewPending}
              className='ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-40'>
              {isImportPending ? '导入中…' : '确认并导入'}
            </button>
            <button
              type='button'
              onClick={handleSyncSources}
              disabled={isSyncPending || isImportPending || isPreviewPending}
              className='ui-btn ml-0 disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto'>
              {isSyncPending ? '同步中…' : '维护：同步已有来源'}
            </button>
          </div>
        </section>

        {preview && (
          <section className='mt-8 border-y border-slate-200 bg-white px-4 py-6 md:px-5' aria-labelledby='anki-preview-heading'>
            <h2 id='anki-preview-heading' className='text-xl font-semibold text-slate-950'>导入前预览</h2>
            <div className='mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-slate-600 md:grid-cols-4'>
              <Info label='总行数' value={String(preview.totalRows)} />
              <Info label='有效行' value={String(preview.validRows)} />
              <Info label='将新建词' value={String(preview.createWords)} />
              <Info label='将更新词' value={String(preview.updateWords)} />
              <Info label='带单词发音' value={String(preview.rowsWithWordAudioRef)} />
              <Info label='单词发音匹配' value={String(preview.matchedWordAudioRows)} />
              <Info label='带音频引用' value={String(preview.rowsWithAudioRef)} />
              <Info label='音频已匹配' value={String(preview.matchedAudioRows)} />
              <Info label='上传音频数' value={String(preview.uploadedAudioFiles)} />
              <Info label='跳过行' value={String(preview.skippedRows)} />
              <Info
                label='目标单词书'
                value={
                  preview.wordbookTitle ||
                  selectedWordbookPathLabel ||
                  preview.notebookName ||
                  notebookName ||
                  '未设置'
                }
              />
              <Info label='全局标签' value={preview.globalTags || globalTags || '未设置'} />
            </div>

            <div className='mt-6 overflow-x-auto border-t border-slate-200'>
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
                      <td className='px-2 py-2 font-semibold text-gray-900'>{row.word || '-'}</td>
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
              <Info label='上传音频' value={String(summary.uploadedAudios)} />
            </div>
            <div className='mt-4 text-xs leading-5 text-emerald-700'>
              来源：{summary.sourceName || selectedWordbookTitle || notebookName || 'Anki导入'} ｜ 笔记本：
              {summary.notebookName || selectedWordbookPathLabel || notebookName || '未设置'} ｜ 标签：
              {summary.globalTags || globalTags || '未设置'}
            </div>
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
