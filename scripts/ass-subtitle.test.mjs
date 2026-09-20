import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyAssTimelinePadding,
  convertRawSubtitlesToTimeline,
  parseSrtToRawSubtitles,
  parseAssToRawSubtitles,
  serializeTimelineToAss,
} from '../modules/import/audio/ass.ts'

test('ASS subtitles parse authored fields and receive import timeline padding', () => {
  const source = `[Script Info]
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,最初, with comma
Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,次の行`

  const parsed = parseAssToRawSubtitles(source)
  assert.deepEqual(
    parsed.map(item => ({ text: item.text, start: item.rawStart, end: item.rawEnd })),
    [
      { text: '最初, with comma', start: 1, end: 2 },
      { text: '次の行', start: 3, end: 4 },
    ],
  )

  const padded = applyAssTimelinePadding(parsed)
  assert.deepEqual(
    padded.map(item => ({ start: item.start, end: item.end })),
    [
      { start: 0.9, end: 2.3 },
      { start: 2.9, end: 4.3 },
    ],
  )
})

test('re-import timeline conversion preserves original ASS timestamps exactly', () => {
  const source = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:01:07.12,0:01:07.69,Default,,0,0,0,,最後、
Dialogue: 0,0:01:08.19,0:01:09.40,Default,,0,0,0,,講座4番は、`

  const parsed = convertRawSubtitlesToTimeline(parseAssToRawSubtitles(source))
  assert.deepEqual(
    parsed.map(item => ({ text: item.text, start: item.start, end: item.end })),
    [
      { text: '最後、', start: 67.12, end: 67.69 },
      { text: '講座4番は、', start: 68.19, end: 69.4 },
    ],
  )
})

test('re-import timeline conversion preserves original SRT millisecond timestamps', () => {
  const source = `1
00:01:07,120 --> 00:01:07,690
最後、

2
00:01:08.190 --> 00:01:09.400
講座4番は、`

  const parsed = convertRawSubtitlesToTimeline(parseSrtToRawSubtitles(source))
  assert.deepEqual(
    parsed.map(item => ({ text: item.text, start: item.start, end: item.end })),
    [
      { text: '最後、', start: 67.12, end: 67.69 },
      { text: '講座4番は、', start: 68.19, end: 69.4 },
    ],
  )
})

test('current listening timelines serialize as downloadable ASS subtitles', () => {
  const output = serializeTimelineToAss(
    [
      { text: '一行目', start: 0.9, end: 2.3 },
      { text: '二行目\n続き', start: 2.9, end: 4.3 },
    ],
    '問題2-01',
  )

  assert.match(output, /Title: 問題2-01/)
  assert.match(output, /Format: Layer, Start, End/)
  assert.match(
    output,
    /Dialogue: 0,0:00:00\.90,0:00:02\.30,Default,,0,0,0,,一行目/,
  )
  assert.match(output, /二行目\\N続き/)
})
