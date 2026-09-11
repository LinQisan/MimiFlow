import assert from 'node:assert/strict'
import test from 'node:test'
import { groupWordbooksForFilter, listWordbookFilterOptions } from '../modules/knowledge/vocabulary/domain/wordbook-list.ts'

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
  const options = listWordbookFilterOptions(books)
  assert.deepEqual(options.map(option => option.value), ['series:s2', 'b', 'a', 'series:s1', 'c'])
  assert.equal(options[0].meta, '2 个词表')
  assert.equal(options[1].count, 12)
  assert.equal(options[1].depth, 1)
  assert.equal(options[1].selectedLabel, '系列乙 / Unit10')
  assert.equal(options[4].count, 0)
})

test('same-named series remain distinct and empty collections have no groups', () => {
  assert.deepEqual(groupWordbooksForFilter([]), [])
  assert.equal(groupWordbooksForFilter([
    { id: '1', name: '基础', seriesId: 'a', seriesName: '同名' },
    { id: '2', name: '基础', seriesId: 'b', seriesName: '同名' },
  ]).length, 2)
})
