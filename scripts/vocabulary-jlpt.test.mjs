import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterVocabularyTags,
  inferVocabularyJlpt,
  normalizeVocabularyJlpt,
} from '../modules/knowledge/vocabulary/domain/jlpt.ts'

test('JLPT values are normalized independently from vocabulary tags', () => {
  assert.equal(normalizeVocabularyJlpt(' n2 '), 'N2')
  assert.equal(normalizeVocabularyJlpt('N2重点'), null)
  assert.equal(inferVocabularyJlpt('N2語彙トレーニング', 'Unit06'), 'N2')
})

test('structural wordbook values are not retained as vocabulary tags', () => {
  assert.deepEqual(
    filterVocabularyTags(['N2', 'unit06', 'Unit 006', 'カタカナ語', 'N2重点']),
    ['カタカナ語', 'N2重点'],
  )
})
