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

import { saveLearningRecord } from '@/modules/knowledge/learning-records/actions'
import { LEARNING_POINT_CATEGORY_LABELS } from '@/modules/knowledge/learning-records/domain'
import { saveVocabulary } from '@/modules/knowledge/vocabulary/actions'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'
import WordAudioButton from '@/components/vocabulary/WordAudioButton'

const POS_OPTIONS = ['名词', '动词', '形容词', '副词', '助词', '接续词']
const BASE_INPUT_CLASS =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-100'
const LABEL_CLASS = 'text-xs font-bold text-slate-700'

type RecordMode = 'word' | 'learning-point' | 'sentence'
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
  onSaved?: (payload: { word: string; meta: VocabularyMeta }) => void
}) {
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
  const [pointTitle, setPointTitle] = useState('')
  const [fragmentsValue, setFragmentsValue] = useState('')
  const [pointNote, setPointNote] = useState('')
  const [category, setCategory] = useState<LearningPointCategory>(
    LearningPointCategory.GRAMMAR,
  )
  const popupRef = useRef<HTMLDivElement>(null)
  const primaryInputRef = useRef<HTMLInputElement>(null)
  const closeTimerRef = useRef<number | null>(null)
  const titleInputId = useId()
  const contextId = useId()
  const [popupHeight, setPopupHeight] = useState(42)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
  }))

  useEffect(() => {
    const detectedHeadword = detectedWord?.dictionaryForm?.trim() || word
    setPanelOpen(false)
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
  }, [word, sourceType, sourceId, initialMeta, detectedWord])

  const requestClose = useCallback(() => {
    if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current)
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
  }, [panelOpen, mode])

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
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (panelOpen) setPanelOpen(false)
      else requestClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [panelOpen, requestClose])

  useEffect(
    () => () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current)
    },
    [],
  )

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
          pronunciations[0],
          pronunciations,
          meanings,
          partsOfSpeech[0],
          partsOfSpeech,
        )
        if (
          (result.state === 'success' || result.state === 'already_exists') &&
          result.word &&
          result.meta
        ) {
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
            mode === 'learning-point' ? splitListInput(fragmentsValue) : [],
          sentenceText: contextSentence || word,
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
      closeTimerRef.current = window.setTimeout(requestClose, 900)
    } catch (error) {
      console.error('Save failed:', error)
      setSaveState('error')
      setStatusMessage('保存失败，请检查连接后重试。')
    }
  }

  return (
    <div
      ref={popupRef}
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
      className={`ui-pop fixed z-50 overflow-y-auto overscroll-contain border border-slate-200 bg-white shadow-2xl transition-[width] ${
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
          <header className='sticky top-0 z-10 border-b border-slate-100 bg-white px-3 pt-3'>
            <div className='flex items-center justify-between gap-3'>
              <div className='min-w-0'>
                <p className='text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400'>记录选区</p>
                <div className='mt-0.5 flex min-w-0 items-center gap-1'>
                  <p className='max-w-[15rem] truncate text-sm font-bold text-slate-950'>{word}</p>
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
            <div className='mt-3 grid grid-cols-3 gap-1' role='tablist' aria-label='记录层级'>
              {[
                { value: 'word' as const, label: '单词' },
                { value: 'learning-point' as const, label: '学习点' },
                { value: 'sentence' as const, label: '句子' },
              ].map(item => (
                <button
                  key={item.value}
                  type='button'
                  role='tab'
                  aria-selected={mode === item.value}
                  onClick={() => changeMode(item.value)}
                  className={`border-b-2 px-2 py-2 text-xs font-bold transition ${
                    mode === item.value
                      ? 'border-slate-900 text-slate-950'
                      : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}>
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          <div className='space-y-4 px-4 py-4'>
            <p id={contextId} className='rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600'>
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
                        onClick={() => setPartOfSpeechValue(current => current === option ? '' : option)}
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
              <>
                <label className='block space-y-1.5'>
                  <span className={LABEL_CLASS}>{mode === 'sentence' ? '句子标题' : '学习点名称'}</span>
                  <input
                    ref={primaryInputRef}
                    id={titleInputId}
                    value={pointTitle}
                    onChange={event => setPointTitle(event.target.value)}
                    placeholder={mode === 'sentence' ? '可选，方便以后检索' : '如：～ざるを得ない'}
                    className={BASE_INPUT_CLASS}
                  />
                </label>
                {mode === 'learning-point' ? (
                  <>
                    <section className='space-y-2'>
                      <span className={LABEL_CLASS}>类型</span>
                      <div className='flex flex-wrap gap-1.5'>
                        {Object.values(LearningPointCategory).map(option => (
                          <button
                            key={option}
                            type='button'
                            onClick={() => setCategory(option)}
                            className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                              category === option
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 text-slate-500'
                            }`}>
                            {LEARNING_POINT_CATEGORY_LABELS[option]}
                          </button>
                        ))}
                      </div>
                    </section>
                    <label className='block space-y-1.5'>
                      <span className={LABEL_CLASS}>句内片段</span>
                      <textarea
                        value={fragmentsValue}
                        onChange={event => setFragmentsValue(event.target.value)}
                        rows={3}
                        placeholder='每行一个片段，可记录不连续的多个位置'
                        className={`${BASE_INPUT_CLASS} resize-y`}
                      />
                      <span className='block text-[10px] leading-4 text-slate-400'>每行一个片段；保存的是文本与原句，不保存 DOM 节点。</span>
                    </label>
                  </>
                ) : null}
                <label className='block space-y-1.5'>
                  <span className={LABEL_CLASS}>笔记</span>
                  <textarea
                    value={pointNote}
                    onChange={event => setPointNote(event.target.value)}
                    rows={4}
                    placeholder={mode === 'sentence' ? '拆解长难句结构、逻辑或翻译' : '写下规则、含义、对比或易错原因'}
                    className={`${BASE_INPUT_CLASS} resize-y`}
                  />
                </label>
              </>
            )}

            <div className='flex items-center justify-between gap-3 border-t border-slate-100 pt-3'>
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
              <button
                type='button'
                onClick={handleSave}
                disabled={saveButton.disabled}
                className='h-9 shrink-0 rounded-lg bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-wait disabled:bg-slate-200 disabled:text-slate-500'>
                {saveButton.label}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
