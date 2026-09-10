import assert from 'node:assert/strict'
import test from 'node:test'

import { parseVocabularyInspectorEntry } from '../modules/knowledge/vocabulary/domain/inspector-entry-validation.ts'

const entry = {
  id: 'vocabulary-1',
  word: '学ぶ',
  pronunciations: [],
  partsOfSpeech: [],
  meanings: [],
  grammarPartOfSpeech: 'verb',
  transitivity: null,
  conjugationType: null,
  wordAudio: null,
  tags: [],
  wordbookIds: [],
  senses: [{ id: 'sense-1', clientMetadata: { source: 'editor' } }],
  definitions: [],
  sentences: [],
  patterns: [],
  expressions: [],
  relations: [],
  notes: [],
  clientMetadata: { source: 'editor' },
}

test('inspector parser accepts direct and wrapped entries without dropping unknown fields', () => {
  const direct = parseVocabularyInspectorEntry(entry)
  assert.equal(direct.success, true)
  assert.deepEqual(direct.data.clientMetadata, { source: 'editor' })

  const wrapped = parseVocabularyInspectorEntry({ entry, requestId: 'request-1' })
  assert.equal(wrapped.success, true)
  assert.equal(wrapped.data.id, entry.id)
  assert.deepEqual(wrapped.data.senses[0].clientMetadata, { source: 'editor' })
})

test('inspector parser rejects incomplete entries', () => {
  const invalid = parseVocabularyInspectorEntry({ ...entry, word: '' })
  assert.equal(invalid.success, false)
})
