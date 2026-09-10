import assert from 'node:assert/strict'
import test from 'node:test'
import {
  groupVocabularyRelationsForDisplay,
  relationReadingPattern,
} from '../modules/knowledge/vocabulary/domain/relations.ts'
import { buildJapaneseRubyHtml } from '../utils/language/japaneseRuby.ts'

test('relation ruby only annotates kanji runs and keeps kana out of rt', () => {
  const cases = [
    ['依存心', 'いぞんしん', '<ruby>依存心<rt[^>]*>いぞんしん</rt></ruby>'],
    ['相互依存する', 'そうごいぞんする', '<ruby>相互依存<rt[^>]*>そうごいぞん</rt></ruby>する'],
    ['依存症', 'いぞんしょう', '<ruby>依存症<rt[^>]*>いぞんしょう</rt></ruby>'],
    ['アルコール依存症', 'アルコールいぞんしょう', 'アルコール<ruby>依存症<rt[^>]*>いぞんしょう</rt></ruby>'],
    ['頼る', 'たよる', '<ruby>頼<rt[^>]*>たよ</rt></ruby>る'],
  ]
  for (const [word, reading, expected] of cases) {
    const html = buildJapaneseRubyHtml(word, reading, { groupKanji: true })
    assert.match(html, new RegExp(`^${expected}$`))
    assert.equal(html.replace(/<rt[^>]*>.*?<\/rt>/gu, '').replace(/<[^>]*>/gu, ''), word)
  }
})

test('mechanically substituted compound patterns are hidden without modifying data', () => {
  for (const [targetText, pattern] of [
    ['依存心', '～心'], ['相互依存する', '相互～する'],
    ['依存症', '～症'], ['アルコール依存症', 'アルコール～症'],
  ]) {
    const relation = { type: 'compound', targetText, pattern }
    assert.equal(relationReadingPattern(relation, '依存'), '')
    assert.equal(relation.pattern, pattern)
  }
})

test('reading patterns preserve extra information and do not guess without a source', () => {
  const relation = { type: 'compound', targetText: '依存心', pattern: '～心（心理的傾向）' }
  assert.equal(relationReadingPattern(relation, '依存'), relation.pattern)
  assert.equal(relationReadingPattern({ ...relation, pattern: '～心' }), '～心')
  assert.equal(relationReadingPattern({ ...relation, pattern: '依存心' }), '')
  assert.equal(relationReadingPattern({ type: 'related', targetText: '頼る', marker: 'が', pattern: '～が頼る' }), '')
})

test('display groups keep related words compact and learning-oriented', () => {
  const groups = groupVocabularyRelationsForDisplay([
    { id: 'compound-1', type: 'compound' },
    { id: 'derived-1', type: 'derived' },
    { id: 'related-1', type: 'related' },
    { id: 'synonym-1', type: 'synonym' },
  ])

  assert.deepEqual(
    groups.map(group => group.label),
    ['派生・複合', '近义与相关'],
  )
  assert.deepEqual(
    groups.map(group => group.items.map(item => item.id)),
    [
      ['compound-1', 'derived-1'],
      ['related-1', 'synonym-1'],
    ],
  )
})

test('ruby falls back to plain words without a reading and escapes authored content', () => {
  assert.equal(buildJapaneseRubyHtml('頼る', '', { groupKanji: true }), '頼る')
  assert.equal(buildJapaneseRubyHtml('アルコール', 'アルコール', { groupKanji: true }), 'アルコール')
  const html = buildJapaneseRubyHtml('<依存>', 'いぞん', { groupKanji: true })
  assert.ok(html.startsWith('&lt;<ruby>'))
  assert.ok(html.endsWith('</ruby>&gt;'))
})
