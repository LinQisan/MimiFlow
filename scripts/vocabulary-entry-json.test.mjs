import assert from 'node:assert/strict'
import test from 'node:test'
import { parseVocabularyEntryJson, serializeVocabularyEntry } from '../modules/knowledge/vocabulary/domain/entry-json.ts'
const content = {
  word: '言いつける', pronunciations: ['いいつける'], grammarPartOfSpeech: 'verb', tags: [],
  senses: [{ definitions: [{ language: 'zh', text: '吩咐' }], examples: [{ text: '母に言いつける。', source: '教材', sourceUrl: '#', posTags: ['他動詞'] }], patterns: [], expressions: [], relations: [], notes: [] }],
}
test('JSON accepts copied structures without IDs, validates POS, and locks current identity', () => {
  const draft = parseVocabularyEntryJson(JSON.stringify({ ...content, vocabularyId: 'another' }), 'current')
  assert.equal(draft.vocabularyId, 'current')
  assert.ok(draft.senses[0].id)
  assert.deepEqual(draft.senses[0].examples[0].posTags, ['他動詞'])
  assert.deepEqual(parseVocabularyEntryJson(serializeVocabularyEntry(draft), 'current'), draft)
  assert.ok(!serializeVocabularyEntry(draft).includes('vocabularyId'))
})
test('JSON rejects incomplete input instead of saving a previous draft', () => {
  assert.throws(() => parseVocabularyEntryJson('{', 'current'))
  assert.throws(() => parseVocabularyEntryJson('[]', 'current'), /对象/)
  assert.throws(() => parseVocabularyEntryJson(JSON.stringify({ ...content, word: '' }), 'current'), /word/)
})

test('multiple readings survive JSON serialization and reordering without losing manual ruby', () => {
  const draft = parseVocabularyEntryJson(JSON.stringify({ ...content, pronunciations: ['にん|げん', 'じんかん'] }), 'current')
  assert.deepEqual(draft.pronunciations, ['にん|げん', 'じんかん'])
  const json = JSON.parse(serializeVocabularyEntry(draft))
  assert.equal('reading' in json, false)
  json.pronunciations.reverse()
  const changed = parseVocabularyEntryJson(JSON.stringify(json), 'current')
  assert.deepEqual(changed.pronunciations, ['じんかん', 'にん|げん'])
})

test('pronunciation lists can be cleared and malformed or singular readings fail visibly', () => {
  const draft = parseVocabularyEntryJson(JSON.stringify({ ...content, pronunciations: [] }), 'current')
  assert.deepEqual(draft.pronunciations, [])
  for (const pronunciations of ['かな', [1], ['']]) {
    assert.throws(() => parseVocabularyEntryJson(JSON.stringify({ ...content, pronunciations }), 'current'), /pronunciations/)
  }
  assert.throws(() => parseVocabularyEntryJson(JSON.stringify({ ...content, reading: 'different' }), 'current'), /Unrecognized key|无法识别/)
})
