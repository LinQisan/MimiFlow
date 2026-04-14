// hooks/useTextSelection.ts
import { SourceType } from '@prisma/client'
import { useState, useEffect } from 'react'

export interface SelectionState {
  text: string
  x: number
  y: number
  isVisible: boolean
  isTop: boolean
  contextSentence: string
  // 💡 修改 1：允许初始状态为空字符串
  sourceType: SourceType | ''
  sourceId: string
}

export function useTextSelection() {
  const [selection, setSelection] = useState<SelectionState>({
    text: '',
    x: 0,
    y: 0,
    isVisible: false,
    isTop: true,
    contextSentence: '',
    sourceType: '', // 现在这里不会报错了
    sourceId: '',
  })

  useEffect(() => {
    const extractSelectedText = (windowSelection: Selection) => {
      if (windowSelection.rangeCount === 0) return ''
      const range = windowSelection.getRangeAt(0)
      const fragment = range.cloneContents()

      // 划词结果里不包含 <rt> 注音，避免 WordTooltip 词条被注音污染。
      fragment.querySelectorAll('rt').forEach(node => node.remove())

      return (fragment.textContent || '').trim()
    }

    const handleMouseUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.ui-pop')) return

      const windowSelection = window.getSelection()
      const text = windowSelection ? extractSelectedText(windowSelection) : ''

      if (text && text.length > 0 && text.length <= 30) {
        const range = windowSelection!.getRangeAt(0)
        const rect = range.getBoundingClientRect()

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
          isVisible: true,
          isTop: rect.top > 250,
          // 💡 修改 2：使用 as SourceType 强转，且找不到时 fallback 回空字符串而不是 'UNKNOWN'
          sourceType:
            (sourceNode?.getAttribute('data-source-type') as SourceType) || '',
          sourceId: sourceNode?.getAttribute('data-source-id') || '',
          contextSentence: contextNode?.textContent?.trim() || text,
        })
      } else {
        setSelection(prev => ({ ...prev, isVisible: false }))
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
          isTop: rect.top > 250,
        }
      })
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.ui-pop')) {
        setSelection(prev => ({ ...prev, isVisible: false }))
      }
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

  const closeSelection = () =>
    setSelection(prev => ({ ...prev, isVisible: false }))

  return { selection, closeSelection }
}
