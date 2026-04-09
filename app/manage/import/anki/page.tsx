'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { previewAnkiImport, runAnkiImport } from '@/app/actions/ankiImporter'
import { useDialog } from '@/context/DialogContext'

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
  groupName?: string
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

export default function ManageAnkiImportPage() {
  const dialog = useDialog()
  const tsvRef = useRef<HTMLInputElement | null>(null)
  const audioRef = useRef<HTMLInputElement | null>(null)
  const [isAudioDragging, setIsAudioDragging] = useState(false)
  const [pickedAudioNames, setPickedAudioNames] = useState<string[]>([])
  const [audioFolder, setAudioFolder] = useState('imports/anki')
  const [sourceLabel, setSourceLabel] = useState('Anki导入')
  const [groupName, setGroupName] = useState('Anki导入')
  const [globalTags, setGlobalTags] = useState('书籍:N2核心, 单元:Unit01')
  const [notebookName, setNotebookName] = useState('')
  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [summary, setSummary] = useState<{
    totalRows: number
    created: number
    updated: number
    linkedSentences: number
    uploadedAudios: number
    sourceName?: string
    notebookName?: string
    groupName?: string
    globalTags?: string
  } | null>(null)
  const [isPreviewPending, startPreviewTransition] = useTransition()
  const [isImportPending, startImportTransition] = useTransition()

  const buildFormDataForPreview = () => {
    const file = tsvRef.current?.files?.[0]
    if (!file) return null
    const formData = new FormData()
    formData.set('tsvFile', file)
    formData.set('audioFolder', audioFolder)
    formData.set('sourceLabel', sourceLabel.trim())
    formData.set('groupName', groupName.trim())
    formData.set('globalTags', globalTags.trim())
    formData.set('notebookName', notebookName.trim())
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
      formData.set('sourceLabel', sourceLabel.trim())
      formData.set('groupName', groupName.trim())
      formData.set('globalTags', globalTags.trim())
      formData.set('notebookName', notebookName.trim())
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
  }

  return (
    <main className='min-h-screen bg-gray-50 px-4 py-6 md:px-6 md:py-8'>
      <div className='mx-auto max-w-6xl'>
        <section className='border-b border-gray-200 pb-5'>
          <Link
            href='/manage'
            className='mb-2 inline-flex items-center text-sm font-semibold text-indigo-600 hover:text-indigo-700'>
            返回管理中心
          </Link>
          <h1 className='text-3xl font-black text-gray-900'>Anki 导入器</h1>
          <p className='mt-2 text-sm text-gray-500'>
            先识别 TXT/TSV，再批量上传音频并自动匹配。支持字段：单词、单词注音、单词释义、例句、例句翻译、用法、单词发音、句子发音。
          </p>
        </section>

        <section className='mt-4 border-b border-gray-200 bg-white px-4 py-4'>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            <label className='flex flex-col gap-2 text-sm font-semibold text-gray-700'>
              Anki TSV 文件
              <input ref={tsvRef} type='file' accept='.txt,.tsv,text/plain' className='ui-btn ui-btn-sm h-10 justify-start' />
            </label>
            <label className='flex flex-col gap-2 text-sm font-semibold text-gray-700'>
              批量音频文件（可拖拽/多选）
              <input
                ref={audioRef}
                type='file'
                multiple
                accept='audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm'
                onChange={event => {
                  const list = Array.from(event.currentTarget.files || [])
                  setPickedAudioNames(list.map(file => file.name))
                }}
                className='hidden'
              />
              <div
                onDragOver={handleAudioDragOver}
                onDragLeave={handleAudioDragLeave}
                onDrop={handleAudioDrop}
                className={`border px-3 py-3 transition ${
                  isAudioDragging ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-gray-50'
                }`}>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <button type='button' onClick={handleAudioPick} className='ui-btn ui-btn-sm'>
                    选择音频文件
                  </button>
                  <span className='text-xs text-gray-500'>
                    {pickedAudioNames.length > 0
                      ? `已选择 ${pickedAudioNames.length} 个音频`
                      : isAudioDragging
                        ? '松开即可批量上传音频'
                        : '可直接把多个音频拖进此区域'}
                  </span>
                </div>
                {pickedAudioNames.length > 0 && (
                  <div className='mt-2 max-h-24 overflow-y-auto border border-gray-100 bg-white px-2 py-1.5 text-xs text-gray-600'>
                    {pickedAudioNames.slice(0, 10).map((name, index) => (
                      <div key={`anki-audio-picked-${name}-${index}`} className='truncate'>
                        {name}
                      </div>
                    ))}
                    {pickedAudioNames.length > 10 && (
                      <div className='mt-1 text-[11px] text-gray-400'>还有 {pickedAudioNames.length - 10} 个文件...</div>
                    )}
                  </div>
                )}
              </div>
            </label>
          </div>
          <label className='mt-3 flex flex-col gap-2 text-sm font-semibold text-gray-700'>
            音频保存目录（相对 /public/audios）
            <input
              value={audioFolder}
              onChange={event => setAudioFolder(event.currentTarget.value)}
              className='h-10 border border-gray-200 bg-white px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
              placeholder='imports/anki'
            />
          </label>
          <div className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-2'>
            <label className='flex flex-col gap-2 text-sm font-semibold text-gray-700'>
              批量来源名称（整批统一）
              <input
                value={sourceLabel}
                onChange={event => setSourceLabel(event.currentTarget.value)}
                className='h-10 border border-gray-200 bg-white px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
                placeholder='例如：Anki·N2 Unit01'
              />
            </label>
            <label className='flex flex-col gap-2 text-sm font-semibold text-gray-700'>
              导入分组名称（生词页标签）
              <input
                value={groupName}
                onChange={event => setGroupName(event.currentTarget.value)}
                className='h-10 border border-gray-200 bg-white px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
                placeholder='例如：Anki导入 / N2导入'
              />
            </label>
            <label className='flex flex-col gap-2 text-sm font-semibold text-gray-700'>
              全局标签（逗号/分号分隔）
              <input
                value={globalTags}
                onChange={event => setGlobalTags(event.currentTarget.value)}
                className='h-10 border border-gray-200 bg-white px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
                placeholder='例如：书籍:N2核心, 单元:Unit01, 主题:词汇'
              />
            </label>
            <label className='flex flex-col gap-2 text-sm font-semibold text-gray-700'>
              笔记本路径（可多级）
              <input
                value={notebookName}
                onChange={event => setNotebookName(event.currentTarget.value)}
                className='h-10 border border-gray-200 bg-white px-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'
                placeholder='例如：日语/N2/Unit01/名词A'
              />
            </label>
          </div>

          <div className='mt-4 flex flex-wrap items-center gap-2'>
            <button
              type='button'
              onClick={handlePreview}
              disabled={isPreviewPending || isImportPending}
              className='ui-btn ui-btn-sm'>
              {isPreviewPending ? '识别中...' : '步骤 1：识别文本'}
            </button>
            <button
              type='button'
              onClick={handleImport}
              disabled={!preview || isImportPending || isPreviewPending}
              className='ui-btn ui-btn-sm ui-btn-primary'>
              {isImportPending ? '导入中...' : '步骤 2：上传音频并导入'}
            </button>
          </div>
        </section>

        {preview && (
          <section className='mt-4 border-b border-gray-200 bg-white px-4 py-4'>
            <h2 className='text-base font-bold text-gray-900'>导入前预览</h2>
            <div className='mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 md:grid-cols-4'>
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
              <Info label='目标笔记本' value={preview.notebookName || notebookName || '未设置'} />
              <Info label='导入分组' value={preview.groupName || groupName || '未设置'} />
              <Info label='全局标签' value={preview.globalTags || globalTags || '未设置'} />
            </div>

            <div className='mt-3 overflow-x-auto'>
              <table className='min-w-full text-left text-sm'>
                <thead className='text-xs text-gray-500'>
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
                    <tr key={`anki-preview-${row.rowNo}-${row.word}-${index}`} className='border-t border-gray-100 align-top'>
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
          <section className='mt-4 border-b border-emerald-200 bg-emerald-50 px-4 py-4'>
            <h2 className='text-base font-bold text-emerald-800'>导入完成</h2>
            <div className='mt-2 grid grid-cols-2 gap-2 text-xs text-emerald-700 md:grid-cols-5'>
              <Info label='导入行数' value={String(summary.totalRows)} />
              <Info label='新建词' value={String(summary.created)} />
              <Info label='更新词' value={String(summary.updated)} />
              <Info label='关联例句' value={String(summary.linkedSentences)} />
              <Info label='上传音频' value={String(summary.uploadedAudios)} />
            </div>
            <div className='mt-2 text-xs text-emerald-700'>
              来源：{summary.sourceName || sourceLabel || 'Anki导入'} ｜ 笔记本：
              {summary.notebookName || notebookName || '未设置'} ｜ 分组：
              {summary.groupName || groupName || '未设置'} ｜ 标签：
              {summary.globalTags || globalTags || '未设置'}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className='border-b border-gray-100 pb-2'>
      <p className='text-[11px] text-gray-500'>{label}</p>
      <p className='mt-1 font-bold text-gray-900'>{value}</p>
    </div>
  )
}
