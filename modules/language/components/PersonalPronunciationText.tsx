'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CustomSelect from '@/components/ui/CustomSelect'
import { annotateJapaneseText, buildJapaneseLexicalRanges } from '@/utils/language/japaneseRuby'
import { occurrenceReadings, personalReadingCandidates, type PronunciationChoice } from '../domain/personal-pronunciation'
import { saveMaterialPronunciationChoice } from '../pronunciation-choice-actions'

export default function PersonalPronunciationText({ text, location, materialId, pronunciationMap, metadata, tokenWords, lexicalSurfaces, rubyEnabled, choices, onSaved, onInspect, className }: {
  text: string; location: string; materialId: string
  pronunciationMap: Record<string, string>
  metadata: Record<string, { pronunciations: string[] }>
  lexicalSurfaces: string[]
  tokenWords: string[]; rubyEnabled: boolean; choices: PronunciationChoice[]
  onInspect?: (surface: string, x: number, y: number) => void
  onSaved: (choice: PronunciationChoice) => void; className: string
}) {
  const [editor, setEditor] = useState<{ start: number; surface: string; candidates: string[]; canInspect: boolean; x: number; y: number } | null>(null)
  const [reading, setReading] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const editorOpen = Boolean(editor)
  useEffect(() => { if (editorOpen) popupRef.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus() }, [editorOpen])
  const close = () => {
    const start = editor?.start
    setEditor(null)
    requestAnimationFrame(() => textRef.current?.querySelector<HTMLElement>(`[data-vocab-start="${start}"]`)?.focus())
  }
  useEffect(() => {
    if (!editorOpen) return
    const reposition = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setEditor(current => current ? { ...current,
        x: Math.max(12, Math.min(rect.left, window.innerWidth - 372)),
        y: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 300)),
      } : current)
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [editorOpen])
  const lexicalBoundaries = lexicalSurfaces.length ? [0, text.length,
    ...buildJapaneseLexicalRanges(text, lexicalSurfaces).flatMap(range => [range.start, range.end]),
  ] : undefined
  const candidatesBySurface = Object.fromEntries(Object.keys(pronunciationMap).map(surface =>
    [surface, personalReadingCandidates(surface, metadata)],
  ))
  const editableReadingSurfaces = rubyEnabled ? Object.keys(candidatesBySurface).filter(surface => candidatesBySurface[surface].length > 1) : []
  const overrides = occurrenceReadings(text, location, choices)
  const open = (target: HTMLElement) => {
    const token = target.closest<HTMLElement>('[data-vocab-start]')
    if (!token || !rubyEnabled || window.getSelection()?.toString()) return
    const surface = token.dataset.vocabSurface || ''
    if (!editableReadingSurfaces.includes(surface)) return
    const start = Number(token.dataset.vocabStart)
    const rect = token.getBoundingClientRect()
    anchorRef.current = token
    setReading(overrides[start] || pronunciationMap[surface])
    setStatus('')
    setEditor({ start, surface, canInspect: Boolean(token.dataset.wordbookId), candidates: candidatesBySurface[surface], x: Math.max(12, Math.min(rect.left, window.innerWidth - 372)), y: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 300)) })
  }
  return <>
    <span ref={textRef} className={className} data-pronunciation-location={location} data-pronunciation-text={text}
      onClick={event => { if ((event.target as HTMLElement).closest('[role="button"]')) { event.stopPropagation(); open(event.target as HTMLElement) } }}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event.target as HTMLElement) } }}
      dangerouslySetInnerHTML={{ __html: annotateJapaneseText(text, pronunciationMap, { rubyEnabled, lexicalBoundaries, occurrenceReadings: overrides, editableReadingSurfaces, tokenClassName: 'vocab-token', tokenWords, rubyClassName: 'text-slate-900', rtClassName: 'text-slate-500' }) }} />
    {editor && createPortal(<div ref={popupRef} role='dialog' aria-label='此处读音' data-context-ignore='true'
      className='ui-pop fixed z-[100] w-[360px] max-w-[calc(100vw-24px)] bg-white p-4 text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100'
      style={{ left: editor.x, top: editor.y, maxHeight: 'calc(100vh - 24px)', overflowY: 'auto' }}
      onKeyDown={event => { if (event.key === 'Escape' && !saving) { event.stopPropagation(); close() } }}>
      {onInspect && editor.canInspect && <button type='button' className='ui-btn float-right' onClick={() => { onInspect(editor.surface, editor.x, editor.y); close() }}>词条信息</button>}
      <p className='mb-3 font-semibold'>「{editor.surface}」此处的读音</p>
      {editor.candidates.length > 1 && <CustomSelect aria-label='选择读音' value={reading} onChange={event => setReading(event.target.value)}>
        {[...new Set([...editor.candidates, reading])].map(value => <option key={value} value={value}>{value}</option>)}
      </CustomSelect>}
      <p className='mt-2 text-xs text-slate-500'>仅保存到当前用户在本文的这一处。</p>
      <p role='status' className='mt-2 text-xs text-rose-600'>{status}</p>
      <div className='mt-3 flex justify-end gap-2'>
        <button type='button' className='ui-btn' disabled={saving} onClick={close}>取消</button>
        <button type='button' className='ui-btn ui-btn-primary' disabled={saving || !reading.trim()} onClick={async () => {
          setSaving(true)
          try {
            const result = await saveMaterialPronunciationChoice(materialId, { location, sourceText: text, start: editor.start, surface: editor.surface, reading: reading.trim() })
            if (result.success) { onSaved(result.choice); close() } else setStatus(result.message)
          } catch { setStatus('保存失败，请重试') } finally { setSaving(false) }
        }}>{saving ? '保存中…' : '保存'}</button>
      </div>
    </div>, document.body)}
  </>
}
