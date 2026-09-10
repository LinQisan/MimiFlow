export type InlineHighlightRect = {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

const SAME_LINE_TOLERANCE = 2
const INLINE_FRAGMENT_GAP_TOLERANCE = 8

function unionRects(
  left: InlineHighlightRect,
  right: InlineHighlightRect,
): InlineHighlightRect {
  const unionLeft = Math.min(left.left, right.left)
  const unionRight = Math.max(left.right, right.right)
  const unionTop = Math.min(left.top, right.top)
  const unionBottom = Math.max(left.bottom, right.bottom)

  return {
    left: unionLeft,
    right: unionRight,
    top: unionTop,
    bottom: unionBottom,
    width: unionRight - unionLeft,
    height: unionBottom - unionTop,
  }
}

function copyRect(rect: InlineHighlightRect): InlineHighlightRect {
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

/**
 * A DOM Range crossing ruby bases can yield one client rect per base character.
 * Join only nearby fragments on the same visual line so one matched word gets
 * one underline while wrapped matches still render once per line.
 */
export function mergeInlineHighlightRects(
  rects: InlineHighlightRect[],
): InlineHighlightRect[] {
  const merged: InlineHighlightRect[] = []
  const sorted = [...rects].sort(
    (left, right) => left.bottom - right.bottom || left.left - right.left,
  )

  sorted.forEach(rect => {
    const mergeTargetIndex = merged.findLastIndex(candidate => {
      const sharesLine =
        Math.abs(candidate.bottom - rect.bottom) <= SAME_LINE_TOLERANCE
      const isNearby =
        rect.left <= candidate.right + INLINE_FRAGMENT_GAP_TOLERANCE &&
        rect.right >= candidate.left - INLINE_FRAGMENT_GAP_TOLERANCE
      return sharesLine && isNearby
    })

    if (mergeTargetIndex < 0) {
      merged.push(copyRect(rect))
      return
    }

    merged[mergeTargetIndex] = unionRects(merged[mergeTargetIndex], rect)
  })

  return merged.sort(
    (left, right) => left.top - right.top || left.left - right.left,
  )
}
