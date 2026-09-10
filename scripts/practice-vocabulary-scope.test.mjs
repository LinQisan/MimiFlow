import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveVocabularyScopeIds, mergeVocabularyScope } from '../modules/practice/domain/vocabulary-scope.ts'

const entry = (word, ids, isMastered = false) => ({ word, wordbookIds: ids, isMastered, reading: '', partOfSpeech: '' })
const absent = row => ({ ...row, isMastered: Boolean(row.isMastered), count: 0, paperCount: 0 })

test('whole books resolve every leaf in authored order, including more than fifty lists', () => {
  const lists = Array.from({ length: 65 }, (_, i) => ({ id: `list-${i}`, seriesId: 'book' }))
  lists.push({ id: 'other', seriesId: 'other-book' })
  assert.equal(resolveVocabularyScopeIds(lists, 'series', 'book').length, 65)
  assert.deepEqual(resolveVocabularyScopeIds(lists, 'wordbook', 'list-3'), ['list-3'])
  assert.deepEqual(resolveVocabularyScopeIds(lists, 'wordbook', 'book'), [])
  assert.deepEqual(resolveVocabularyScopeIds(lists, 'all', ''), [])
})

test('scope deduplicates book entries, retains corpus evidence, and includes absent words', () => {
  const corpus = [{ ...entry('ＡＩ', []), count: 7, paperCount: 3 }, { ...entry('外部', ['one']), count: 2 }]
  const entries = [entry('AI', ['one']), entry('ＡＩ', ['two']), entry('新語', ['two'], true)]
  const rows = mergeVocabularyScope(corpus, entries, absent)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].count, 7)
  assert.deepEqual(rows[0].wordbookIds, ['one', 'two'])
  assert.equal(rows[1].count, 0)
  assert.equal(rows[1].isMastered, true)
  assert.equal(corpus[0].wordbookIds.length, 0)
})

test('empty scopes stay empty and local mastery changes override fetched preferences', () => {
  assert.deepEqual(mergeVocabularyScope([absent(entry('語', ['one']))], [], absent), [])
  const rows = mergeVocabularyScope([], [entry('語', ['one'], true)], absent, { '語': false })
  assert.equal(rows[0].isMastered, false)
})
