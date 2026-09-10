'use client'

import { useEffect, useRef, useState } from 'react'
import type { SourceType } from '@prisma/client'
import { joinJapaneseLayoutGaps } from '@/modules/language/domain/text'
import { translateSudachiPartOfSpeech, type SudachiLexeme } from '@/modules/language/domain/sudachi'
import CustomSelect from '@/components/ui/CustomSelect'
import { findSelectionAttributeTargets, saveSelectionAttribute } from '../selection-attribute-actions'
import { SELECTION_ATTRIBUTE_OPTIONS, suggestSelectionAttribute, type SelectionAttributeInput } from '../domain/selection-attribute'

type Target = Extract<Awaited<ReturnType<typeof findSelectionAttributeTargets>>, { success: true }>['targets'][number] & { newWord?: { word: string; reading: string; meaning: string; partOfSpeech: string } }
const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700'

export default function SelectionAttributeEditor({ text, contextSentence, sourceType, sourceId, onCancel }: {
  text: string; contextSentence: string; sourceType: SourceType; sourceId: string; onCancel: () => void
}) {
  const [expression, setExpression] = useState(text)
  const [type, setType] = useState<SelectionAttributeInput['type']>('collocation')
  const [reading, setReading] = useState('')
  const [meaning, setMeaning] = useState('')
  const [targets, setTargets] = useState<Target[]>([])
  const [selected, setSelected] = useState<Record<string, string | null>>({})
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setLoading(true)
    async function load() {
      const analysisText = joinJapaneseLayoutGaps(text)
      let terms = [analysisText]
      let suggestion = analysisText
      let lexemes: SudachiLexeme[] = []
      let unavailable = false
      try {
        const response = await fetch('/api/pronunciation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: [analysisText] }), signal: controller.signal })
        if (!response.ok) throw new Error('analysis unavailable')
        const data = await response.json()
        const result = suggestSelectionAttribute(analysisText, data.lexicon || {})
        lexemes = Object.values(data.lexicon || {})
        terms = [...new Set([...terms, ...result.terms])]
        suggestion = result.expression
        unavailable = !data.available
      } catch { unavailable = true }
      if (!active) return
      const result = await findSelectionAttributeTargets(terms)
      if (!active) return
      setExpression(suggestion)
      if (result.success) {
        const suggestedWords = [...new Map(lexemes.filter(item => ['名詞', '動詞', '形容詞', '形状詞', '副詞'].includes(item.partsOfSpeech[0])).map(item => [item.dictionaryForm, item])).values()]
        const fresh: Target[] = suggestedWords.filter(item => !result.targets.some(target => [item.surface, item.dictionaryForm, item.normalizedForm].includes(target.word))).map(item => ({
          id: `new:${item.dictionaryForm}`, word: item.dictionaryForm, meanings: [], pronunciations: [item.dictionaryReading], senses: [], newWord: { word: item.dictionaryForm, reading: item.dictionaryReading, meaning: '', partOfSpeech: translateSudachiPartOfSpeech(item.partsOfSpeech) },
        }))
        setTargets([...result.targets, ...fresh])
        setSelected({})
        setMessage(unavailable ? '自动分析暂不可用，可以手动填写原形并搜索关联单词。' : '')
      } else setMessage(result.message)
      setLoading(false)
      inputRef.current?.focus()
    }
    void load().catch(() => { if (active) { setLoading(false); setMessage('加载失败，请重试。') } })
    return () => { active = false; controller.abort() }
  }, [text, revision])

  async function search() {
    if (!query.trim()) return
    setLoading(true)
    try {
      const result = await findSelectionAttributeTargets([], query)
      if (!result.success) { setMessage(result.message); return }
      setTargets(current => [...current.filter(t => t.id in selected), ...result.targets.filter(t => !(t.id in selected))])
      if (!result.targets.length) {
        const newWord = { word: query.trim(), reading: '', meaning: '', partOfSpeech: '' }
        setTargets(current => [...current.filter(t => t.id !== `new:${newWord.word}`), { id: `new:${newWord.word}`, word: newWord.word, pronunciations: [], meanings: [], senses: [], newWord }])
      }
      setMessage(result.targets.length ? '' : '未找到已收藏的单词。可勾选新词并填写释义后一起保存。')
    } catch { setMessage('查询失败，请重试。') }
    finally { setLoading(false) }
  }

  async function save() {
    setSaving(true)
    try {
      const result = await saveSelectionAttribute({ text: expression, type, reading, meaning, targets: Object.entries(selected).map(([vocabularyId, senseId]) => ({ vocabularyId, senseId, newWord: targets.find(t => t.id === vocabularyId)?.newWord })), contextSentence, sourceType, sourceId })
      if (!result.success) { setMessage(result.message); return }
      const refreshed = await findSelectionAttributeTargets(targets.filter(target => target.id in selected).map(target => target.word)).catch(() => null)
      if (refreshed?.success) { setTargets(refreshed.targets); setSelected({}) }
      setDirty(false)
      setMessage(`已保存到 ${result.count} 个单词；重复保存不会新增相同条目。`)
      window.dispatchEvent(new Event('vocabulary-attributes-changed'))
    } catch { setMessage('保存失败，请重试。') }
    finally { setSaving(false) }
  }

  return <div className='space-y-3 p-4' data-selection-editor={dirty || saving ? 'true' : undefined}
    onChange={() => setDirty(true)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); if (!saving) onCancel() } }}>
    <p className='text-xs leading-5 text-slate-500'>原文：<span lang='ja' className='font-word-ja'>{text}</span></p>
    <label className='block space-y-1 text-xs font-semibold'>属性类别
      <CustomSelect value={type} disabled={saving} onChange={event => { setType(event.target.value as typeof type); setDirty(true) }}>
        {SELECTION_ATTRIBUTE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </CustomSelect>
    </label>
    <p className='text-xs leading-5 text-slate-500'>{type === 'collocation' ? '保存词语的常见组合，可同时挂到多个单词的对应义项。' : type === 'idiom' ? '用于整体具有固定意义的惯用句。' : type === 'synonym' ? '仅用于意义相近、可以相互解释的词语。' : '保存与该单词有关联的表达，不标记为近义词。'}</p>
    <label className='block space-y-1 text-xs font-semibold'>表达 / 原形（可修改）
      <input ref={inputRef} className={`${field} font-word-ja`} value={expression} disabled={loading || saving} onChange={e => setExpression(e.target.value)} />
    </label>
    <label className='block space-y-1 text-xs font-semibold'>读音（可选）<input className={field} value={reading} disabled={saving} onChange={e => setReading(e.target.value)} /></label>
    {type === 'collocation' || type === 'idiom' ? <label className='block space-y-1 text-xs font-semibold'>表达释义（可选）<input className={field} value={meaning} disabled={saving} onChange={e => setMeaning(e.target.value)} /></label> : null}
    <fieldset className='space-y-2' disabled={saving || loading}>
      <legend className='mb-2 text-xs font-semibold'>关联单词与义项（可多选）</legend>
      <div className='flex gap-2'><input aria-label='搜索已收藏的关联单词' placeholder='搜索已收藏的单词' className={field} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search() } }} /><button className='ui-btn shrink-0' type='button' onClick={search}>搜索</button></div>
      {targets.map(target => <div key={target.id} className='border-b border-slate-100 py-2 dark:border-slate-800'>
        <label className='flex min-h-10 items-center gap-2 text-sm'><input type='checkbox' checked={target.id in selected} onChange={e => { setDirty(true); setSelected(current => { const next = { ...current }; if (e.target.checked) next[target.id] = target.senses.length === 1 ? target.senses[0].id : target.senses.length ? '' : null; else delete next[target.id]; return next }) }} /><span className='font-word-ja'>{target.word}</span>{target.newWord ? <span className='text-xs text-slate-500'>新词</span> : null}<span className='text-xs text-slate-500'>{target.pronunciations.join(' / ')}</span></label>
        <p className='text-xs text-slate-500'>{target.meanings.join('；')}</p>
        {target.id in selected && target.newWord ? <><label className='block space-y-1 text-xs font-semibold'>新词释义（必填）<input className={field} value={target.newWord.meaning} placeholder='填写该单词在这里的意思' onChange={e => setTargets(current => current.map(t => t.id === target.id ? { ...t, newWord: { ...t.newWord!, meaning: e.target.value } } : t))} /></label>
          <label className='mt-2 block space-y-1 text-xs font-semibold'>新词读音<input className={field} value={target.newWord.reading} onChange={e => setTargets(current => current.map(t => t.id === target.id ? { ...t, newWord: { ...t.newWord!, reading: e.target.value } } : t))} /></label>
          <label className='mt-2 block space-y-1 text-xs font-semibold'>新词词性<input className={field} value={target.newWord.partOfSpeech} placeholder='名词、动词等' onChange={e => setTargets(current => current.map(t => t.id === target.id ? { ...t, newWord: { ...t.newWord!, partOfSpeech: e.target.value } } : t))} /></label>
        </> : null}
        {target.id in selected && target.senses.length ? <CustomSelect aria-label={`${target.word}的义项`} value={selected[target.id] || ''} onChange={e => { setSelected(current => ({ ...current, [target.id]: e.target.value })); setDirty(true) }}>
          <option value='' disabled>选择对应义项</option>
          {target.senses.map(s => <option key={s.id} value={s.id}>{s.order + 1}. {s.definitions.map(d => d.definition).join('；') || '未填写释义'}</option>)}
        </CustomSelect> : null}
      </div>)}
      {!loading && targets.length === 0 ? <p className='text-xs text-slate-500'>未匹配到词条，可搜索其他写法或先收藏单词。</p> : null}
    </fieldset>
    <details className='text-xs text-slate-500'><summary>原句将保留在关联单词的例句中</summary><p className='mt-2 font-reading-ja'>{contextSentence || text}</p></details>
    <p role='status' className='text-xs leading-5'>{loading ? '正在查找关联单词…' : message}</p>
    <div className='sticky bottom-0 flex flex-wrap justify-end gap-2 bg-white py-2 dark:bg-slate-950'>
      {!dirty && !saving ? <button type='button' className='ui-btn' disabled={loading} onClick={() => setRevision(r => r + 1)}>重新匹配</button> : null}
      <button className='ui-btn' type='button' disabled={saving} onClick={onCancel}>取消</button>
      <button className='ui-btn ui-btn-primary' type='button' disabled={saving || loading || !expression.trim() || !Object.keys(selected).length || Object.values(selected).includes('') || targets.some(t => t.id in selected && t.newWord && !t.newWord.meaning.trim())} onClick={save}>{saving ? '保存中…' : '保存关联'}</button>
    </div>
  </div>
}
