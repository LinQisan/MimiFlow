import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildVocabularyFocusHref,
  buildVocabularyViewHref,
} from '../modules/knowledge/vocabulary/domain/navigation.ts'

const readParams = href => new URL(href, 'http://localhost').searchParams

test('focus-only targets open the requested card without synthesizing q', () => {
  const params = readParams(buildVocabularyFocusHref('vocab-1'))

  assert.equal(params.get('focus'), 'vocab-1')
  assert.equal(params.get('view'), 'card')
  assert.equal(params.has('q'), false)
})

test('card mode preserves a user-entered q and every active filter', () => {
  const href = buildVocabularyViewHref(
    '/vocabulary?page=3&wordbook=book-1&group=%E6%97%A5%E8%AA%9E&pos=%E5%90%8D%E8%A9%9E&tag=N2&q=%E6%A4%9C%E7%B4%A2',
    'card',
    'vocab-2',
  )
  const params = readParams(href)

  assert.equal(params.get('page'), '3')
  assert.equal(params.get('wordbook'), 'book-1')
  assert.equal(params.get('group'), '日語')
  assert.equal(params.get('pos'), '名詞')
  assert.equal(params.get('tag'), 'N2')
  assert.equal(params.get('q'), '検索')
  assert.equal(params.get('focus'), 'vocab-2')
  assert.equal(params.get('view'), 'card')
})

test('list mode clears transient focus but keeps the active q', () => {
  const href = buildVocabularyViewHref(
    '/vocabulary?page=2&wordbook=all&group=%E6%97%A5%E8%AA%9E&q=%E6%A4%9C%E7%B4%A2&focus=vocab-2&view=card',
    'list',
  )
  const params = readParams(href)

  assert.equal(params.get('q'), '検索')
  assert.equal(params.get('page'), '2')
  assert.equal(params.has('focus'), false)
  assert.equal(params.has('view'), false)
})

test('returning from a focus card restores the unfiltered list contract', () => {
  const href = buildVocabularyViewHref(
    '/vocabulary?focus=vocab-3&view=card',
    'list',
  )

  assert.equal(href, '/vocabulary')
})

test('focus navigation does not discard a wordbook scope', () => {
  const params = readParams(
    buildVocabularyViewHref(
      '/vocabulary?wordbook=book-2&group=%E6%97%A5%E8%AA%9E',
      'card',
      'vocab-4',
    ),
  )

  assert.equal(params.get('wordbook'), 'book-2')
  assert.equal(params.get('group'), '日語')
  assert.equal(params.get('focus'), 'vocab-4')
})

test('focus navigation does not discard POS or tag filters', () => {
  const params = readParams(
    buildVocabularyViewHref(
      '/vocabulary?pos=%E5%90%8D%E8%A9%9E&tag=N3&q=%E8%AA%9E',
      'card',
      'vocab-5',
    ),
  )

  assert.equal(params.get('pos'), '名詞')
  assert.equal(params.get('tag'), 'N3')
  assert.equal(params.get('q'), '語')
})

test('back and forward URL transitions never turn focus into q', () => {
  const list = '/vocabulary?page=1&wordbook=all&q=%E6%A4%9C%E7%B4%A2'
  const focus = buildVocabularyViewHref(list, 'card', 'vocab-6')
  const returned = buildVocabularyViewHref(focus, 'list')
  const forward = buildVocabularyViewHref(returned, 'card', 'vocab-6')

  assert.equal(readParams(focus).get('q'), '検索')
  assert.equal(readParams(focus).get('focus'), 'vocab-6')
  assert.equal(readParams(returned).get('q'), '検索')
  assert.equal(readParams(returned).has('focus'), false)
  assert.equal(readParams(forward).get('q'), '検索')
  assert.equal(readParams(forward).get('focus'), 'vocab-6')
})

test('refreshing a focus URL retains its encoded focus id and card view', () => {
  const href = buildVocabularyFocusHref('vocab/%E6%97%A5%E8%AA%9E')
  const params = readParams(href)

  assert.equal(params.get('focus'), 'vocab/%E6%97%A5%E8%AA%9E')
  assert.equal(params.get('view'), 'card')
})

test('missing focus ids remain ordinary list data instead of inventing a q', () => {
  const params = readParams(
    buildVocabularyViewHref('/vocabulary?page=4&q=%E6%A4%9C%E7%B4%A2', 'card', 'missing'),
  )

  assert.equal(params.get('focus'), 'missing')
  assert.equal(params.get('q'), '検索')
})

test('NFKC-equivalent focus records use the same navigation contract', () => {
  const focusHref = buildVocabularyFocusHref('fullwidth-record')
  const returnedHref = buildVocabularyViewHref(focusHref, 'list')

  assert.equal(readParams(focusHref).get('focus'), 'fullwidth-record')
  assert.equal(readParams(returnedHref).has('focus'), false)
  assert.equal(readParams(returnedHref).has('q'), false)
})
