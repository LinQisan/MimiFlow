import assert from 'node:assert/strict'
import test from 'node:test'
import { groupWordbooksForFilter } from '../modules/knowledge/vocabulary/domain/wordbook-list.ts'

test('wordbook filter groups preserve authored order and series identity', () => {
  const books = [
    { id: 'b', name: 'Unit10', seriesId: 's2', seriesName: '系列乙', count: 12 },
    { id: 'a', name: 'Unit02', seriesId: 's2', seriesName: '系列乙', count: 3 },
    { id: 'c', name: 'Unit02', seriesId: 's1', seriesName: '系列甲', count: 0 },
  ]
  const before = structuredClone(books)
  const groups = groupWordbooksForFilter(books)
  assert.deepEqual(groups.map(group => group.id), ['s2', 's1'])
  assert.deepEqual(groups.map(group => group.books.map(book => book.id)), [['b', 'a'], ['c']])
  assert.equal(groups[0].books[0].count, 12)
  assert.deepEqual(books, before)
})

test('same-named series remain distinct and empty collections have no groups', () => {
  assert.deepEqual(groupWordbooksForFilter([]), [])
  assert.equal(groupWordbooksForFilter([
    { id: '1', name: '基础', seriesId: 'a', seriesName: '同名' },
    { id: '2', name: '基础', seriesId: 'b', seriesName: '同名' },
  ]).length, 2)
})
