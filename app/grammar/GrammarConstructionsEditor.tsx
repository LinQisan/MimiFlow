'use client'

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
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  connection: '',
  meaning: '',
  note: '',
  examplesInput: '',
  sentenceExampleIds: [],
})

export default function GrammarConstructionsEditor({
  value,
  onChange,
}: GrammarConstructionsEditorProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const rows = useMemo(
    () => (value.length > 0 ? value : [createDraft()]),
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
          className={`rounded-lg border bg-white p-2.5 transition-colors ${
            overId === item.id ? 'border-blue-300' : 'border-slate-200'
          }`}>
          <div className='mb-2 flex items-center justify-between'>
            <div className='flex items-center gap-2 text-xs font-semibold text-slate-500'>
              <span className='inline-flex h-6 items-center rounded-md border border-slate-200 px-2'>
                #{index + 1}
              </span>
              <span className='inline-flex h-6 items-center rounded-md border border-slate-200 px-2'>
                拖拽排序
              </span>
            </div>
            <button
              type='button'
              onClick={() => removeRow(item.id)}
              className='h-6 rounded-md border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-700 hover:bg-rose-100'>
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
                className='h-8 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-400'
              />
            </label>
            <label className='space-y-1'>
              <span className='text-[11px] font-semibold text-slate-600'>意思</span>
              <input
                value={item.meaning}
                onChange={e => updateField(item.id, 'meaning', e.target.value)}
                placeholder='例如：只好...'
                className='h-8 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-400'
              />
            </label>
          </div>

          <label className='mt-2 block space-y-1'>
            <span className='text-[11px] font-semibold text-slate-600'>备注（可选）</span>
            <input
              value={item.note}
              onChange={e => updateField(item.id, 'note', e.target.value)}
              placeholder='例如：偏书面、常用于积极语境'
              className='h-8 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-blue-400'
            />
          </label>

          <label className='mt-2 block space-y-1'>
            <span className='text-[11px] font-semibold text-slate-600'>
              该接续下例句（每行一条例句）
            </span>
            <textarea
              value={item.examplesInput}
              onChange={e =>
                updateField(item.id, 'examplesInput', e.target.value)
              }
              placeholder='例如：雨が降っているから、出かけない。'
              className='min-h-[74px] w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-blue-400'
            />
          </label>
        </article>
      ))}

      <button
        type='button'
        onClick={addRow}
        className='h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100'>
        + 新增接续
      </button>
    </div>
  )
}
