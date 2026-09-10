import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesLearningRecordSelection as matches } from '../modules/knowledge/learning-records/selection.ts'

const sentence = 'この問題は一筋縄ではいかない。'
const point = { kind: 'LEARNING_POINT', title: '難しい問題', sentenceText: sentence, fragments: ['一筋縄ではいかない'] }

test('matches legacy fragments even when the title differs', () => {
  assert.equal(matches(point, '一筋縄ではいかない', sentence), true)
  assert.equal(matches(point, 'では', sentence), false)
  assert.equal(matches(point, '', sentence), false)
})

test('matches a saved sentence from its selected words or full text', () => {
  const record = { kind: 'SENTENCE', title: '問題', fragments: [], sentenceText: sentence }
  assert.equal(matches(record, '問題', sentence), true)
  assert.equal(matches(record, sentence, '前の文。' + sentence), true)
  assert.equal(matches(record, '問題', '別の問題です。'), false)
  assert.equal(matches(record, '存在しない語', sentence), false)
})

test('normalizes whitespace without changing authored punctuation or Japanese text', () => {
  assert.equal(matches({ ...point, fragments: ['  一筋縄ではいかない\n'] }, '一筋縄ではいかない', sentence), true)
  assert.equal(matches({ ...point, fragments: ['一筋縄ではいかない？'] }, '一筋縄ではいかない', sentence), false)
  assert.equal(matches({ ...point, sentenceText: '別の文。' }, '一筋縄ではいかない', sentence), false)
})
