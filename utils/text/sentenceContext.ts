const cleanInlineSelectionText = (value: string) =>
  value.replace(/\s+/g, ' ').trim()

const stripContextUiChrome = (value: string) =>
  (() => {
    let next = cleanInlineSelectionText(value)
    const leadingPatterns = [
      /^#\d+\s*/,
      /^(已收藏|收藏)\s*/,
      /^(笔记\*?|笔记)\s*/,
      /^(收起编辑|编辑)\s*/,
      /^(取消|保存笔记)\s*/,
    ]
    let changed = true
    while (changed && next) {
      changed = false
      for (const pattern of leadingPatterns) {
        const replaced = next.replace(pattern, '').trim()
        if (replaced !== next) {
          next = replaced
          changed = true
        }
      }
    }
    return next
  })()

export function extractSentenceContainingSelection(
  text: string,
  selectedText: string,
) {
  const normalizedText = stripContextUiChrome(text)
  const normalizedSelection = cleanInlineSelectionText(selectedText)
  if (!normalizedText || !normalizedSelection) return ''

  const parts = normalizedText
    .split(/(?<=[。！？.!?\n])/)
    .map(item => item.trim())
    .filter(Boolean)
  if (parts.length === 0) return ''

  const comparableSelection = normalizedSelection.toLowerCase()
  const matched = parts.find(part =>
    part.toLowerCase().includes(comparableSelection),
  )
  if (matched) return matched

  // A short, single context block is still a useful sentence even when DOM
  // normalization changed the selected surface. Never fall back to a
  // multi-sentence article or transcript.
  return parts.length === 1 && normalizedText.length <= 500
    ? normalizedText
    : ''
}
