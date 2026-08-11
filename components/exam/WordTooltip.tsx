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
import { saveVocabulary } from '@/modules/knowledge/vocabulary/actions'
import { SourceType } from '@prisma/client'
import type { VocabularyMeta } from '@/utils/vocabulary/vocabularyMeta'

// --- 预设的常用词性选项 (可根据需要修改) ---
const POS_OPTIONS = ['名词', '动词', '形容词', '副词', '助词', '接续词']

// --- UI 样式常量 ---
const TOOLTIP_WIDTH_CLASS = 'w-[260px]'
const SECTION_TITLE_CLASS = 'text-xs font-bold text-slate-700'
const SECTION_HINT_CLASS = 'mt-1 text-[10px] leading-relaxed text-slate-400'
const BASE_INPUT_CLASS =
  'w-full h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs outline-none transition-all placeholder:text-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-200'

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
        // 不按空格和 | 分割，避免把「にん げん / にん|げん」这种单个注音误拆。
        .split(/[\/／\n,，；;]+/)
        .map(item => item.trim())
        .filter(Boolean),
    ),
  )

export default function WordTooltip({
  word,
  x,
  y,
  isTop = true,
  contextSentence,
  sourceType,
  sourceId,
  initialMeta,
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
  onClose?: () => void
  onSaved?: (payload: { word: string; meta: VocabularyMeta }) => void
}) {
  // --- 1. 内部状态管理 ---
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [headwordValue, setHeadwordValue] = useState('')
  const [pronunciationValue, setPronunciationValue] = useState('')
  const [meaningValue, setMeaningValue] = useState('')
  const [partOfSpeechValue, setPartOfSpeechValue] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(true)
  const popupRef = useRef<HTMLDivElement>(null)
  const headwordInputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const headwordInputId = useId()
  const pronunciationInputId = useId()
  const partOfSpeechInputId = useId()
  const meaningInputId = useId()
  const contextId = useId()
  const [popupHeight, setPopupHeight] = useState(320)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1024 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
  }))

  useEffect(() => {
    setSaveState('idle')
    setStatusMessage('')
    setHeadwordValue(word)
    const initialPron = (initialMeta?.pronunciations || []).join(' / ')
    setPronunciationValue(initialPron)
    setPartOfSpeechValue(initialMeta?.partsOfSpeech?.[0] || '')
    setMeaningValue((initialMeta?.meanings || []).join('; '))
  }, [word, initialMeta])

  const requestClose = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    onClose?.()
  }, [onClose])

  useLayoutEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const focusFrame = window.requestAnimationFrame(() => {
      headwordInputRef.current?.focus({ preventScroll: true })
      headwordInputRef.current?.select()
    })
    return () => {
      window.cancelAnimationFrame(focusFrame)
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
      }
      previousFocusRef.current?.focus({ preventScroll: true })
    }
  }, [])

  useLayoutEffect(() => {
    const popup = popupRef.current
    if (!popup) return
    const measure = () => setPopupHeight(popup.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(popup)
    return () => observer.disconnect()
  }, [showAdvanced])

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
      requestClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [requestClose])

  // --- 2. 动态计算样式与位置 ---
  const viewportPadding = 12
  const tooltipWidth = Math.min(260, Math.max(160, viewport.width - 24))
  const tooltipHalfWidth = tooltipWidth / 2
  const minX = viewport.offsetLeft + tooltipHalfWidth + viewportPadding
  const maxX =
    viewport.offsetLeft + viewport.width - tooltipHalfWidth - viewportPadding
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

  const saveBtnConfig = useMemo(() => {
    switch (saveState) {
      case 'saving':
        return {
          text: '保存中...',
          bg: 'bg-slate-100 text-slate-500 cursor-wait',
          disabled: true,
        }
      case 'saved':
        return {
          text: '已保存',
          bg: 'bg-slate-100 text-slate-700',
          disabled: true,
        }
      case 'error':
        return {
          text: '重试',
          bg: 'bg-rose-100 text-rose-700 hover:bg-rose-200',
          disabled: false,
        }
      default:
        return {
          text: '保存',
          bg: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
          disabled: false,
        }
    }
  }, [saveState])

  // --- 3. 核心：处理保存逻辑 ---
  const handleSave = async () => {
    if (saveState === 'saving' || saveState === 'saved') return
    const normalizedHeadword = headwordValue.trim()
    if (!normalizedHeadword) {
      setSaveState('error')
      setStatusMessage('请填写要保存的单词或原形。')
      return
    }
    setSaveState('saving')
    setStatusMessage('正在保存词条…')

    const pronList = splitPronunciationInput(pronunciationValue)
    const meaningList = splitListInput(meaningValue)
    const posList = splitListInput(partOfSpeechValue)

    try {
      const res = await saveVocabulary(
        normalizedHeadword,
        word,
        contextSentence,
        sourceType,
        sourceId,
        pronList[0],
        pronList,
        meaningList,
        posList[0],
        posList,
      )

      if (
        (res.state === 'success' || res.state === 'already_exists') &&
        res.word &&
        res.meta
      ) {
        onSaved?.({ word: res.word, meta: res.meta })
        setSaveState('saved')
        setStatusMessage(res.message || '已保存到生词本。')
        closeTimerRef.current = window.setTimeout(requestClose, 1000)
      } else {
        setSaveState('error')
        setStatusMessage(res.message || '保存失败，请重试。')
      }
    } catch (error) {
      console.error('Save failed:', error)
      setSaveState('error')
      setStatusMessage('保存失败，请检查连接后重试。')
    }
  }

  // --- 4. 辅助函数：点击快捷词性标签 ---
  const handleTogglePosOption = (pos: string) => {
    setPartOfSpeechValue(prev => (prev === pos ? '' : pos))
  }

  return (
    <div
      ref={popupRef}
      role='dialog'
      aria-modal='false'
      aria-label={`保存词条：${word}`}
      aria-describedby={contextId}
      onClick={e => e.stopPropagation()} // 阻止冒泡，防止点击弹窗内部导致弹窗关闭
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        top: topOffset,
        left: clampedX,
        width: tooltipWidth,
        maxHeight: Math.max(180, viewport.height - viewportPadding * 2),
        transform:
          shouldOpenDown || !isTop
            ? 'translate(-50%, 0)'
            : 'translate(-50%, -100%)',
      }}
      className={`ui-pop fixed z-50 ${TOOLTIP_WIDTH_CLASS} overflow-y-auto overscroll-contain rounded-xl border border-gray-100 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200`}>
      {/* --- 头部区块 --- */}
      <div className='flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 px-3 py-2.5'>
        <span className='max-w-[60%] truncate text-base font-bold tracking-tight text-slate-900'>
          {headwordValue || word}
        </span>
        <div className='flex items-center gap-1.5'>
          <button
            type='button'
            onClick={handleSave}
            disabled={saveBtnConfig.disabled}
            className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors duration-200 ${saveBtnConfig.bg}`}>
            {saveBtnConfig.text}
          </button>
          <button
            type='button'
            onClick={requestClose}
            aria-label='关闭词条编辑'
            className='inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900'>
            ×
          </button>
        </div>
      </div>

      {/* --- 内容区块 --- */}
      <div
        className='space-y-4 overflow-y-auto px-3 py-3 custom-scrollbar'
        style={{ maxHeight: Math.max(120, viewport.height - 88) }}>
        <p
          id={contextId}
          className='line-clamp-2 rounded-md bg-slate-50 px-2 py-1.5 text-[10px] leading-4 text-slate-500'>
          例句：{contextSentence || word}
        </p>
        {/* 1. 读音/注音模块 */}
        <section className='space-y-2'>
          <label htmlFor={headwordInputId} className={SECTION_TITLE_CLASS}>
            单词 / 原形
          </label>
          <input
            ref={headwordInputRef}
            id={headwordInputId}
            value={headwordValue}
            onChange={e => setHeadwordValue(e.target.value)}
            placeholder='如: ののしる'
            className={BASE_INPUT_CLASS}
          />
          <p className={SECTION_HINT_CLASS}>
            默认带入当前划词词面；如需保存原形，请手动改成词典形。
          </p>
        </section>

        <section className='space-y-2'>
          <label htmlFor={pronunciationInputId} className={SECTION_TITLE_CLASS}>
            读音 / 注音
          </label>
          <input
            id={pronunciationInputId}
            value={pronunciationValue}
            onChange={e => setPronunciationValue(e.target.value)}
            placeholder='如: 言:い い 訳:わけ / にん げん（或 にん|げん）'
            className={BASE_INPUT_CLASS}
          />
          <p className={SECTION_HINT_CLASS}>
            支持假名或罗马音。多个读音请用 /、逗号、分号或换行分隔。
          </p>
        </section>

        {/* 2. 展开高级选项按钮 */}
        <div className='border-t border-slate-100 pt-3'>
          <button
            type='button'
            onClick={() => setShowAdvanced(v => !v)}
            className='inline-flex h-7 w-full items-center justify-center rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800'>
            {showAdvanced ? '收起释义与词性' : '添加释义与词性 (可选)'}
          </button>
        </div>

        {/* 3. 高级选项 (词性 & 释义) */}
        {showAdvanced && (
          <div className='animate-in slide-in-from-top-2 space-y-4 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 duration-200'>
            {/* 词性 */}
            <section className='space-y-2'>
              <label htmlFor={partOfSpeechInputId} className={SECTION_TITLE_CLASS}>
                词性
              </label>
              <div className='flex flex-wrap gap-1.5'>
                {POS_OPTIONS.map(option => {
                  const active = partOfSpeechValue === option
                  return (
                    <button
                      key={`pos-option-${option}`}
                      type='button'
                      onClick={() => handleTogglePosOption(option)}
                      className={`rounded border px-2 py-1 text-[10px] font-semibold transition-colors ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      }`}>
                      {option}
                    </button>
                  )
                })}
              </div>
              <input
                id={partOfSpeechInputId}
                value={partOfSpeechValue}
                onChange={e => setPartOfSpeechValue(e.target.value)}
                placeholder='手动输入其他词性'
                className={BASE_INPUT_CLASS}
              />
            </section>

            {/* 释义 */}
            <section className='space-y-2'>
              <label htmlFor={meaningInputId} className={SECTION_TITLE_CLASS}>
                释义
              </label>
              <input
                id={meaningInputId}
                value={meaningValue}
                onChange={e => setMeaningValue(e.target.value)}
                placeholder='如: 学习; 用功'
                className={BASE_INPUT_CLASS}
              />
              <p className={SECTION_HINT_CLASS}>
                多个释义请用分号 ( ; ) 隔开。
              </p>
            </section>
          </div>
        )}
        <p
          className={`min-h-4 text-[11px] font-semibold ${
            saveState === 'error'
              ? 'text-rose-700'
              : saveState === 'saved'
                ? 'text-emerald-700'
                : 'text-slate-500'
          }`}
          aria-live='polite'>
          {statusMessage}
        </p>
      </div>

      {/* --- 小箭头 (Triangle) --- */}
      <div
        className={`absolute left-1/2 h-2.5 w-2.5 rotate-45 -translate-x-1/2 border border-slate-100 bg-white ${
          shouldOpenDown || !isTop ? '-top-1' : '-bottom-1'
        }`}
        style={{
          borderBottom: shouldOpenDown || !isTop ? 'none' : '',
          borderRight: shouldOpenDown || !isTop ? 'none' : '',
          borderTop: shouldOpenDown || !isTop ? '' : 'none',
          borderLeft: shouldOpenDown || !isTop ? '' : 'none',
        }}
      />
    </div>
  )
}
