import assert from 'node:assert/strict'
import test from 'node:test'

import { mergeInlineHighlightRects } from '../utils/text/inlineHighlightRects.ts'

function rect(left, top, width, height) {
  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
  }
}

test('merges adjacent ruby-base fragments belonging to one matched word', () => {
  assert.deepEqual(
    mergeInlineHighlightRects([rect(10, 20, 18, 24), rect(31, 20, 18, 24)]),
    [rect(10, 20, 39, 24)],
  )
})

test('keeps wrapped portions of a matched word on separate lines', () => {
  assert.deepEqual(
    mergeInlineHighlightRects([rect(90, 20, 18, 24), rect(10, 50, 18, 24)]),
    [rect(90, 20, 18, 24), rect(10, 50, 18, 24)],
  )
})

test('does not bridge a large inline gap', () => {
  assert.deepEqual(
    mergeInlineHighlightRects([rect(10, 20, 18, 24), rect(50, 20, 18, 24)]),
    [rect(10, 20, 18, 24), rect(50, 20, 18, 24)],
  )
})

test('preserves coordinates exposed through DOMRect-style getters', () => {
  const source = rect(10, 20, 18, 24)
  const domRectLike = Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries(source).map(([key, value]) => [
        key,
        { configurable: true, get: () => value },
      ]),
    ),
  )

  assert.deepEqual(mergeInlineHighlightRects([domRectLike]), [source])
})
