import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  annotateJapaneseTextWithSudachi,
  buildJapaneseRubyHtml,
  formatJapaneseTextWithSudachiRubyNotation,
  isInlineKanaReadingCompatible,
} from '../utils/language/japaneseRuby.ts'
import {
  buildJapaneseVocabularySearchTerms,
  containsJapaneseVocabularyMatch,
} from '../utils/vocabulary/japaneseInflection.ts'
import { getVocabularyMatchVariants } from '../utils/text/pronunciation.ts'

// Lexicon entries copied verbatim from a real run of
// `scripts/sudachi_pronunciation.py` for the card below, so this test locks
// the render contract against the actual Sudachi output shape.
const LEXICON = {
  '事前': { surface: '事前', dictionaryForm: '事前', normalizedForm: '事前', reading: 'じぜん', dictionaryReading: 'じぜん', partsOfSpeech: ['名詞'] },
  'に': { surface: 'に', dictionaryForm: 'に', normalizedForm: 'に', reading: 'に', dictionaryReading: 'に', partsOfSpeech: ['助詞'] },
  'インタビュー': { surface: 'インタビュー', dictionaryForm: 'インタビュー', normalizedForm: 'インタビュー', reading: 'いんたびゅー', dictionaryReading: 'いんたびゅー', partsOfSpeech: ['名詞'] },
  'の': { surface: 'の', dictionaryForm: 'の', normalizedForm: 'の', reading: 'の', dictionaryReading: 'の', partsOfSpeech: ['助詞'] },
  '相手': { surface: '相手', dictionaryForm: '相手', normalizedForm: '相手', reading: 'あいて', dictionaryReading: 'あいて', partsOfSpeech: ['名詞'] },
  '質問': { surface: '質問', dictionaryForm: '質問', normalizedForm: '質問', reading: 'しつもん', dictionaryReading: 'しつもん', partsOfSpeech: ['名詞'] },
  'を': { surface: 'を', dictionaryForm: 'を', normalizedForm: 'を', reading: 'を', dictionaryReading: 'を', partsOfSpeech: ['助詞'] },
  '伝え': { surface: '伝え', dictionaryForm: '伝える', normalizedForm: '伝える', reading: 'つたえ', dictionaryReading: 'つたえる', partsOfSpeech: ['動詞'] },
  'て': { surface: 'て', dictionaryForm: 'て', normalizedForm: 'て', reading: 'て', dictionaryReading: 'て', partsOfSpeech: ['助詞'] },
  'おい': { surface: 'おい', dictionaryForm: 'おく', normalizedForm: 'おく', reading: 'おい', dictionaryReading: 'おく', partsOfSpeech: ['動詞'] },
  'た': { surface: 'た', dictionaryForm: 'た', normalizedForm: 'た', reading: 'た', dictionaryReading: 'た', partsOfSpeech: ['助動詞'] },
}

const SUDACHI_OPTIONS = {
  useSudachiReading: true,
  rubyEnabled: true,
  rubyClassName: 'jp-ruby',
  rtClassName: 'jp-ruby-rt',
}

test('card headword renders grouped Sudachi ruby without kana ruby', () => {
  const html = annotateJapaneseTextWithSudachi('事前に', LEXICON, SUDACHI_OPTIONS)
  // 事前 keeps one grouped ruby; the kana に must not gain ruby.
  assert.match(html, /<ruby[^>]*>事前<rt[^>]*>じぜん<\/rt><\/ruby>/)
  assert.equal(html.includes('>に<rt'), false)
  // Original-text offsets stay intact for highlight/click behavior.
  assert.match(html, /data-vocab-start="0"/)
  assert.match(html, /data-vocab-end="2"/)
  assert.match(html, /data-vocab-start="2"/)
  assert.match(html, /data-vocab-end="3"/)
})

test('parenthesized headword uses the analyzed reading, not the parens', () => {
  // The live pipeline returns the whole headword 後(に) as one Sudachi
  // surface (verb+okurigana notation kept by the tokenizer) with the
  // analyzed reading あと. It must not be misread as inline ruby notation.
  const lexicon = {
    '後(に)': { surface: '後(に)', dictionaryForm: '後', normalizedForm: '後', reading: 'あと', dictionaryReading: 'あと', partsOfSpeech: ['名詞'] },
    '後': { surface: '後', dictionaryForm: '後', normalizedForm: '後', reading: 'あと', dictionaryReading: 'あと', partsOfSpeech: ['名詞'] },
    'に': { surface: 'に', dictionaryForm: 'に', normalizedForm: 'に', reading: 'に', dictionaryReading: 'に', partsOfSpeech: ['助詞'] },
  }
  const html = annotateJapaneseTextWithSudachi('後(に)', lexicon, SUDACHI_OPTIONS)
  assert.match(html, /<ruby[^>]*>後<rt[^>]*>あと<\/rt><\/ruby>\(に\)/)
  assert.match(html, /data-vocab-start="0"/)
  assert.match(html, /data-vocab-end="4"/)
  // Genuine inline notation (authored kana covered by the token reading)
  // Keeps the authored rendering for 辿（たど）っ.
  const inlineLexicon = {
    '辿（たど）っ': { surface: '辿（たど）っ', dictionaryForm: '辿る', normalizedForm: '辿る', reading: 'たどっ', dictionaryReading: 'たどる', partsOfSpeech: ['動詞'] },
  }
  const inlineHtml = annotateJapaneseTextWithSudachi('辿（たど）っ', inlineLexicon, SUDACHI_OPTIONS)
  assert.match(inlineHtml, /<ruby[^>]*>辿<rt[^>]*>たど<\/rt><\/ruby>（たど）っ/)
  // The personal path is untouched: same inputs, same outputs as before.
  assert.match(
    buildJapaneseRubyHtml('後(に)', 'のちに', { rubyClassName: 'jp-ruby', rtClassName: 'jp-ruby-rt' }),
    /<ruby[^>]*>後<rt[^>]*>のち<\/rt><\/ruby>\(に\)/,
  )
})

test('card sentence renders Sudachi ruby on every kanji token', () => {
  const text = 'インタビューの相手に、事前に質問を伝えておいた。'
  const html = annotateJapaneseTextWithSudachi(text, LEXICON, SUDACHI_OPTIONS)
  assert.match(html, /<ruby[^>]*>相手<rt[^>]*>あいて<\/rt><\/ruby>/)
  assert.match(html, /<ruby[^>]*>事前<rt[^>]*>じぜん<\/rt><\/ruby>/)
  assert.match(html, /<ruby[^>]*>質問<rt[^>]*>しつもん<\/rt><\/ruby>/)
  // 伝え splits into kanji ruby + okurigana, same as Reading/Practice.
  assert.match(html, /<ruby[^>]*>伝<rt[^>]*>つた<\/rt><\/ruby>え/)
  // Every token keeps its original-text range: no metadata leaks across tokens.
  const starts = [...html.matchAll(/data-vocab-start="(\d+)"/g)].map(m => Number(m[1]))
  assert.ok(starts.length > 5, `expected many tokens, got ${starts.length}`)
  assert.deepEqual([...starts].sort((a, b) => a - b), starts)
})

test('card resolver prefers Sudachi in default mode, keeps personal fallback', async () => {
  const tabs = await readFile(
    path.join(process.cwd(), 'modules/knowledge/vocabulary/components/VocabularyTabs.tsx'),
    'utf8',
  )
  const resolver = tabs.slice(tabs.indexOf('const pronunciationSourceForVocab'))
  const body = resolver.slice(0, resolver.indexOf('\n  }\n'))
  // Default mode with Sudachi data ready short-circuits before the authored
  // (N語彙トレーニング) preference.
  const sudachiBranch = body.indexOf("return 'sudachi' as const")
  const authoredBranch = body.indexOf('prefersAuthoredVocabularyPronunciation')
  assert.ok(sudachiBranch >= 0 && authoredBranch >= 0 && sudachiBranch < authoredBranch)
  assert.match(body, /sudachiAvailable/)
  // "我的" and non-Japanese paths still resolve to personal.
  assert.match(body, /return 'personal' as const/)
})

// Lexicon entries copied verbatim from a real Sudachi run for the sentence
// below. Headword 後(に) (reading のちに) never matches it, which used to
// blank the whole sentence before the Sudachi branch was decoupled.
const SENTENCE_LEXICON = {
  '松本': { surface: '松本', dictionaryForm: '松本', normalizedForm: '松本', reading: 'まつもと', dictionaryReading: 'まつもと', partsOfSpeech: ['名詞'] },
  'さん': { surface: 'さん', dictionaryForm: 'さん', normalizedForm: 'さん', reading: 'さん', dictionaryReading: 'さん', partsOfSpeech: ['接尾辞'] },
  'は': { surface: 'は', dictionaryForm: 'は', normalizedForm: 'は', reading: 'は', dictionaryReading: 'は', partsOfSpeech: ['助詞'] },
  '文学部': { surface: '文学部', dictionaryForm: '文学部', normalizedForm: '文学部', reading: 'ぶんがくぶ', dictionaryReading: 'ぶんがくぶ', partsOfSpeech: ['名詞'] },
  'を': { surface: 'を', dictionaryForm: 'を', normalizedForm: 'を', reading: 'を', dictionaryReading: 'を', partsOfSpeech: ['助詞'] },
  '卒業': { surface: '卒業', dictionaryForm: '卒業', normalizedForm: '卒業', reading: 'そつぎょう', dictionaryReading: 'そつぎょう', partsOfSpeech: ['名詞'] },
  'し': { surface: 'し', dictionaryForm: 'する', normalizedForm: '為る', reading: 'し', dictionaryReading: 'する', partsOfSpeech: ['動詞'] },
  'た': { surface: 'た', dictionaryForm: 'た', normalizedForm: 'た', reading: 'た', dictionaryReading: 'た', partsOfSpeech: ['助動詞'] },
  '後': { surface: '後', dictionaryForm: '後', normalizedForm: '後', reading: 'あと', dictionaryReading: 'あと', partsOfSpeech: ['名詞'] },
  'に': { surface: 'に', dictionaryForm: 'に', normalizedForm: 'に', reading: 'に', dictionaryReading: 'に', partsOfSpeech: ['助詞'] },
  '医学部': { surface: '医学部', dictionaryForm: '医学部', normalizedForm: '医学部', reading: 'いがくぶ', dictionaryReading: 'いがくぶ', partsOfSpeech: ['名詞'] },
  '入り': { surface: '入り', dictionaryForm: '入る', normalizedForm: '入る', reading: 'はいり', dictionaryReading: 'はいる', partsOfSpeech: ['動詞'] },
  '直し': { surface: '直し', dictionaryForm: '直す', normalizedForm: '直す', reading: 'なおし', dictionaryReading: 'なおす', partsOfSpeech: ['動詞'] },
}

test('sentence without headword match still renders full Sudachi ruby', () => {
  const word = '後(に)'
  const text = '松本さんは文学部を卒業した後に、医学部に入り直したそうだ。'
  // Replicates VocabularySentenceText's match gate with the real data:
  // the headword genuinely matches nothing in this sentence.
  const variants = getVocabularyMatchVariants(word, ['のちに'])
  const terms = buildJapaneseVocabularySearchTerms(word, [], variants)
  const additional = new Set(variants.slice(1))
  const matched = terms.filter(surface =>
    containsJapaneseVocabularyMatch(text, surface, additional.has(surface)),
  )
  assert.deepEqual(matched, [])
  // The fixed Sudachi branch annotates the whole text anyway.
  const html = annotateJapaneseTextWithSudachi(text, SENTENCE_LEXICON, {
    useSudachiReading: true,
    rubyEnabled: true,
    rubyClassName: 'jp-ruby',
    rtClassName: 'jp-ruby-rt',
  })
  assert.match(html, /<ruby[^>]*>松本<rt[^>]*>まつもと<\/rt><\/ruby>/)
  assert.match(html, /<ruby[^>]*>文学部<rt[^>]*>ぶんがくぶ<\/rt><\/ruby>/)
  assert.match(html, /<ruby[^>]*>卒業<rt[^>]*>そつぎょう<\/rt><\/ruby>/)
  assert.match(html, /<ruby[^>]*>後<rt[^>]*>あと<\/rt><\/ruby>/)
  assert.match(html, /<ruby[^>]*>医学部<rt[^>]*>いがくぶ<\/rt><\/ruby>/)
  // 入り直した splits into kanji ruby + okurigana, same as Reading/Practice.
  assert.match(html, /<ruby[^>]*>入<rt[^>]*>はい<\/rt><\/ruby>り/)
  assert.match(html, /<ruby[^>]*>直<rt[^>]*>なお<\/rt><\/ruby>し/)
  // Token ranges stay intact for highlight/click behavior.
  const starts = [...html.matchAll(/data-vocab-start="(\d+)"/g)].map(m => Number(m[1]))
  assert.ok(starts.length > 5)
  assert.deepEqual([...starts].sort((a, b) => a - b), starts)
})

test('sentence component keeps the sudachi-no-match fallback branch', async () => {
  const component = await readFile(
    path.join(
      process.cwd(),
      'modules/knowledge/vocabulary/components/VocabularySentenceText.tsx',
    ),
    'utf8',
  )
  // The whole-text fallback must sit inside the Sudachi branch, before the
  // highlight split; personal/off paths below stay untouched.
  const sudachiBranch = component.indexOf("pronunciationSource === 'sudachi'")
  const fallback = component.indexOf('if (matchedSurfaces.length === 0)', sudachiBranch)
  const personalPath = component.indexOf('const renderHighlightedSurface')
  assert.ok(sudachiBranch >= 0 && fallback > sudachiBranch && personalPath > fallback)
})

test('display and copy share one inline-notation decision', () => {
  // 後(に) is a headword notation, not authored ruby: incompatible.
  assert.equal(isInlineKanaReadingCompatible('後(に)', 'あと'), false)
  // Genuine authored notation covered by the token reading: compatible.
  assert.equal(isInlineKanaReadingCompatible('辿（たど）っ', 'たどっ'), true)
  // No parens at all: nothing to decide.
  assert.equal(isInlineKanaReadingCompatible('事前に', 'じぜんに'), false)
})

test('display and copy agree on the winning reading', () => {
  const lexicon = {
    '後(に)': { surface: '後(に)', dictionaryForm: '後', normalizedForm: '後', reading: 'あと', dictionaryReading: 'あと', partsOfSpeech: ['名詞'] },
    '事前': { surface: '事前', dictionaryForm: '事前', normalizedForm: '事前', reading: 'じぜん', dictionaryReading: 'じぜん', partsOfSpeech: ['名詞'] },
    'に': { surface: 'に', dictionaryForm: 'に', normalizedForm: 'に', reading: 'に', dictionaryReading: 'に', partsOfSpeech: ['助詞'] },
    '辿（たど）っ': { surface: '辿（たど）っ', dictionaryForm: '辿る', normalizedForm: '辿る', reading: 'たどっ', dictionaryReading: 'たどる', partsOfSpeech: ['動詞'] },
  }
  // 後(に): both paths use あと; the parens stay literal in both.
  assert.match(
    annotateJapaneseTextWithSudachi('後(に)', lexicon, SUDACHI_OPTIONS),
    /<ruby[^>]*>後<rt[^>]*>あと<\/rt><\/ruby>\(に\)/,
  )
  assert.equal(
    formatJapaneseTextWithSudachiRubyNotation('後(に)', lexicon),
    '{後|あと}(に)',
  )
  // 事前に: unchanged in both paths.
  assert.equal(
    formatJapaneseTextWithSudachiRubyNotation('事前に', lexicon),
    '{事前|じぜん}に',
  )
  // 辿（たど）っ: authored notation honored in both paths.
  assert.match(
    annotateJapaneseTextWithSudachi('辿（たど）っ', lexicon, SUDACHI_OPTIONS),
    /<ruby[^>]*>辿<rt[^>]*>たど<\/rt><\/ruby>（たど）っ/,
  )
  assert.equal(
    formatJapaneseTextWithSudachiRubyNotation('辿（たど）っ', lexicon),
    '{辿|たど}（たど）っ',
  )
})
