import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPriorityReviewPlan,
  getPracticeWordRecommendReasons,
  PRACTICE_WORD_RECOMMEND_REASON_LABELS,
} from '../features/practice/domain/vocabulary-analytics.ts'

const insight = (overrides = {}) => ({
  word: 'こと',
  count: 18,
  paperCount: 5,
  optionCount: 14,
  targetCount: 3,
  learningValue: 42,
  isMastered: false,
  categoryCounts: { TEXT_VOCAB: 5, GRAMMAR: 4, READING: 3, LISTENING: 0 },
  ...overrides,
})

test('recommend reasons explain all learning dimensions', () => {
  assert.deepEqual(
    getPracticeWordRecommendReasons(insight(), 5),
    ['full-coverage', 'top-tested', 'top-distractor'],
  )
  assert.deepEqual(
    PRACTICE_WORD_RECOMMEND_REASON_LABELS['full-coverage'],
    '全卷覆盖',
  )
})

test('recommend reasons degrade gracefully without coverage data', () => {
  // Summary-level rows lack paperCount/categoryCounts: no invented reasons.
  assert.deepEqual(
    getPracticeWordRecommendReasons(
      { word: 'こと', count: 18, optionCount: 14, targetCount: 3 },
      5,
    ),
    ['top-tested', 'top-distractor', 'frequent'],
  )
  assert.deepEqual(
    getPracticeWordRecommendReasons(
      { word: 'あ', count: 1, optionCount: 0, targetCount: 0 },
      5,
    ),
    [],
  )
})

test('complex form and multi-category reasons use word shape', () => {
  assert.ok(
    getPracticeWordRecommendReasons(
      insight({ word: '対策本部', count: 2, paperCount: 1, optionCount: 0, targetCount: 0 }),
      5,
    ).includes('complex-form'),
  )
  assert.ok(
    !getPracticeWordRecommendReasons(
      insight({ word: 'こと', categoryCounts: { TEXT_VOCAB: 9 } }),
      5,
    ).includes('multi-category'),
  )
})

test('priority review plan counts full-coverage words for five papers', () => {
  const plan = buildPriorityReviewPlan(
    [
      insight({ word: 'こと', paperCount: 5, learningValue: 42 }),
      insight({ word: 'よう', paperCount: 4, learningValue: 30 }),
      insight({ word: 'ため', paperCount: 2, learningValue: 99 }),
      insight({ word: '既知', paperCount: 5, learningValue: 50, isMastered: true }),
    ],
    5,
  )
  assert.equal(plan.threshold, 4)
  assert.deepEqual(
    plan.words.map(row => row.word),
    ['こと', 'よう'],
  )
})

test('priority review plan keeps full coverage for small corpora', () => {
  const plan = buildPriorityReviewPlan(
    [insight({ word: 'こと', paperCount: 2 })],
    2,
  )
  assert.equal(plan.threshold, 2)
  assert.equal(plan.words.length, 1)
})
