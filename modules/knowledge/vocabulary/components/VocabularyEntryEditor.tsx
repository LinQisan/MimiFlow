'use client'

import Link from 'next/link'
import {
  parseVocabularyEntryJson,
  serializeVocabularyEntry,
} from '../domain/entry-json'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import CustomSelect from '@/components/ui/CustomSelect'
import type {
  VocabItem,
  VocabularyRelationItem,
  VocabularySenseItem,
} from '../types'
import {
  EXPRESSION_TYPE_OPTIONS,
  RELATION_TYPE_OPTIONS,
  USAGE_NOTE_TYPE_OPTIONS,
  inferStructuredPartOfSpeech,
  structuredPartOfSpeechLabel,
  type VocabularyEntryDraft,
} from '../domain/entry'
import {
  groupVocabularyRelationsForDisplay,
  normalizeRelationMetadata,
  relationReadingPattern,
  relationUsesPattern,
} from '../domain/relations'
import { saveVocabularyEntryDraft } from '../entry-actions'
import VocabularyRelationWord from './VocabularyRelationWord'

type DraftSense = VocabularyEntryDraft['senses'][number]
type DraftRelation = VocabularyEntryDraft['relations'][number]

const fieldClass =
  'min-h-8 w-full border-0 border-transparent bg-transparent px-0.5 py-1 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-300 hover:border-slate-200 focus:border-slate-400 focus:ring-0'
const subtleButton =
  'inline-flex min-h-7 items-center text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-700 disabled:opacity-50'
const quietDeleteButton =
  'text-[11px] font-medium text-slate-300 transition-colors hover:text-rose-600 focus-visible:text-rose-600 focus-visible:outline-none'

let clientIdSequence = 0

/**
 * Generate an ID for a newly-created draft entity.
 *
 * This is intentionally only called from user events. Missing IDs while
 * normalizing server data use makeLegacyDraftId below so render stays pure
 * and hydration does not depend on browser randomness.
 */
export function makeVocabularyClientId(prefix: string) {
  const cryptoApi =
    typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined
  let suffix: string | undefined

  if (typeof cryptoApi?.randomUUID === 'function') {
    try {
      suffix = cryptoApi.randomUUID()
    } catch {
      // Some browsers expose randomUUID but reject it outside a secure context.
    }
  }

  if (!suffix && typeof cryptoApi?.getRandomValues === 'function') {
    try {
      suffix = Array.from(cryptoApi.getRandomValues(new Uint32Array(4)))
        .map(value => value.toString(16).padStart(8, '0'))
        .join('')
    } catch {
      // Fall through to the monotonic local fallback.
    }
  }

  if (!suffix) {
    suffix = `${Date.now().toString(36)}-${(clientIdSequence++).toString(36)}`
  }

  return `${prefix}-${suffix}`
}

const makeLegacyDraftId = (prefix: string, scope: string, index: number) =>
  `legacy-${prefix}-${encodeURIComponent(scope)}-${index}`

const exampleKey = (example: {
  text: string
  translation?: string | null
  sourceUrl?: string | null
}) =>
  [example.text, example.translation || '', example.sourceUrl || '#'].join(
    '\u0000',
  )

function toVocabularyEntryDraft(vocabulary: VocabItem): VocabularyEntryDraft {
  const senses = vocabulary.senses?.length
    ? vocabulary.senses
    : [
        {
          id: makeLegacyDraftId('sense', vocabulary.id, 0),
          order: 0,
          definitions: (vocabulary.meanings || ['']).map((text, index) => ({
            id: makeLegacyDraftId('definition', vocabulary.id, index),
            language: 'zh',
            text,
          })),
          examples: vocabulary.sentences,
          patterns: [],
          expressions: [],
          relations: [],
          notes: [],
        } satisfies VocabularySenseItem,
      ]

  const draftSenses = senses.map(sense => ({
    id: sense.id,
    definitions: (() => {
      const chineseDefinitions = sense.definitions.filter(item =>
        /^zh(?:-|$)/i.test(item.language),
      )
      return (
        chineseDefinitions.length > 0
          ? chineseDefinitions
          : [
              {
                id: makeLegacyDraftId('definition', sense.id, 0),
                language: 'zh',
                text: '',
              },
            ]
      ).map((item, definitionIndex) => ({
        ...item,
        id:
          item.id || makeLegacyDraftId('definition', sense.id, definitionIndex),
      }))
    })(),
    examples: sense.examples.map((example, exampleIndex) => ({
      id: example.id || makeLegacyDraftId('example', sense.id, exampleIndex),
      text: example.text,
      translation: example.translation || '',
      source: example.source || '手动录入',
      sourceUrl: example.sourceUrl || '#',
      posTags: example.posTags || [],
    })),
    patterns: sense.patterns.map((item, itemIndex) => ({
      ...item,
      id: item.id || makeLegacyDraftId('pattern', sense.id, itemIndex),
    })),
    expressions: sense.expressions.map((item, itemIndex) => ({
      ...item,
      id: item.id || makeLegacyDraftId('expression', sense.id, itemIndex),
    })),
    relations: sense.relations.map((item, itemIndex) => ({
      id: item.id || makeLegacyDraftId('relation', sense.id, itemIndex),
      type: item.type,
      targetVocabularyId: item.targetVocabularyId || null,
      targetText: item.targetText,
      targetReading: item.targetReading || '',
      marker: item.marker || '',
      pattern: item.pattern || '',
    })),
    notes: sense.notes.map((item, itemIndex) => ({
      ...item,
      id: item.id || makeLegacyDraftId('note', sense.id, itemIndex),
    })),
  }))
  const assignedExampleIds = new Set(
    draftSenses.flatMap(sense => sense.examples.map(example => example.id)),
  )
  const assignedExampleKeys = new Set(
    draftSenses.flatMap(sense => sense.examples.map(exampleKey)),
  )
  const unassignedExamples = vocabulary.sentences.flatMap(
    (example, sentenceIndex) => {
      if (example.id && assignedExampleIds.has(example.id)) return []
      if (assignedExampleKeys.has(exampleKey(example))) return []
      return [
        {
          id:
            example.id ||
            makeLegacyDraftId('example', vocabulary.id, sentenceIndex),
          text: example.text,
          translation: example.translation || '',
          source: example.source || '手动录入',
          sourceUrl: example.sourceUrl || '#',
          posTags: example.posTags || [],
        },
      ]
    },
  )
  if (draftSenses.length > 0 && unassignedExamples.length > 0) {
    draftSenses[0] = {
      ...draftSenses[0],
      examples: [...draftSenses[0].examples, ...unassignedExamples],
    }
  }

  return {
    vocabularyId: vocabulary.id,
    word: vocabulary.word,
    reading: vocabulary.pronunciation || vocabulary.pronunciations?.[0] || '',
    etymologies: vocabulary.etymologies || [],
    grammarPartOfSpeech:
      vocabulary.grammarPartOfSpeech ||
      inferStructuredPartOfSpeech(vocabulary.partsOfSpeech || []),
    transitivity: vocabulary.transitivity || null,
    conjugationType: vocabulary.conjugationType || '',
    tags: [...(vocabulary.tags || [])],
    senses: draftSenses,
    relations: (vocabulary.relations || []).map(item => ({
      id: item.id,
      type: item.type,
      targetVocabularyId: item.targetVocabularyId || null,
      targetText: item.targetText,
      targetReading: item.targetReading || '',
      marker: item.marker || '',
      pattern: item.pattern || '',
    })),
  }
}

const draftRelation = (relation: VocabularyRelationItem): DraftRelation => ({
  id: relation.id,
  type: relation.type,
  targetVocabularyId: relation.targetVocabularyId || null,
  targetText: relation.targetText,
  targetReading: relation.targetReading || '',
  marker: relation.marker || '',
  pattern: relation.pattern || '',
})

function vocabularyDraftToPreview(
  vocabulary: VocabItem,
  draft: VocabularyEntryDraft,
): VocabItem {
  const originalExamples = new Map(
    vocabulary.sentences
      .filter(example => Boolean(example.id))
      .map(example => [example.id as string, example]),
  )
  const senses: VocabularySenseItem[] = draft.senses.map(
    (sense, senseIndex) => ({
      id: sense.id,
      order: senseIndex,
      definitions: sense.definitions.map(definition => ({ ...definition })),
      examples: sense.examples.map(example => ({
        ...originalExamples.get(example.id),
        id: example.id,
        text: example.text,
        translation: example.translation || null,
        source: example.source,
        sourceUrl: example.sourceUrl,
        meaningIndex: senseIndex,
        senseId: sense.id,
        posTags: example.posTags || [],
      })),
      patterns: sense.patterns.map(pattern => ({ ...pattern })),
      expressions: sense.expressions.map(expression => ({ ...expression })),
      relations: sense.relations.map(relation => ({ ...relation })),
      notes: sense.notes.map(note => ({ ...note })),
    }),
  )
  const meanings = senses
    .map(
      sense =>
        sense.definitions.find(definition =>
          /^zh(?:-|$)/i.test(definition.language),
        )?.text ||
        sense.definitions[0]?.text ||
        '',
    )
    .filter(Boolean)
  const partOfSpeech = structuredPartOfSpeechLabel(draft.grammarPartOfSpeech)

  return {
    ...vocabulary,
    word: draft.word,
    pronunciation: draft.reading || null,
    pronunciations: draft.reading ? [draft.reading] : [],
    etymologies: draft.etymologies ?? vocabulary.etymologies,
    grammarPartOfSpeech: draft.grammarPartOfSpeech,
    transitivity: draft.transitivity || null,
    conjugationType: draft.conjugationType || null,
    partOfSpeech,
    partsOfSpeech: [partOfSpeech],
    tags: [...draft.tags],
    meanings,
    senses,
    sentences: senses.flatMap(sense => sense.examples),
    relations: draft.relations.map(relation => ({ ...relation })),
  }
}

export function useVocabularyInlineEditor({
  vocabulary,
  enabled,
  onSaved,
}: {
  vocabulary: VocabItem | null
  enabled: boolean
  onSaved?: (vocabulary: VocabItem) => void
}) {
  const initialDraft = useMemo(
    () => (enabled && vocabulary ? toVocabularyEntryDraft(vocabulary) : null),
    [enabled, vocabulary],
  )
  const [draft, setDraft] = useState<VocabularyEntryDraft | null>(null)
  const [jsonText, setJsonText] = useState('')
  const [baselineJson, setBaselineJson] = useState('')
  const [baseline, setBaseline] = useState<VocabularyEntryDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const initializedVocabularyIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !initialDraft) {
      initializedVocabularyIdRef.current = null
      setDraft(null)
      setBaseline(null)
      setJsonText('')
      setBaselineJson('')
      setError('')
      setSaving(false)
      return
    }
    if (initializedVocabularyIdRef.current === initialDraft.vocabularyId) return
    initializedVocabularyIdRef.current = initialDraft.vocabularyId
    setDraft(initialDraft)
    setBaseline(initialDraft)
    setJsonText(serializeVocabularyEntry(initialDraft))
    setBaselineJson(serializeVocabularyEntry(initialDraft))
    setError('')
  }, [enabled, initialDraft])

  const dirty = Boolean(
    (draft && baseline && JSON.stringify(draft) !== JSON.stringify(baseline)) ||
    jsonText !== baselineJson,
  )
  const previewVocabulary = useMemo(
    () =>
      vocabulary && draft
        ? vocabularyDraftToPreview(vocabulary, draft)
        : vocabulary,
    [draft, vocabulary],
  )

  useEffect(() => {
    if (!enabled || !dirty) return
    const warning = '当前词条有未保存修改，确定离开吗？'
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = warning
    }
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a')
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      ) {
        return
      }
      if (!window.confirm(warning)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleDocumentClick, true)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleDocumentClick, true)
    }
  }, [dirty, enabled])

  const updateSense = useCallback(
    (senseIndex: number, updater: (sense: DraftSense) => DraftSense) => {
      setDraft(previous =>
        previous
          ? {
              ...previous,
              senses: previous.senses.map((sense, index) =>
                index === senseIndex ? updater(sense) : sense,
              ),
            }
          : previous,
      )
    },
    [],
  )

  const updateRelations = useCallback((relations: VocabularyRelationItem[]) => {
    setDraft(previous => {
      if (!previous) return previous
      const senseRelationIds = previous.senses.map(
        sense => new Set(sense.relations.map(relation => relation.id)),
      )
      return {
        ...previous,
        relations: relations
          .filter(
            relation => !senseRelationIds.some(ids => ids.has(relation.id)),
          )
          .map(draftRelation),
        senses: previous.senses.map((sense, senseIndex) => ({
          ...sense,
          relations: relations
            .filter(relation => senseRelationIds[senseIndex]?.has(relation.id))
            .map(draftRelation),
        })),
      }
    })
  }, [])

  const addRelation = useCallback((type: DraftRelation['type']) => {
    setDraft(previous =>
      previous
        ? {
            ...previous,
            relations: [
              ...previous.relations,
              {
                id: makeVocabularyClientId('relation'),
                type,
                targetVocabularyId: null,
                targetText: '',
                targetReading: '',
                marker: '',
                pattern: '',
              },
            ],
          }
        : previous,
    )
  }, [])

  const discard = useCallback(() => {
    if (dirty && !window.confirm('当前词条有未保存修改，确定放弃吗？')) {
      return false
    }
    setDraft(null)
    setBaseline(null)
    setError('')
    return true
  }, [dirty])

  const save = useCallback(async () => {
    if (!draft || !vocabulary || saving) return false
    setSaving(true)
    setError('')
    try {
      const parsedDraft = parseVocabularyEntryJson(jsonText, vocabulary.id)
      const result = await saveVocabularyEntryDraft(parsedDraft)
      if (!result.success) {
        setError(result.message || '词条保存失败')
        return false
      }
      const preview = vocabularyDraftToPreview(vocabulary, parsedDraft)
      setDraft(parsedDraft)
      setBaseline(parsedDraft)
      setJsonText(serializeVocabularyEntry(parsedDraft))
      setBaselineJson(serializeVocabularyEntry(parsedDraft))
      onSaved?.(preview)
      return true
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : '词条保存失败，请保留当前内容后重试',
      )
      return false
    } finally {
      setSaving(false)
    }
  }, [draft, jsonText, onSaved, saving, vocabulary])

  return {
    jsonText,
    setJsonText,
    draft,
    setDraft,
    previewVocabulary,
    dirty,
    saving,
    error,
    updateSense,
    updateRelations,
    addRelation,
    discard,
    save,
  }
}

export function VocabularyInlineEditToolbar({
  dirty,
  saving,
  error,
  onCancel,
  onSave,
}: {
  dirty: boolean
  saving: boolean
  error?: string
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <>
      <div className='vocab-flat-section sticky top-2 z-30 mb-4 flex items-center justify-between gap-4 border-slate-200 bg-[#f6f5f1] py-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='text-xs font-semibold tracking-[0.08em] text-slate-600'>
            编辑中
          </span>
          {dirty ? (
            <span className='text-[11px] text-amber-700'>· 未保存修改</span>
          ) : null}
        </div>
        <div className='flex shrink-0 items-center gap-3'>
          <button
            type='button'
            disabled={saving}
            onClick={onCancel}
            className='text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 disabled:opacity-50'>
            取消
          </button>
          <button
            type='button'
            disabled={saving}
            onClick={onSave}
            className='ui-btn ui-btn-primary ui-btn-sm px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50'>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
      {error ? (
        <p
          role='alert'
          className='mb-4 border-l-2 border-rose-300 pl-3 text-sm text-rose-700'>
          {error}
        </p>
      ) : null}
    </>
  )
}

export function InlineEditableText({
  editing,
  value,
  display,
  placeholder = '点击编辑',
  onChange,
  className = '',
  inputClassName = '',
  multiline = false,
  displayTag = 'span',
  ariaLabel,
  onActivate,
}: {
  editing: boolean
  value: string
  display?: ReactNode
  placeholder?: string
  onChange: (value: string) => void
  className?: string
  inputClassName?: string
  multiline?: boolean
  displayTag?: 'span' | 'div'
  ariaLabel?: string
  onActivate?: () => void
}) {
  const [active, setActive] = useState(false)
  const [draftValue, setDraftValue] = useState(value)
  const originalValueRef = useRef(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!active) setDraftValue(value)
  }, [active, value])

  useEffect(() => {
    if (!editing) setActive(false)
  }, [editing])

  useEffect(() => {
    if (!editing || !active) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [active, editing])

  useLayoutEffect(() => {
    if (!active || !multiline) return
    const element = inputRef.current
    if (!(element instanceof HTMLTextAreaElement)) return
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [active, draftValue, multiline])

  const beginEditing = () => {
    if (!editing) return
    originalValueRef.current = value
    setDraftValue(value)
    setActive(true)
    onActivate?.()
  }

  const cancelEditing = () => {
    const original = originalValueRef.current
    setDraftValue(original)
    onChange(original)
    setActive(false)
  }

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
      return
    }
    if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
      event.preventDefault()
      setActive(false)
    }
  }

  if (editing && active) {
    const sharedClassName = `${fieldClass} ${className} ${inputClassName}`
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          aria-label={ariaLabel}
          rows={1}
          onPointerDown={event => event.stopPropagation()}
          value={draftValue}
          placeholder={placeholder}
          onClick={event => event.stopPropagation()}
          onChange={event => {
            setDraftValue(event.currentTarget.value)
            onChange(event.currentTarget.value)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setActive(false)}
          className={`block resize-none overflow-hidden leading-7 ${sharedClassName}`}
        />
      )
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        aria-label={ariaLabel}
        onPointerDown={event => event.stopPropagation()}
        value={draftValue}
        placeholder={placeholder}
        onClick={event => event.stopPropagation()}
        onChange={event => {
          setDraftValue(event.currentTarget.value)
          onChange(event.currentTarget.value)
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setActive(false)}
        className={sharedClassName}
      />
    )
  }

  const Display = displayTag
  const displayContent = value.trim() ? (
    display || value
  ) : (
    <span className='text-slate-300'>{placeholder}</span>
  )
  return (
    <Display
      role={editing ? 'button' : undefined}
      tabIndex={editing ? 0 : undefined}
      aria-label={editing ? ariaLabel : undefined}
      onPointerDown={editing ? event => event.stopPropagation() : undefined}
      onClick={editing ? beginEditing : undefined}
      onKeyDown={
        editing
          ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                beginEditing()
              }
            }
          : undefined
      }
      className={`${className} ${
        editing
          ? 'cursor-text outline-none transition-colors hover:bg-stone-50/80 focus-visible:bg-stone-50/80 focus-visible:ring-1 focus-visible:ring-slate-300'
          : ''
      }`.trim()}>
      {displayContent}
    </Display>
  )
}

export function InlineEditableSelect({
  editing,
  value,
  display,
  options,
  onChange,
  ariaLabel,
}: {
  editing: boolean
  value: string
  display: ReactNode
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  ariaLabel: string
}) {
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (!editing) setActive(false)
  }, [editing])

  if (editing && active) {
    return (
      <CustomSelect
        value={value}
        aria-label={ariaLabel}
        className='!min-h-8 !w-auto !border-0 !bg-transparent !px-1 !py-0 !text-[11px] !font-semibold !text-slate-600 !shadow-none'
        onChange={event => {
          onChange(event.target.value)
          setActive(false)
        }}>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </CustomSelect>
    )
  }

  return (
    <span
      role={editing ? 'button' : undefined}
      tabIndex={editing ? 0 : undefined}
      aria-label={editing ? ariaLabel : undefined}
      onPointerDown={editing ? event => event.stopPropagation() : undefined}
      onClick={editing ? () => setActive(true) : undefined}
      onKeyDown={
        editing
          ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setActive(true)
              }
            }
          : undefined
      }
      className={`inline-flex cursor-text items-center px-1 py-0.5 text-[11px] font-semibold text-slate-600 ${
        editing
          ? 'hover:bg-stone-50/80 focus-visible:bg-stone-50/80 focus-visible:outline-none'
          : ''
      }`}>
      {display}
    </span>
  )
}

function InlineAddButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button type='button' onClick={onClick} className={subtleButton}>
      {children}
    </button>
  )
}

export function moveInlineItem<T extends { id: string }>(
  items: T[],
  id: string,
  delta: number,
) {
  const index = items.findIndex(item => item.id === id)
  const nextIndex = index + delta
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return next
}

export function reorderInlineItems<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string,
) {
  const sourceIndex = items.findIndex(item => item.id === sourceId)
  const targetIndex = items.findIndex(item => item.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(sourceIndex, 1)
  const insertionIndex =
    sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
  next.splice(insertionIndex, 0, item)
  return next
}

export function InlineItemActions({
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
}: {
  onDelete?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}) {
  return (
    <span className='pointer-events-none absolute right-0 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 bg-[#f6f5f1] pl-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100'>
      {onMoveUp ? (
        <button
          type='button'
          aria-label='上移'
          disabled={!canMoveUp}
          onClick={onMoveUp}
          className={quietDeleteButton + ' px-0.5 disabled:opacity-25'}>
          ↑
        </button>
      ) : null}
      {onMoveDown ? (
        <button
          type='button'
          aria-label='下移'
          disabled={!canMoveDown}
          onClick={onMoveDown}
          className={quietDeleteButton + ' px-0.5 disabled:opacity-25'}>
          ↓
        </button>
      ) : null}
      {onDelete ? (
        <button type='button' onClick={onDelete} className={quietDeleteButton}>
          删除
        </button>
      ) : null}
    </span>
  )
}

export function VocabularyDefinitions({
  definitions,
  editing = false,
  onChange,
}: {
  definitions: VocabularySenseItem['definitions']
  editing?: boolean
  onChange?: (definitions: VocabularySenseItem['definitions']) => void
}) {
  const updateDefinition = (id: string, text: string) => {
    onChange?.(
      definitions.map(definition =>
        definition.id === id ? { ...definition, text } : definition,
      ),
    )
  }

  return (
    <div className='vocab-definition-list space-y-1.5'>
      {definitions.map((definition, index) => (
        <div
          key={definition.id}
          draggable={editing}
          onDragStart={event => {
            if (!editing) return
            event.dataTransfer.setData('text/plain', definition.id)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={event => {
            if (!editing) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDrop={event => {
            if (!editing) return
            event.preventDefault()
            const sourceId = event.dataTransfer.getData('text/plain')
            if (!sourceId) return
            onChange?.(reorderInlineItems(definitions, sourceId, definition.id))
          }}
          className='group relative min-w-0'>
          <InlineEditableText
            editing={editing}
            value={definition.text}
            display={
              <span className='vocab-definition-text text-lg font-semibold leading-relaxed text-slate-900'>
                {definition.text}
              </span>
            }
            placeholder={index === 0 ? '中文释义' : '补充释义'}
            ariaLabel={`释义 ${index + 1}`}
            className='text-lg font-semibold leading-relaxed text-slate-900'
            displayTag='div'
            onChange={value => updateDefinition(definition.id, value)}
          />
          {editing ? (
            <InlineItemActions
              onMoveUp={() =>
                onChange?.(moveInlineItem(definitions, definition.id, -1))
              }
              onMoveDown={() =>
                onChange?.(moveInlineItem(definitions, definition.id, 1))
              }
              onDelete={
                definitions.length > 1
                  ? () =>
                      onChange?.(
                        definitions.filter(item => item.id !== definition.id),
                      )
                  : undefined
              }
              canMoveUp={index > 0}
              canMoveDown={index < definitions.length - 1}
            />
          ) : null}
        </div>
      ))}
      {editing ? (
        <InlineAddButton
          onClick={() =>
            onChange?.([
              ...definitions,
              {
                id: makeVocabularyClientId('definition'),
                language: 'zh',
                text: '',
              },
            ])
          }>
          + 添加释义
        </InlineAddButton>
      ) : null}
    </div>
  )
}

export function VocabularySenseDetails({
  sense,
  sourceWord,
  showPronunciation = true,
  showRelations = true,
  editing = false,
  onChange,
}: {
  sense: VocabularySenseItem
  sourceWord?: string
  showPronunciation?: boolean
  showRelations?: boolean
  editing?: boolean
  onChange?: (sense: VocabularySenseItem) => void
}) {
  const expressionGroups = Object.entries(
    Object.groupBy(sense.expressions, expression => expression.type),
  )
  const update = (
    updater: (value: VocabularySenseItem) => VocabularySenseItem,
  ) => {
    onChange?.(updater(sense))
  }

  return (
    <div className='vocab-sense-details mt-4 space-y-4'>
      {(sense.patterns.length > 0 || editing) && (
        <section className='vocab-pattern-section'>
          <h4 className='mb-2 text-[11px] font-semibold tracking-[0.08em] text-slate-400'>
            用法
          </h4>
          <div className='vocab-pattern-list grid gap-x-3 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-[minmax(9rem,11rem)_minmax(0,1fr)]'>
            {sense.patterns.map((item, index) => (
              <div
                key={item.id}
                className='vocab-pattern-row group relative grid min-w-0 grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-baseline gap-x-3 sm:col-span-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]'>
                <InlineEditableText
                  editing={editing}
                  value={item.text}
                  display={
                    <span className='font-reading-body-ja'>{item.text}</span>
                  }
                  placeholder='Nに依存する'
                  ariaLabel='用法搭配'
                  onChange={value =>
                    update(current => ({
                      ...current,
                      patterns: current.patterns.map(pattern =>
                        pattern.id === item.id
                          ? { ...pattern, text: value }
                          : pattern,
                      ),
                    }))
                  }
                />
                {editing || item.meaning?.trim() ? (
                  <InlineEditableText
                    editing={editing}
                    value={item.meaning || ''}
                    display={
                      <span className='text-slate-500'>{item.meaning}</span>
                    }
                    placeholder='依赖于……'
                    ariaLabel='用法中文解释'
                    className='text-slate-500'
                    onChange={value =>
                      update(current => ({
                        ...current,
                        patterns: current.patterns.map(pattern =>
                          pattern.id === item.id
                            ? { ...pattern, meaning: value }
                            : pattern,
                        ),
                      }))
                    }
                  />
                ) : null}
                {editing ? (
                  <InlineItemActions
                    onMoveUp={() =>
                      update(current => ({
                        ...current,
                        patterns: moveInlineItem(current.patterns, item.id, -1),
                      }))
                    }
                    onMoveDown={() =>
                      update(current => ({
                        ...current,
                        patterns: moveInlineItem(current.patterns, item.id, 1),
                      }))
                    }
                    onDelete={() =>
                      update(current => ({
                        ...current,
                        patterns: current.patterns.filter(
                          pattern => pattern.id !== item.id,
                        ),
                      }))
                    }
                    canMoveUp={index > 0}
                    canMoveDown={index < sense.patterns.length - 1}
                  />
                ) : null}
              </div>
            ))}
          </div>
          {editing ? (
            <InlineAddButton
              onClick={() =>
                update(current => ({
                  ...current,
                  patterns: [
                    ...current.patterns,
                    {
                      id: makeVocabularyClientId('pattern'),
                      text: '',
                      meaning: '',
                    },
                  ],
                }))
              }>
              + 添加用法
            </InlineAddButton>
          ) : null}
        </section>
      )}

      {(sense.expressions.length > 0 || editing) && (
        <section aria-label='表达' className='vocab-expression-section space-y-2'>
          {expressionGroups.map(([type, expressions]) => (
            <div key={type} className='vocab-expression-group space-y-1.5'>
              <h4 className='text-xs font-semibold text-slate-500'>
                {
                  EXPRESSION_TYPE_OPTIONS.find(
                    option => option[0] === type,
                  )?.[1]
                }
              </h4>
              <div className='flex flex-col gap-2 text-sm leading-8 text-slate-700'>
                {expressions?.map(item => (
                  <span
                    key={item.id}
                    className='group relative flex flex-wrap items-baseline gap-x-3 gap-y-0'>
                    <InlineEditableText
                      editing={editing}
                      value={item.text}
                      display={
                        <VocabularyRelationWord
                          word={item.text}
                          reading={item.reading}
                          showPronunciation={showPronunciation}
                        />
                      }
                      placeholder='表达内容'
                      ariaLabel='表达内容'
                      className='font-reading-body-ja font-medium'
                      onChange={value =>
                        update(current => ({
                          ...current,
                          expressions: current.expressions.map(expression =>
                            expression.id === item.id
                              ? { ...expression, text: value }
                              : expression,
                          ),
                        }))
                      }
                    />
                    {editing ? (
                      <InlineEditableText
                        editing
                        value={item.reading || ''}
                        display={
                          <span className='text-[11px] text-slate-400'>
                            {item.reading || '读音'}
                          </span>
                        }
                        placeholder='读音'
                        ariaLabel='表达读音'
                        className='text-[11px] text-slate-400'
                        onChange={value =>
                          update(current => ({
                            ...current,
                            expressions: current.expressions.map(expression =>
                              expression.id === item.id
                                ? { ...expression, reading: value }
                                : expression,
                            ),
                          }))
                        }
                      />
                    ) : null}
                    {editing ? (
                      <InlineEditableText
                        editing
                        value={item.meaning || ''}
                        display={
                          <span className='text-xs text-slate-500'>
                            {item.meaning || '释义'}
                          </span>
                        }
                        placeholder='表达释义'
                        ariaLabel='表达释义'
                        className='text-xs text-slate-500'
                        onChange={value =>
                          update(current => ({
                            ...current,
                            expressions: current.expressions.map(expression =>
                              expression.id === item.id
                                ? { ...expression, meaning: value }
                                : expression,
                            ),
                          }))
                        }
                      />
                    ) : item.meaning ? (
                      <span className='text-xs text-slate-500'>
                        {item.meaning}
                      </span>
                    ) : null}
                    {editing ? (
                      <InlineItemActions
                        onMoveUp={() =>
                          update(current => ({
                            ...current,
                            expressions: moveInlineItem(
                              current.expressions,
                              item.id,
                              -1,
                            ),
                          }))
                        }
                        onMoveDown={() =>
                          update(current => ({
                            ...current,
                            expressions: moveInlineItem(
                              current.expressions,
                              item.id,
                              1,
                            ),
                          }))
                        }
                        onDelete={() =>
                          update(current => ({
                            ...current,
                            expressions: current.expressions.filter(
                              expression => expression.id !== item.id,
                            ),
                          }))
                        }
                      />
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {editing ? (
            <InlineAddButton
              onClick={() =>
                update(current => ({
                  ...current,
                  expressions: [
                    ...current.expressions,
                    {
                      id: makeVocabularyClientId('expression'),
                      type: 'collocation',
                      text: '',
                      reading: '',
                      meaning: '',
                    },
                  ],
                }))
              }>
              + 添加表达
            </InlineAddButton>
          ) : null}
        </section>
      )}

      {(sense.notes.length > 0 || editing) && (
        <section className='vocab-note-section pl-4'>
          <h4 className='mb-1 text-[11px] font-semibold tracking-[0.08em] text-slate-400'>
            注意
          </h4>
          <div className='space-y-1'>
            {sense.notes.map((item, index) => (
              <div
                key={item.id}
                className='group relative flex items-start gap-2'>
                {editing ? (
                  <InlineEditableSelect
                    editing
                    value={item.type}
                    display={
                      USAGE_NOTE_TYPE_OPTIONS.find(
                        option => option[0] === item.type,
                      )?.[1] || '一般'
                    }
                    options={USAGE_NOTE_TYPE_OPTIONS.map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    ariaLabel='注意类型'
                    onChange={value =>
                      update(current => ({
                        ...current,
                        notes: current.notes.map(note =>
                          note.id === item.id
                            ? { ...note, type: value as typeof note.type }
                            : note,
                        ),
                      }))
                    }
                  />
                ) : null}
                <InlineEditableText
                  editing={editing}
                  value={item.text}
                  display={
                    <span className='text-sm leading-7 text-slate-600'>
                      {item.text}
                    </span>
                  }
                  placeholder='输入用法限制或语感说明'
                  ariaLabel={`注意 ${index + 1}`}
                  className='min-w-0 flex-1 text-sm leading-7 text-slate-600'
                  multiline
                  onChange={value =>
                    update(current => ({
                      ...current,
                      notes: current.notes.map(note =>
                        note.id === item.id ? { ...note, text: value } : note,
                      ),
                    }))
                  }
                />
                {editing ? (
                  <InlineItemActions
                    onDelete={() =>
                      update(current => ({
                        ...current,
                        notes: current.notes.filter(
                          note => note.id !== item.id,
                        ),
                      }))
                    }
                  />
                ) : null}
              </div>
            ))}
          </div>
          {editing ? (
            <InlineAddButton
              onClick={() =>
                update(current => ({
                  ...current,
                  notes: [
                    ...current.notes,
                    {
                      id: makeVocabularyClientId('note'),
                      type: 'usage',
                      text: '',
                    },
                  ],
                }))
              }>
              + 添加备注
            </InlineAddButton>
          ) : null}
        </section>
      )}

      {showRelations && (sense.relations.length > 0 || editing) ? (
        <div className='vocab-relation-section'>
          <VocabularyRelationDetails
            relations={sense.relations}
            sourceWord={sourceWord}
            showPronunciation={showPronunciation}
            editing={editing}
            onChange={relations =>
              update(current => ({ ...current, relations }))
            }
          />
        </div>
      ) : null}
    </div>
  )
}

export function VocabularyRelationDetails({
  relations,
  sourceWord,
  showPronunciation = true,
  editing = false,
  onChange,
  onAdd,
}: {
  relations: VocabularyRelationItem[]
  sourceWord?: string
  showPronunciation?: boolean
  editing?: boolean
  onChange?: (relations: VocabularyRelationItem[]) => void
  onAdd?: (type: VocabularyRelationItem['type']) => void
}) {
  const groups = groupVocabularyRelationsForDisplay(relations)
  const requiredGroups = [
    { key: 'derived-compound', label: '派生・複合' },
    { key: 'related-synonym', label: '近义与相关' },
  ] as const
  const displayGroups = editing
    ? [
        ...requiredGroups.map(
          required =>
            groups.find(group => group.key === required.key) || {
              ...required,
              items: [] as VocabularyRelationItem[],
            },
        ),
        ...groups.filter(
          group => !requiredGroups.some(required => required.key === group.key),
        ),
      ]
    : groups
  const defaultTypeForGroup = (
    label: string,
    items: VocabularyRelationItem[],
  ) => {
    if (label === '派生・複合') return 'derived' as const
    if (label === '近义与相关') return 'related' as const
    return items[0]?.type || ('related' as const)
  }
  const updateRelation = (next: VocabularyRelationItem) => {
    onChange?.(
      relations.map(relation => (relation.id === next.id ? next : relation)),
    )
  }
  const removeRelation = (id: string) => {
    onChange?.(relations.filter(relation => relation.id !== id))
  }
  const moveRelation = (id: string, delta: number) => {
    onChange?.(moveInlineItem(relations, id, delta))
  }
  const reorderRelation = (sourceId: string, targetId: string) => {
    onChange?.(reorderInlineItems(relations, sourceId, targetId))
  }

  return (
    <div aria-label='関連語彙' className='vocab-relation-details space-y-2'>
      {displayGroups.map(({ key, label, items }) => (
        <div
          key={key}
          className='flex flex-wrap items-baseline gap-x-4 gap-y-2'>
          <span className='shrink-0 text-[11px] font-semibold tracking-[0.04em] text-slate-500'>
            {label}
          </span>
          <div className='flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-2'>
            {items.map(relation =>
              editing ? (
                <InlineRelationItem
                  key={relation.id}
                  relation={relation}
                  showPronunciation={showPronunciation}
                  onChange={updateRelation}
                  onDelete={() => removeRelation(relation.id)}
                  onMoveUp={() => moveRelation(relation.id, -1)}
                  onMoveDown={() => moveRelation(relation.id, 1)}
                  onReorder={sourceId => reorderRelation(sourceId, relation.id)}
                  canMoveUp={
                    relations.findIndex(item => item.id === relation.id) > 0
                  }
                  canMoveDown={
                    relations.findIndex(item => item.id === relation.id) <
                    relations.length - 1
                  }
                />
              ) : (
                <RelationLink
                  key={relation.id}
                  relation={relation}
                  showType={false}
                  sourceWord={sourceWord}
                  showPronunciation={showPronunciation}
                />
              ),
            )}
            {editing && onAdd ? (
              <InlineAddButton
                onClick={() => onAdd(defaultTypeForGroup(label, items))}>
                + 添加
              </InlineAddButton>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function InlineRelationItem({
  relation,
  showPronunciation,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onReorder,
  canMoveUp,
  canMoveDown,
}: {
  relation: VocabularyRelationItem
  showPronunciation: boolean
  onChange: (relation: VocabularyRelationItem) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onReorder: (sourceId: string) => void
  canMoveUp: boolean
  canMoveDown: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const patch = (value: Partial<VocabularyRelationItem>) =>
    onChange({ ...relation, ...value })

  return (
    <div
      draggable
      onDragStart={event => {
        event.dataTransfer.setData('text/plain', relation.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={event => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={event => {
        event.preventDefault()
        const sourceId = event.dataTransfer.getData('text/plain')
        if (sourceId) onReorder(sourceId)
      }}
      className='group relative min-w-0'>
      <div className='flex min-w-0 items-baseline gap-2'>
        <InlineEditableText
          editing
          value={relation.targetText}
          display={
            <VocabularyRelationWord
              word={relation.targetText}
              reading={relation.targetReading}
              showPronunciation={showPronunciation}
            />
          }
          placeholder='输入关联词'
          ariaLabel='关联词词面'
          className='text-sm leading-7 text-slate-700'
          onActivate={() => setExpanded(true)}
          onChange={value =>
            patch({ targetText: value, targetVocabularyId: null })
          }
        />
        <button
          type='button'
          onClick={() => setExpanded(value => !value)}
          className='text-[10px] text-slate-400 opacity-0 transition-opacity hover:text-slate-700 group-hover:opacity-100 focus-visible:opacity-100'>
          {expanded ? '收起' : '详情'}
        </button>
        <InlineItemActions
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
        />
      </div>
      {expanded ? (
        <div className='mt-2 grid gap-x-4 gap-y-1 border-t border-slate-200/70 pt-2 text-[11px] text-slate-400 sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]'>
          <label className='flex items-center gap-2'>
            <span>关系</span>
            <CustomSelect
              value={relation.type}
              aria-label='关联词关系类型'
              className='!min-h-7 !w-auto !border-0 !bg-transparent !px-0 !py-0 !text-[11px] !text-slate-600 !shadow-none'
              onChange={event =>
                onChange(
                  normalizeRelationMetadata({
                    ...relation,
                    type: event.target.value as VocabularyRelationItem['type'],
                  }),
                )
              }>
              {RELATION_TYPE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </CustomSelect>
          </label>
          <label className='flex min-w-0 items-center gap-2'>
            <span className='shrink-0'>读音</span>
            <input
              value={relation.targetReading || ''}
              placeholder='いぞんしょう'
              aria-label='关联词读音'
              onChange={event =>
                patch({ targetReading: event.currentTarget.value })
              }
              className={`${fieldClass} text-slate-500`}
            />
          </label>
          {relation.type === 'related' ? (
            <label className='flex items-center gap-2'>
              <span>助词</span>
              <input
                value={relation.marker || ''}
                placeholder='が'
                aria-label='关联词助词标记'
                onChange={event => patch({ marker: event.currentTarget.value })}
                className={`${fieldClass} w-12 text-slate-500`}
              />
            </label>
          ) : null}
          {relationUsesPattern(relation.type) ? (
            <label className='flex min-w-0 items-center gap-2'>
              <span>{relation.type === 'collocation' ? '搭配' : '构词'}</span>
              <input
                value={relation.pattern || ''}
                placeholder='～症'
                aria-label='关联词构词模式'
                onChange={event =>
                  patch({ pattern: event.currentTarget.value })
                }
                className={`${fieldClass} min-w-0 text-slate-500`}
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function RelationLink({
  relation,
  showType = true,
  sourceWord,
  showPronunciation = true,
}: {
  relation: VocabularyRelationItem
  showType?: boolean
  sourceWord?: string
  showPronunciation?: boolean
}) {
  const label = RELATION_TYPE_OPTIONS.find(
    option => option[0] === relation.type,
  )?.[1]
  const pattern = relationReadingPattern(relation, sourceWord)
  const marker = relation.type === 'related' ? relation.marker?.trim() : ''
  const word = (
    <VocabularyRelationWord
      word={relation.targetText}
      reading={relation.targetReading}
      showPronunciation={showPronunciation}
    />
  )
  return (
    <span className='text-sm leading-7 text-slate-700'>
      {showType ? (
        <span className='mr-2 text-[11px] text-slate-500'>{label}</span>
      ) : null}
      {marker ? (
        <span
          title='教材语法标记'
          className='mr-1 text-[11px] font-normal text-slate-400'>
          {marker}
        </span>
      ) : null}
      {relation.targetVocabularyId ? (
        <Link
          className='underline decoration-slate-300 underline-offset-4 hover:decoration-slate-700'
          href={`/vocabulary?focus=${relation.targetVocabularyId}&view=card`}>
          {word}
        </Link>
      ) : (
        word
      )}
      {pattern ? (
        <span className='ml-3 text-[11px] text-slate-400'>{pattern}</span>
      ) : null}
    </span>
  )
}
