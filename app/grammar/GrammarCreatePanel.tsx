'use client'

import { useMemo, useState, useTransition } from 'react'
import { createGrammar } from './actions'
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

export default function GrammarCreatePanel({
  grammarOptions,
  tagSuggestions,
  clusterSuggestions,
}: GrammarCreatePanelProps) {
  const [name, setName] = useState('')
  const [constructions, setConstructions] = useState<ConstructionDraft[]>([
    {
      id: `${Date.now()}-init`,
      connection: '',
      meaning: '',
      note: '',
      examplesInput: '',
      sentenceExampleIds: [],
    },
  ])
  const [tagsInput, setTagsInput] = useState('')
  const [clusterTitle, setClusterTitle] = useState('')
  const [similarFilter, setSimilarFilter] = useState('')
  const [selectedSimilarIds, setSelectedSimilarIds] = useState<string[]>([])
  const [message, setMessage] = useState('')
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
        {
          id: `${Date.now()}-reset`,
          connection: '',
          meaning: '',
          note: '',
          examplesInput: '',
          sentenceExampleIds: [],
        },
      ])
      setTagsInput('')
      setClusterTitle('')
      setSimilarFilter('')
      setSelectedSimilarIds([])
    })
  }

  return (
    <section className='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6'>
      <h2 className='text-lg font-bold text-slate-900'>创建语法</h2>
      <p className='mt-1 text-xs text-slate-500'>
        支持标签、相似语法归组、手动例句与数据库句子匹配。
      </p>

      <div className='mt-4 grid grid-cols-1 gap-3'>
        <label className='space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>语法名称</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder='例如：〜わけではない'
            className='h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400'
          />
        </label>
      </div>

      <label className='mt-3 block space-y-1'>
        <span className='text-xs font-semibold text-slate-600'>
          接续与意思（卡片可拖拽排序）
        </span>
        <GrammarConstructionsEditor value={constructions} onChange={setConstructions} />
      </label>

      <div className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-2'>
        <label className='space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>标签（逗号分隔）</span>
          <input
            value={tagsInput}
            onChange={e => setTagsInput(e.target.value)}
            placeholder='积极语境, 书面语, N2'
            className='h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400'
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
            className='h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400'
            list='grammar-cluster-suggestions'
          />
          <datalist id='grammar-cluster-suggestions'>
            {clusterSuggestions.map(item => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
      </div>

      <div className='mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3'>
        <div className='mb-2 flex items-center justify-between gap-2'>
          <span className='text-xs font-bold text-slate-700'>相似语法（可选）</span>
          <input
            value={similarFilter}
            onChange={e => setSimilarFilter(e.target.value)}
            placeholder='筛选语法名称'
            className='h-8 w-44 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-blue-400'
          />
        </div>
        <div className='max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2'>
          {filteredGrammarOptions.length === 0 ? (
            <p className='text-xs text-slate-400'>暂无可选语法</p>
          ) : (
            filteredGrammarOptions.map(item => (
              <label key={item.id} className='flex items-center gap-2 text-sm text-slate-700'>
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

      <div className='mt-4 flex items-center gap-3'>
        <button
          type='button'
          onClick={handleCreate}
          disabled={isPending}
          className='h-10 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300'>
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
    </section>
  )
}
