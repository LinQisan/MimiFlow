'use client'

import { useId, useRef, useState, useTransition } from 'react'
import CustomSelect from '@/components/ui/CustomSelect'
import WordAudioButton from '@/modules/knowledge/vocabulary/components/WordAudioButton'
import type { VocabItem } from '../../types'
import { addNadeshikoExample, searchNadeshikoExamples } from '../actions'
import { nadeshikoSourceLabel, type NadeshikoSearchItem, type NadeshikoSearchState } from '../domain'

export default function NadeshikoSearchPanel({ vocabulary, editing = false }: {
  vocabulary: VocabItem
  editing?: boolean
}) {
  const regionId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(vocabulary.word)
  const [completedQuery, setCompletedQuery] = useState('')
  const [state, setState] = useState<NadeshikoSearchState>('idle')
  const [examples, setExamples] = useState<NadeshikoSearchItem[]>([])
  const [message, setMessage] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [senseId, setSenseId] = useState(vocabulary.senses?.[0]?.id || '')
  const [pending, startTransition] = useTransition()
  const selectedSenseId = vocabulary.senses?.some(sense => sense.id === senseId)
    ? senseId : vocabulary.senses?.[0]?.id || ''

  function search() {
    if (busy.current || !query.trim()) return
    busy.current = true
    setState('loading')
    setMessage('')
    setExamples([])
    const searchedQuery = query.trim()
    startTransition(async () => {
      try {
        const result = await searchNadeshikoExamples({ vocabularyId: vocabulary.id, query: searchedQuery })
        setExamples(result.examples)
        setState(result.state)
        setMessage(result.message || '')
        setCompletedQuery(searchedQuery)
      } catch {
        setState('error')
        setMessage('无法获取动漫例句，请稍后再试')
      } finally { busy.current = false }
    })
  }

  function add(example: NadeshikoSearchItem) {
    if (busy.current || editing) return
    busy.current = true
    setAdding(example.externalId)
    setMessage('')
    startTransition(async () => {
      try {
        const result = await addNadeshikoExample({
          vocabularyId: vocabulary.id, query: completedQuery,
          externalId: example.externalId, senseId: selectedSenseId,
        })
        if (result.success) {
          setExamples(previous => previous.map(item => item.externalId === example.externalId ? { ...item, isAdded: true } : item))
        } else setMessage(result.message)
      } catch { setMessage('无法添加例句，请稍后再试') }
      finally { busy.current = false; setAdding(null) }
    })
  }

  return (
    <section className='vocab-flat-section mt-3 pt-0' aria-label='动漫例句搜索'>
      <button type='button' className='ui-btn ui-btn-ghost min-h-10'
        aria-expanded={open} aria-controls={regionId}
        onClick={() => {
          setOpen(!open)
          if (!open) {
            search()
            requestAnimationFrame(() => inputRef.current?.focus())
          }
        }}>
        {open ? '收起动漫例句' : '查找动漫例句'}
      </button>
      {open ? (
        <div id={regionId} className='mt-2' onKeyDown={event => {
          if (event.key === 'Escape') {
            setOpen(false)
            const trigger = event.currentTarget.previousElementSibling
            if (trigger instanceof HTMLButtonElement) trigger.focus()
          }
        }}>
          <form className='flex flex-wrap items-end gap-2' onSubmit={event => { event.preventDefault(); search() }}>
            <label className='min-w-0 flex-1 text-sm' htmlFor={`${regionId}-query`}>
              搜索词
              <input ref={inputRef} id={`${regionId}-query`} value={query} maxLength={200}
                onChange={event => setQuery(event.target.value)}
                className='ui-input mt-1 w-full font-reading-body-ja text-base' />
            </label>
            <button type='submit' className='ui-btn min-h-10' disabled={pending || !query.trim()}>
              {state === 'loading' ? '搜索中…' : '搜索'}
            </button>
          </form>
          <div role='status' aria-live='polite' className='my-2 text-sm text-slate-500'>
            {state === 'loading' ? '正在搜索动漫例句…' : state === 'empty' ? '没有找到动漫例句' : message}
          </div>
          {editing ? <p className='my-2 text-sm text-slate-500'>请先保存或取消单词编辑，再添加动漫例句。</p> : null}
          {examples.length && (vocabulary.senses?.length || 0) > 1 ? (
            <label className='mb-2 flex items-center gap-2 text-sm'>添加到义项
              <CustomSelect value={selectedSenseId} onChange={event => setSenseId(event.target.value)} disabled={pending} aria-label='动漫例句添加到义项'>
                {vocabulary.senses?.map((sense, index) => <option key={sense.id} value={sense.id}>义项 {index + 1}</option>)}
              </CustomSelect>
            </label>
          ) : null}
          <div className='max-h-[28rem] divide-y divide-slate-200 overflow-y-auto'>
            {examples.map(example => (
              <div key={example.externalId} className='py-4'>
                <p lang='ja' className='font-reading-body-ja text-base leading-8'>{example.sentence}</p>
                {example.translation ? <p className='mt-1 text-sm text-slate-500'>{example.translation}</p> : null}
                <div className='mt-2 flex flex-wrap items-center gap-2'>
                  {example.audioUrl ? <WordAudioButton audioFile={example.audioUrl} word={example.sentence} /> : <span className='text-xs text-slate-400'>暂无音频</span>}
                  <a href={`https://nadeshiko.co/sentence/${encodeURIComponent(example.externalId)}`} target='_blank' rel='noopener noreferrer'
                    className='min-w-0 flex-1 text-xs text-slate-500 hover:underline'>
                    {nadeshikoSourceLabel(example)}
                  </a>
                  <button type='button' className='ui-btn ui-btn-sm min-h-10' disabled={example.isAdded || pending || editing}
                    onClick={() => add(example)}>
                    {example.isAdded ? '✓ 已添加' : adding === example.externalId ? '添加中…' : '添加'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
