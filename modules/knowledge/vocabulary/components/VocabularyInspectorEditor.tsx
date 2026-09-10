'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'

import CustomSelect from '@/components/ui/CustomSelect'
import {
  EXPRESSION_TYPE_OPTIONS,
  RELATION_TYPE_OPTIONS,
  TRANSITIVITY_OPTIONS,
  USAGE_NOTE_TYPE_OPTIONS,
  VOCABULARY_POS_OPTIONS,
  type VocabularyEntryDraft,
} from '../domain/entry'
import type { VocabularyInspectorEntryDraft } from '../domain/inspector-entry'

type Draft = VocabularyInspectorEntryDraft
type Sense = Draft['senses'][number]
type Definition = Draft['definitions'][number]
type Sentence = Draft['sentences'][number]
type Pattern = Draft['patterns'][number]
type Expression = Draft['expressions'][number]
type Relation = Draft['relations'][number]
type Note = Draft['notes'][number]

const inputClass = 'vocab-inspector-field'
const labelClass = 'vocab-inspector-label'
const sectionClass = 'vocab-inspector-section'

export function makeInspectorClientId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `client-${prefix}-${crypto.randomUUID()}`
  }
  return `client-${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function cloneVocabularyInspectorEntry(entry: Draft): Draft {
  return JSON.parse(JSON.stringify(entry)) as Draft
}

function splitLines(value: string) {
  return Array.from(new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)))
}

function senseLabel(_sense: Sense, index: number) {
  return `义项 ${index + 1}`
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 2,
  className = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
  rows?: number
  className?: string
}) {
  return (
    <label className={`vocab-inspector-field-wrap ${className}`}>
      <span className={labelClass}>{label}</span>
      {multiline ? (
        <textarea className={inputClass} rows={rows} value={value} placeholder={placeholder} onChange={event => onChange(event.currentTarget.value)} />
      ) : (
        <input className={inputClass} value={value} placeholder={placeholder} onChange={event => onChange(event.currentTarget.value)} />
      )}
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  label: string
  value: string
  options: readonly (readonly [string, string])[]
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <label className={`vocab-inspector-field-wrap ${className}`}>
      <span className={labelClass}>{label}</span>
      <CustomSelect className={inputClass} value={value} onChange={event => onChange(event.currentTarget.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </CustomSelect>
    </label>
  )
}

function ItemActions({
  index,
  length,
  onMove,
  onRemove,
}: {
  index: number
  length: number
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <div className='vocab-inspector-item-actions'>
      <button type='button' onClick={() => onMove(-1)} disabled={index === 0} aria-label='上移'>↑</button>
      <button type='button' onClick={() => onMove(1)} disabled={index === length - 1} aria-label='下移'>↓</button>
      <button type='button' onClick={onRemove} className='vocab-inspector-remove'>删除</button>
    </div>
  )
}

function SensePicker({
  senses,
  value,
  onChange,
  allowNone = false,
}: {
  senses: Draft['senses']
  value: string | null
  onChange: (value: string | null) => void
  allowNone?: boolean
}) {
  return (
    <label className='vocab-inspector-inline-field'>
      <span>义项</span>
      <CustomSelect value={value || ''} className={inputClass} onChange={event => onChange(event.currentTarget.value || null)}>
        {allowNone ? <option value=''>全部义项</option> : null}
        {senses.map((sense, index) => <option key={sense.id} value={sense.id}>{senseLabel(sense, index)}</option>)}
      </CustomSelect>
    </label>
  )
}

export default function VocabularyInspectorEditor({
  data,
  draft,
  setDraft,
}: {
  data: {
    availableWordbooks: Array<{ id: string; label: string }>
  }
  draft: Draft
  setDraft: Dispatch<SetStateAction<Draft>>
}) {
  const [activeSenseId, setActiveSenseId] = useState(draft.senses[0]?.id || '')
  const activeSenseIndex = Math.max(0, draft.senses.findIndex(sense => sense.id === activeSenseId))
  const activeSense = draft.senses[activeSenseIndex]

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }))
  type FlatKey = 'definitions' | 'sentences' | 'patterns' | 'expressions' | 'relations' | 'notes'
  const patchFlat = <K extends FlatKey>(key: K, index: number, patch: Partial<Draft[K][number]>) => {
    setDraft(current => {
      const items = [...current[key]]
      const item = items[index]
      if (item) items[index] = { ...item, ...patch }
      return { ...current, [key]: items }
    })
  }

  const addSense = () => {
    const id = makeInspectorClientId('sense')
    setDraft(current => ({ ...current, senses: [...current.senses, { id }] }))
    setActiveSenseId(id)
  }

  const addDefinition = () => set('definitions', [...draft.definitions, { language: 'zh', dictionaryName: '用户编辑', definition: '', senseId: activeSense?.id || null }])
  const addSentence = () => set('sentences', [...draft.sentences, { text: '', translation: '', source: '手动录入', sourceUrl: '#', posTags: [], audioFile: null, meaningIndex: activeSenseIndex, senseId: activeSense?.id || null }])
  const addPattern = () => set('patterns', [...draft.patterns, { text: '', meaning: '', senseId: activeSense?.id || null }])
  const addExpression = () => set('expressions', [...draft.expressions, { type: 'collocation', text: '', reading: '', meaning: '', senseId: activeSense?.id || null }])
  const addRelation = (senseId: string | null = activeSense?.id || null) => set('relations', [...draft.relations, { type: 'related', targetText: '', targetReading: '', marker: '', pattern: '', senseId }])
  const addNote = () => set('notes', [...draft.notes, { type: 'usage', text: '', senseId: activeSense?.id || null }])

  return (
    <div className='vocab-inspector-editor'>
      <section className={sectionClass}>
        <h3>词条</h3>
        <div className='vocab-inspector-grid vocab-inspector-grid-2'>
          <Field label='单词' value={draft.word} onChange={value => set('word', value)} />
          <Field label='音频路径' value={draft.wordAudio || ''} onChange={value => set('wordAudio', value || null)} placeholder='/audios/...' />
          <Field label='词源（每行一个）' value={(draft.etymologies || []).join('\n')} onChange={value => set('etymologies', splitLines(value))} multiline rows={2} />
          <Field label='读音（每行一个）' value={draft.pronunciations.join('\n')} onChange={value => set('pronunciations', splitLines(value))} multiline rows={2} />
          <Field label='词性（兼容显示，每行一个）' value={draft.partsOfSpeech.join('\n')} onChange={value => set('partsOfSpeech', splitLines(value))} multiline rows={2} />
          <SelectField label='结构化词性' value={draft.grammarPartOfSpeech || 'other'} options={VOCABULARY_POS_OPTIONS} onChange={value => set('grammarPartOfSpeech', value as VocabularyEntryDraft['grammarPartOfSpeech'])} />
          <SelectField label='及物性' value={draft.transitivity || ''} options={([['', '未指定'], ...TRANSITIVITY_OPTIONS] as const)} onChange={value => set('transitivity', (value || null) as Draft['transitivity'])} />
          <Field label='活用类型' value={draft.conjugationType || ''} onChange={value => set('conjugationType', value || null)} placeholder='五段、上一段…' />
          <Field label='标签（逗号或换行）' value={draft.tags.join('\n')} onChange={value => set('tags', splitLines(value))} multiline rows={2} />
        </div>
        <Field label='词书释义（每行一条）' value={draft.meanings.join('\n')} onChange={value => set('meanings', splitLines(value))} multiline rows={3} />
      </section>

      <section className={sectionClass}>
        <div className='vocab-inspector-section-head'><h3>所属单词本</h3><span>{draft.wordbookIds.length} 本</span></div>
        <div className='vocab-inspector-memberships'>
          {data.availableWordbooks.map(wordbook => <label key={wordbook.id}><input type='checkbox' checked={draft.wordbookIds.includes(wordbook.id)} onChange={event => set('wordbookIds', event.currentTarget.checked ? [...draft.wordbookIds, wordbook.id] : draft.wordbookIds.filter(id => id !== wordbook.id))} /><span>{wordbook.label}</span></label>)}
        </div>
      </section>

      <section className={sectionClass}>
        <div className='vocab-inspector-section-head'><h3>义项</h3><button type='button' className='vocab-inspector-link-button' onClick={addSense}>＋添加义项</button></div>
        <div className='vocab-inspector-sense-tabs'>
          {draft.senses.map((sense, index) => <button type='button' key={sense.id} aria-pressed={sense.id === activeSense?.id} onClick={() => setActiveSenseId(sense.id)}>{senseLabel(sense, index)}</button>)}
        </div>
        {!activeSense ? <p className='vocab-inspector-empty'>请添加一个义项。</p> : (
          <div className='vocab-inspector-sense-summary'><span>当前义项内容可在下方各组中按义项调整</span><button type='button' className='vocab-inspector-link-button' onClick={() => { if (draft.senses.length <= 1) return; const next = draft.senses.filter(sense => sense.id !== activeSense.id); setDraft(current => ({ ...current, senses: next, definitions: current.definitions.map(item => item.senseId === activeSense.id ? { ...item, senseId: next[0]?.id || null } : item), sentences: current.sentences.map(item => item.senseId === activeSense.id ? { ...item, senseId: next[0]?.id || null } : item), patterns: current.patterns.map(item => item.senseId === activeSense.id ? { ...item, senseId: next[0]?.id || null } : item), expressions: current.expressions.map(item => item.senseId === activeSense.id ? { ...item, senseId: next[0]?.id || null } : item), relations: current.relations.map(item => item.senseId === activeSense.id ? { ...item, senseId: next[0]?.id || null } : item), notes: current.notes.map(item => item.senseId === activeSense.id ? { ...item, senseId: next[0]?.id || null } : item) })); setActiveSenseId(next[0]?.id || '') }} disabled={draft.senses.length <= 1}>删除当前义项</button></div>
        )}
      </section>

      <FlatDefinitions senses={draft.senses} items={draft.definitions} onAdd={addDefinition} onChange={(index, patch) => patchFlat('definitions', index, patch)} onRemove={index => set('definitions', draft.definitions.filter((_, itemIndex) => itemIndex !== index))} />
      <FlatSentences senses={draft.senses} items={draft.sentences} onAdd={addSentence} onChange={(index, patch) => patchFlat('sentences', index, patch)} onRemove={index => set('sentences', draft.sentences.filter((_, itemIndex) => itemIndex !== index))} />
      <FlatPatterns senses={draft.senses} items={draft.patterns} onAdd={addPattern} onChange={(index, patch) => patchFlat('patterns', index, patch)} onRemove={index => set('patterns', draft.patterns.filter((_, itemIndex) => itemIndex !== index))} />
      <FlatExpressions senses={draft.senses} items={draft.expressions} onAdd={addExpression} onChange={(index, patch) => patchFlat('expressions', index, patch)} onRemove={index => set('expressions', draft.expressions.filter((_, itemIndex) => itemIndex !== index))} />
      <FlatRelations senses={draft.senses} items={draft.relations} onAdd={() => addRelation(activeSense?.id || null)} onChange={(index, patch) => patchFlat('relations', index, patch)} onRemove={index => set('relations', draft.relations.filter((_, itemIndex) => itemIndex !== index))} />
      <FlatNotes senses={draft.senses} items={draft.notes} onAdd={addNote} onChange={(index, patch) => patchFlat('notes', index, patch)} onRemove={index => set('notes', draft.notes.filter((_, itemIndex) => itemIndex !== index))} />
    </div>
  )
}

function SectionHeader({ title, count, onAdd }: { title: string; count: number; onAdd: () => void }) {
  return <div className='vocab-inspector-section-head'><h3>{title} <span>{count}</span></h3><button type='button' className='vocab-inspector-link-button' onClick={onAdd}>＋添加</button></div>
}

function FlatDefinitions({ senses, items, onAdd, onChange, onRemove }: { senses: Draft['senses']; items: Definition[]; onAdd: () => void; onChange: (index: number, patch: Partial<Definition>) => void; onRemove: (index: number) => void }) {
  return <section className={sectionClass}><SectionHeader title='定义 / 释义' count={items.length} onAdd={onAdd} /><div className='vocab-inspector-item-list'>{items.map((item, index) => <div className='vocab-inspector-item' key={item.id || `definition-${index}`}><div className='vocab-inspector-grid vocab-inspector-grid-2'><SelectField label='语言' value={item.language} options={([['zh', '中文'], ['ja', '日本語'], ['en', 'English']] as const)} onChange={value => onChange(index, { language: value })} /><Field label='辞典 / 来源' value={item.dictionaryName} onChange={value => onChange(index, { dictionaryName: value })} /></div><Field label='内容' value={item.definition} onChange={value => onChange(index, { definition: value })} multiline rows={2} /><SensePicker senses={senses} value={item.senseId} onChange={value => onChange(index, { senseId: value })} /><ItemActions index={index} length={items.length} onMove={() => {}} onRemove={() => onRemove(index)} /></div>)}</div></section>
}

function FlatSentences({ senses, items, onAdd, onChange, onRemove }: { senses: Draft['senses']; items: Sentence[]; onAdd: () => void; onChange: (index: number, patch: Partial<Sentence>) => void; onRemove: (index: number) => void }) {
  return <section className={sectionClass}><SectionHeader title='例句' count={items.length} onAdd={onAdd} /><div className='vocab-inspector-item-list'>{items.map((item, index) => <div className='vocab-inspector-item' key={item.id || `sentence-${index}`}><Field label='例句' value={item.text} onChange={value => onChange(index, { text: value })} multiline rows={2} /><Field label='翻译' value={item.translation || ''} onChange={value => onChange(index, { translation: value || null })} /><div className='vocab-inspector-grid vocab-inspector-grid-2'><Field label='来源' value={item.source} onChange={value => onChange(index, { source: value })} /><Field label='来源 URL' value={item.sourceUrl} onChange={value => onChange(index, { sourceUrl: value })} /><Field label='音频路径' value={item.audioFile || ''} onChange={value => onChange(index, { audioFile: value || null })} /><Field label='词性标签（逗号分隔）' value={(item.posTags || []).join(', ')} onChange={value => onChange(index, { posTags: splitLines(value) })} /></div><SensePicker senses={senses} value={item.senseId} onChange={value => onChange(index, { senseId: value })} /><ItemActions index={index} length={items.length} onMove={() => {}} onRemove={() => onRemove(index)} /></div>)}</div></section>
}

function FlatPatterns({ senses, items, onAdd, onChange, onRemove }: { senses: Draft['senses']; items: Pattern[]; onAdd: () => void; onChange: (index: number, patch: Partial<Pattern>) => void; onRemove: (index: number) => void }) {
  return <section className={sectionClass}><SectionHeader title='用法模式' count={items.length} onAdd={onAdd} /><div className='vocab-inspector-item-list'>{items.map((item, index) => <div className='vocab-inspector-item' key={item.id || `pattern-${index}`}><Field label='模式' value={item.text} onChange={value => onChange(index, { text: value })} /><Field label='说明' value={item.meaning || ''} onChange={value => onChange(index, { meaning: value || null })} /><SensePicker senses={senses} value={item.senseId} onChange={value => onChange(index, { senseId: value })} /><ItemActions index={index} length={items.length} onMove={() => {}} onRemove={() => onRemove(index)} /></div>)}</div></section>
}

function FlatExpressions({ senses, items, onAdd, onChange, onRemove }: { senses: Draft['senses']; items: Expression[]; onAdd: () => void; onChange: (index: number, patch: Partial<Expression>) => void; onRemove: (index: number) => void }) {
  return <section className={sectionClass}><SectionHeader title='表达 / 搭配' count={items.length} onAdd={onAdd} /><div className='vocab-inspector-item-list'>{items.map((item, index) => <div className='vocab-inspector-item' key={item.id || `expression-${index}`}><div className='vocab-inspector-grid vocab-inspector-grid-2'><SelectField label='类型' value={item.type} options={EXPRESSION_TYPE_OPTIONS} onChange={value => onChange(index, { type: value as Expression['type'] })} /><Field label='读音' value={item.reading || ''} onChange={value => onChange(index, { reading: value || null })} /></div><Field label='表达' value={item.text} onChange={value => onChange(index, { text: value })} /><Field label='释义' value={item.meaning || ''} onChange={value => onChange(index, { meaning: value || null })} /><SensePicker senses={senses} value={item.senseId} onChange={value => onChange(index, { senseId: value })} /><ItemActions index={index} length={items.length} onMove={() => {}} onRemove={() => onRemove(index)} /></div>)}</div></section>
}

function RelationRow({ relation, senses, index, length, onChange, onRemove, onMove }: { relation: Relation; senses: Draft['senses']; index: number; length: number; onChange: (patch: Partial<Relation>) => void; onRemove: () => void; onMove: (delta: -1 | 1) => void }) {
  return <div className='vocab-inspector-item'><div className='vocab-inspector-grid vocab-inspector-grid-2'><SelectField label='关系' value={relation.type} options={RELATION_TYPE_OPTIONS} onChange={value => onChange({ type: value as Relation['type'] })} /><Field label='目标词' value={relation.targetText} onChange={value => onChange({ targetText: value, targetVocabularyId: null })} /><Field label='目标读音' value={relation.targetReading || ''} onChange={value => onChange({ targetReading: value || null })} /><Field label='关联 ID（可选）' value={relation.targetVocabularyId || ''} onChange={value => onChange({ targetVocabularyId: value || null })} /></div>{relation.type === 'related' ? <Field label='助词' value={relation.marker || ''} onChange={value => onChange({ marker: value || null })} /> : null}{['compound', 'derived', 'collocation'].includes(relation.type) ? <Field label='构词 / 搭配模式' value={relation.pattern || ''} onChange={value => onChange({ pattern: value || null })} /> : null}<SensePicker senses={senses} value={relation.senseId} allowNone onChange={value => onChange({ senseId: value })} /><ItemActions index={index} length={length} onMove={onMove} onRemove={onRemove} /></div>
}

function FlatRelations({ senses, items, onAdd, onChange, onRemove }: { senses: Draft['senses']; items: Relation[]; onAdd: () => void; onChange: (index: number, patch: Partial<Relation>) => void; onRemove: (index: number) => void }) {
  return <section className={sectionClass}><SectionHeader title='义项关联词' count={items.length} onAdd={onAdd} /><div className='vocab-inspector-item-list'>{items.map((item, index) => <RelationRow key={item.id || `relation-${index}`} relation={item} senses={senses} index={index} length={items.length} onChange={patch => onChange(index, patch)} onRemove={() => onRemove(index)} onMove={() => {}} />)}</div></section>
}

function FlatNotes({ senses, items, onAdd, onChange, onRemove }: { senses: Draft['senses']; items: Note[]; onAdd: () => void; onChange: (index: number, patch: Partial<Note>) => void; onRemove: (index: number) => void }) {
  return <section className={sectionClass}><SectionHeader title='使用备注' count={items.length} onAdd={onAdd} /><div className='vocab-inspector-item-list'>{items.map((item, index) => <div className='vocab-inspector-item' key={item.id || `note-${index}`}><SelectField label='类型' value={item.type} options={USAGE_NOTE_TYPE_OPTIONS} onChange={value => onChange(index, { type: value as Note['type'] })} /><Field label='备注' value={item.text} onChange={value => onChange(index, { text: value })} multiline rows={2} /><SensePicker senses={senses} value={item.senseId} onChange={value => onChange(index, { senseId: value })} /><ItemActions index={index} length={items.length} onMove={() => {}} onRemove={() => onRemove(index)} /></div>)}</div></section>
}
