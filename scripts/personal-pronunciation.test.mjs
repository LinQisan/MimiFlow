import assert from 'node:assert/strict'
import test from 'node:test'
import { personalReadingCandidates, occurrenceReadings } from '../modules/language/domain/personal-pronunciation.ts'
import { annotateJapaneseText } from '../utils/language/japaneseRuby.ts'
import { buildPronunciationMapForText } from '../utils/vocabulary/japaneseInflection.ts'

test('personal readings preserve authored alternative order and inflect each candidate', () => {
  assert.deepEqual(personalReadingCandidates('突く', { 突く: { pronunciations: ['つく', 'つつく'] } }), ['つく', 'つつく'])
  assert.deepEqual(personalReadingCandidates('突いた', { 突く: { pronunciations: ['つく / つつく'] } }), ['ついた', 'つついた'])
})

test('compound personal ruby stays intact across possible tokenizer boundaries', () => {
  const map = buildPronunciationMapForText('思い返す。思い返した。', { 思い返す: 'おもいかえす', 思い: 'おもい' })
  const html = annotateJapaneseText('思い返す。思い返した。', map, { tokenClassName: 'vocab-token' })
  assert.match(html, /data-vocab-surface="思い返す"/)
  assert.match(html, /data-vocab-surface="思い返した"/)
  assert.equal((html.match(/>かえ<\/rt>/g) || []).length, 2)
})

test('personal vocabulary ruby groups a mixed kanji run before trailing kana', () => {
  const html = annotateJapaneseText('手探り', { 手探り: 'てさぐり' })
  assert.match(html, /^<ruby>手探<rt[^>]*>てさぐ<\/rt><\/ruby>り$/)
})

test('saved reading affects only its source occurrence and rejects stale source text', () => {
  const text = '突く。突く。'
  const choice = { location: 'chapter:block-0', sourceText: text, start: 3, surface: '突く', reading: 'つつく' }
  const overrides = occurrenceReadings(text, choice.location, [choice])
  assert.deepEqual(overrides, { 3: 'つつく' })
  assert.deepEqual(occurrenceReadings(text, 'chapter:block-1', [choice]), {})
  assert.deepEqual(occurrenceReadings('突く。', choice.location, [choice]), {})
  const html = annotateJapaneseText(text, { 突く: 'つく' }, { occurrenceReadings: overrides })
  assert.match(html, />つ<\/rt>/)
  assert.match(html, />つつ<\/rt>/)
  assert.equal(html.replace(/<rt[^>]*>.*?<\/rt>/g, '').replace(/<[^>]+>/g, ''), text)
})

test('copy includes occurrence choices while keeping other occurrences and source markers intact', async () => {
  const { formatJapaneseTextWithRubyNotation } = await import('../utils/language/japaneseRuby.ts')
  assert.equal(formatJapaneseTextWithRubyNotation('突く。突く。[^1]', { 突く: 'つく' }, { 3: 'つつく' }), '{突く|つく}。{突く|つつく}。[^1]')
})

test('personal reading does not annotate a shorter word inside another lexical word', () => {
  const html = annotateJapaneseText('日本人と思い返した', { 人: 'ひと', 思い返した: 'おもいかえした' }, { lexicalBoundaries: [0, 3, 4, 8, 9] })
  assert.ok(!html.includes('ひと'))
  assert.ok(html.includes('おも'))
  assert.ok(html.includes('かえ'))
})

test('only words with multiple readings expose a reading switch', () => {
  const html = annotateJapaneseText('突く。思い返す。', { 突く: 'つく', 思い返す: 'おもいかえす' }, {
    tokenClassName: 'vocab-token', editableReadingSurfaces: ['突く'],
  })
  assert.equal((html.match(/data-pronunciation-editable/g) || []).length, 1)
  assert.match(html, /aria-label="修改「突く」在此处的读音"/)
  assert.ok(!html.includes('修改「思い返す」'))
  assert.ok(html.includes('かえ'))
})
