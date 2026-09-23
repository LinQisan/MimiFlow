import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPracticeCopyPayload } from '../modules/practice/domain/copy-payload.ts'
import { resolveListeningSection } from '../modules/practice/domain/listening-section.ts'

test('practice copy keeps question labels and authored listening order', () => {
  const format = text => `«${text}»`
  assert.equal(
    buildPracticeCopyPayload([
      {
        id: 'q1',
        prompt: '問題',
        options: [{ id: 'a', text: '回答' }],
      },
    ], format),
    '题目：«問題»\n\n选项：\n1. «回答»',
  )

  assert.equal(
    buildPracticeCopyPayload([
      {
        id: 'q2',
        lessonId: 'lesson-1',
        lesson: {
          id: 'lesson-1',
          dialogues: [
            { text: '后句', start: 2, sequenceId: 2 },
            { text: '前句', start: 1, sequenceId: 1 },
          ],
        },
        options: [{ id: 'b', text: '选项' }],
      },
    ], format),
    '«前句»\n«后句»\n\n选项：\n1. «选项»',
  )
})

test('listening sections retain explicit and TOEIC identities', () => {
  assert.deepEqual(
    resolveListeningSection({
      content: { listeningSectionNumber: 3 },
      payload: { listeningSectionTitle: '要点' },
      metadata: {},
    }),
    { key: 'listening-part-3', title: '要点', partNumber: 3 },
  )
  assert.deepEqual(
    resolveListeningSection({
      content: {},
      payload: {},
      metadata: {},
      questionType: 'TOEIC_CONVERSATIONS',
    }),
    { key: 'toeic-part-3', title: 'Part 3 · Conversations', partNumber: 3 },
  )
})
