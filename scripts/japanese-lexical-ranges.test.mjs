import assert from 'node:assert/strict'
import test from 'node:test'

import {
  annotateJapaneseText,
  buildJapaneseLexicalRanges,
  buildJapaneseRubyHtml,
} from '../utils/language/japaneseRuby.ts'
import { buildPronunciationMapForText } from '../utils/vocabulary/japaneseInflection.ts'
import {
  groupWordbookDistributionBySource,
  resolveJlptHighlightSlot,
  resolvePrimaryJlpt,
} from '../features/reading/domain/wordbook-highlight-groups.ts'

test('adjacent tokens keep exact original-text offsets', () => {
  const text = '進むフェリー'
  assert.equal(text.length, 6)
  assert.deepEqual(buildJapaneseLexicalRanges(text, ['進む', 'フェリー']), [
    { surface: '進む', start: 0, end: 2 },
    { surface: 'フェリー', start: 2, end: 6 },
  ])
})

test('overlapping candidates resolve to the longest match without overlap', () => {
  const ranges = buildJapaneseLexicalRanges('進むフェリー', [
    '進むフェリー',
    '進む',
    'フェリー',
  ])
  assert.deepEqual(ranges, [{ surface: '進むフェリー', start: 0, end: 6 }])
})

test('short kanji surfaces keep the compound boundary used by alias matching', () => {
  assert.deepEqual(buildJapaneseLexicalRanges('外国 国', ['国']), [
    { surface: '国', start: 3, end: 4 },
  ])
  assert.deepEqual(buildJapaneseLexicalRanges('外国人', ['外国人', '国']), [
    { surface: '外国人', start: 0, end: 3 },
  ])
})

test('rendered tokens carry original offsets and ruby never enters the coordinate space', () => {
  const html = annotateJapaneseText(
    '進むフェリー',
    { '進む': 'すすむ', 'フェリー': 'ふぇりー' },
    { tokenClassName: 'vocab-token' },
  )
  assert.match(html, /data-vocab-token="true"/)
  assert.match(html, /data-vocab-start="0"/)
  assert.match(html, /data-vocab-end="2"/)
  assert.match(html, /data-vocab-start="2"/)
  assert.match(html, /data-vocab-end="6"/)
  // rt content is decoration: it must not shift the lexical coordinates above.
  assert.match(html, /<rt/)
  assert.equal(html.includes('data-vocab-start="3"'), false)
})

test('ruby splits the reading across kanji without touching offsets', () => {
  const html = buildJapaneseRubyHtml('進む', 'すすむ')
  assert.match(html, /<ruby>/)
  // Okurigana stays outside the ruby element; the kanji keeps its share.
  assert.match(html, /<rt[^>]*>すす<\/rt><\/ruby>む/)
})

test('mixed kanji and kana words group the kanji reading before okurigana', () => {
  const cases = [
    ['手探り', 'てさぐり', /^<ruby>手探<rt[^>]*>てさぐ<\/rt><\/ruby>り$/],
    ['受取り', 'うけとり', /^<ruby>受取<rt[^>]*>うけと<\/rt><\/ruby>り$/],
    ['取扱い', 'とりあつかい', /^<ruby>取扱<rt[^>]*>とりあつか<\/rt><\/ruby>い$/],
    ['お手伝い', 'おてつだい', /^お<ruby>手伝<rt[^>]*>てつだ<\/rt><\/ruby>い$/],
    ['取り扱う', 'とりあつかう', /^<ruby>取<rt[^>]*>と<\/rt><\/ruby>り<ruby>扱<rt[^>]*>あつか<\/rt><\/ruby>う$/],
  ]
  for (const [word, reading, expected] of cases) {
    const html = buildJapaneseRubyHtml(word, reading)
    assert.match(html, expected)
    assert.equal(
      html.replace(/<rt[^>]*>.*?<\/rt>/gu, '').replace(/<[^>]*>/gu, ''),
      word,
    )
  }

  // The mixed-script rule must not change the existing default for a wholly
  // kanji compound, where callers may still request per-kanji ruby.
  const allKanji = buildJapaneseRubyHtml('日本', 'にほん')
  assert.equal((allKanji.match(/<ruby>/gu) || []).length, 2)
})

test('conjugated surfaces match the lemma while ranges stay on the surface', () => {
  // Note: a kanji directly before the verb (昨日進んだ) is deliberately left
  // unmatched by the compound-prefix guard; use a kana boundary instead.
  const text = '彼は進んだ'
  const pronMap = buildPronunciationMapForText(text, { '進む': 'すすむ' })
  assert.ok('進んだ' in pronMap, 'inflected surface is addressable')
  assert.equal(pronMap['進んだ'], 'すすんだ')
  const ranges = buildJapaneseLexicalRanges(text, Object.keys(pronMap))
  const hit = ranges.find(range => range.surface === '進んだ')
  assert.deepEqual(hit, { surface: '進んだ', start: 2, end: 5 })
})

test('one token in two wordbooks merges metadata instead of overlapping', () => {
  const sources = groupWordbookDistributionBySource([
    {
      id: 'red-n2',
      pathLabel: '红宝书 / N2',
      sourceId: 'red-series',
      sourceLabel: '红宝书',
      matchedWords: ['進む'],
      matchedHeadwords: { '進む': '進む' },
      matchedJlpt: { '進む': ['N2'] },
    },
    {
      id: 'red-n3',
      pathLabel: '红宝书 / N3',
      sourceId: 'red-series',
      sourceLabel: '红宝书',
      matchedWords: ['進む'],
      matchedHeadwords: { '進む': '進む' },
      matchedJlpt: { '進む': ['N3'] },
    },
  ])
  assert.equal(sources.length, 1)
  // A preceding token must never leak its levels into the next one: use a
  // second word that exists in only one wordbook.
  assert.deepEqual(sources[0].jlptByWord['進む'], ['N2', 'N3'])
  assert.deepEqual(sources[0].wordbookIdsByWord['進む'].sort(), ['red-n2', 'red-n3'])
  // The single primary level decides one deterministic highlight slot.
  assert.equal(resolvePrimaryJlpt(sources[0].jlptByWord['進む']), 'N2')
  assert.equal(
    resolveJlptHighlightSlot(resolvePrimaryJlpt(sources[0].jlptByWord['進む'])),
    3,
  )
})
