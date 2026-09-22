'use client'

import { useMemo, useState, useTransition } from 'react'

import GrammarConstructionsEditor, {
  type ConstructionDraft,
} from './GrammarConstructionsEditor'
import { removeGrammar, updateGrammar } from '../actions'

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

const inputClassName =
  'ui-input h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none'

export default function GrammarEditTable({ initialRows }: GrammarEditTableProps) {
  const [rows, setRows] = useState(initialRows)
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [messageById, setMessageById] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter(item =>
      [item.name, item.tagsInput, item.clusterTitle].some(value =>
        value.toLowerCase().includes(keyword),
      ),
    )
  }, [query, rows])

  const updateField = (
    id: string,
    field: 'name' | 'tagsInput' | 'clusterTitle',
    value: string,
  ) => {
    setRows(previous =>
      previous.map(item => (item.id === id ? { ...item, [field]: value } : item)),
    )
  }

  const onSave = (id: string) => {
    const row = rows.find(item => item.id === id)
    if (!row) return
    setPendingId(id)
    startTransition(async () => {
      const result = await updateGrammar({
        grammarId: row.id,
        name: row.name,
        constructions: row.constructions,
        tagsInput: row.tagsInput,
        clusterTitle: row.clusterTitle,
      })
      setMessageById(previous => ({ ...previous, [id]: result.message }))
      if (result.success) setExpandedId(null)
      setPendingId(null)
    })
  }

  const onDelete = (id: string) => {
    if (!window.confirm('确认删除这条语法？')) return
    setPendingId(id)
    startTransition(async () => {
      const result = await removeGrammar(id)
      if (result.success) {
        setRows(previous => previous.filter(item => item.id !== id))
        setExpandedId(null)
      }
      setMessageById(previous => ({ ...previous, [id]: result.message }))
      setPendingId(null)
    })
  }

  return (
    <section className='overflow-hidden rounded-xl bg-transparent'>
      <div className='flex flex-wrap items-center justify-between gap-3 p-3'>
        <h2 className='text-sm font-bold text-slate-900'>语法列表</h2>
        <input
          type='search'
          value={query}
          onChange={event => setQuery(event.currentTarget.value)}
          placeholder='搜索语法、标签或分组'
          aria-label='搜索语法'
          className='ui-input h-9 w-full rounded-lg border-0 bg-slate-50 px-3 text-sm outline-none sm:w-72'
        />
      </div>

      <div className='space-y-4'>
        {filteredRows.map(item => {
          const expanded = expandedId === item.id
          const rowPending = isPending && pendingId === item.id
          const tags = item.tagsInput
            .split(/[,，]/)
            .map(tag => tag.trim())
            .filter(Boolean)
          return (
            <article key={item.id} className='px-3 py-3 md:px-4'>
              <div className='flex min-w-0 flex-wrap items-center gap-2'>
                <button
                  type='button'
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className='min-w-0 flex-1 text-left'>
                  <span className='block truncate text-base font-bold text-slate-950'>
                    {item.name}
                  </span>
                  <span className='mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-400'>
                    <span>{item.constructions.length} 个接续</span>
                    {item.dbExampleCount > 0 ? <span>{item.dbExampleCount} 条例句</span> : null}
                    {item.clusterTitle ? <span>{item.clusterTitle}</span> : null}
                  </span>
                </button>
                <div className='hidden flex-wrap gap-1.5 md:flex'>
                  {tags.slice(0, 3).map(tag => (
                    <span key={tag} className='rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500'>
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  type='button'
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className='ui-btn ui-btn-sm'>
                  {expanded ? '收起' : '编辑'}
                </button>
              </div>

              {expanded ? (
                <div className='mt-4 bg-slate-500/[0.025] p-3 sm:pl-8'>
                  <div className='grid gap-3 md:grid-cols-2'>
                    <label className='text-xs font-semibold text-slate-500'>
                      名称
                      <input
                        value={item.name}
                        onChange={event => updateField(item.id, 'name', event.currentTarget.value)}
                        className={`${inputClassName} mt-1`}
                      />
                    </label>
                    <label className='text-xs font-semibold text-slate-500'>
                      标签
                      <input
                        value={item.tagsInput}
                        onChange={event => updateField(item.id, 'tagsInput', event.currentTarget.value)}
                        placeholder='逗号分隔'
                        className={`${inputClassName} mt-1`}
                      />
                    </label>
                    <label className='text-xs font-semibold text-slate-500 md:col-span-2'>
                      相似组
                      <input
                        value={item.clusterTitle}
                        onChange={event => updateField(item.id, 'clusterTitle', event.currentTarget.value)}
                        className={`${inputClassName} mt-1`}
                      />
                    </label>
                    <div className='md:col-span-2'>
                      <p className='mb-1 text-xs font-semibold text-slate-500'>接续与意思</p>
                      <GrammarConstructionsEditor
                        value={item.constructions}
                        onChange={next =>
                          setRows(previous =>
                            previous.map(row =>
                              row.id === item.id ? { ...row, constructions: next } : row,
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
                    <p className={`text-xs font-semibold ${
                      messageById[item.id]?.includes('已') ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {messageById[item.id] || ''}
                    </p>
                    <div className='flex gap-2'>
                      <button
                        type='button'
                        onClick={() => onDelete(item.id)}
                        disabled={rowPending}
                        className='ui-btn ui-btn-sm ui-btn-danger disabled:opacity-50'>
                        删除
                      </button>
                      <button
                        type='button'
                        onClick={() => onSave(item.id)}
                        disabled={rowPending}
                        className='ui-btn ui-btn-sm ui-btn-primary disabled:opacity-50'>
                        {rowPending ? '保存中…' : '保存'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
        {filteredRows.length === 0 ? (
          <p className='py-16 text-center text-sm text-slate-400'>
            {query.trim() ? '没有匹配结果' : '暂无语法'}
          </p>
        ) : null}
      </div>
    </section>
  )
}
