'use client'

// Grammar creation panel.

import { useMemo, useState, useTransition } from 'react'
import { createGrammar } from '../actions'
import GrammarConstructionsEditor, {
  type ConstructionDraft,
} from './GrammarConstructionsEditor'

type GrammarOption = {
  id: string
  name: string
}

type GrammarCreatePanelProps = {
  grammarOptions: GrammarOption[]
  tagSuggestions: string[]
  clusterSuggestions: string[]
}

const createInitialConstruction = (id: string): ConstructionDraft => ({
  id,
  connection: '',
  meaning: '',
  note: '',
  examplesInput: '',
  sentenceExampleIds: [],
})

export default function GrammarCreatePanel({
  grammarOptions,
  tagSuggestions,
  clusterSuggestions,
}: GrammarCreatePanelProps) {
  const [name, setName] = useState('')
  const [constructions, setConstructions] = useState<ConstructionDraft[]>([
    createInitialConstruction('init'),
  ])
  const [tagsInput, setTagsInput] = useState('')
  const [clusterTitle, setClusterTitle] = useState('')
  const [similarFilter, setSimilarFilter] = useState('')
  const [selectedSimilarIds, setSelectedSimilarIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()

  const filteredGrammarOptions = useMemo(() => {
    const q = similarFilter.trim().toLowerCase()
    if (!q) return grammarOptions.slice(0, 80)
    return grammarOptions
      .filter(item => item.name.toLowerCase().includes(q))
      .slice(0, 80)
  }, [grammarOptions, similarFilter])

  const toggleSimilarId = (id: string) => {
    setSelectedSimilarIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id],
    )
  }

  const handleCreate = () => {
    startTransition(async () => {
      const result = await createGrammar({
        name,
        constructions,
        tagsInput,
        clusterTitle,
        similarGrammarIds: selectedSimilarIds,
      })
      setMessage(result.message)
      if (!result.success) return
      setName('')
      setConstructions([
        createInitialConstruction(
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `reset-${Date.now()}`,
        ),
      ])
      setTagsInput('')
      setClusterTitle('')
      setSimilarFilter('')
      setSelectedSimilarIds([])
      setExpanded(false)
    })
  }

  return (
    <section className='rounded-xl bg-transparent'>
      <div className='flex items-center justify-between gap-3 px-4 py-3'>
        <h2 className='text-sm font-bold text-slate-900'>新建语法</h2>
        <button
          type='button'
          onClick={() => setExpanded(previous => !previous)}
          className={expanded ? 'ui-btn ui-btn-sm' : 'ui-btn ui-btn-sm ui-btn-primary'}>
          {expanded ? '收起' : '新建'}
        </button>
      </div>

      {expanded ? (
        <div className='p-4'>
        <label className='space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>语法名称</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder='例如：〜わけではない'
            className='ui-input h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none'
          />
        </label>

      <label className='mt-3 block space-y-1'>
        <span className='text-xs font-semibold text-slate-600'>接续与意思</span>
        <GrammarConstructionsEditor value={constructions} onChange={setConstructions} />
      </label>

      <div className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-2'>
        <label className='space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>标签（逗号分隔）</span>
          <input
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
            placeholder='积极语境, 书面语, N2'
            className='ui-input h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none'
            list='grammar-tag-suggestions'
          />
          <datalist id='grammar-tag-suggestions'>
            {tagSuggestions.map(item => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
        <label className='space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>相似语法分组名</span>
          <input
            value={clusterTitle}
            onChange={e => setClusterTitle(e.target.value)}
            placeholder='例如：原因表达对比组'
            className='ui-input h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none'
            list='grammar-cluster-suggestions'
          />
          <datalist id='grammar-cluster-suggestions'>
            {clusterSuggestions.map(item => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
      </div>

      <details className='mt-3 rounded-lg bg-slate-50'>
        <summary className='cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-600'>
          相似语法 {selectedSimilarIds.length > 0 ? `· 已选 ${selectedSimilarIds.length}` : ''}
        </summary>
        <div className='p-3'>
        <div className='mb-2 flex items-center justify-between gap-2'>
          <input
            value={similarFilter}
            onChange={e => setSimilarFilter(e.target.value)}
            placeholder='筛选语法名称'
            className='ui-input h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs outline-none'
          />
        </div>
        <div className='max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2'>
          {filteredGrammarOptions.length === 0 ? (
            <p className='text-xs text-slate-400'>暂无可选语法</p>
          ) : (
            filteredGrammarOptions.map(item => (
              <label key={item.id} className='flex items-center gap-2 rounded-md px-1 py-1 text-sm text-slate-700 hover:bg-slate-50'>
                <input
                  type='checkbox'
                  checked={selectedSimilarIds.includes(item.id)}
                  onChange={() => toggleSimilarId(item.id)}
                />
                <span>{item.name}</span>
              </label>
            ))
          )}
        </div>
        </div>
      </details>

      <div className='mt-4 flex items-center gap-3'>
        <button
          type='button'
          onClick={handleCreate}
          disabled={isPending}
          className='ui-btn ui-btn-primary h-10 px-4 disabled:cursor-not-allowed disabled:opacity-50'>
          {isPending ? '创建中...' : '创建语法'}
        </button>
        {message ? (
          <p
            className={`text-sm font-semibold ${
              message.includes('已创建') ? 'text-emerald-600' : 'text-rose-600'
            }`}>
            {message}
          </p>
        ) : null}
      </div>
        </div>
      ) : message ? (
        <p className='border-t border-slate-100 px-4 py-2 text-xs font-semibold text-emerald-600'>
          {message}
        </p>
      ) : null}
    </section>
  )
}
