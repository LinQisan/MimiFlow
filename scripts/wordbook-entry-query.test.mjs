import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWordbookQuery, wordbookEntryWhere } from '../modules/knowledge/wordbooks/entry-query.ts'
import { buildWordbookEntryHref, buildVocabularyViewHref } from '../modules/knowledge/vocabulary/domain/navigation.ts'

test('empty and full-book searches retain both wordbook and vocabulary ownership', () => {
  for (const query of ['', '青春', 'せいしゅん', '名詞']) {
    const where = wordbookEntryWhere('owner-a', 'book-a', query)
    assert.equal(where.wordbookId, 'book-a')
    assert.deepEqual(where.wordbook, { userId: 'owner-a' })
    assert.equal(where.vocabulary.userId, 'owner-a')
  }
  assert.equal(wordbookEntryWhere('owner-b', 'book-a').vocabulary.userId, 'owner-b')
})

test('search normalizes fullwidth input and includes readings, etymologies, meanings and parts of speech', () => {
  assert.equal(normalizeWordbookQuery('  ＡＢＣ　'), 'ABC')
  assert.equal(normalizeWordbookQuery('字'.repeat(120)).length, 100)
  assert.equal(wordbookEntryWhere('u', 'b', '  ').vocabulary.OR, undefined)
  const filters = wordbookEntryWhere('u', 'b', '　青春 ').vocabulary.OR
  assert.deepEqual(filters.slice(0, 4), ['word', 'pronunciations', 'etymologies', 'partsOfSpeech'].map(field => ({
    [field]: { contains: '青春', mode: 'insensitive' },
  })))
  assert.deepEqual(filters[4], { senses: { some: { definitions: { some: { definition: { contains: '青春', mode: 'insensitive' } } } } } })
})

test('view and edit target the requested card in its wordbook scope', () => {
  for (const edit of [false, true]) {
    const url = new URL(buildWordbookEntryHref('book / 1', 'word / 2', edit), 'http://localhost')
    assert.equal(url.pathname, '/vocabulary')
    assert.equal(url.searchParams.get('wordbook'), 'book / 1')
    assert.equal(url.searchParams.get('focus'), 'word / 2')
    assert.equal(url.searchParams.get('view'), 'card')
    assert.equal(url.searchParams.get('edit'), edit ? '1' : null)
    assert.equal(url.searchParams.has('q'), false)
  }
})

test('leaving an entry clears edit mode while preserving the book scope', () => {
  const url = new URL(buildVocabularyViewHref(buildWordbookEntryHref('b', 'v', true), 'list'), 'http://localhost')
  assert.equal(url.searchParams.get('wordbook'), 'b')
  assert.equal(url.searchParams.has('edit'), false)
  assert.equal(url.searchParams.has('focus'), false)
})
