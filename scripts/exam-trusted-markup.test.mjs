import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'
import { createTrustedMarkupSlots } from '../components/exam/question-renderer/trustedMarkup.ts'

const hook = registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('@/')
      ? new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href
      : specifier, context)
  },
})
const { annotateExamText } = await import('../components/exam/question-renderer/annotate.ts')
hook.deregister()

const lexicon = Object.fromEntries(['猫', '0', '1', 'EXAM', 'BLANK'].map(surface => [surface, {
  surface, dictionaryForm: surface, normalizedForm: surface,
  reading: surface === '猫' ? 'ネコ' : surface,
  dictionaryReading: surface === '猫' ? 'ネコ' : surface,
  partsOfSpeech: ['名詞'],
}]))

for (const showPronunciation of [false, true]) {
  for (const showMeaning of [false, true]) {
    test(`cloze slots survive annotation: pronunciation=${showPronunciation}, meaning=${showMeaning}`, () => {
      const source = '猫[1]、猫[2]。<img src=x onerror=alert(1)>'
      const slots = createTrustedMarkupSlots(source)
      const blank = '<span class="article-blank-empty">(1)</span>'
      const note = '<sup><a href="#note-1">注1</a></sup>'
      const text = source.replace('[1]', slots.add(blank)).replace('[2]', slots.add(note))
      const settings = {
        showPronunciation, showMeaning, pronunciationSource: 'sudachi',
        sudachiLexicon: lexicon, pronunciationMap: { 猫: 'ねこ' },
        tokenWords: showMeaning ? ['猫', '0', '1', 'EXAM', 'BLANK'] : [],
      }
      const html = slots.restore(annotateExamText({ text, settings, protectedTokens: slots.tokens }))
      assert.ok(html.includes(blank))
      assert.ok(html.includes(note))
      assert.ok(!html.includes('EXAM_BLANK'))
      assert.ok(!html.includes('\uE000'))
      assert.ok(!html.includes('<img'))
      assert.ok(html.replace(/<[^>]+>/g, '').includes('&lt;img src=x onerror=alert(1)&gt;'))
      assert.equal(html.includes('<ruby'), showPronunciation)
      if (showMeaning) assert.ok(html.includes('data-vocab-surface="猫"'))
      if (showPronunciation || showMeaning) {
        assert.ok(!slots.restore(annotateExamText({ text, settings })).includes(blank), 'fixture reproduces unprotected marker corruption')
      }
    })
  }
}

test('source-authored marker text is never restored as trusted markup', () => {
  const source = '\uE000EXAM_BLANK_0\uE001'
  const slots = createTrustedMarkupSlots(source)
  const token = slots.add('<span>(1)</span>')
  assert.notEqual(token, source)
  assert.equal(slots.restore(source + token), source + '<span>(1)</span>')
})
