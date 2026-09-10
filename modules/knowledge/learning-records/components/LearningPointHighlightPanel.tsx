'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { LearningPointCategory } from '@prisma/client'

import { LEARNING_POINT_CATEGORY_LABELS } from '@/modules/knowledge/learning-records/domain'
import type { LearningPointHighlight, LearningPointSelection } from '@/hooks/useStudyTextHighlights'

const CATEGORY_CLASS: Record<LearningPointCategory, string> = {
  GRAMMAR: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  PATTERN: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  IDIOM: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  PARAPHRASE: 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200',
  DISTRACTOR: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  OTHER: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
}

function LearningPointInspector({
  selection,
  onClose,
  onInspectWord,
}: {
  selection: LearningPointSelection
  onClose: () => void
  onInspectWord: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [position, setPosition] = useState({ left: 12, top: 12 })

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const place = () => {
      if (!selection.range.startContainer.isConnected) {
        onClose()
        return
      }
      const anchor = selection.range.getBoundingClientRect()
      const width = panel.offsetWidth
      const height = panel.offsetHeight
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))
      const below = anchor.bottom + 8
      const top = Math.max(12, Math.min(
        below + height <= window.innerHeight - 12 ? below : anchor.top - height - 8,
        window.innerHeight - height - 12,
      ))
      setPosition(previous => previous.left === left && previous.top === top ? previous : { left, top })
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(panel)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [selection, onClose])

  useLayoutEffect(() => {
    const previousFocus = document.activeElement
    if (previousFocus instanceof HTMLElement && !panelRef.current?.contains(previousFocus)) {
      returnFocusRef.current = previousFocus
    }
    closeRef.current?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) onClose()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
      if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={panelRef}
      role='dialog'
      aria-label='正文注释'
      data-highlight-ignore='true'
      data-context-ignore='true'
      className='ui-pop fixed z-[80] flex max-h-[calc(100dvh-24px)] w-96 max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-slate-300 text-slate-900 shadow-xl dark:border-slate-700 dark:text-slate-100'
      style={{ ...position, background: 'var(--editorial-paper-raised, white)' }}>
      <div className='flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2 dark:border-slate-700'>
        <span className='text-xs font-semibold'>{selection.points.some(point => point.annotationLabel) ? '我的注释' : '学习点'}</span>
        <button ref={closeRef} type='button' className='ui-btn ui-btn-sm' onClick={() => { onClose(); returnFocusRef.current?.focus({ preventScroll: true }) }} aria-label='关闭学习点'>关闭</button>
      </div>
      <div className='overflow-y-auto px-4'>
        {selection.points.map(point => {
          const category = point.category || 'OTHER'
          return (
            <article key={point.id} className='space-y-2 border-b border-slate-200 py-4 last:border-0 dark:border-slate-700'>
              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${CATEGORY_CLASS[category]}`}>
                {point.annotationLabel || LEARNING_POINT_CATEGORY_LABELS[category]}
              </span>
              <h3 className='font-word-ja text-base font-semibold'>{point.title}</h3>
              {point.fragments.length ? <p lang='ja' className='font-reading-ja text-sm leading-6 text-slate-500 dark:text-slate-400'>{point.fragments.join(' / ')}</p> : null}
              <p className='whitespace-pre-wrap text-sm leading-6'>{point.note || '此学习点暂无补充说明。'}</p>
            </article>
          )
        })}
      </div>
      {selection.wordbook ? (
        <div className='border-t border-slate-200 px-4 py-2 dark:border-slate-700'>
          <button type='button' className='ui-btn ui-btn-sm' onClick={onInspectWord}>查看「{selection.wordbook.word}」的词语注释</button>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

export default function LearningPointHighlightPanel({
  points,
  isLoading = false,
  selection,
  onClose,
  onInspect,
  onInspectWord,
}: {
  points: LearningPointHighlight[]
  isLoading?: boolean
  selection: LearningPointSelection | null
  onClose: () => void
  onInspect: (id: string) => void
  onInspectWord: () => void
}) {
  const categories = [...new Set(points.filter(point => !point.annotationLabel).map(point => point.category || 'OTHER'))]
  const annotationLabels = [...new Set(points.flatMap(point => point.annotationLabel ? [point.annotationLabel] : []))]
  return (
    <div data-highlight-ignore='true' data-context-ignore='true' className='border-y border-slate-200 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2' aria-label='学习点图例'>
        <span className='font-semibold text-slate-700 dark:text-slate-200'>我的标记 · 正文底色</span>
        {annotationLabels.map(label => <span key={label} className={`rounded px-1.5 py-0.5 ${CATEGORY_CLASS.IDIOM}`}>{label}</span>)}
        {categories.map(category => (
          <span key={category} className={`rounded px-1.5 py-0.5 ${CATEGORY_CLASS[category]}`}>{LEARNING_POINT_CATEGORY_LABELS[category]}</span>
        ))}
        <span role='status'>{isLoading ? '正在加载…' : points.length ? '点击标记文字查看；下划线为词语注释' : '当前内容暂无学习点'}</span>
        {points.length > 0 ? (
          <details className='w-full'>
            <summary className='min-h-10 cursor-pointer py-3 focus-visible:outline-2'>定位标记（{points.length}）</summary>
            <div className='flex flex-wrap gap-2 pb-2'>
              {points.map(point => <button key={point.id} type='button' className='ui-btn' onClick={() => onInspect(point.id)}>{point.title}</button>)}
            </div>
          </details>
        ) : null}
      </div>
      {selection ? <LearningPointInspector selection={selection} onClose={onClose} onInspectWord={onInspectWord} /> : null}
    </div>
  )
}
