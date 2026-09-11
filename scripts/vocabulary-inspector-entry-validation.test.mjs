import assert from 'node:assert/strict'
import test from 'node:test'

import { parseVocabularyInspectorEntry } from '../modules/knowledge/vocabulary/domain/inspector-entry-validation.ts'

const entry = {
  id: 'vocabulary-1',
  word: '学ぶ',
  pronunciations: [],
  partsOfSpeech: [],
  grammarPartOfSpeech: 'verb',
  transitivity: null,
  conjugationType: null,
  wordAudio: null,
  tags: [],
  wordbookIds: [],
  senses: [{ id: 'sense-1' }],
  definitions: [],
  sentences: [],
  patterns: [],
  expressions: [],
  relations: [],
  notes: [],
}

test('inspector parser accepts the canonical direct entry', () => {
  const direct = parseVocabularyInspectorEntry(entry)
  assert.equal(direct.success, true)
})

test('inspector parser rejects unknown fields and wrapped payloads', () => {
  assert.equal(parseVocabularyInspectorEntry({ ...entry, meanings: [] }).success, false)
  assert.equal(parseVocabularyInspectorEntry({ ...entry, clientMetadata: {} }).success, false)
  assert.equal(parseVocabularyInspectorEntry({ entry }).success, false)
})

test('inspector parser rejects incomplete entries', () => {
  const invalid = parseVocabularyInspectorEntry({ ...entry, word: '' })
  assert.equal(invalid.success, false)
})
