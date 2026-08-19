const UNDERLINE_MARKER = '++'

export type UnderlineSelectionResult = {
  text: string
  selectionStart: number
  selectionEnd: number
  changed: boolean
}

export function toggleUnderlineSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): UnderlineSelectionResult {
  const start = Math.max(0, Math.min(selectionStart, text.length))
  const end = Math.max(start, Math.min(selectionEnd, text.length))
  if (start === end || !text.slice(start, end).trim()) {
    return { text, selectionStart: start, selectionEnd: end, changed: false }
  }

  const markerLength = UNDERLINE_MARKER.length
  const hasOuterMarkers =
    text.slice(start - markerLength, start) === UNDERLINE_MARKER &&
    text.slice(end, end + markerLength) === UNDERLINE_MARKER

  if (hasOuterMarkers) {
    return {
      text:
        text.slice(0, start - markerLength) +
        text.slice(start, end) +
        text.slice(end + markerLength),
      selectionStart: start - markerLength,
      selectionEnd: end - markerLength,
      changed: true,
    }
  }

  return {
    text:
      text.slice(0, start) +
      UNDERLINE_MARKER +
      text.slice(start, end) +
      UNDERLINE_MARKER +
      text.slice(end),
    selectionStart: start + markerLength,
    selectionEnd: end + markerLength,
    changed: true,
  }
}

export function renderUnderlineMarkup(escapedHtml: string) {
  return escapedHtml.replace(
    /\+\+([\s\S]+?)\+\+/g,
    '<span class="exam-text-underline">$1</span>',
  )
}
