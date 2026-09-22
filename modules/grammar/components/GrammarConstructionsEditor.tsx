'use client'

// Grammar construction editor.

import { useMemo, useState } from 'react'

export type ConstructionDraft = {
  id: string
  connection: string
  meaning: string
  note: string
  examplesInput: string
  sentenceExampleIds?: string[]
}

type GrammarConstructionsEditorProps = {
  value: ConstructionDraft[]
  onChange: (next: ConstructionDraft[]) => void
}

const createDraft = (): ConstructionDraft => ({
  id:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  connection: '',
  meaning: '',
  note: '',
  examplesInput: '',
  sentenceExampleIds: [],
})

const EMPTY_ROWS_FALLBACK: ConstructionDraft[] = [
  {
    id: 'empty',
    connection: '',
    meaning: '',
    note: '',
    examplesInput: '',
    sentenceExampleIds: [],
  },
]

export default function GrammarConstructionsEditor({
  value,
  onChange,
}: GrammarConstructionsEditorProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const rows = useMemo(
    () => (value.length > 0 ? value : EMPTY_ROWS_FALLBACK),
    [value],
  )

  const updateField = (
    id: string,
    field: 'connection' | 'meaning' | 'note' | 'examplesInput',
    fieldValue: string,
  ) => {
    const next = rows.map(item =>
      item.id === id ? { ...item, [field]: fieldValue } : item,
    )
    onChange(next)
  }

  const addRow = () => onChange([...rows, createDraft()])

  const removeRow = (id: string) => {
    const next = rows.filter(item => item.id !== id)
    onChange(next.length > 0 ? next : [createDraft()])
  }

  const moveRow = (fromId: string, toId: string) => {
    if (fromId === toId) return
    const fromIndex = rows.findIndex(item => item.id === fromId)
    const toIndex = rows.findIndex(item => item.id === toId)
    if (fromIndex < 0 || toIndex < 0) return
    const next = [...rows]
    const [picked] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, picked)
    onChange(next)
  }

  return (
    <div className='space-y-2'>
      {rows.map((item, index) => (
        <article
          key={item.id}
          draggable
          onDragStart={() => setDraggingId(item.id)}
          onDragOver={event => {
            event.preventDefault()
            setOverId(item.id)
          }}
          onDrop={event => {
            event.preventDefault()
            if (draggingId) moveRow(draggingId, item.id)
            setDraggingId(null)
            setOverId(null)
          }}
          onDragEnd={() => {
            setDraggingId(null)
            setOverId(null)
          }}
          className={`px-2.5 py-3 transition-colors ${
            overId === item.id ? 'bg-slate-100 ring-1 ring-slate-500' : 'bg-transparent'
          }`}>
          <div className='mb-2 flex items-center justify-between'>
            <div className='flex items-center gap-2 text-xs font-semibold text-slate-500'>
              <span className='inline-flex h-6 items-center rounded-md bg-slate-100 px-2'>
                #{index + 1}
              </span>
              <span className='text-slate-400'>拖动排序</span>
            </div>
            <button
              type='button'
              onClick={() => removeRow(item.id)}
              className='text-xs font-semibold text-slate-400 hover:text-rose-600'>
              删除
            </button>
          </div>

          <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
            <label className='space-y-1'>
              <span className='text-[11px] font-semibold text-slate-600'>接续</span>
              <input
                value={item.connection}
                onChange={e => updateField(item.id, 'connection', e.target.value)}
                placeholder='例如：Vる + しかない'
                className='ui-input h-8 w-full rounded-md border border-slate-200 px-2 text-sm outline-none'
              />
            </label>
            <label className='space-y-1'>
              <span className='text-[11px] font-semibold text-slate-600'>意思</span>
              <input
                value={item.meaning}
                onChange={e => updateField(item.id, 'meaning', e.target.value)}
                placeholder='例如：只好...'
                className='ui-input h-8 w-full rounded-md border border-slate-200 px-2 text-sm outline-none'
              />
            </label>
          </div>

          <label className='mt-2 block space-y-1'>
            <span className='text-[11px] font-semibold text-slate-600'>备注（可选）</span>
            <input
              value={item.note}
              onChange={e => updateField(item.id, 'note', e.target.value)}
              placeholder='可选'
              className='ui-input h-8 w-full rounded-md border border-slate-200 px-2 text-sm outline-none'
            />
          </label>

          <label className='mt-2 block space-y-1'>
            <span className='text-[11px] font-semibold text-slate-600'>
              例句
            </span>
            <textarea
              value={item.examplesInput}
              onChange={e =>
                updateField(item.id, 'examplesInput', e.target.value)
              }
              placeholder='例如：雨が降っているから、出かけない。'
              className='ui-input min-h-[64px] w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none'
            />
          </label>
        </article>
      ))}

      <button
        type='button'
        onClick={addRow}
        className='ui-btn ui-btn-sm'>
        新增接续
      </button>
    </div>
  )
}
