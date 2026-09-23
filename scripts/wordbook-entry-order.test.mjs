import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isWordbookEntryMoveDirection,
  moveWordbookEntry,
  planImportedWordbookOrder,
  WORDBOOK_ENTRY_ORDER,
} from '../modules/knowledge/wordbooks/entry-order.ts'
import { vocabularyGroupPageSql } from '../modules/knowledge/vocabulary/server/group-page-query.ts'

test('Anki preserves A B C source order even when B already exists', () => {
  assert.deepEqual(planImportedWordbookOrder(['A', 'B', 'C'], [{ vocabularyId: 'B', sortOrder: 0 }]), [
    { vocabularyId: 'A', sortOrder: 1 },
    { vocabularyId: 'B', sortOrder: 2 },
    { vocabularyId: 'C', sortOrder: 3 },
  ])
})
test('reimport is idempotent, keeps first occurrence, and appends after unrelated entries', () => {
  const other = [{ vocabularyId: 'older', sortOrder: 5 }]
  const result = planImportedWordbookOrder(['A', 'B', 'A', 'C'], other)
  assert.deepEqual(result.map(row => row.sortOrder), [6, 7, 8])
  assert.deepEqual(planImportedWordbookOrder(['A', 'B', 'C'], [...other, ...result]), result)
  assert.deepEqual(other, [{ vocabularyId: 'older', sortOrder: 5 }])
})
test('a single word can move one authored-order slot in either direction', () => {
  const initial = ['A', 'B', 'C']
  assert.deepEqual(moveWordbookEntry(initial, 'B', 'up'), ['B', 'A', 'C'])
  assert.deepEqual(moveWordbookEntry(initial, 'B', 'down'), ['A', 'C', 'B'])
  assert.deepEqual(initial, ['A', 'B', 'C'])
})
test('wordbook entry moves reject missing entries, boundaries, and invalid directions', () => {
  assert.equal(moveWordbookEntry(['A', 'B'], 'A', 'up'), null)
  assert.equal(moveWordbookEntry(['A', 'B'], 'B', 'down'), null)
  assert.equal(moveWordbookEntry(['A', 'B'], 'missing', 'up'), null)
  assert.equal(isWordbookEntryMoveDirection('up'), true)
  assert.equal(isWordbookEntryMoveDirection('down'), true)
  assert.equal(isWordbookEntryMoveDirection('sideways'), false)
})
test('oldest-first and authored entry ordering are applied before pagination', () => {
  assert.deepEqual(WORDBOOK_ENTRY_ORDER, [{ sortOrder: 'asc' }, { vocabulary: { createdAt: 'asc' } }, { vocabularyId: 'asc' }])
  const query = vocabularyGroupPageSql('owner', {
    wordbookFilter: 'book', seriesFilter: '', tagFilter: 'all', keyword: '',
    groupFilter: '', posFilter: 'all', page: 2, pageSize: 30, focusId: '',
  }, [], { kana: 'ja', hangul: 'ko', han: 'zh', cyrillic: 'ru', other: 'en' })
  assert.match(query.text, /entry.sort_order/)
  assert.match(query.text, /JOIN wordbooks book ON book.id = entry.wordbook_id/)
  assert.doesNotMatch(query.text, /book.user_id = \$\d+/)
  assert.match(query.text, /v\."createdAt" ASC, v.id ASC/)
  assert.ok(query.text.indexOf('entry.sort_order') < query.text.indexOf('pagination AS'))
  assert.ok(query.values.includes('owner'))
  assert.ok(query.values.includes('book'))
})
