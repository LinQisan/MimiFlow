import assert from 'node:assert/strict'
import test from 'node:test'
import { buildJapaneseRubyHtml, annotateJapaneseTextWithSudachi } from '../utils/language/japaneseRuby.ts'
import { renderRubySegmentsHtml } from '../modules/knowledge/vocabulary/domain/pronunciation.ts'

const visibleReading = html => html.replace(/<ruby[^>]*>[^<]*<rt[^>]*>(.*?)<\/rt><\/ruby>/g, '$1').replace(/<[^>]+>/g, '')
const surfaceText = html => html.replace(/<rt[^>]*>.*?<\/rt>/g, '').replace(/<[^>]+>/g, '')

for (const [word, reading] of [
  ['素直な', 'すなおな'], ['素直な', 'スナオナ'],
  ['少ない', 'すくない'], ['危ない', 'あぶない'],
  ['暖かい', 'あたたかい'], ['示し', 'しめし'],
  ['聞き分け', 'ききわけ'], ['取り戻す', 'とりもどす'],
]) {
  test(`ruby preserves the entire reading and surface: ${word} / ${reading}`, () => {
    const html = buildJapaneseRubyHtml(word, reading)
    assert.equal(surfaceText(html), word)
    // Kana on the surface intentionally keep their original script.
    const hiragana = value => value.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    assert.equal(hiragana(visibleReading(html)), hiragana(reading))
  })
}

test('stem-only readings retain kana that happen to match the written ending', () => {
  const html = buildJapaneseRubyHtml('素直な', 'すなお')
  assert.match(html, /素直<rt[^>]*>すなお<\/rt><\/ruby>な/)
})

test('authored, automatic and materialized readings use the same alignment', () => {
  const surface = '素直な'
  const reading = 'すなおな'
  const outputs = [
    buildJapaneseRubyHtml(surface, reading),
    annotateJapaneseTextWithSudachi(surface, {
      [surface]: { surface, reading, dictionaryForm: surface, dictionaryReading: reading, normalizedForm: surface, partsOfSpeech: ['形状詞'] },
    }, { useSudachiReading: true, rubyEnabled: true }),
    renderRubySegmentsHtml([{ text: surface, reading }]),
    renderRubySegmentsHtml([{ text: '素直', reading: 'すなお' }, { text: 'な' }]),
  ]
  for (const html of outputs) {
    assert.equal(surfaceText(html), surface)
    assert.equal(visibleReading(html), reading)
  }
})
