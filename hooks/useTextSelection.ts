// hooks/useTextSelection.ts
import { SourceType } from '@prisma/client'
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
    const extractCleanTextFromElement = (element: HTMLElement | null) => {
      return getCleanElementText(element)
    }

    const resolveContextText = (element: HTMLElement | null, fallback: string) => {
      if (!element) return cleanInlineSelectionText(fallback)
      const explicitSentence =
        element.closest('[data-context-sentence]') ||
        element.querySelector('[data-context-sentence]')
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

    const handleMouseUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.ui-pop')) return

      const windowSelection = window.getSelection()
      const text = windowSelection ? extractSelectedText(windowSelection) : ''

      if (text && text.length > 0 && text.length <= 30) {
        const range = windowSelection!.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        selectedRangeRef.current = range.cloneRange()

        const container = range.commonAncestorContainer
        const element =
          container.nodeType === 3
            ? container.parentElement
            : (container as HTMLElement)

        const sourceNode = element?.closest('[data-source-type]')
        const contextNode =
          element?.closest('[data-context-block]') || sourceNode

        setSelection({
          text,
          x: rect.left + rect.width / 2,
          y: rect.top,
          rects: getRangeRects(range),
          isVisible: true,
          isTop: rect.top > 250,
          sourceType:
            (sourceNode?.getAttribute('data-source-type') as SourceType) || '',
          sourceId: sourceNode?.getAttribute('data-source-id') || '',
          contextSentence: resolveContextText(
            contextNode as HTMLElement | null,
            text,
          ),
        })
        restoreSelectedRange(text)
      } else {
        selectedRangeRef.current = null
        setSelection(prev => ({ ...prev, rects: [], isVisible: false }))
      }
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

    const handleMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.ui-pop')) return
      const windowSelection = window.getSelection()
      if (!windowSelection || windowSelection.rangeCount === 0) return
      const text = extractSelectedText(windowSelection)
      if (text) return
      selectedRangeRef.current = null
      setSelection(prev =>
        prev.isVisible ? { ...prev, rects: [], isVisible: false } : prev,
      )
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('scroll', updateSelectionPosition, { passive: true })
    window.addEventListener('resize', updateSelectionPosition)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('scroll', updateSelectionPosition)
      window.removeEventListener('resize', updateSelectionPosition)
    }
  }, [])

  const closeSelection = () => {
    selectedRangeRef.current = null
    setSelection(prev => ({ ...prev, rects: [], isVisible: false }))
  }

  return { selection, closeSelection }
}
