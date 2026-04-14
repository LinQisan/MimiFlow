'use client'

import { useState, useTransition } from 'react'
import { removeGrammar, updateGrammar } from '../actions'
import GrammarConstructionsEditor, {
  type ConstructionDraft,
} from '../GrammarConstructionsEditor'

type EditableGrammarRow = {
  id: string
  name: string
  constructions: ConstructionDraft[]
  tagsInput: string
  clusterTitle: string
  dbExampleCount: number
}

type GrammarEditTableProps = {
  initialRows: EditableGrammarRow[]
}

export default function GrammarEditTable({ initialRows }: GrammarEditTableProps) {
  const [rows, setRows] = useState(initialRows)
  const [messageById, setMessageById] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const updateField = (
    id: string,
    field: 'name' | 'tagsInput' | 'clusterTitle',
    value: string,
  ) => {
    setRows(prev =>
      prev.map(item => (item.id === id ? { ...item, [field]: value } : item)),
    )
  }

  const onSave = (id: string) => {
    const row = rows.find(item => item.id === id)
    if (!row) return

    setPendingId(id)
    startTransition(async () => {
      const res = await updateGrammar({
        grammarId: row.id,
        name: row.name,
        constructions: row.constructions,
        tagsInput: row.tagsInput,
        clusterTitle: row.clusterTitle,
      })
      setMessageById(prev => ({ ...prev, [id]: res.message }))
      setPendingId(null)
    })
  }

  const onDelete = (id: string) => {
    setPendingId(id)
    startTransition(async () => {
      const res = await removeGrammar(id)
      if (res.success) {
        setRows(prev => prev.filter(item => item.id !== id))
      }
      setMessageById(prev => ({ ...prev, [id]: res.message }))
      setPendingId(null)
    })
  }

  if (rows.length === 0) {
    return (
      <section className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
        <h2 className='text-lg font-black text-slate-900'>编辑表格</h2>
        <p className='mt-2 text-sm text-slate-500'>暂无语法数据，请先创建语法。</p>
      </section>
    )
  }

  return (
    <section className='rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_2px_6px_rgba(15,23,42,0.04),0_20px_60px_rgba(15,23,42,0.06)] md:p-6'>
      <h2 className='text-lg font-black text-slate-900'>编辑表格</h2>
      <p className='mt-1 text-xs text-slate-500'>
        支持编辑语法基础信息、标签、相似组和手动例句。数据库例句在创建时绑定，当前保留只读。
      </p>

      <div className='mt-3 space-y-3'>
        {rows.map(item => {
          const rowPending = isPending && pendingId === item.id
          return (
            <article
              key={item.id}
              className='rounded-2xl border border-slate-200 bg-slate-50 p-3'>
              <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                <label className='space-y-1'>
                  <span className='text-xs font-semibold text-slate-600'>语法名称</span>
                  <input
                    value={item.name}
                    onChange={e => updateField(item.id, 'name', e.target.value)}
                    className='h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                  />
                </label>
                <label className='space-y-1 md:col-span-2'>
                  <span className='text-xs font-semibold text-slate-600'>
                    接续与意思（卡片可拖拽排序）
                  </span>
                  <GrammarConstructionsEditor
                    value={item.constructions}
                    onChange={next =>
                      setRows(prev =>
                        prev.map(row =>
                          row.id === item.id ? { ...row, constructions: next } : row,
                        ),
                      )
                    }
                  />
                </label>
                <label className='space-y-1'>
                  <span className='text-xs font-semibold text-slate-600'>标签</span>
                  <input
                    value={item.tagsInput}
                    onChange={e => updateField(item.id, 'tagsInput', e.target.value)}
                    placeholder='逗号分隔'
                    className='h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                  />
                </label>
                <label className='space-y-1'>
                  <span className='text-xs font-semibold text-slate-600'>相似组</span>
                  <input
                    value={item.clusterTitle}
                    onChange={e => updateField(item.id, 'clusterTitle', e.target.value)}
                    className='h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100'
                  />
                </label>
              </div>

              <div className='mt-2 flex flex-wrap items-center justify-between gap-2'>
                <span className='text-xs text-slate-500'>
                  数据库例句 {item.dbExampleCount} 条（只读保留）
                </span>
                <div className='flex items-center gap-2'>
                  <button
                    type='button'
                    onClick={() => onDelete(item.id)}
                    disabled={rowPending}
                    className='h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'>
                    删除
                  </button>
                  <button
                    type='button'
                    onClick={() => onSave(item.id)}
                    disabled={rowPending}
                    className='h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300'>
                    {rowPending ? '处理中...' : '保存'}
                  </button>
                </div>
              </div>

              {messageById[item.id] ? (
                <p
                  className={`mt-1 text-xs font-semibold ${
                    messageById[item.id].includes('已') ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                  {messageById[item.id]}
                </p>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
