import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareVocabularyJlptLevels,
  JLPT_PRIORITY,
  mergeVocabularyJlptLevels,
  normalizeVocabularyJlpt,
  normalizeVocabularyJlptLevels,
  resolvePrimaryVocabularyJlpt,
} from '../modules/knowledge/vocabulary/domain/jlpt.ts'
import {
  mergeJlptLevels,
  normalizeJlptLevels,
  resolvePrimaryJlpt,
} from '../features/reading/domain/wordbook-highlight-groups.ts'

test('single JLPT values normalize without dropping information', () => {
  assert.equal(normalizeVocabularyJlpt(' n2 '), 'N2')
  assert.equal(normalizeVocabularyJlpt('N2重点'), null)
  assert.deepEqual(normalizeVocabularyJlptLevels('N2'), ['N2'])
  assert.deepEqual(normalizeVocabularyJlptLevels(['N2']), ['N2'])
})

test('a word keeps every level it belongs to', () => {
  assert.deepEqual(normalizeVocabularyJlptLevels(['N2', 'N3']), ['N2', 'N3'])
  assert.deepEqual(normalizeVocabularyJlptLevels(['N3', 'N2']), ['N2', 'N3'])
  assert.deepEqual(normalizeVocabularyJlptLevels('["N2", "N3"]'), ['N2', 'N3'])
  assert.deepEqual(normalizeVocabularyJlptLevels('N2/N3'), ['N2', 'N3'])
})

test('duplicate and invalid levels are removed', () => {
  assert.deepEqual(normalizeVocabularyJlptLevels(['N2', 'N2', 'n2']), ['N2'])
  assert.deepEqual(normalizeVocabularyJlptLevels(['N9', '', null, undefined]), [])
  assert.deepEqual(normalizeVocabularyJlptLevels(['N2重点', 'Unit06']), [])
  assert.deepEqual(normalizeVocabularyJlptLevels(null), [])
  assert.deepEqual(normalizeVocabularyJlptLevels(undefined), [])
})

test('primary level is derived only for display, never stored', () => {
  assert.equal(resolvePrimaryVocabularyJlpt(['N2', 'N3']), 'N2')
  assert.equal(resolvePrimaryVocabularyJlpt(['N3', 'N1']), 'N1')
  assert.equal(resolvePrimaryVocabularyJlpt([]), null)
  assert.equal(resolvePrimaryVocabularyJlpt(null), null)
})

test('levels sort by priority N1 first', () => {
  assert.deepEqual([...JLPT_PRIORITY], ['N1', 'N2', 'N3', 'N4', 'N5'])
  assert.deepEqual(['N5', 'N2', 'N1'].sort(compareVocabularyJlptLevels), ['N1', 'N2', 'N5'])
  assert.deepEqual(
    mergeVocabularyJlptLevels(['N3'], 'N1/N2', ['N2', 'N6']),
    ['N1', 'N2', 'N3'],
  )
})

test('reading re-exports stay identical to the canonical helper', () => {
  const inputs = ['N2', ['N2', 'N3'], '["N1", "N2"]', 'N2/N3', null, ['N9']]
  for (const input of inputs) {
    assert.deepEqual(normalizeJlptLevels(input), normalizeVocabularyJlptLevels(input))
    assert.equal(resolvePrimaryJlpt(input), resolvePrimaryVocabularyJlpt(input))
  }
  assert.deepEqual(mergeJlptLevels(['N3'], 'N1'), mergeVocabularyJlptLevels(['N3'], 'N1'))
})
