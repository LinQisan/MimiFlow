import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluateSortingOrder,
  resolveCorrectOrderIds,
} from '../modules/questions/domain/sorting.ts'

const options = [
  { id: 'opt_41', text: '雌に限っての' },
  { id: 'opt_7', text: 'とか' },
  { id: 'option-action', text: '行動なのだ' },
  { id: 'uuid-spawn', text: '産卵を控えた' },
]
const correctOrder = [
  'uuid-spawn',
  'opt_41',
  'option-action',
  'opt_7',
]

test('排序题：完全正确的排列判为正确', () => {
  const result = evaluateSortingOrder({
    options,
    correctOrder,
    selectedOrder: correctOrder,
    starIndex: 2,
  })
  assert.equal(result.isCorrect, true)
  assert.equal(result.selectedOptionId, 'option-action')
})

test('排序题：完整作答且 ★ 位置正确时按 JLPT 规则判为正确', () => {
  const result = evaluateSortingOrder({
    options,
    correctOrder,
    selectedOrder: ['opt_41', 'uuid-spawn', 'option-action', 'opt_7'],
    starIndex: 2,
  })
  assert.equal(result.isCorrect, true)
})

test('排序题：★ 位置错误时判为错误', () => {
  const result = evaluateSortingOrder({
    options,
    correctOrder,
    selectedOrder: ['uuid-spawn', 'opt_41', 'opt_7', 'option-action'],
    starIndex: 2,
  })
  assert.equal(result.isCorrect, false)
  assert.equal(result.correctOptionId, 'option-action')
})

test('排序题：原始选项数组顺序与正确顺序不同时仍解析正确', () => {
  assert.deepEqual(resolveCorrectOrderIds(options, [3, 0, 2, 1]), correctOrder)
})

test('排序题：option id 与数组 index 无关', () => {
  const result = evaluateSortingOrder({
    options,
    correctOrder: resolveCorrectOrderIds(options, [3, 0, 2, 1]),
    selectedOrder: correctOrder,
    starIndex: 2,
  })
  assert.equal(result.isCorrect, true)
  assert.equal(result.correctOptionId, 'option-action')
  assert.notEqual(result.correctOptionId, String(2))
})
