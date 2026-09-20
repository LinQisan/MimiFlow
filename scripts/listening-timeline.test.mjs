import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MIN_TIMELINE_DURATION,
  getTimelineOverlapWarningsAtId,
  getTimelineOverlapWarnings,
  getTimelinePlaybackRangeError,
  getTimelineRangeError,
  updateDialogueTimelineAtId,
  updateDialogueTimelineAtIndex,
} from '../modules/listening/domain/timeline.ts'
import { updateDialogueTextAtId } from '../modules/listening/domain/dialogue-editor.ts'

test('timeline validation enforces non-negative, ordered, minimum ranges, and duration', () => {
  assert.equal(
    getTimelineRangeError({ start: -0.01, end: 1 }),
    '开始时间不能小于 0。',
  )
  assert.equal(
    getTimelineRangeError({ start: 1, end: 1 }),
    '开始时间必须早于结束时间。',
  )
  assert.equal(
    getTimelineRangeError({
      start: 1,
      end: 1 + MIN_TIMELINE_DURATION - 0.001,
    }),
    '片段长度至少为 0.05 秒。',
  )
  assert.match(
    getTimelineRangeError({ start: 1, end: 5, audioDuration: 4 }) || '',
    /不能超过音频长度/,
  )
  assert.equal(
    getTimelineRangeError({ start: 1, end: 1.05, audioDuration: 4 }),
    null,
  )
  assert.equal(getTimelinePlaybackRangeError({ start: 1, end: 1.01 }), null)
})

test('timeline updates preserve other dialogue fields and report overlap without moving neighbors', () => {
  const dialogues = [
    { id: 1, text: '上一句', start: 0, end: 1 },
    { id: 2, text: '当前句', start: 1.2, end: 2 },
    { id: 3, text: '下一句', start: 2.3, end: 3 },
  ]
  const updated = updateDialogueTimelineAtIndex(dialogues, 1, {
    start: 0.88,
    end: 2.42,
  })

  assert.deepEqual(updated, [
    dialogues[0],
    { id: 2, text: '当前句', start: 0.88, end: 2.42 },
    dialogues[2],
  ])
  assert.deepEqual(
    getTimelineOverlapWarnings(dialogues, 1, { start: 0.88, end: 2.42 }),
    { previous: 0.12, next: 0.12 },
  )
  assert.equal(updateDialogueTimelineAtIndex(dialogues, 9, { start: 1, end: 2 }), null)
})

test('stable dialogue ids keep timeline updates attached to the authored segment', () => {
  const dialogues = [
    { stableId: 'first', text: '第一句', start: 0, end: 1 },
    { stableId: 'second', text: '第二句', start: 1.2, end: 2 },
    { stableId: 'third', text: '第三句', start: 2.3, end: 3 },
  ]
  const updated = updateDialogueTimelineAtId(dialogues, 'second', {
    start: 0.88,
    end: 2.42,
  })

  assert.deepEqual(updated, [
    dialogues[0],
    { ...dialogues[1], start: 0.88, end: 2.42 },
    dialogues[2],
  ])
  assert.deepEqual(
    getTimelineOverlapWarningsAtId(dialogues, 'second', {
      start: 0.88,
      end: 2.42,
    }),
    { previous: 0.12, next: 0.12 },
  )
  assert.equal(
    updateDialogueTimelineAtId(dialogues, 'missing', { start: 1, end: 2 }),
    null,
  )
})

test('stable dialogue ids keep text edits attached to the authored segment', () => {
  const dialogues = [
    { stableId: 'first', text: '第一句' },
    { stableId: 'second', text: '第二句' },
  ]

  assert.deepEqual(updateDialogueTextAtId(dialogues, 'second', '已修改'), [
    dialogues[0],
    { stableId: 'second', text: '已修改' },
  ])
  assert.equal(updateDialogueTextAtId(dialogues, 'missing', '不会写入'), null)
})
