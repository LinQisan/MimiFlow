import assert from 'node:assert/strict'
import test from 'node:test'

import {
  annotateJapaneseText,
  annotateJapaneseTextWithSudachi,
  buildJapaneseLexicalRanges,
} from '../utils/language/japaneseRuby.ts'


const lexeme = (surface, reading, partsOfSpeech = ['名詞']) => ({
  surface,
  dictionaryForm: surface,
  normalizedForm: surface,
  reading,
  dictionaryReading: reading,
  partsOfSpeech,
})

const tokenContents = html =>
  [...html.matchAll(
    /<span class="vocab-token"([^>]*)>([\s\S]*?)<\/span>/g,
  )].map(match => {
    const attributes = match[1]
    return {
      surface: attributes.match(/data-vocab-surface="([^"]+)"/)?.[1],
      start: Number(attributes.match(/data-vocab-start="(\d+)"/)?.[1]),
      end: Number(attributes.match(/data-vocab-end="(\d+)"/)?.[1]),
      html: match[2],
    }
  })

test('lexical ranges stay in the raw source coordinate space', () => {
  const cases = [
    {
      text: '進むフェリー',
      surfaces: ['進む', 'フェリー'],
      expected: [
        { surface: '進む', start: 0, end: 2 },
        { surface: 'フェリー', start: 2, end: 6 },
      ],
    },
    {
      text: '満員の映画館',
      surfaces: ['満員', '映画館'],
      expected: [
        { surface: '満員', start: 0, end: 2 },
        { surface: '映画館', start: 3, end: 6 },
      ],
    },
    {
      text: '夏休みの映画館',
      surfaces: ['夏休み', '映画館'],
      expected: [
        { surface: '夏休み', start: 0, end: 3 },
        { surface: '映画館', start: 4, end: 7 },
      ],
    },
    {
      text: '外国人など旅行者',
      surfaces: ['外国人', '旅行者'],
      expected: [
        { surface: '外国人', start: 0, end: 3 },
        { surface: '旅行者', start: 5, end: 8 },
      ],
    },
    {
      text: '冒険譚ではある',
      surfaces: ['冒険譚'],
      expected: [{ surface: '冒険譚', start: 0, end: 3 }],
    },
  ]

  cases.forEach(({ text, surfaces, expected }) => {
    assert.deepEqual(buildJapaneseLexicalRanges(text, surfaces), expected)
  })

  assert.deepEqual(
    buildJapaneseLexicalRanges('進むフェリー', [
      '進',
      '進む',
      'むフェリー',
      'フェリー',
    ]),
    [
      { surface: '進む', start: 0, end: 2 },
      { surface: 'フェリー', start: 2, end: 6 },
    ],
  )
})

test('lexical token wrappers stay intact when personal ruby splits a word', () => {
  const words = ['進む', '外国人', '光景', '視線', '作者', '学校']
  const readings = ['すすむ', 'がいこくじん', 'こうけい', 'しせん', 'さくしゃ', 'がっこう']
  const lexicon = Object.fromEntries(
    words.map((word, index) => [
      word,
      lexeme(word, readings[index], word === '進む' ? ['動詞'] : ['名詞']),
    ]),
  )
  const text = words.join(' ')
  const pronunciationMap = Object.fromEntries(
    words.map((word, index) => [word, readings[index]]),
  )

  const automaticTokens = tokenContents(
    annotateJapaneseTextWithSudachi(text, lexicon, {
      useSudachiReading: true,
      rubyEnabled: true,
    }),
  )
  const personalTokens = tokenContents(
    annotateJapaneseTextWithSudachi(text, lexicon, {
      pronunciationMap,
      useSudachiReading: false,
      rubyEnabled: true,
    }),
  )

  assert.deepEqual(automaticTokens.map(token => token.surface), words)
  assert.deepEqual(personalTokens.map(token => token.surface), words)
  assert.deepEqual(
    personalTokens.map(({ surface, start, end }) => ({ surface, start, end })),
    automaticTokens.map(({ surface, start, end }) => ({ surface, start, end })),
  )
  assert.equal(automaticTokens.length, words.length)
  assert.equal(personalTokens.length, words.length)

  const personalFirst = personalTokens[0].html
  assert.match(personalFirst, /^<ruby>進<rt[^>]*>すす<\/rt><\/ruby>む$/)
  assert.equal((personalTokens[1].html.match(/<ruby/g) || []).length, 3)
  assert.equal((automaticTokens[1].html.match(/<ruby/g) || []).length, 1)
  assert.doesNotMatch(personalTokens[0].html, /vocab-token/)
  assert.doesNotMatch(personalTokens[1].html, /data-vocab-token/)
})

test('the personal-pronunciation fallback also emits one token wrapper', () => {
  const html = annotateJapaneseText(
    '進む 外国人',
    { 進む: 'すすむ', 外国人: 'がいこくじん' },
    { tokenClassName: 'vocab-token' },
  )
  const tokens = tokenContents(html)

  assert.deepEqual(tokens.map(token => token.surface), ['進む', '外国人'])
  assert.equal((tokens[1].html.match(/<ruby/g) || []).length, 3)
})

test('wordbook lexical boundaries can join multiple Sudachi lexemes', () => {
  const html = annotateJapaneseTextWithSudachi(
    '映画館 冒険譚',
    {
      映: lexeme('映', 'えい'),
      画: lexeme('画', 'が'),
      館: lexeme('館', 'かん'),
      冒険: lexeme('冒険', 'ぼうけん'),
      譚: lexeme('譚', 'たん'),
    },
    {
      pronunciationMap: {
        映: 'えい',
        画: 'が',
        館: 'かん',
        冒険: 'ぼうけん',
        譚: 'たん',
      },
      useSudachiReading: false,
      rubyEnabled: true,
      tokenClassName: 'vocab-token',
      tokenWords: ['映画館', '冒険譚'],
    },
  )
  const tokens = tokenContents(html)

  assert.deepEqual(tokens.map(token => token.surface), ['映画館', '冒険譚'])
  assert.equal(tokens.length, 2)
  assert.equal((tokens[0].html.match(/<ruby/g) || []).length, 3)
  assert.equal((tokens[1].html.match(/<ruby/g) || []).length, 3)
  assert.doesNotMatch(tokens[0].html, /data-vocab-token/)
  assert.doesNotMatch(tokens[1].html, /data-vocab-token/)
})

test('custom ruby never shifts adjacent lexical token ranges', () => {
  const text = '進むフェリー'
  const lexicon = {
    進: lexeme('進', 'すす', ['動詞']),
    む: lexeme('む', 'む', ['動詞']),
    フェリー: lexeme('フェリー', 'ふぇりー'),
  }
  const options = {
    rubyEnabled: true,
    tokenClassName: 'vocab-token',
    tokenWords: ['進む', 'フェリー'],
  }
  const automaticTokens = tokenContents(
    annotateJapaneseTextWithSudachi(text, lexicon, {
      ...options,
      useSudachiReading: true,
    }),
  )
  const personalTokens = tokenContents(
    annotateJapaneseTextWithSudachi(text, lexicon, {
      ...options,
      pronunciationMap: { 進: 'すす' },
      useSudachiReading: false,
    }),
  )
  const expectedRanges = [
    { surface: '進む', start: 0, end: 2 },
    { surface: 'フェリー', start: 2, end: 6 },
  ]

  assert.deepEqual(
    automaticTokens.map(({ surface, start, end }) => ({ surface, start, end })),
    expectedRanges,
  )
  assert.deepEqual(
    personalTokens.map(({ surface, start, end }) => ({ surface, start, end })),
    expectedRanges,
  )
  assert.equal((personalTokens[0].html.match(/<ruby/g) || []).length, 1)
  assert.equal(personalTokens[1].html, 'フェリー')
  assert.doesNotMatch(personalTokens[0].html, /data-vocab-token/)
  assert.doesNotMatch(personalTokens[1].html, /data-vocab-token/)
})
