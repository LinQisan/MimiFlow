'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  LearningPointCategory,
  LearningRecordKind,
  SourceType,
} from '@prisma/client'

import { findLearningRecordsForSelection, saveLearningRecord } from '@/modules/knowledge/learning-records/actions'
import LearningRecordFields from '@/modules/knowledge/learning-records/components/LearningRecordFields'
import { saveVocabulary } from '@/modules/knowledge/vocabulary/actions'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import type { VocabularyInspectorMetaUpdate } from '@/modules/knowledge/vocabulary/domain/inspector-meta'
import LearningRecordItem from '@/modules/knowledge/learning-records/components/LearningRecordItem'
import VocabularyWordbookInspector from '@/modules/knowledge/vocabulary/components/VocabularyWordbookInspector'
import { getVocabularyInspectorData } from '@/modules/knowledge/vocabulary/inspector-actions'
import WordAudioButton from '@/modules/knowledge/vocabulary/components/WordAudioButton'

import SelectionAttributeEditor from '@/modules/knowledge/vocabulary/components/SelectionAttributeEditor'

const POS_OPTIONS = ['名词', '动词', '形容词', '副词', '助词', '接续词']
const BASE_INPUT_CLASS =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-100 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700'
const LABEL_CLASS = 'text-xs font-bold text-slate-700 dark:text-slate-300'

type RecordMode = 'attribute' | 'word' | 'learning-point' | 'sentence'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const splitListInput = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const splitPronunciationInput = (value: string) =>
  Array.from(
    new Set(
      value
        .split(/[\/／\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

const defaultModeForSelection = (detectedWord: unknown): RecordMode =>
  detectedWord ? 'word' : 'learning-point'

export default function WordTooltip({
  word,
  x,
  y,
  isTop = true,
  contextSentence,
  sourceType,
  sourceId,
  initialMeta,
  detectedWord,
  onClose,
  onSaved,
}: {
  word: string
  x: number
  y: number
  isTop?: boolean
  contextSentence: string
  sourceType: SourceType
  sourceId: string
  initialMeta?: VocabularyMeta
  detectedWord?: {
    surface: string
    dictionaryForm: string
    normalizedForm: string
    reading: string
    partOfSpeech: string
  } | null
  onClose?: () => void
  onSaved?: (payload: VocabularyInspectorMetaUpdate) => void
}) {
  const [savedWord, setSavedWord] = useState<string | null>(null)
  const [existingWord, setExistingWord] = useState<string | null>(null)
  const [records, setRecords] = useState<Array<Extract<Awaited<ReturnType<typeof findLearningRecordsForSelection>>, { success: true }>['records'][number]>>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [revision, setRevision] = useState(0)
  const [draftDirty, setDraftDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [mode, setMode] = useState<RecordMode>(() =>
    defaultModeForSelection(detectedWord),
  )
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [headwordValue, setHeadwordValue] = useState('')
  const [pronunciationValue, setPronunciationValue] = useState('')
  const [meaningValue, setMeaningValue] = useState('')
  const [partOfSpeechValue, setPartOfSpeechValue] = useState('')
  const [sentenceText, setSentenceText] = useState(contextSentence || word)
  const selectionIdentityRef = useRef('')
  const [pointTitle, setPointTitle] = useState('')
  const [fragmentsValue, setFragmentsValue] = useState('')
  const [pointNote, setPointNote] = useState('')
  const [category, setCategory] = useState<LearningPointCategory>(
    LearningPointCategory.GRAMMAR,
  )
  const popupRef = useRef<HTMLDivElement>(null)
  const primaryInputRef = useRef<HTMLInputElement>(null)
  const contextId = useId()
  const [popupHeight, setPopupHeight] = useState(42)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
  }))

  useEffect(() => {
    const identity = JSON.stringify([word, sourceType, sourceId, contextSentence])
    if (selectionIdentityRef.current === identity) return
    selectionIdentityRef.current = identity
    setSavedWord(null)
    setSentenceText(contextSentence || word)
    const detectedHeadword = detectedWord?.dictionaryForm?.trim() || word
    setPanelOpen(false)
    setDraftDirty(false)
    setMode(defaultModeForSelection(detectedWord))
    setSaveState('idle')
    setStatusMessage('')
    setHeadwordValue(detectedHeadword)
    setPronunciationValue(
      (initialMeta?.pronunciations || []).join(' / ') || detectedWord?.reading || '',
    )
    setPartOfSpeechValue(
      initialMeta?.partsOfSpeech?.[0] || detectedWord?.partOfSpeech || '',
    )
    setMeaningValue((initialMeta?.meanings || []).join('; '))
    setPointTitle(word)
    setFragmentsValue(word)
    setPointNote('')
    setCategory(LearningPointCategory.GRAMMAR)
  }, [word, sourceType, sourceId, contextSentence, initialMeta, detectedWord])

  useEffect(() => {
    if (!panelOpen) return
    let active = true
    setLoading(true)
    setLoadError('')
    setCreating(false)
    void Promise.all([
      getVocabularyInspectorData(savedWord || detectedWord?.dictionaryForm?.trim() || word),
      findLearningRecordsForSelection({ sourceType, sourceId, selection: word, contextSentence }),
    ]).then(([vocabulary, learning]) => {
      if (!active) return
      if (!learning.success) { setLoadError(learning.message); return }
      setExistingWord(vocabulary.success ? vocabulary.data.word : null)
      setRecords(learning.records)
    }).catch(() => { if (active) setLoadError('已有定义加载失败，请重试。') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [panelOpen, word, savedWord, detectedWord?.dictionaryForm, sourceType, sourceId, contextSentence, revision])

  const cancelCreation = useCallback(() => {
    setHeadwordValue(detectedWord?.dictionaryForm?.trim() || word)
    setPronunciationValue((initialMeta?.pronunciations || []).join(' / ') || detectedWord?.reading || '')
    setPartOfSpeechValue(initialMeta?.partsOfSpeech?.[0] || detectedWord?.partOfSpeech || '')
    setMeaningValue((initialMeta?.meanings || []).join('; '))
    setPointTitle(word)
    setFragmentsValue(word)
    setSentenceText(contextSentence || word)
    setPointNote('')
    setCategory(LearningPointCategory.GRAMMAR)
    setSaveState('idle')
    setStatusMessage('')
    setPanelOpen(false)
    setCreating(false)
    setDraftDirty(false)
  }, [word, detectedWord, initialMeta, contextSentence])

  const matchingRecords = records.filter(record => record.kind === (mode === 'sentence' ? LearningRecordKind.SENTENCE : LearningRecordKind.LEARNING_POINT))
  const showingExisting = mode !== 'attribute' && !creating && (mode === 'word' ? Boolean(existingWord) : matchingRecords.length > 0)

  const requestClose = useCallback(() => {
    if (popupRef.current?.querySelector('[data-selection-editor="true"]')) {
      setStatusMessage('请先保存或取消当前编辑。')
      return
    }
    onClose?.()
  }, [onClose])

  useLayoutEffect(() => {
    const popup = popupRef.current
    if (!popup) return
    const measure = () => setPopupHeight(popup.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(popup)
    return () => observer.disconnect()
  }, [panelOpen, mode])

  useEffect(() => {
    if (!panelOpen) return
    const frame = window.requestAnimationFrame(() => primaryInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [panelOpen, mode, loading, showingExisting])

  useEffect(() => {
    const updateViewport = () => {
      const visualViewport = window.visualViewport
      setViewport({
        width: visualViewport?.width || window.innerWidth,
        height: visualViewport?.height || window.innerHeight,
        offsetLeft: visualViewport?.offsetLeft || 0,
        offsetTop: visualViewport?.offsetTop || 0,
      })
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('resize', updateViewport)
    window.visualViewport?.addEventListener('scroll', updateViewport)
    return () => {
      window.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('resize', updateViewport)
      window.visualViewport?.removeEventListener('scroll', updateViewport)
    }
  }, [])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saveState === 'saving') return
      if (draftDirty && !showingExisting) { event.preventDefault(); cancelCreation(); return }
      if (popupRef.current?.querySelector('[data-selection-editor="true"]')) return
      event.preventDefault()
      if (panelOpen) setPanelOpen(false)
      else requestClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [panelOpen, requestClose, draftDirty, showingExisting, saveState, cancelCreation])

  const panelWidth = panelOpen ? Math.min(380, viewport.width - 24) : 68
  const viewportPadding = 12
  const minX = viewport.offsetLeft + panelWidth / 2 + viewportPadding
  const maxX = viewport.offsetLeft + viewport.width - panelWidth / 2 - viewportPadding
  const clampedX = Math.min(Math.max(x, minX), maxX)
  const viewportBottom = viewport.offsetTop + viewport.height
  const spaceAbove = y - viewport.offsetTop
  const spaceBelow = viewportBottom - y
  const shouldOpenDown =
    spaceBelow >= popupHeight + 16 || (!isTop && spaceBelow >= spaceAbove)
  const topOffset = shouldOpenDown
    ? Math.max(
        viewport.offsetTop + viewportPadding,
        Math.min(y + 12, viewportBottom - popupHeight - viewportPadding),
      )
    : Math.min(
        viewportBottom - viewportPadding,
        Math.max(y - 8, viewport.offsetTop + popupHeight + viewportPadding),
      )

  const saveButton = useMemo(() => {
    if (saveState === 'saving') return { label: '保存中…', disabled: true }
    if (saveState === 'saved') return { label: '已保存', disabled: true }
    if (saveState === 'error') return { label: '重试', disabled: false }
    return { label: '保存', disabled: false }
  }, [saveState])

  const changeMode = (nextMode: RecordMode) => {
    if (popupRef.current?.querySelector('[data-selection-editor="true"]')) {
      setStatusMessage('请先保存或取消当前编辑。')
      return
    }
    setCreating(false)
    setMode(nextMode)
    setSaveState('idle')
    setStatusMessage('')
  }

  const handleSave = async () => {
    if (saveState === 'saving' || saveState === 'saved') return
    setSaveState('saving')
    setStatusMessage('正在保存…')

    try {
      if (mode === 'word') {
        const normalizedHeadword = headwordValue.trim()
        if (!normalizedHeadword) {
          setSaveState('error')
          setStatusMessage('请填写单词或原形。')
          return
        }
        const pronunciations = splitPronunciationInput(pronunciationValue)
        const meanings = splitListInput(meaningValue)
        const partsOfSpeech = splitListInput(partOfSpeechValue)
        const result = await saveVocabulary(
          normalizedHeadword,
          word,
          contextSentence,
          sourceType,
          sourceId,
          pronunciations,
          meanings,
          partsOfSpeech,
        )
        if (
          (result.state === 'success' || result.state === 'already_exists') &&
          result.word &&
          result.meta
        ) {
          setSavedWord(result.word)
          onSaved?.({ word: result.word, meta: result.meta })
          setSaveState('saved')
          setStatusMessage(result.message || '已保存到生词本。')
        } else {
          setSaveState('error')
          setStatusMessage(result.message || '保存失败，请重试。')
          return
        }
      } else {
        const result = await saveLearningRecord({
          kind:
            mode === 'sentence'
              ? LearningRecordKind.SENTENCE
              : LearningRecordKind.LEARNING_POINT,
          category: mode === 'learning-point' ? category : null,
          title: mode === 'sentence' ? pointTitle || contextSentence : pointTitle,
          fragments:
            mode === 'learning-point' ? fragmentsValue.split(/\n+/) : [],
          sentenceText,
          note: pointNote,
          sourceType,
          sourceId,
        })
        if (!result.success) {
          setSaveState('error')
          setStatusMessage(result.message)
          return
        }
        setSaveState('saved')
        setStatusMessage(
          mode === 'sentence' ? '已保存为句子记录。' : result.message,
        )
      }
      window.dispatchEvent(new Event('learning-records-changed'))
      setRevision(value => value + 1)
      setSaveState('idle')
      setDraftDirty(false)
    } catch (error) {
      console.error('Save failed:', error)
      setSaveState('error')
      setStatusMessage('保存失败，请检查连接后重试。')
    }
  }

  return (
    <div
      ref={popupRef}
      data-highlight-ignore='true'
      role={panelOpen ? 'dialog' : undefined}
      aria-label={panelOpen ? `记录所选内容：${word}` : undefined}
      aria-describedby={panelOpen ? contextId : undefined}
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      style={{
        top: topOffset,
        left: clampedX,
        width: panelWidth,
        maxHeight: Math.max(180, viewport.height - viewportPadding * 2),
        transform:
          shouldOpenDown || !isTop ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
      className={`ui-pop fixed z-50 overflow-y-auto overscroll-contain border border-slate-200 bg-white dark:bg-slate-950 dark:text-slate-100 dark:border-slate-700 shadow-2xl transition-[width] ${
        panelOpen ? 'rounded-2xl' : 'rounded-full'
      }`}>
      {!panelOpen ? (
        <button
          type='button'
          onClick={() => setPanelOpen(true)}
          className='flex h-9 w-full items-center justify-center text-xs font-bold text-slate-900 hover:bg-slate-50'>
          划词
        </button>
      ) : (
        <>
          <header className='sticky top-0 z-10 border-b border-slate-100 bg-white dark:bg-slate-950 px-3 pt-3'>
            <div className='flex items-center justify-between gap-3'>
              <div className='min-w-0'>
                <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400'>记录选区</p>
                <div className='mt-0.5 flex min-w-0 items-center gap-1'>
                  <p className='max-w-[15rem] truncate text-sm font-bold text-slate-950 dark:text-slate-100'>{word}</p>
                  <WordAudioButton
                    key={initialMeta?.wordAudio || 'no-word-audio'}
                    audioFile={initialMeta?.wordAudio}
                    word={word}
                    className='size-7'
                  />
                </div>
              </div>
              <button
                type='button'
                onClick={requestClose}
                aria-label='关闭记录面板'
                className='flex size-8 items-center justify-center rounded-full text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900'>
                ×
              </button>
            </div>
            <p role='status' className='text-xs text-slate-500'>{statusMessage}</p>
            <div className='mt-3 grid grid-cols-4 gap-1' role='tablist' aria-label='记录层级'>
              {[
                { value: 'word' as const, label: '单词' },
                { value: 'attribute' as const, label: '搭配 / 关联' },
                { value: 'learning-point' as const, label: '学习点' },
                { value: 'sentence' as const, label: '句子' },
              ].map(item => (
                <button
                  key={item.value}
                  type='button'
                  role='tab'
                  disabled={loading || saveState === 'saving'}
                  aria-selected={mode === item.value}
                  onClick={() => changeMode(item.value)}
                  className={`border-b-2 px-2 py-2 text-xs font-bold transition ${
                    mode === item.value
                      ? 'border-slate-900 text-slate-950 dark:border-slate-100 dark:text-slate-100'
                      : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}>
                  {item.label}{!loading && item.value !== 'attribute' && (item.value === 'word' ? existingWord : records.some(record => record.kind === (item.value === 'sentence' ? LearningRecordKind.SENTENCE : LearningRecordKind.LEARNING_POINT))) ? ' · 已有' : ''}
                </button>
              ))}
            </div>
          </header>

          {mode === 'attribute' ? <SelectionAttributeEditor key={word + sourceId} text={word} contextSentence={contextSentence} sourceType={sourceType} sourceId={sourceId} onCancel={() => { setMode(defaultModeForSelection(detectedWord)); setStatusMessage('') }} /> : loading || loadError ? <div className='p-4 text-sm' role='status'>
            {loading ? '正在匹配已有定义…' : loadError}
            {loadError ? <button className='ui-btn mt-3' onClick={() => setRevision(value => value + 1)}>重试</button> : null}
          </div> : showingExisting ? (
            mode === 'word' && existingWord ? <VocabularyWordbookInspector
              embedded word={existingWord} matchedVariant={word} x={x} y={y}
              onClose={() => setPanelOpen(false)}
              onSaved={payload => {
                if (payload.previousWord && payload.previousWord !== payload.word) {
                  setSavedWord(payload.word)
                  setExistingWord(payload.word)
                }
                onSaved?.(payload)
              }}
              onDeleted={() => { setSavedWord(null); setExistingWord(null); setRevision(value => value + 1) }}
            /> : <div className='px-4'>
              {matchingRecords.map(record => <LearningRecordItem compact key={record.id} record={{ ...record, sourceHref: null, updatedAtLabel: '已保存' }} onChanged={() => setRevision(value => value + 1)} />)}
              <button type='button' className='ui-btn mb-3' onClick={() => { if (popupRef.current?.querySelector('[data-selection-editor="true"]')) { setStatusMessage('请先保存或取消当前编辑。'); return }; setCreating(true) }}>另建{mode === 'sentence' ? '句子' : '学习点'}</button>
            </div>
          ) : <div data-selection-editor={draftDirty || saveState === 'saving' ? 'true' : undefined} onChange={() => setDraftDirty(true)} onKeyDown={event => { if (event.key === 'Escape' && saveState !== 'saving') { event.stopPropagation(); cancelCreation() } }} className='space-y-4 px-4 py-4'>
            <p id={contextId} className='rounded-lg bg-slate-50 dark:bg-slate-900 dark:text-slate-300 px-3 py-2 text-xs leading-5 text-slate-600'>
              {contextSentence || word}
            </p>

            {mode === 'word' ? (
              <>
                <label className='block space-y-1.5'>
                  <span className={LABEL_CLASS}>单词 / 原形</span>
                  <input ref={primaryInputRef} value={headwordValue} onChange={event => setHeadwordValue(event.target.value)} className={BASE_INPUT_CLASS} />
                </label>
                <label className='block space-y-1.5'>
                  <span className={LABEL_CLASS}>读音 / 注音</span>
                  <input value={pronunciationValue} onChange={event => setPronunciationValue(event.target.value)} placeholder='多个读音用 / 分隔' className={BASE_INPUT_CLASS} />
                </label>
                <section className='space-y-2'>
                  <span className={LABEL_CLASS}>词性</span>
                  <div className='flex flex-wrap gap-1.5'>
                    {POS_OPTIONS.map(option => (
                      <button
                        key={option}
                        type='button'
                        onClick={() => { setPartOfSpeechValue(current => current === option ? '' : option); setDraftDirty(true) }}
                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                          partOfSpeechValue === option
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 text-slate-500'
                        }`}>
                        {option}
                      </button>
                    ))}
                  </div>
                  <input value={partOfSpeechValue} onChange={event => setPartOfSpeechValue(event.target.value)} placeholder='或手动输入' className={BASE_INPUT_CLASS} />
                </section>
                <label className='block space-y-1.5'>
                  <span className={LABEL_CLASS}>释义</span>
                  <input value={meaningValue} onChange={event => setMeaningValue(event.target.value)} placeholder='多个释义用分号分隔' className={BASE_INPUT_CLASS} />
                </label>
              </>
            ) : (
              <LearningRecordFields kind={mode === 'sentence' ? LearningRecordKind.SENTENCE : LearningRecordKind.LEARNING_POINT}
                value={{ title: pointTitle, category, fragments: fragmentsValue, sentenceText, note: pointNote }}
                onChange={next => {
                  setPointTitle(next.title)
                  setCategory(next.category)
                  setFragmentsValue(next.fragments)
                  setSentenceText(next.sentenceText)
                  setPointNote(next.note)
                  setDraftDirty(true)
                }} />
            )}

            <div className='sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white py-3 dark:bg-slate-950'>
              <p
                aria-live='polite'
                className={`min-h-4 text-[11px] font-semibold ${
                  saveState === 'error'
                    ? 'text-rose-700'
                    : saveState === 'saved'
                      ? 'text-emerald-700'
                      : 'text-slate-500'
                }`}>
                {statusMessage}
              </p>
              <button type='button' className='ui-btn' disabled={saveState === 'saving'} onClick={cancelCreation}>取消</button>
              <button
                type='button'
                onClick={handleSave}
                disabled={saveButton.disabled}
                className='h-9 shrink-0 rounded-lg bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-200 disabled:text-slate-500'>
                {saveButton.label}
              </button>
            </div>
          </div>}
        </>
      )}
    </div>
  )
}
