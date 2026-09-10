import assert from 'node:assert/strict'
import test from 'node:test'
import { applyVocabularyInspectorMetaUpdate, applyVocabularyInspectorPronunciationUpdate } from '../modules/knowledge/vocabulary/domain/inspector-meta.ts'

const meta = { pronunciations: ['ふだん'], partsOfSpeech: ['名詞'], meanings: ['平时'], wordAudio: '/audios/word.mp3' }

test('renaming a popup entry clears stale old metadata without changing unrelated words', () => {
  const original = { '普段': meta, '別': meta }
  const result = applyVocabularyInspectorMetaUpdate(original, { word: '平常', previousWord: '普段', meta })
  assert.deepEqual(result['普段'], { pronunciations: [], partsOfSpeech: [], meanings: [], wordAudio: null })
  assert.equal(result['平常'], meta)
  assert.equal(result['別'], meta)
  assert.equal(original['普段'], meta)
})

test('ordinary edits and existing callers replace only their requested word', () => {
  const next = { ...meta, meanings: ['日常'] }
  assert.deepEqual(applyVocabularyInspectorMetaUpdate({ '普段': meta }, { word: '普段', previousWord: '普段', meta: next }), { '普段': next })
  assert.deepEqual(applyVocabularyInspectorMetaUpdate({}, { word: '普段', meta }), { '普段': meta })
})

test('pronunciation edits replace or remove cached readings and drop the old headword', () => {
  const original = { '普段': 'ふだん', '別': 'べつ' }
  assert.deepEqual(applyVocabularyInspectorPronunciationUpdate(original, { word: '平常', previousWord: '普段', meta: { ...meta, pronunciations: ['へいじょう'] } }), { '平常': 'へいじょう', '別': 'べつ' })
  assert.deepEqual(applyVocabularyInspectorPronunciationUpdate(original, { word: '普段', meta: { ...meta, pronunciations: [] } }), { '別': 'べつ' })
  assert.equal(original['普段'], 'ふだん')
})
