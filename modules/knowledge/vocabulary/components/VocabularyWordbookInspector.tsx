'use client'

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type Dispatch, type SetStateAction } from 'react'

import { useDialog } from '@/context/DialogContext'
import WordAudioButton from '@/modules/knowledge/vocabulary/components/WordAudioButton'
import { deleteVocabulary } from '../actions'
import {
  getVocabularyInspectorData,
  updateFullVocabularyFromInspector,
  type VocabularyInspectorData,
} from '../inspector-actions'
import type { VocabularyInspectorEntryDraft } from '../domain/inspector-entry'
import { RELATION_TYPE_OPTIONS } from '../domain/relations'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import VocabularyInspectorEditor, { cloneVocabularyInspectorEntry } from './VocabularyInspectorEditor'

type InspectorData = VocabularyInspectorData & { entry: VocabularyInspectorEntryDraft }

export default function VocabularyWordbookInspector({
  word,
  matchedVariant,
  wordbookId,
  x,
  y,
  onClose,
  onSaved,
  onDeleted,
  embedded = false,
}: {
  embedded?: boolean
  onDeleted?: () => void
  word: string
  matchedVariant?: string
  wordbookId?: string
  x: number
  y: number
  onClose: () => void
  onSaved?: (payload: { word: string; previousWord?: string; meta: VocabularyMeta; membershipsChanged: boolean }) => void
}) {
  const { confirm } = useDialog()
  const [data, setData] = useState<InspectorData | null>(null)
  const [draft, setDraft] = useState<VocabularyInspectorEntryDraft | null>(null)
  const [loadMessage, setLoadMessage] = useState('正在加载单词信息…')
  const [isEditing, setIsEditing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const panelRef = useRef<HTMLElement>(null)
  const [panelSize, setPanelSize] = useState({ width: 396, height: 460 })
  const [viewport, setViewport] = useState(() => ({ width: typeof window === 'undefined' ? 1024 : window.innerWidth, height: typeof window === 'undefined' ? 768 : window.innerHeight }))

  useEffect(() => {
    let active = true
    setData(null)
    setDraft(null)
    setIsEditing(false)
    setLoadMessage('正在加载单词信息…')
    setStatusMessage('')
    void getVocabularyInspectorData(word, wordbookId)
      .then(result => {
        if (!active) return
        if (!result.success) { setLoadMessage(result.message); return }
        const next = result.data as InspectorData
        setData(next)
        setDraft(cloneVocabularyInspectorEntry(next.entry))
      })
      .catch(() => { if (active) setLoadMessage('单词信息加载失败，请关闭后重试') })
    return () => { active = false }
  }, [word, wordbookId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isPending) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (isEditing && data) {
        setDraft(cloneVocabularyInspectorEntry(data.entry))
        setStatusMessage('')
        setIsEditing(false)
      } else onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [data, isEditing, isPending, onClose])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>(isEditing ? 'input, textarea, select' : 'button')?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [isEditing, data?.id])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const measure = () => {
      const rect = panel.getBoundingClientRect()
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) }
      setPanelSize(current => current.width === next.width && current.height === next.height ? current : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [data, draft, isEditing])

  useEffect(() => {
    const handleResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    const handlePointerDown = (event: PointerEvent) => {
      if (!embedded && !isEditing && !isPending && panelRef.current && !panelRef.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('resize', handleResize)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => { window.removeEventListener('resize', handleResize); document.removeEventListener('pointerdown', handlePointerDown) }
  }, [embedded, isEditing, isPending, onClose])

  const left = Math.max(12, Math.min(x + 12, viewport.width - panelSize.width - 12))
  const top = Math.max(12, Math.min(y + 12, viewport.height - panelSize.height - 12))

  const cancelEditing = () => {
    if (!data || isPending) return
    setDraft(cloneVocabularyInspectorEntry(data.entry))
    setStatusMessage('')
    setIsEditing(false)
  }

  const setCurrentDraft: Dispatch<SetStateAction<VocabularyInspectorEntryDraft>> = update => {
    setDraft(current => {
      if (!current) return current
      return typeof update === 'function' ? update(current) : update
    })
  }

  const handleSave = () => {
    if (!data || !draft || isPending) return
    const previousWord = data.word
    const previousMemberships = new Set(data.entry.wordbookIds)
    const membershipsChanged = previousMemberships.size !== draft.wordbookIds.length || draft.wordbookIds.some(id => !previousMemberships.has(id))
    setStatusMessage('正在保存…')
    startTransition(async () => {
      try {
        const result = await updateFullVocabularyFromInspector(draft)
        if (!result.success) { setStatusMessage(result.message); return }
        const nextData = result.data as InspectorData
        setData(nextData)
        setDraft(cloneVocabularyInspectorEntry(nextData.entry))
        setStatusMessage('')
        setIsEditing(false)
        onSaved?.({ word: nextData.word, previousWord, meta: result.meta, membershipsChanged: membershipsChanged || previousWord !== nextData.word })
      } catch { setStatusMessage('保存失败，请重试') }
    })
  }

  return (
    <aside ref={panelRef} role='dialog' aria-label={`${word} 的单词本信息`} data-highlight-ignore='true' data-selection-editor={isEditing || isPending ? 'true' : undefined} style={{ left: embedded ? undefined : left, top: embedded ? undefined : top, isolation: 'isolate' }} className={`vocab-inspector ${embedded ? 'relative w-full max-h-[calc(100dvh-10rem)]' : 'fixed z-[70]'} flex flex-col overflow-hidden`}>
      <header className='vocab-inspector-header'>
        <div className='min-w-0'><div className='flex min-w-0 items-center gap-2'><h2 className='vocab-inspector-word'>{data?.word || word}</h2>{matchedVariant && matchedVariant !== (data?.word || word) ? <span className='vocab-inspector-match'>正文匹配：{matchedVariant}</span> : null}<WordAudioButton key={data?.entry.wordAudio || 'no-audio'} audioFile={data?.entry.wordAudio} word={data?.word || word} className='size-7' /></div>{data?.entry.pronunciations.length ? <p className='vocab-inspector-pronunciation'>{data.entry.pronunciations.join(' · ')}</p> : null}{data?.entry.etymologies?.length ? <p className='vocab-inspector-meta'>词源：{data.entry.etymologies.join(' · ')}</p> : null}{data?.entry.partsOfSpeech.length ? <p className='vocab-inspector-meta'>{data.entry.partsOfSpeech.join(' · ')}</p> : null}</div>
        <button type='button' onClick={isEditing ? cancelEditing : onClose} disabled={isPending} aria-label={isEditing ? '取消编辑' : '关闭单词信息'} className='vocab-inspector-close'>×</button>
      </header>
      <div className='vocab-inspector-body'>{!data || !draft ? <p className='vocab-inspector-loading'>{loadMessage}</p> : isEditing ? <VocabularyInspectorEditor data={data} draft={draft} setDraft={setCurrentDraft} /> : <WordSummary data={data} />}</div>
      {data ? <footer className='vocab-inspector-footer'><p aria-live='polite' className='vocab-inspector-status'>{statusMessage}</p>{isEditing ? <div className='vocab-inspector-actions'><button type='button' onClick={cancelEditing} disabled={isPending} className='ui-btn ui-btn-sm'>取消</button><button type='button' onClick={handleSave} disabled={isPending} className='ui-btn ui-btn-primary ui-btn-sm'>{isPending ? '保存中…' : '保存'}</button></div> : <div className='vocab-inspector-actions'><button type='button' className='ui-btn ui-btn-danger ui-btn-sm' disabled={isPending} onClick={() => { startTransition(async () => { if (!await confirm(`删除「${data.word}」及其收藏、定义和学习记录？`, { title: '删除单词', danger: true })) return; try { const result = await deleteVocabulary(data.id); if (!result.success) { setStatusMessage(result.message); return }; onDeleted?.(); onSaved?.({ word: data.word, meta: { pronunciations: [], meanings: [], partsOfSpeech: [], wordAudio: null }, membershipsChanged: true }); if (!embedded) onClose() } catch { setStatusMessage('删除失败，请重试') } }) }}>删除</button><button type='button' onClick={() => setIsEditing(true)} className='ui-btn ui-btn-primary ui-btn-sm'>编辑词条</button></div>}</footer> : null}
    </aside>
  )
}

function WordSummary({ data }: { data: InspectorData }) {
  const entry = data.entry
  const definitions = entry.definitions
  const references = [
    ...entry.patterns.map(item => ({ key: item.id || item.text, label: '模式', text: item.text, detail: item.meaning })),
    ...entry.expressions.map(item => ({ key: item.id || item.text, label: item.type, text: item.text, detail: item.meaning })),
    ...entry.relations.map(item => ({ key: item.id || item.targetText, label: RELATION_TYPE_OPTIONS.find(option => option[0] === item.type)?.[1] || item.type, text: item.targetText, detail: item.targetReading })),
    ...entry.notes.map(item => ({ key: item.id || item.text, label: item.type, text: item.text, detail: null })),
  ]
  return <div className='vocab-inspector-summary'>
    <section><h3>释义</h3>{definitions.length ? <div className='vocab-inspector-definitions'>{definitions.map((definition, index) => <article key={definition.id || `${definition.senseId}-${index}`}><p className='vocab-inspector-source'>{definition.dictionaryName || '辞典'} · {definition.language.toLowerCase().startsWith('ja') ? '日本語' : definition.language.toLowerCase().startsWith('zh') ? '中文' : definition.language}</p><p>{definition.definition}</p></article>)}</div> : <p className='vocab-inspector-empty'>尚未填写释义</p>}</section>
    <section><h3>例句</h3>{data.sentences.length ? <ol className='vocab-inspector-examples'>{data.sentences.map((sentence, index) => <li key={`${sentence.text}-${index}`}><div className='flex items-start gap-1'><p lang='ja' className='font-word-ja min-w-0 flex-1'>{sentence.text}</p><WordAudioButton audioFile={sentence.audioFile || sentence.audioData?.audioFile} start={sentence.audioFile ? 0 : sentence.audioData?.start} end={sentence.audioFile ? undefined : sentence.audioData?.end} word={sentence.text} className='-mr-1 -mt-1 size-7' /></div>{sentence.translation ? <p className='vocab-inspector-translation'>{sentence.translation}</p> : null}{sentence.source ? <p className='vocab-inspector-source'>{sentence.sourceUrl?.startsWith('/') && !sentence.sourceUrl.startsWith('//') ? <a href={sentence.sourceUrl}>{sentence.source}</a> : sentence.source}</p> : null}</li>)}</ol> : <p className='vocab-inspector-empty'>暂无例句</p>}</section>
    {references.length ? <section><h3>参考信息</h3><div className='vocab-inspector-references'>{references.map(reference => <div key={reference.key}><span>{reference.label}</span><p lang='ja' className='font-word-ja'>{reference.text}{reference.detail ? <small>{reference.detail}</small> : null}</p></div>)}</div></section> : null}
    <section><h3>所属单词本</h3>{data.memberships.length ? <p className='vocab-inspector-membership-text'>{data.memberships.map((item, index) => <span key={item.id}>{index > 0 ? ' · ' : ''}<a href={`/vocabulary/wordbooks/${encodeURIComponent(item.id)}`}>{item.label}</a></span>)}</p> : <p className='vocab-inspector-empty'>未归入单词本</p>}</section>
  </div>
}
