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
    const handleMouseUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.ui-pop')) return

      const windowSelection = window.getSelection()
      const text = windowSelection?.toString().trim()

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

    const handleMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.ui-pop')) {
        setSelection(prev => ({ ...prev, isVisible: false }))
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [])

  const closeSelection = () =>
    setSelection(prev => ({ ...prev, isVisible: false }))

  return { selection, closeSelection }
}
