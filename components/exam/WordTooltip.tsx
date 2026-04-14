'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { saveVocabulary } from '@/app/actions/content'
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
  const [pronunciationValue, setPronunciationValue] = useState('')
  const [saveWithPronunciation, setSaveWithPronunciation] = useState(false)
  const [meaningValue, setMeaningValue] = useState('')
  const [saveWithMeaning, setSaveWithMeaning] = useState(true)
  const [partOfSpeechValue, setPartOfSpeechValue] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(true)

  useEffect(() => {
    setSaveState('idle')
    const initialPron = (initialMeta?.pronunciations || []).join(' / ')
    setPronunciationValue(initialPron)
    setPartOfSpeechValue(initialMeta?.partsOfSpeech?.[0] || '')
    setMeaningValue((initialMeta?.meanings || []).join('; '))
  }, [word, initialMeta])

  // --- 2. 动态计算样式与位置 ---
  const estimatedHeight = showAdvanced ? 320 : 180
  const tooltipHalfWidth = 130
  const viewportPadding = 12
  const maxX = typeof window === 'undefined' ? x : window.innerWidth - tooltipHalfWidth - viewportPadding
  const minX = tooltipHalfWidth + viewportPadding
  const clampedX = Math.min(Math.max(x, minX), maxX)
  const shouldOpenDown = isTop && y < estimatedHeight + 16
  const maxY =
    typeof window === 'undefined'
      ? y
      : window.innerHeight - viewportPadding - (shouldOpenDown ? estimatedHeight : 0)
  const topOffset = shouldOpenDown
    ? Math.min(y + 12, maxY)
    : Math.max(y, estimatedHeight + viewportPadding)

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
    setSaveState('saving')

    const pronList = splitPronunciationInput(pronunciationValue)
    const meaningList = splitListInput(meaningValue)
    const posList = splitListInput(partOfSpeechValue)

    try {
      const res = await saveVocabulary(
        word,
        contextSentence,
        sourceType,
        sourceId,
        saveWithPronunciation ? pronList[0] : undefined,
        saveWithPronunciation ? pronList : [],
        saveWithMeaning ? meaningList : [],
        posList[0],
        posList,
      )

      if (res.state === 'success' || res.state === 'already_exists') {
        const savedMeta: VocabularyMeta = {
          pronunciations: saveWithPronunciation
            ? Array.from(new Set(pronList.map(item => item.trim()).filter(Boolean)))
            : initialMeta?.pronunciations || [],
          partsOfSpeech: Array.from(
            new Set(
              posList.map(item => item.trim()).filter(Boolean).length > 0
                ? posList.map(item => item.trim()).filter(Boolean)
                : initialMeta?.partsOfSpeech || [],
            ),
          ),
          meanings: saveWithMeaning
            ? Array.from(new Set(meaningList.map(item => item.trim()).filter(Boolean)))
            : initialMeta?.meanings || [],
        }
        onSaved?.({ word, meta: savedMeta })
        setSaveState('saved')
        setTimeout(() => onClose?.(), 1000)
      } else {
        setSaveState('error')
      }
    } catch (error) {
      console.error('Save failed:', error)
      setSaveState('error')
    }
  }

  // --- 4. 辅助函数：点击快捷词性标签 ---
  const handleTogglePosOption = (pos: string) => {
    setPartOfSpeechValue(prev => (prev === pos ? '' : pos))
  }

  return (
    <div
      onClick={e => e.stopPropagation()} // 阻止冒泡，防止点击弹窗内部导致弹窗关闭
      onMouseDown={e => e.stopPropagation()}
      style={{
        top: topOffset,
        left: clampedX,
        transform:
          shouldOpenDown || !isTop
            ? 'translate(-50%, 0)'
            : 'translate(-50%, -100%)',
      }}
      className={`ui-pop fixed z-50 ${TOOLTIP_WIDTH_CLASS} bg-white overflow-hidden rounded-xl shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200`}>
      {/* --- 头部区块 --- */}
      <div className='flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 px-3 py-2.5'>
        <span className='max-w-[60%] truncate text-base font-bold tracking-tight text-slate-900'>
          {word}
        </span>
        <button
          type='button'
          onClick={handleSave}
          disabled={saveBtnConfig.disabled}
          className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors duration-200 ${saveBtnConfig.bg}`}>
          {saveBtnConfig.text}
        </button>
      </div>

      {/* --- 内容区块 --- */}
      <div className='max-h-[min(68vh,20rem)] space-y-4 overflow-y-auto px-3 py-3 custom-scrollbar'>
        {/* 1. 读音/注音模块 */}
        <section className='space-y-2'>
          <div className='flex items-center justify-between'>
            <p className={SECTION_TITLE_CLASS}>读音 / 注音</p>
            <label className='flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-500 transition-colors hover:text-slate-800'>
              <input
                type='checkbox'
                className='accent-slate-900'
                checked={saveWithPronunciation}
                onChange={e => setSaveWithPronunciation(e.target.checked)}
              />
              保存此项
            </label>
          </div>
          <input
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
              <p className={SECTION_TITLE_CLASS}>词性</p>
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
                value={partOfSpeechValue}
                onChange={e => setPartOfSpeechValue(e.target.value)}
                placeholder='手动输入其他词性'
                className={BASE_INPUT_CLASS}
              />
            </section>

            {/* 释义 */}
            <section className='space-y-2'>
              <div className='flex items-center justify-between'>
                <p className={SECTION_TITLE_CLASS}>释义</p>
                <label className='flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-500 transition-colors hover:text-slate-800'>
                  <input
                    type='checkbox'
                    className='accent-slate-900'
                    checked={saveWithMeaning}
                    onChange={e => setSaveWithMeaning(e.target.checked)}
                  />
                  保存此项
                </label>
              </div>
              <input
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
