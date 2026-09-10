import { joinJapaneseLayoutGaps } from '@/modules/language/domain/text'

export const cleanInlineSelectionText = (value: string) =>
  joinJapaneseLayoutGaps(value.replace(/\s+/g, ' ').trim())

export function getCleanSelectionText(selection: Selection | null) {
  if (!selection || selection.rangeCount === 0) return ''
  return getCleanRangeText(selection.getRangeAt(0))
}

export function getCleanRangeText(range: Range) {
  const fragment = range.cloneContents()
  fragment
    .querySelectorAll(
      'rt, button:not([data-selection-text="true"]), textarea, input, select, option, [data-context-ignore]',
    )
    .forEach(node => node.remove())
  return cleanInlineSelectionText(fragment.textContent || '')
}

export function getCleanElementText(element: HTMLElement | null) {
  if (!element) return ''
  const clone = element.cloneNode(true) as HTMLElement
  clone
    .querySelectorAll(
      'rt, button:not([data-selection-text="true"]), textarea, input, select, option, [data-context-ignore]',
    )
    .forEach(node => node.remove())
  return cleanInlineSelectionText(clone.textContent || '')
}
