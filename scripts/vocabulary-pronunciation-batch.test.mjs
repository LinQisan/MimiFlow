import assert from 'node:assert/strict'
import test from 'node:test'
import { mapSentencePronunciationResults } from '../modules/knowledge/vocabulary/domain/pronunciation-batch.ts'

test('batch results accept link and sentence IDs while excluding unresolved IDs', () => {
  const data = { sentence: { segments: [{ text: '便', reading: 'べん' }] }, other: {} }
  const links = [{ id: 'link-a', sentenceId: 'sentence' }, { id: 'link-b', sentenceId: 'sentence' }]
  assert.deepEqual(mapSentencePronunciationResults(['link-a', 'link-b', 'sentence', 'other', 'missing'], links, data), {
    'link-a': data.sentence, 'link-b': data.sentence, sentence: data.sentence,
  })
  assert.deepEqual(mapSentencePronunciationResults(['sentence'], [], data), {})
})
