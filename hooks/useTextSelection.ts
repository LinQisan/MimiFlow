// hooks/useTextSelection.ts
import { SourceType } from '#prisma-client'
import { useState, useEffect, useRef } from 'react'
import {
  cleanInlineSelectionText,
  getCleanElementText,
  getCleanSelectionText,
} from '@/utils/text/selection'

export interface SelectionState {
  text: string
  x: number
  y: number
  rects: Array<{
    top: number
    left: number
    width: number
    height: number
  }>
  isVisible: boolean
  isTop: boolean
  contextSentence: string
  sourceType: SourceType | ''
  sourceId: string
}

export function useTextSelection() {
  const selectedRangeRef = useRef<Range | null>(null)
  const pointerActiveRef = useRef(false)
  const pointerStartSelectionRef = useRef('')
  const lastPointerUpAtRef = useRef(0)
  const lastKeyboardSelectionAtRef = useRef(0)
  const [selection, setSelection] = useState<SelectionState>({
    text: '',
    x: 0,
    y: 0,
    rects: [],
    isVisible: false,
    isTop: true,
    contextSentence: '',
    sourceType: '',
    sourceId: '',
  })

  useEffect(() => {
    let selectionTimer: number | null = null

    const extractCleanTextFromElement = (element: HTMLElement | null) => {
      return getCleanElementText(element)
    }

    const resolveContextText = (element: HTMLElement | null, fallback: string) => {
      if (!element) return cleanInlineSelectionText(fallback)
      const explicitSentence = element.closest('[data-context-sentence]')
      const explicitText = extractCleanTextFromElement(
        explicitSentence as HTMLElement | null,
      )
      if (explicitText) return explicitText
      const cleaned = extractCleanTextFromElement(element)
      return cleaned || cleanInlineSelectionText(fallback)
    }

    const extractSelectedText = (windowSelection: Selection) => {
      return getCleanSelectionText(windowSelection)
    }

    const getRangeRects = (range: Range) =>
      Array.from(range.getClientRects())
        .map(rect => ({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }))
        .filter(rect => rect.width > 0 && rect.height > 0)

    const getSelectionFingerprint = () => {
      const windowSelection = window.getSelection()
      if (!windowSelection || windowSelection.rangeCount === 0) return ''
      const text = extractSelectedText(windowSelection)
      if (!text) return ''
      const rect = windowSelection.getRangeAt(0).getBoundingClientRect()
      return [
        text,
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      ].join('|')
    }

    const restoreSelectedRange = (expectedText: string) => {
      const range = selectedRangeRef.current
      if (!range) return
      window.requestAnimationFrame(() => {
        const windowSelection = window.getSelection()
        if (!windowSelection) return
        const currentText = extractSelectedText(windowSelection)
        if (currentText === expectedText) return
        windowSelection.removeAllRanges()
        windowSelection.addRange(range)
      })
    }

    const hideSelection = () => {
      selectedRangeRef.current = null
      setSelection(prev =>
        prev.isVisible ? { ...prev, rects: [], isVisible: false } : prev,
      )
    }

    const commitSelection = () => {
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLElement &&
        activeElement.closest('.ui-pop')
      ) {
        return
      }
      const windowSelection = window.getSelection()
      const text = windowSelection ? extractSelectedText(windowSelection) : ''

      if (text && text.length > 0 && text.length <= 60) {
        const range = windowSelection!.getRangeAt(0)
        const container = range.commonAncestorContainer
        const element =
          container.nodeType === 3
            ? container.parentElement
            : (container as HTMLElement)
        const sourceNode = element?.closest('[data-source-type]')
        const sourceType =
          (sourceNode?.getAttribute('data-source-type') as SourceType) || ''
        const sourceId = sourceNode?.getAttribute('data-source-id') || ''
        if (!element || !sourceNode || !sourceType || !sourceId) {
          hideSelection()
          return
        }

        const contextNode =
          element.closest(
            '[data-context-sentence], p, li, [data-context-block]',
          ) || sourceNode
        const rect = range.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) {
          hideSelection()
          return
        }
        selectedRangeRef.current = range.cloneRange()

        setSelection({
          text,
          x: rect.left + rect.width / 2,
          y: rect.top,
          rects: getRangeRects(range),
          isVisible: true,
          isTop: rect.top > 250,
          sourceType,
          sourceId,
          contextSentence: resolveContextText(
            contextNode as HTMLElement | null,
            text,
          ),
        })
        restoreSelectedRange(text)
      } else {
        hideSelection()
      }
    }

    const scheduleSelectionCommit = (delay = 0, previousSelection?: string) => {
      if (selectionTimer != null) window.clearTimeout(selectionTimer)
      selectionTimer = window.setTimeout(() => {
        selectionTimer = null
        if (
          previousSelection !== undefined &&
          getSelectionFingerprint() === previousSelection
        ) {
          return
        }
        commitSelection()
      }, delay)
    }

    const updateSelectionPosition = () => {
      const windowSelection = window.getSelection()
      if (!windowSelection || windowSelection.rangeCount === 0) return
      const text = extractSelectedText(windowSelection)
      if (!text) return
      const range = windowSelection.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      setSelection(prev => {
        if (!prev.isVisible) return prev
        if (prev.text !== text) return prev
        return {
          ...prev,
          x: rect.left + rect.width / 2,
          y: rect.top,
          rects: getRangeRects(range),
          isTop: rect.top > 250,
        }
      })
    }

    const isInsidePopover = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest('.ui-pop'))

    const handlePointerDown = (event: PointerEvent) => {
      if (isInsidePopover(event.target)) return
      pointerActiveRef.current = true
      pointerStartSelectionRef.current = getSelectionFingerprint()
      hideSelection()
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (isInsidePopover(event.target)) return
      pointerActiveRef.current = false
      lastPointerUpAtRef.current = Date.now()
      scheduleSelectionCommit(
        event.pointerType === 'touch' ? 220 : 80,
        pointerStartSelectionRef.current,
      )
    }

    const handlePointerCancel = () => {
      pointerActiveRef.current = false
    }

    const handleSelectionChange = () => {
      // 拖动或长按期间只让浏览器更新原生选区，等手势结束后再打开。
      if (pointerActiveRef.current) return
      // pointerup 会用手势开始时的选区做去重，避免同一次操作提交两次。
      if (Date.now() - lastPointerUpAtRef.current < 300) return
      // 只接受明确的键盘扩展选区，忽略脚本、焦点切换等附带的 selectionchange。
      if (Date.now() - lastKeyboardSelectionAtRef.current > 500) return
      scheduleSelectionCommit(240)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        hideSelection()
        return
      }
      if (
        event.shiftKey &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
          event.key,
        )
      ) {
        lastKeyboardSelectionAtRef.current = Date.now()
      }
    }

    const handleWindowScroll = () => {
      if (pointerActiveRef.current) {
        updateSelectionPosition()
        return
      }
      hideSelection()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('pointercancel', handlePointerCancel)
    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleWindowScroll, { passive: true })
    window.addEventListener('resize', updateSelectionPosition)
    window.visualViewport?.addEventListener('resize', updateSelectionPosition)
    window.visualViewport?.addEventListener('scroll', updateSelectionPosition)
    return () => {
      if (selectionTimer != null) window.clearTimeout(selectionTimer)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointercancel', handlePointerCancel)
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleWindowScroll)
      window.removeEventListener('resize', updateSelectionPosition)
      window.visualViewport?.removeEventListener(
        'resize',
        updateSelectionPosition,
      )
      window.visualViewport?.removeEventListener(
        'scroll',
        updateSelectionPosition,
      )
    }
  }, [])

  const closeSelection = () => {
    selectedRangeRef.current = null
    window.getSelection()?.removeAllRanges()
    setSelection(prev => ({ ...prev, rects: [], isVisible: false }))
  }

  return { selection, closeSelection }
}
